let org = "pulumi";
let stack = "dev"
const backendURL = "http://api.pulumi.com/api"

type SupportedProject = "simple-resource" | "bucket-time" | "go-bucket" | "lambda-template" | "yamlcaml";
type Operation = "update" | "preview" | "destroy" | "refresh";

const makePulumiAPICall = async (method: string, urlSuffix: string, payload?: any) => {
    const url = `${backendURL}/${urlSuffix}`
    const accessToken = process.env.PULUMI_ACCESS_TOKEN;
    const headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': `token ${accessToken}`
    };
    const response = await fetch(url, {
        method,
        headers,
        body: payload ? JSON.stringify(payload) : undefined
    });

    if(!response.ok) {
        let errMessage = "";
        try {
            errMessage = await response.text();
        } catch{}
        throw new Error(`failed to call ${urlSuffix}: ${errMessage}`)
    }

    return await response.json();
}

const createDeployment = async (project: string, payload: any) => {
    const urlSuffix  = `preview/${org}/${project}/${stack}/deployments`;

    return await makePulumiAPICall('POST', urlSuffix, payload);
}

const createSimpleDeployment = async (op: Operation) => {
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/main",
                repoDir: "pulumi-programs/simple-resource",
                gitAuth: {
                    accessToken: process.env.GITHUB_ACCESS_TOKEN,
                }
            }
        },
        operationContext: {
            operation: op,
            preRunCommands: [
            ],
            environmentVariables: {
            }
        }
    };

    return createDeployment("simple-resource", payload);
}

const createInlineYamlDeployment = async (op: Operation) => {
    // you can define your pulumi program dynamically
    // via YAML that we send over the wire.
    const yamlProgram = `name: yamlcaml
runtime: yaml
description: A minimal AWS Pulumi YAML program

resources:
    # Create an AWS resource (S3 Bucket)
    my-bucket:
        type: aws:s3:Bucket

outputs:
    # Export the name of the bucket
    bucketName: \${my-bucket.id}
`;
    const stackYaml = `config:
    aws:region: us-west-2    
`;
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/main",
                repoDir: "pulumi-programs/yamlcaml", // dummy repo. What is in here doesn't matter
                gitAuth: {
                    accessToken: process.env.GITHUB_ACCESS_TOKEN,
                }
            }
        },
        operationContext: {
            operation: op,
            preRunCommands: [
                // the pulumi program gets written to disk via pre-run commands
                `ls pulumi`,
                `echo "$YAML_PROGRAM" | base64 -d | tee Pulumi.yaml`,
                `echo "$STACK_YAML" | base64 -d  | tee Pulumi.dev.yaml`,
                `ls`,
                `cat Pulumi.yaml`
            ],
            environmentVariables: {
                YAML_PROGRAM: Buffer.from(yamlProgram).toString('base64'), // pass the program as an env var
                STACK_YAML: Buffer.from(stackYaml).toString('base64'), // pass the stack config as an env var
                AWS_REGION: "us-west-2",
                AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
            }
        }
    };

    return createDeployment("yamlcaml", payload);
}

const createAwsBucketDeployment = async (op: Operation) => {
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/main",
                repoDir: "pulumi-programs/bucket-time",
                gitAuth: {
                    accessToken: process.env.GITHUB_ACCESS_TOKEN,
                }
            }
        },
        operationContext: {
            operation: op,
            preRunCommands: [
            ],
            environmentVariables: {
                AWS_REGION: "us-west-2",
                AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
            }
        }
    };

    return createDeployment("bucket-time", payload);
}

const createLambdaTemplateDeployment = async (op: Operation) => {
    const helloWorldHandler = `
    exports.handler =  async function(event, context) {
        console.log("EVENT:    " + JSON.stringify(event, null, 2))
        return context.logStreamName
    }
    `;
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/main",
                repoDir: "pulumi-programs/lambda-template",
                gitAuth: {
                    accessToken: process.env.GITHUB_ACCESS_TOKEN,
                }
            }
        },
        operationContext: {
            operation: op,
            preRunCommands: [
            ],
            environmentVariables: {
                AWS_REGION: "us-west-2",
                AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
                LAMBDA_CODE: helloWorldHandler,
            }
        }
    };

    return createDeployment("lambda-template", payload);
}

const createAwsGoBucketDeployment = async (op: Operation) => {
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/main",
                repoDir: "pulumi-programs/go-bucket",
                gitAuth: {
                    accessToken: process.env.GITHUB_ACCESS_TOKEN,
                }
            }
        },
        operationContext: {
            operation: op,
            preRunCommands: [],
            environmentVariables: {
                AWS_REGION: "us-west-2",
                AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
            }
        }
    };

    return createDeployment("go-bucket", payload);
}

const createProjectDeployment = async (project: SupportedProject, op: Operation = "update") => {
    switch(project) {
        case "simple-resource":
            return createSimpleDeployment(op);
        case "bucket-time":
            return createAwsBucketDeployment(op);
        case "go-bucket":
            return createAwsGoBucketDeployment(op);
        case "lambda-template":
            return createLambdaTemplateDeployment(op);
        case "yamlcaml":
            return createInlineYamlDeployment(op);
        default:
            throw new Error(`unable to deploy project. unknown project: ${project}`);
    }
}

const getDeploymentStatus = async (deployment: DeploymentAction) => {

   return await makePulumiAPICall("GET", `preview/${org}/${deployment.project}/${stack}/deployments/${deployment.id}`)
}

