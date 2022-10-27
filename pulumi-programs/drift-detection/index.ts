import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import fetch from "node-fetch";

 const c = new pulumi.Config();
 // default to every five minutes
let schedule = c.get("schedule") || "cron(0/5 * * * ? *)";
// list of stacks to run drift detection over
let stacks: string[] = c.requireObject("stacks");
let pulumiAccessToken = c.requireSecret("pulumiAccessToken");

 aws.cloudwatch.onSchedule("drift-lambda", schedule, async() => {
    let outstandingDeploymentIDs: string[] = [];
    let deploymentToStack: {[key: string]: string}= {};
    let deploymentToURL: {[key: string]: string}= {};
    let driftedStacks: string[] = [];
    for(let s of stacks) {
        const parts = s.split("/");
        const organization = parts[0];
        const project = parts[1];
        const stack = parts[2];
        console.log(`refreshing stack: ${s}`);

        const url = `https://api.pulumi.com/api/preview/${organization}/${project}/${stack}/deployments`
        const headers = {
            'Accept': 'application/json',
            'Content-Type': 'application/json',
            'Authorization': `token ${pulumiAccessToken.get()}`
        };

            // The Pulumi.yaml file is necessary for pulumi stack yaml
            const yamlProgram = `name: ${project}
runtime: yaml
`;
        // kick off deployment

        const payload = {
            sourceContext: {
                git: {
                    repoURL: "https://github.com/pulumi/examples.git", // use a random public repo so as to not require a github token
                    branch: "refs/heads/master",
                    repoDir: "aws-go-lambda", // dummy repo. What is in here doesn't matter
                }
            },
            operationContext: {
                operation: "preview",
                preRunCommands: [
                    // the pulumi program gets written to disk via pre-run commands
                    `echo "$YAML_PROGRAM" | base64 -d | tee Pulumi.yaml`,
                    `pulumi stack select ${organization}/${stack} && pulumi config refresh`,
                    // this is where the magic happens.
                    // this command will fail if there are any changes
                    // TODO: move this out of pre-run commands https://github.com/pulumi/pulumi-service/issues/10420
                    `pulumi refresh --expect-no-changes --yes`,
                ],
                environmentVariables: {
                    YAML_PROGRAM: Buffer.from(yamlProgram).toString('base64'), // pass the program as an env var
                    AWS_REGION: "us-west-2",
                    // pass in environment variables available in the current lambda execution role to destroy the target program
                    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                    AWS_SECRET_ACCESS_KEY: {
                        secret: process.env.AWS_SECRET_ACCESS_KEY,
                    },
                    AWS_SESSION_TOKEN: { 
                        secret: process.env.AWS_SESSION_TOKEN,
                    },
                }
            }
        };

        const response = await fetch(url, {
            method: "POST",
            headers,
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            let errMessage = "";
            try {
                errMessage = await response.text();
            } catch { }
            throw new Error(`failed to queue refresh: ${errMessage}`)
        }

        const deployment = await response.json();
        outstandingDeploymentIDs.push(deployment.id);
        deploymentToStack[deployment.id] = s;
        deploymentToURL[deployment.id] = deployment.consoleUrl;
    }

    while(outstandingDeploymentIDs.length) {
        await delay(2000);
        let completedDeployments: string[]= [];
        for(let deploymentID of outstandingDeploymentIDs) {
            // query deployment
            const s = deploymentToStack[deploymentID];
            const parts = s.split("/");
            const organization = parts[0];
            const project = parts[1];
            const stack = parts[2];
            
            const url = `https://api.pulumi.com/api/preview/${organization}/${project}/${stack}/deployments/${deploymentID}`;

            const headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `token ${pulumiAccessToken.get()}`
            };
            const response = await fetch(url, {
                method: "GET",
                headers,
            });
    
            if (!response.ok) {
                let errMessage = "";
                try {
                    errMessage = await response.text();
                } catch { }
                throw new Error(`failed to get stack: ${errMessage}`)
            }
    
            const deployment = await response.json();
            const status = deployment.status;
            if(["succeeded", "failed"].indexOf(status)> -1){
                completedDeployments.push(deploymentID);
                if(status=== "failed") {
                    // assume all failures are due to drift
                    // when we post a mesage we include the URL 
                    // so that results can be checked
                    driftedStacks.push(deploymentID);
                }
            }
        }

        outstandingDeploymentIDs = outstandingDeploymentIDs.filter(x => completedDeployments.indexOf(x) === -1);
        console.log(`Finished polling deployments: ${completedDeployments.length} out of ${outstandingDeploymentIDs.length} complete.`);
    }

    if(driftedStacks.length) {
        console.log(`found ${driftedStacks.length} stacks that did not pass drift check`);
        for(let d of driftedStacks) {
            // for now, just print to cloudwatch logs when we see a failure
            // TODO: spice this up by posting to slack
            console.log(`${deploymentToURL[d]}`);
        }
    }

    function delay(ms: number) {
        return new Promise( resolve => setTimeout(resolve, ms) );
    }
 });

