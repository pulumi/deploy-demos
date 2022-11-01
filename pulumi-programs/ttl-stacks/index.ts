import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import * as service from "@pulumi/pulumiservice";
import * as random from "@pulumi/random";
import * as crypto from "crypto";
import fetch from "node-fetch";

console.log(process.env);

const config = new pulumi.Config();
const stackConfig = {
  // Webhook secret used to authenticate messages. Must match the value on the
  // webhook's settings.
  sharedSecret: new random.RandomString("shared-secret", { length: 16 }),
  pulumiAccessToken: config.requireSecret("pulumiAccessToken"),
};

const image = awsx.ecr.buildAndPushImage("stack-ttl", {
  context: "./app",
});

const lambdaRole = new aws.iam.Role("stack-ttl-lambda-role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "lambda.amazonaws.com",
  }),
  managedPolicyArns: [
    aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
    aws.iam.ManagedPolicies.AmazonS3FullAccess,
    aws.iam.ManagedPolicy.AmazonSQSFullAccess,
  ],
});

// new aws.iam.RolePolicyAttachment("stack-ttl-lambda-policy-attachment", {
//   role: lambdaRole.name,
//   policyArn: aws.iam.ManagedPolicy.LambdaFullAccess,
// });

const queueProcessor = new aws.lambda.Function("stack-ttl-queue-processor", {
  packageType: "Image",
  imageUri: image.imageValue,
  role: lambdaRole.arn,
  timeout: 60,
  memorySize: 512,
  environment: {
    variables: {
      PULUMI_HOME: "/tmp/pulumi",
      PULUMI_ACCESS_TOKEN: stackConfig.pulumiAccessToken,
      GITHUB_ACCESS_TOKEN: config.requireSecret("githubAccessToken"),
    },
  },
  // imageConfig: {
  //   entryPoints: []
  // }
  // layers: [
  //   new aws.lambda.LayerVersion("secrets", {

  //   }),
  // ]
  // environment: {
  //   variables: {
  // AWS_REGION: "us-west-2",
  // TODO: LayerVersion these secrets
  // AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID || "",
  // AWS_SECRET_ACCESS_KEY: process.env.AWS_SECRET_ACCESS_KEY || "",
  // AWS_SESSION_TOKEN: process.env.AWS_SESSION_TOKEN || "",
  //   },
  // },
});

// Just logs information from an incoming webhook request.
function logRequest(req: awsx.apigateway.Request) {
  const webhookID =
    req.headers !== undefined ? req.headers["pulumi-webhook-id"] : "";
  const webhookKind =
    req.headers !== undefined ? req.headers["pulumi-webhook-kind"] : "";
  console.log(`Received webhook from Pulumi ${webhookID} [${webhookKind}]`);
}

// Webhooks can optionally be configured with a shared secret, so that webhook
// handlers like this app can authenticate message integrity. Rejects any
// incoming requests that don't have a valid "pulumi-webhook-signature" header.
function authenticateRequest(
  req: awsx.apigateway.Request
): awsx.apigateway.Response | undefined {
  const webhookSig =
    req.headers !== undefined ? req.headers["pulumi-webhook-signature"] : "";
  if (!stackConfig.sharedSecret || !webhookSig) {
    return undefined;
  }

  const payload = Buffer.from(
    req.body!.toString(),
    req.isBase64Encoded ? "base64" : "utf8"
  );
  const hmacAlg = crypto.createHmac(
    "sha256",
    stackConfig.sharedSecret.result.get()
  );
  const hmac = hmacAlg.update(payload).digest("hex");

  const result = crypto.timingSafeEqual(
    Buffer.from(webhookSig),
    Buffer.from(hmac)
  );
  if (!result) {
    console.log(
      `Mismatch between expected signature and HMAC: '${webhookSig}' vs. '${hmac}'.`
    );
    return {
      statusCode: 400,
      body: "Unable to authenticate message: Mismatch between signature and HMAC",
    };
  }

  return undefined;
}

