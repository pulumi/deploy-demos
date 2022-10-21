
import * as awsx from "@pulumi/awsx";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import fetch from "node-fetch";

import * as crypto from "crypto";

const config = new pulumi.Config();

const stackConfig = {
    // Webhook secret used to authenticate messages. Must match the value on the
    // webhook's settings.
    sharedSecret: config.get("sharedSecret"),
    pulumiAccessToken: config.requireSecret("pulumiAccessToken"),
};

// Just logs information from an incoming webhook request.
function logRequest(req: awsx.apigateway.Request) {
    const webhookID = req.headers !== undefined ? req.headers["pulumi-webhook-id"] : "";
    const webhookKind = req.headers !== undefined ? req.headers["pulumi-webhook-kind"] : "";
    console.log(`Received webhook from Pulumi ${webhookID} [${webhookKind}]`);
}

// Webhooks can optionally be configured with a shared secret, so that webhook handlers like this app can authenticate
// message integrity. Rejects any incoming requests that don't have a valid "pulumi-webhook-signature" header.
function authenticateRequest(req: awsx.apigateway.Request): awsx.apigateway.Response | undefined {
    const webhookSig = req.headers !== undefined ? req.headers["pulumi-webhook-signature"] : "";
    if (!stackConfig.sharedSecret || !webhookSig) {
        return undefined;
    }

    const payload = Buffer.from(req.body!.toString(), req.isBase64Encoded ? "base64" : "utf8");
    const hmacAlg = crypto.createHmac("sha256", stackConfig.sharedSecret);
    const hmac = hmacAlg.update(payload).digest("hex");

    const result = crypto.timingSafeEqual(Buffer.from(webhookSig), Buffer.from(hmac));
    if (!result) {
        console.log(`Mismatch between expected signature and HMAC: '${webhookSig}' vs. '${hmac}'.`);
        return { statusCode: 400, body: "Unable to authenticate message: Mismatch between signature and HMAC" };
    }

    return undefined;
}

type ReaperMessage = {
    organization: string;
    project: string;
    stack: string;
    expiration: string;
}

// the queue for scheduling stack deletion
const queue = new aws.sqs.Queue("reaper-queue", {
    visibilityTimeoutSeconds: 181, // TODO: tighten this up as well as lambda timeout
});

// this processor looks for messages in the queue one at a time that have passed their expiry.
// if a message has not passed it's expriy, then it throws an error so the message gets retried.
// expired messages trigger destroy operations via the pulumi deployment api.
queue.onEvent("reaper-queue-processor", async (e) => {
    console.log("queue processor running");
    const messagesToRetry = [];
    for (let rec of e.Records) {
        const message = JSON.parse(rec.body)
        const organization = message.organization;
        const project = message.project
        const stack = message.stack;
        const expiration = new Date(message.expiration);
        const now = new Date();
        console.log(`processing message with expiration ${expiration} for stack ${organization}/${project}/${stack}\n`)

        // if we're already past the expiry, then schedule a destroy for the stack.
        // we'll pass in the ambiently available lambda environment variables to the deployment.
        // in addition, we'll do some additional work to set up a "dummy" directory with
        // a `pulumi.yaml` file needed for the destory, and run a pulumi refresh to hydrate the last applied config
        if (expiration < now) {
            console.log(`stack has expired, scheduling destroy: ${organization}/${project}/${stack}\n`)
            const url = `https://api.pulumi.com/api/preview/${organization}/${project}/${stack}/deployments`
            const headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `token ${stackConfig.pulumiAccessToken.get()}`
            };

            // The Pulumi.yaml file is necessary for pulumi stack yaml
            const yamlProgram = `name: ${project}
runtime: nodejs
`;

            const payload = {
                sourceContext: {
                    git: {
                        repoURL: "https://github.com/pulumi/examples.git", // use a random public repo so as to not require a github token
                        branch: "refs/heads/master",
                        repoDir: "aws-go-lambda", // dummy repo. What is in here doesn't matter
                    }
                },
                operationContext: {
                    operation: "destroy",
                    preRunCommands: [
                        // the pulumi program gets written to disk via pre-run commands
                        // TODO: remove `cd` when https://github.com/pulumi/pulumi-service/issues/10428 is fixed
                        `echo "$YAML_PROGRAM" | base64 -d | tee Pulumi.yaml`,
                        `pulumi stack select ${organization}/${stack} && pulumi config refresh`,
                        `ls`,
                        `cat Pulumi.yaml`
                    ],
                    environmentVariables: {
                        YAML_PROGRAM: Buffer.from(yamlProgram).toString('base64'), // pass the program as an env var
                        AWS_REGION: "us-west-2",
                        // pass in environment variables available in the current lambda execution role to destroy the target program
                        AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID,
                        AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY,
                        AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN,
                    }
                }
            };

            await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });

            console.log(`destroy queued: ${organization}/${project}/${stack}\n`);

            // continue to the next message (right now it is one message per batch);
            // if we make it through the loop without error, then the batch is marked as complete an will not be retried.
            continue;
        }

        messagesToRetry.push({ "itemIdentifier": rec.messageId });
        // if we're not past the expiry, we'll just throw an error so the message gets reprocessed
        // TODO: should return partial batch success pending https://github.com/pulumi/pulumi-aws/issues/2048
        throw new Error(`waitng until ${expiration} to destroy stack ${organization}/${project}/${stack}!\n`)
    }
}, {
    batchSize: 1,
    maximumBatchingWindowInSeconds: 0,
});

