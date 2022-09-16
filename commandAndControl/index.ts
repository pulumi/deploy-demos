const org = "pulumi";
const stack = "dev"
const backendURL = "http://api.pulumi.com/api"

type SupportedProject = "simple-resource" | "bucket-time" | "go-bucket";
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
    const urlSuffix  = `preview/deployments/${org}/${project}/${stack}`;

    return await makePulumiAPICall('POST', urlSuffix, payload);
}

const createSimpleDeployment = async (op: Operation) => {
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/main",
                repoDir: "simple-resource",
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

const createAwsBucketDeployment = async (op: Operation) => {
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/main",
                repoDir: "bucket-time",
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

const createAwsGoBucketDeployment = async (op: Operation) => {
    const payload = {
        sourceContext: {
            git: {
                repoURL: "https://github.com/pulumi/deploy-demos.git",
                branch: "refs/heads/main",
                repoDir: "go-bucket",
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
        default:
            throw new Error(`unable to deploy project. unknown project: ${project}`);
    }
}

const getDeploymentStatus = async (project: string, deploymentID: string) => {
   return await makePulumiAPICall("GET", `preview/deployments/${org}/${project}/${stack}/${deploymentID}`)
}

const getDeploymentLogs = async (project: string, deploymentID: string) => {
    return await makePulumiAPICall("GET", `preview/deployments/${org}/${project}/${stack}/${deploymentID}/logs`)
 }

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

const printStatusAndLogs = async (project: string, deploymentID: string) =>{
    const deploymentStatusResult = await getDeploymentStatus(project, deploymentID);
    console.log(deploymentStatusResult);
    const deploymentLogs = await getDeploymentLogs(project, deploymentID);
    console.log(JSON.stringify(deploymentLogs));
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
};

const queryDeployment = async (deployment: DeploymentAction) => {
    const { project, id } = deployment;

    const deploymentStatusResult = await getDeploymentStatus(project, id!);
        deployment.status = deploymentStatusResult.status; 
        console.log(deploymentStatusResult);

        const deploymentLogs = await getDeploymentLogs(project, id!);
        console.log(JSON.stringify(deploymentLogs));

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

    // run a single supported project

    // // const project: SupportedProject = "go-bucket";
    // const project: SupportedProject = "simple-resource";
    // // const project: SupportedProject = "bucket-time";
    // const op: Operation = "update";
    // const deployments: DeploymentAction[] = [{
    //     project,
    //     op,
    // }];
    

    // parallel load test variant targeting the same stack

    // const deployments: DeploymentAction[] = [];
    // for (let i = 0; i < 9; i++) {
    //     deployments.push({
    //         project: "bucket-time",
    //         op: "update",
    //     });
    // }


    // deploy all three sample programs simultaneously
    const deployments: DeploymentAction[] = [
        {
            project: "bucket-time",
            op: "update",
        },
        {
            project: "simple-resource",
            op: "update",
        },
        {
            project: "go-bucket",
            op: "update",
        },
    ];

    await execDeploymentsAndMonitorToCompletion(deployments);

    // useful for debugging the driver if it happens to exit early before a deployment has finished (ie an API field changes)
    // printStatusAndLogs("79fcd545-f9f0-4287-8c53-06072f508732")

}
run().catch(err => console.log(err));
