import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

 const c = new pulumi.Config();
 // default to every five minutes
let schedule = c.get("schedule") || "cron(0/5 * * * ? *)";
// list of stacks to run drift detection over
let stacks: string[] = c.requireObject("stacks");
let pulumiAccessToken = c.requireSecret("pulumiAccessToken");

 // A refresh of several stacks routinely takes longer than the 180s CallbackFunction
 // default, which would kill this mid-poll and report no drift on a healthy schedule.
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

        const url = `https://api.pulumi.com/api/stacks/${organization}/${project}/${stack}/deployments`
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
            operation: "preview",
            // This payload is self-contained — it supplies its own sourceContext,
            // credentials, and pre-run commands — so deliberately do not inherit the
            // target stack's configured deployment settings.
            inheritSettings: false,
            sourceContext: {
                git: {
                    repoURL: "https://github.com/pulumi/examples.git", // use a random public repo so as to not require a github token
                    branch: "refs/heads/master",
                    repoDir: "aws-go-lambda", // dummy repo. What is in here doesn't matter
                }
            },
            operationContext: {
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
            throw new Error(`failed to queue refresh for ${s}: ${response.status} ${errMessage}`)
        }

        const deployment = await response.json();
        outstandingDeploymentIDs.push(deployment.id);
        deploymentToStack[deployment.id] = s;
        deploymentToURL[deployment.id] = deployment.consoleUrl;
    }

    // Bound the poll so a deployment that never reaches a terminal state can't spin
    // until the lambda times out with no drift report for any stack in the batch.
    // Must stay under the function timeout above or it can never fire.
    const pollDeadline = Date.now() + 14 * 60 * 1000;

    while(outstandingDeploymentIDs.length) {
        if (Date.now() > pollDeadline) {
            throw new Error(`timed out waiting for deployments: ${outstandingDeploymentIDs.map(id => deploymentToStack[id]).join(", ")}`);
        }
        await delay(2000);
        let completedDeployments: string[]= [];
        for(let deploymentID of outstandingDeploymentIDs) {
            // query deployment
            const s = deploymentToStack[deploymentID];
            const parts = s.split("/");
            const organization = parts[0];
            const project = parts[1];
            const stack = parts[2];
            
            const url = `https://api.pulumi.com/api/stacks/${organization}/${project}/${stack}/deployments/${deploymentID}`;

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
                throw new Error(`failed to get deployment ${deploymentID}: ${response.status} ${errMessage}`)
            }
    
            const deployment = await response.json();
            const status = deployment.status;
            // Enumerate the in-flight states rather than the terminal ones: a deployment
            // that ends up aborted or skipped is finished, and treating it as outstanding
            // would hang the whole batch.
            if(["not-started", "accepted", "running"].indexOf(status) === -1){
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
        console.log(`Finished polling deployments: ${completedDeployments.length} completed this pass, ${outstandingDeploymentIDs.length} still outstanding.`);
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
 }, { timeout: 900 });