const getDeploymentLogs = async (deployment: DeploymentAction) => {
    let hasMoreLogs = true;
    const logs: string[] = [];

    while(hasMoreLogs) {
        const { currentStep, currentJob, nextOffset, totalSteps } = deployment.logMarker!;
        if (currentStep! >= totalSteps!) {
            return logs;
        }

        const query = `job=${currentJob}&step=${currentStep}&offset=${nextOffset}`;
        const logsResponse = await makePulumiAPICall("GET", `preview/${org}/${deployment.project}/${stack}/deployments/${deployment.id}/logs?${query}`);
        const logLines = (logsResponse.lines || []).map((l:any) => `${l.timestamp}: ${l.line}`);
        logs.push(...logLines);
        if (logsResponse.nextOffset !== undefined) {
            deployment.logMarker!.nextOffset = logsResponse.nextOffset;
        } else {
            deployment.logMarker!.nextOffset = 0;
            deployment.logMarker!.currentStep = deployment.logMarker!.currentStep! + 1;
            if(deployment.logMarker!.currentStep >= deployment.logMarker!.totalSteps!) {
                break;
            }
            logs.push(`\nstep: ${deployment.logMarker!.currentStep}\n`);
        }

        hasMoreLogs = logsResponse.nextOffset !== nextOffset;
    }

    return logs;
 }

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

const printStatusAndLogs = async (deployment: DeploymentAction) =>{
    const deploymentStatusResult = await getDeploymentStatus(deployment);

    const deploymentLogs = await getDeploymentLogs(deployment);
    const logs = deploymentLogs.join('');

    console.log(deploymentStatusResult);
    console.log(logs);
}

const nonTerminalDeploymentStatuses = ["not-started", "accepted", "running"];

const isDeploymentRunning = (status: string) => {
    return (nonTerminalDeploymentStatuses.includes(status) || !status);
}

type DeploymentAction = {
    project: SupportedProject;
    op: Operation;
    id?: string;
    status?: string;
    logMarker?: DeploymentLogMarker
};

type DeploymentLogMarker = {
    nextOffset?: number;
    currentStep?: number;
    currentJob?: number; // always 1 in current impl
    totalSteps?: number;
    totalJobs?: number; // always 1 in current impl
}

const queryDeployment = async (deployment: DeploymentAction) => {
    if(!deployment.logMarker) {
        deployment.logMarker = {
            nextOffset: 0,
            currentJob: 0, // always 1 in current impl
            currentStep: 0,
            totalJobs: 1,
        };
    }

    const deploymentStatusResult = await getDeploymentStatus(deployment);
        deployment.status = deploymentStatusResult.status; 

        // we only have enough state about the deployment to query for logs once it reaches "running" state
        // https://github.com/pulumi/pulumi-service/issues/10266
        // https://github.com/pulumi/pulumi-service/issues/10339
        if (deployment.status === "running" || deployment.status === "succeeded" || deployment.status === "failed" ) {
            deployment.logMarker.totalSteps = deploymentStatusResult.jobs[0].steps.length;
            const deploymentLogs = await getDeploymentLogs(deployment);
            const logs = deploymentLogs.join('');
            if (logs) {
                console.log(deploymentStatusResult);
                console.log(logs);
            }
        } else {
            console.log(deploymentStatusResult);
        }

    return !isDeploymentRunning(deployment.status!);
}

const monitorDeployments = async (deployments: DeploymentAction[]) => {
    
    let deploymentIDs = deployments.map(d => d.id!);

    while(deploymentIDs.length) {
        let completedDeployments: string[]= [];
        for(let deploymentID of deploymentIDs) {
            let deployment = deployments.find( d => (d.id!) === deploymentID);
            if(await queryDeployment(deployment!)){
                completedDeployments.push(deploymentID);
            }
        }
        // filter out completed deployments for the next pass
        deploymentIDs = deploymentIDs.filter(x => completedDeployments.indexOf(x) === -1);
        console.log(`Finished polling deployments: ${completedDeployments.length} out of ${deploymentIDs.length} complete.`);
        await delay(2000);
    }
};

const execDeployments = async (deployments: DeploymentAction[]) => {
    let deploymentNumber = 1;
    for(let deployment of deployments) {
        console.log(`executing deployment ${deploymentNumber}`)
        const deploymentResult = await createProjectDeployment(deployment.project, deployment.op);
        console.log(deploymentResult);
        deployment.id = deploymentResult.id;
        deploymentNumber++;
    }

    return deployments;
}

const execDeploymentsAndMonitorToCompletion = async (deployments: DeploymentAction[]) => {
    deployments = await execDeployments(deployments);
    await monitorDeployments(deployments);

    console.log(JSON.stringify(deployments, null, 2));
    return deployments;
};

const run = async () => {

    // change this to your personal user or organization
    // org = "EvanBoyle";
    org = process.env.ORG_NAME || "pulumi";

    // override this to control the stack name
    stack = process.env.STACK_NAME || "dev";

    // This snippet controls which pulumi-program gets run.
    // You can alter this to point to a different pulumi program.
    // Edit the pulumi programs in the root level `/pulumi-programs` directory to create more cloud resources
    const deployments: DeploymentAction[] = [
        {
            project: "simple-resource",
            op: "update",
        },
        // {
        //     project: "bucket-time",
        //     op: "update",
        // },
        // {
        //     project: "lambda-template",
        //     op: "update",
        // },
        // {
        //     project: "go-bucket",
        //     op: "update",
        // },
        // {
        //     project: "yamlcaml",
        //     op: "update",
        // }
    ];

    await execDeploymentsAndMonitorToCompletion(deployments);
}
run().catch(err => console.log(err));
