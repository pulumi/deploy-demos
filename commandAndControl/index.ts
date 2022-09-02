const org = "pulumi";
const project = "simple-resource"
const stack = "dev"
const backendURL = "http://api.pulumi.com/api"

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

const createDeployment = async () => {
    const urlSuffix  = `preview/deployments/${org}/${project}/${stack}`;
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

    return await makePulumiAPICall('POST', urlSuffix, payload);
}

const getDeploymentStatus = async (deploymentID: string) => {
   return await makePulumiAPICall("GET", `preview/deployments/${org}/${project}/${stack}/${deploymentID}`)
}

const getDeploymentLogs = async (deploymentID: string) => {
    return await makePulumiAPICall("GET", `preview/deployments/${org}/${project}/${stack}/${deploymentID}/logs`)
 }

function delay(ms: number) {
    return new Promise( resolve => setTimeout(resolve, ms) );
}

const printStatusAndLogs = async (deploymentID: string) =>{
    const deploymentStatusResult = await getDeploymentStatus(deploymentID);
    console.log(deploymentStatusResult);
    const deploymentLogs = await getDeploymentLogs(deploymentID);
    console.log(JSON.stringify(deploymentLogs));
}

const nonTerminalDeploymentStatuses = ["not-started", "accepted", "running"];

const run = async () => {
    const deploymentResult = await createDeployment();
    console.log(deploymentResult);
    let status = "not-started"
    while (nonTerminalDeploymentStatuses.includes(status) || !status) {
        const deploymentStatusResult = await getDeploymentStatus(deploymentResult.id);
        status = deploymentStatusResult.status; 
        console.log(deploymentStatusResult);

        const deploymentLogs = await getDeploymentLogs(deploymentResult.id);
        console.log(JSON.stringify(deploymentLogs));

        await delay(2000);
    }

    // printStatusAndLogs("79fcd545-f9f0-4287-8c53-06072f508732")

}
run().catch(err => console.log(err));