type ttlMessage = {
  organization: string;
  project: string;
  stack: string;
  expiration: string;
};

// the queue for scheduling stack deletion
const queue = new aws.sqs.Queue("ttl-queue", {
  visibilityTimeoutSeconds: 181, // TODO: tighten this up as well as lambda timeout
});

// this processor looks for messages in the queue one at a time that have
// passed their expiry. if a message has not passed it's expriy, then it throws
// an error so the message gets retried. expired messages trigger destroy
// operations via the pulumi deployment api.
queue.onEvent("stack-ttl-queue-processor", queueProcessor, {
  batchSize: 1,
  maximumBatchingWindowInSeconds: 0,
});

/** the ttl webhook processes all stack updates, looks up "ttl" tags, and
 * schedules corresponding stacks for deletion via messages in an SQS queue
 */
const webhookHandler = new awsx.apigateway.API("ttl-webhook-handler", {
  restApiArgs: {
    binaryMediaTypes: ["application/json"],
  },
  routes: [
    // {
    //   path: "/",
    //   method: "GET",
    //   eventHandler: async () => ({
    //     statusCode: 200,
    //     body: "🍹 Pulumi Webhook Responder🍹\n",
    //   }),
    // },
    {
      path: "/",
      method: "POST",

      eventHandler: async (req) => {
        logRequest(req);
        const authenticateResult = authenticateRequest(req);
        if (authenticateResult) {
          return authenticateResult;
        }

        const webhookKind =
          req.headers !== undefined ? req.headers["pulumi-webhook-kind"] : "";
        const bytes = req.body!.toString();
        const payload = Buffer.from(bytes, "base64").toString();
        const parsedPayload = JSON.parse(payload);

        if (webhookKind === "stack_update" && parsedPayload.kind === "update") {
          let organization = parsedPayload.organization.githubLogin;
          let stack = parsedPayload.stackName;
          let project = parsedPayload.projectName;

          console.log(
            `processing update handler for stack: ${organization}/${project}/${stack}!\n`
          );

          const url = `https://api.pulumi.com/api/stacks/${organization}/${project}/${stack}`;
          const headers = {
            Accept: "application/json",
            "Content-Type": "application/json",
            Authorization: `token ${stackConfig.pulumiAccessToken.get()}`,
          };
          const response = await fetch(url, {
            method: "GET",
            headers,
          });

          if (!response.ok) {
            let errMessage = "";
            try {
              errMessage = await response.text();
            } catch {}
            throw new Error(`failed to get stack: ${errMessage}`);
          }

          const stackResult = await response.json();
          const ttlTag = (stackResult as any)?.tags?.ttl;
          if (!ttlTag) {
            console.log(
              `no ttl tag found for stack: ${organization}/${project}/${stack}!\n`
            );
            return {
              statusCode: 200,
              body: `noop for stack ${organization}/${project}/${stack}!\n`,
            };
          }

          console.log(
            `ttl tag found for stack, queueing SQS message: ${organization}/${project}/${stack}!\n`
          );

          let time = new Date();
          const expirationMinutes = parseInt(ttlTag) || 30;
          time = new Date(time.getTime() + 60000 * expirationMinutes);

          const message = {
            stack,
            project,
            organization,
            expiration: time.toISOString(),
          };

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
                reject(err);
              }
              console.log(
                `scheduled cleanup for stack ${organization}/${project}/${stack} at ${time.toUTCString()}!\n`
              );
              resolve(data);
            });
          });

          return {
            statusCode: 200,
            body: `scheduled cleanup for stack ${organization}/${project}/${stack}\n`,
          };
        }

        return { statusCode: 200, body: `noop!\n` };
      },
    },
  ],
});

const webhook = new service.Webhook("stack-ttl-webhook", {
  payloadUrl: webhookHandler.url,
  active: true,
  displayName: "stack-ttl-webhook",
  organizationName: "pulumi",
  secret: stackConfig.sharedSecret.result,
});

export const url = webhookHandler.url;
