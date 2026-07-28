
import * as apigateway from "@pulumi/aws-apigateway";
import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";
import { SQSClient, SendMessageCommand } from "@aws-sdk/client-sqs";

import * as crypto from "crypto";

// Structural types matching the API Gateway proxy request/response shapes
// (formerly awsx.apigateway.Request/Response).
interface Request {
    headers?: { [name: string]: string };
    body: string | null;
    isBase64Encoded: boolean;
}

interface Response {
    statusCode: number;
    body: string;
}

const config = new pulumi.Config();

const stackConfig = {
    // Webhook secret used to authenticate messages. Must match the value on the
    // webhook's settings.
    sharedSecret: config.get("sharedSecret"),
    pulumiAccessToken: config.requireSecret("pulumiAccessToken"),
};

// Secrets reach the handlers as Lambda environment variables rather than being read
// inside the callbacks. A closure that reads them directly gets them serialized into
// the deployment package as plaintext, where anyone who can download the zip can read
// them; as environment variables they are encrypted at rest instead.
const secretEnvironment = {
    variables: {
        PULUMI_ACCESS_TOKEN: stackConfig.pulumiAccessToken,
        WEBHOOK_SHARED_SECRET: stackConfig.sharedSecret ?? "",
    },
};

// Just logs information from an incoming webhook request.
function logRequest(req: Request) {
    const webhookID = req.headers !== undefined ? req.headers["pulumi-webhook-id"] : "";
    const webhookKind = req.headers !== undefined ? req.headers["pulumi-webhook-kind"] : "";
    console.log(`Received webhook from Pulumi ${webhookID} [${webhookKind}]`);
}

// Webhooks can optionally be configured with a shared secret, so that webhook handlers like this app can authenticate
// message integrity. Rejects any incoming requests that don't have a valid "pulumi-webhook-signature" header.
function authenticateRequest(req: Request): Response | undefined {
    const webhookSig = req.headers !== undefined ? req.headers["pulumi-webhook-signature"] : "";
    const sharedSecret = process.env.WEBHOOK_SHARED_SECRET;
    if (!sharedSecret || !webhookSig) {
        return undefined;
    }

    const payload = Buffer.from(req.body!.toString(), req.isBase64Encoded ? "base64" : "utf8");
    const hmacAlg = crypto.createHmac("sha256", sharedSecret);
    const hmac = hmacAlg.update(payload).digest("hex");

    const result = crypto.timingSafeEqual(Buffer.from(webhookSig), Buffer.from(hmac));
    if (!result) {
        console.log(`Mismatch between expected signature and HMAC: '${webhookSig}' vs. '${hmac}'.`);
        return { statusCode: 400, body: "Unable to authenticate message: Mismatch between signature and HMAC" };
    }

    return undefined;
}

// The most SQS will hold a delayed message for.
const SQS_MAX_DELAY_SECONDS = 900;

type ttlMessage = {
    organization: string;
    project: string;
    stack: string;
    expiration: string;
}

// Retention is raised from the 4-day default so evidence survives a long weekend —
// a message here is a stack that will never be destroyed.
const deadLetterQueue = new aws.sqs.Queue("ttl-dlq", {
    messageRetentionSeconds: 1209600, // 14 days
});

// A dead-letter queue nobody watches turns a loud failure into a silent leak, which is
// the exact failure mode this program exists to prevent. Alarm on the first message.
new aws.cloudwatch.MetricAlarm("ttl-dlq-not-empty", {
    alarmDescription: "ttl-stacks dead-letter queue is non-empty: one or more stacks will never be destroyed.",
    namespace: "AWS/SQS",
    metricName: "ApproximateNumberOfMessagesVisible",
    dimensions: { QueueName: deadLetterQueue.name },
    statistic: "Maximum",
    period: 300,
    evaluationPeriods: 1,
    comparisonOperator: "GreaterThanOrEqualToThreshold",
    threshold: 1,
    treatMissingData: "notBreaching",
});

// the queue for scheduling stack deletion
const queue = new aws.sqs.Queue("ttl-queue", {
    visibilityTimeoutSeconds: 181, // TODO: tighten this up as well as lambda timeout
    redrivePolicy: pulumi.jsonStringify({
        deadLetterTargetArn: deadLetterQueue.arn,
        maxReceiveCount: 5,
    }),
});

// Left to itself a CallbackFunction attaches ten FullAccess managed policies, including
// AmazonSQSFullAccess on every queue in the account. Each function here gets a role with
// nothing but log writes and the specific queue actions it makes.
function lambdaRole(name: string, queueActions: string[]): aws.iam.Role {
    const role = new aws.iam.Role(`${name}-role`, {
        assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({ Service: "lambda.amazonaws.com" }),
        managedPolicyArns: [aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole],
    });
    if (queueActions.length > 0) {
        new aws.iam.RolePolicy(`${name}-queue-access`, {
            role: role.name,
            policy: {
                Version: "2012-10-17",
                Statement: [{
                    Effect: "Allow",
                    Action: queueActions,
                    Resource: queue.arn,
                }],
            },
        });
    }
    return role;
}

// The event source mapping polls on the function's behalf, so the processor needs the read
// side as well as SendMessage for the re-queue of a stack that hasn't expired yet.
const processorRole = lambdaRole("ttl-queue-processor", [
    "sqs:ReceiveMessage",
    "sqs:DeleteMessage",
    "sqs:GetQueueAttributes",
    "sqs:SendMessage",
]);