/**
 * the reaper webhook processes all stack updates, looks up "reap" tags, and schedules corresponding stacks for deletion
 * via messages in an SQS queue
 */
const webhookHandler = new awsx.apigateway.API("reaper-webhook-handler", {
    restApiArgs: {
        binaryMediaTypes: ["application/json"],
    },
    routes: [{
        path: "/",
        method: "GET",
        eventHandler: async () => ({
            statusCode: 200,
            body: "🍹 Pulumi Webhook Responder🍹\n",
        }),
    }, {
        path: "/",
        method: "POST",

        eventHandler: async (req) => {
            logRequest(req);
            const authenticateResult = authenticateRequest(req);
            if (authenticateResult) {
                return authenticateResult;
            }

            const webhookKind = req.headers !== undefined ? req.headers["pulumi-webhook-kind"] : "";
            const bytes = req.body!.toString();
            const payload = Buffer.from(bytes, "base64").toString();
            const parsedPayload = JSON.parse(payload);

            if (webhookKind === "stack_update" && parsedPayload.kind === "update") {

                let organization = parsedPayload.organization.name;
                let stack = parsedPayload.stackName;
                let project = parsedPayload.projectName;


                console.log(`processing update handler for stack: ${organization}/${project}/${stack}!\n`)

                const url = `https://api.pulumi.com/api/stacks/${organization}/${project}/${stack}`
                const headers = {
                    'Accept': 'application/json',
                    'Content-Type': 'application/json',
                    'Authorization': `token ${stackConfig.pulumiAccessToken.get()}`
                };
                const response = await fetch(url, {
                    method: "GET",
                    headers
                });


                if (!response.ok) {
                    let errMessage = "";
                    try {
                        errMessage = await response.text();
                    } catch { }
                    throw new Error(`failed to get stack: ${errMessage}`)
                }

                const stackResult = await response.json();
                const reapTag = (stackResult as any)?.tags?.reap;
                if (!reapTag) {
                    console.log(`no reap tag found for stack: ${organization}/${project}/${stack}!\n`)
                    return { statusCode: 200, body: `noop for stack ${organization}/${project}/${stack}!\n` };
                }

                console.log(`reap tag found for stack, queueing SQS message: ${organization}/${project}/${stack}!\n`)

                let time = new Date();
                const expirationMinutes = parseInt(reapTag) || 30;
                time = new Date(time.getTime() + 60000 * expirationMinutes);

                const message = {
                    stack,
                    project,
                    organization,
                    expiration: time.toISOString(),
                }

                const params = {
                    // Remove DelaySeconds parameter and value for FIFO queues
                    DelaySeconds: 10,
                    MessageBody: JSON.stringify(message),
                    QueueUrl: queue.url.get(),
                };

                const sqsClient = new aws.sdk.SQS();

                await new Promise((resolve, reject) => {
                    sqsClient.sendMessage(params, (err, data) => {
                        if (err) {
                            console.log(err);
                            reject(err)
                        }
                        console.log(`scheduled cleanup for stack ${organization}/${project}/${stack} at ${time.toUTCString()}!\n`)
                        resolve(data);
                    });
                });

                return { statusCode: 200, body: `scheduled cleanup for stack ${organization}/${project}/${stack}\n` };
            }

            return { statusCode: 200, body: `noop!\n` };
        },
    }],
});

export const url = webhookHandler.url;
