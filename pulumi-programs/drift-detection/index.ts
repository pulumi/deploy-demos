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
// The function is built explicitly to raise that: onSchedule takes an args parameter
// but ignores it — EventRuleEventSubscriptionArgs has no fields at all.
const LAMBDA_TIMEOUT_SECONDS = 900;

// Give up a minute before the lambda is killed, so the loop throws an error naming the
// stacks it was still waiting on instead of dying silently mid-poll.
const POLL_BUDGET_MS = (LAMBDA_TIMEOUT_SECONDS - 60) * 1000;

// Statuses a deployment can still move on from; anything else is finished. Enumerated this
// way round so an aborted or skipped deployment doesn't hang the batch. The full status set
// is spelled out in deployment-drivers/go/http/pulumi_api_live_test.go.
const IN_FLIGHT = ["not-started", "accepted", "running"];

const driftLambda = new aws.lambda.CallbackFunction("drift-lambda", {
    // CallbackFunction still defaults to nodejs22.x, which is in maintenance.
    // Raising that default is tracked in pulumi/pulumi-aws#6336.
    runtime: aws.lambda.Runtime.NodeJS24dX,
    timeout: LAMBDA_TIMEOUT_SECONDS,
    // The token reaches the handler as an environment variable rather than being read
    // inside the callback. A closure that reads it directly gets it serialized into the
    // deployment package as plaintext; as an environment variable it is encrypted at rest.
    environment: { variables: { PULUMI_ACCESS_TOKEN: pulumiAccessToken } },
    callback: async() => {
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
                'Authorization': `token ${process.env.PULUMI_ACCESS_TOKEN}`
            };

            // The Pulumi.yaml file is necessary for pulumi stack yaml
            const yamlProgram = `name: ${project}
runtime: yaml
`;
            // kick off deployment

            const payload = {
                operation: "preview",
                // Don't inherit the target stack's own deployment settings — this
                // deployment runs a throwaway program, not the stack's real one.
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

        const pollDeadline = Date.now() + POLL_BUDGET_MS;

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
                    'Authorization': `token ${process.env.PULUMI_ACCESS_TOKEN}`
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
                if(!IN_FLIGHT.includes(status)){
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
    },
});

aws.cloudwatch.onSchedule("drift-lambda", schedule, driftLambda);