// This processor looks at messages one at a time. Expired stacks are destroyed via the
// Pulumi Deployments API; stacks that are not yet expired are re-queued with a delay.
//
// The function is built explicitly rather than passed as a bare closure because onEvent's
// args only reach the event source mapping — there is no way to set the role through it.
queue.onEvent("ttl-queue-processor", new aws.lambda.CallbackFunction("ttl-queue-processor", {
    // CallbackFunction still defaults to nodejs22.x, which is in maintenance.
    runtime: aws.lambda.Runtime.NodeJS24dX,
    role: processorRole,
    environment: secretEnvironment,
    callback: async (e: aws.sqs.QueueEvent) => {
    console.log("queue processor running");
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
            const url = `https://api.pulumi.com/api/stacks/${organization}/${project}/${stack}/deployments`
            const headers = {
                'Accept': 'application/json',
                'Content-Type': 'application/json',
                'Authorization': `token ${process.env.PULUMI_ACCESS_TOKEN}`
            };

            // The Pulumi.yaml file is necessary for pulumi stack yaml
            const yamlProgram = `name: ${project}
runtime: nodejs
`;

            const payload = {
                operation: "destroy",
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

            const response = await fetch(url, {
                method: "POST",
                headers,
                body: JSON.stringify(payload),
            });

            // Without this check a rejected deployment request still logs "destroy
            // queued" and the SQS message is dropped, so the stack leaks silently.
            if (!response.ok) {
                let errMessage = "";
                try {
                    errMessage = await response.text();
                } catch { }
                throw new Error(`failed to queue destroy for ${organization}/${project}/${stack}: ${response.status} ${errMessage}`)
            }

            console.log(`destroy queued: ${organization}/${project}/${stack}\n`);

            // continue to the next message (right now it is one message per batch);
            // if we make it through the loop without error, then the batch is marked as complete an will not be retried.
            continue;
        }

        // Not expired yet. Re-enqueue with a delay rather than failing the message:
        // failing it would make SQS's receive count track how long we have been
        // waiting rather than whether anything is wrong, so the dead-letter threshold
        // below would fire on healthy stacks with a TTL longer than a few minutes.
        // A TTL longer than SQS's delay ceiling simply round-trips more than once.
        const secondsUntilExpiry = Math.ceil((expiration.getTime() - now.getTime()) / 1000);
        const delaySeconds = Math.min(SQS_MAX_DELAY_SECONDS, Math.max(0, secondsUntilExpiry));

        // Can't use `queue.url.get()` here as the webhook handler below does: this closure
        // is the queue's own event handler, so referencing it would be a cycle. Recover the
        // URL from the record's ARN instead.
        const [, , , region, accountId, queueName] = rec.eventSourceARN.split(":");
        const queueUrl = `https://sqs.${region}.amazonaws.com/${accountId}/${queueName}`;

        await new SQSClient().send(new SendMessageCommand({
            DelaySeconds: delaySeconds,
            MessageBody: rec.body,
            QueueUrl: queueUrl,
        }));
        console.log(`not yet expired, re-queued for ${delaySeconds}s: ${organization}/${project}/${stack} (expires ${expiration.toISOString()})\n`);
    }
    },
}), {
    batchSize: 1,
    maximumBatchingWindowInSeconds: 0,
});

/**
 * the ttl webhook processes all stack updates, looks up "ttl" tags, and schedules corresponding stacks for deletion
 * via messages in an SQS queue
 */
const webhookHandler = new apigateway.RestAPI("ttl-webhook-handler", {
    binaryMediaTypes: ["application/json"],
    routes: [{
        path: "/",
        method: "GET",
        eventHandler: new aws.lambda.CallbackFunction("ttl-webhook-get", {
            runtime: aws.lambda.Runtime.NodeJS24dX,
            role: lambdaRole("ttl-webhook-get", []),
            callback: async () => ({
                statusCode: 200,
                body: "🍹 Pulumi Webhook Responder🍹\n",
            }),
        }),
    }, {
        path: "/",
        method: "POST",

        eventHandler: new aws.lambda.CallbackFunction("ttl-webhook-post", {
            runtime: aws.lambda.Runtime.NodeJS24dX,
            role: lambdaRole("ttl-webhook-post", ["sqs:SendMessage"]),
            environment: secretEnvironment,
            callback: async (req: Request): Promise<Response> => {
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
                        'Authorization': `token ${process.env.PULUMI_ACCESS_TOKEN}`
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
                        throw new Error(`failed to get stack ${organization}/${project}/${stack}: ${response.status} ${errMessage}`)
                    }

                    const stackResult = await response.json();
                    const ttlTag = (stackResult as any)?.tags?.ttl;
                    if (!ttlTag) {
                        console.log(`no ttl tag found for stack: ${organization}/${project}/${stack}!\n`)
                        return { statusCode: 200, body: `noop for stack ${organization}/${project}/${stack}!\n` };
                    }

                    console.log(`ttl tag found for stack, queueing SQS message: ${organization}/${project}/${stack}!\n`)

                    let time = new Date();
                    const expirationMinutes = parseInt(ttlTag) || 30;
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

                    const sqsClient = new SQSClient();

                    await sqsClient.send(new SendMessageCommand(params));
                    console.log(`scheduled cleanup for stack ${organization}/${project}/${stack} at ${time.toUTCString()}!\n`)

                    return { statusCode: 200, body: `scheduled cleanup for stack ${organization}/${project}/${stack}\n` };
                }

                return { statusCode: 200, body: `noop!\n` };
            },
        }),
    }],
});

export const url = webhookHandler.url;
