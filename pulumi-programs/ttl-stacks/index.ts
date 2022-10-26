import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import fetch from "node-fetch";

const config = new pulumi.Config();
const pat = config.requireSecret("pulumiAccessToken");
const githubtoken = config.getSecret("githubToken");

async function postDeployment(operation: string, stack: string, repoURL: string, branch: string, preRunCommands?: string[]) {
    const res = await fetch(`https://api.pulumi.com/api/preview/${stack}/deployments`, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `token ${pat.get()}`,
        },
        body: JSON.stringify({
            sourceContext: {
                git: {
                    repoURL,
                    branch,
                    gitAuth: githubtoken ? { accessToken: `${githubtoken.get()}` } : undefined,
                },
            },
            operationContext: {
                operation,
                environmentVariables: {
                    AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                    AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                    AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
                },
                preRunCommands,
            },
        }),
    });
    console.debug(`status=${res.status}`);
    return res.json();
}

async function getPulumiAPI(path: string) {
    const res = await fetch(`https://api.pulumi.com/api${path}`, {
        method: "GET",
        headers: {
            "Content-Type": "application/json",
            "Authorization": `token ${pat.get()}`,
        },
    });
    return res.json();
}

const subscription = aws.cloudwatch.onSchedule("get-tags", "rate(30 minutes)", async (ev, ctx) => {
    const stacksToDestroy: Record<string, { ttl: string; runtime: string }> = {};
    const resp = await getPulumiAPI(`/user/stacks?maxResults=2000&tagName=pulumi:ttl`);
    for (const stackid of resp.stacks) {
        const stack = await getPulumiAPI(`/stacks/${stackid.orgName}/${stackid.projectName}/${stackid.stackName}`);
        const fqsn = `${stack.orgName}/${stack.projectName}/${stack.stackName}`;
        for (const tag in stack.tags) {
            if (tag == "pulumi:ttl") {
                let tagValue = +(stack.tags[tag]);
                if (isNaN(tagValue)) {
                    tagValue = 24;
                }
                const ttlSeconds = tagValue * 60 * 60;
                const timeSinceUpdateSeconds = Math.floor(+new Date() / 1000) - (stackid.lastUpdate ?? 0);
                const timeLeft = ttlSeconds - timeSinceUpdateSeconds;
                console.log(`stack '${fqsn}' with TTL tag '${stack.tags[tag]}': ${timeLeft} seconds left`);
                if (timeLeft <= 0) {
                    stacksToDestroy[fqsn] = {
                        ttl: stack.tags[tag],
                        runtime: stack.tags["pulumi:runtime"],
                    };
                    console.log(`registering stack ${fqsn} for deletion`)
                }
                break;
            }
        }
    }
    for (const fqsn in stacksToDestroy) {
        console.log(`destroying stack ${fqsn}...`)
        const stackDetails = stacksToDestroy[fqsn];
        await postDeployment("destroy", fqsn, "https://github.com/lukehoban/blank", "refs/heads/main", [
            // Try to remove the stack if it has no resources.
            // TODO: Ideally this would be a post-run command or a `--rm` flag on the destroy operation.
            `pulumi stack rm -y -s ${fqsn} || true`,
            `echo "name: ${fqsn.split("/")[1]}" > Pulumi.yaml`,
            `echo "runtime: ${stackDetails.runtime}" >> Pulumi.yaml`,
            `pulumi config refresh -s ${fqsn}`,
        ]);
        console.log(`destroyed stack ${fqsn}.`)
    }
});

export const functionArn = subscription.func.name;
