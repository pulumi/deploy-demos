const org = "pulumi";
const stack = "dev"
const backendURL = "http://api.pulumi.com/api"

type SupportedProject = "simple-resource" | "bucket-time";

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

const createSimpleDeployment = async () => {
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
            operation: "update",
            preRunCommands: [
            ],
            environmentVariables: {
            }
        }
    };

    return createDeployment("simple-resource", payload);
}

const createAwsBucketDeployment = async () => {
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
            operation: "update",
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

const createProjectDeployment = async (project: SupportedProject) => {
    switch(project) {
        case "simple-resource":
            return createSimpleDeployment();
        case "bucket-time":
            return createAwsBucketDeployment();
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

const run = async () => {
    const project: SupportedProject = "bucket-time";
    const deploymentResult = await createProjectDeployment(project)
    console.log(deploymentResult);
    let status = "not-started"
    while (nonTerminalDeploymentStatuses.includes(status) || !status) {
        const deploymentStatusResult = await getDeploymentStatus(project, deploymentResult.id);
        status = deploymentStatusResult.status; 
        console.log(deploymentStatusResult);

        const deploymentLogs = await getDeploymentLogs(project, deploymentResult.id);
        console.log(JSON.stringify(deploymentLogs));

        await delay(2000);
    }

    // useful for debugging the driver if it happens to exit early before a deployment has finished (ie an API field changes)
    // printStatusAndLogs("79fcd545-f9f0-4287-8c53-06072f508732")

}
run().catch(err => console.log(err));
