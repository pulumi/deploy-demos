import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";
import * as pulumi from "@pulumi/pulumi";
import * as service from "@pulumi/pulumiservice";
import * as random from "@pulumi/random";
import * as crypto from "crypto";
import fetch from "node-fetch";

const config = new pulumi.Config();
const region = aws.config.requireRegion();

// Webhook secret used to authenticate messages. Must match the value on the
// webhook's settings.
const sharedSecret = new random.RandomString("shared-secret", { length: 16 });

// The Pulumi token our Destroy lambda will use with Automation API.
const pulumiAccessToken = config.requireSecret("pulumiAccessToken");

// We'll run our Destroy lambda in a container to get our package dependencies
// set up.
const image = awsx.ecr.buildAndPushImage("stack-ttl", {
  context: "./app",
});

// Permissions for our lambdas and step functions. These are appropriate for a
// demo but too broad for production.
const lambdaRole = new aws.iam.Role("stack-ttl-lambda-role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: "lambda.amazonaws.com",
  }),
  managedPolicyArns: [
    aws.iam.ManagedPolicy.AWSLambdaBasicExecutionRole,
    aws.iam.ManagedPolicy.AmazonS3FullAccess,
    aws.iam.ManagedPolicy.AWSStepFunctionsFullAccess,
  ],
});
const sfnRole = new aws.iam.Role("stack-ttl-sfn-role", {
  assumeRolePolicy: aws.iam.assumeRolePolicyForPrincipal({
    Service: `states.${region}.amazonaws.com`,
  }),
  managedPolicyArns: [
    aws.iam.ManagedPolicy.LambdaFullAccess,
    aws.iam.ManagedPolicy.CloudWatchLogsFullAccess,
  ],
});

// The lambda our step function will invoke when it's time to actually destroy
// the stack. See app/index.ts for its implementation.
const destroyFunction = new aws.lambda.Function("stack-ttl-destroyer", {
  packageType: "Image",
  imageUri: image.imageValue,
  role: lambdaRole.arn,
  timeout: 60,
  memorySize: 512,
  environment: {
    variables: {
      PULUMI_HOME: "/tmp/pulumi",
      PULUMI_ACCESS_TOKEN: pulumiAccessToken,
      GITHUB_ACCESS_TOKEN: config.requireSecret("githubAccessToken"),
    },
  },
});

// The lambda invoked when Pulumi sends us a webhook notification that a stack
// operation has taken place.
//
// Broadly speaking, this will authenticate the request, query the Pulumi REST
// API to determine tags attached to the stack, and if it includes a "ttl: N"
// tag it will schedule the Destroy lambda to execute after N minutes.
const webhookCallback = new aws.lambda.CallbackFunction("webhook", {
  callback: async (req: awsx.apigateway.Request) => {
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
        Authorization: `token ${pulumiAccessToken.get()}`,
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
        `ttl tag found for stack, enqueueing destroy: ${organization}/${project}/${stack}!\n`
      );

      const expirationMinutes = parseInt(ttlTag) ?? 30;

      // Schedule state machine with a delay
      const sfnClient = new aws.sdk.StepFunctions();
      await sfnClient
        .startExecution({
          stateMachineArn: cleanup.arn.get(),
          input: JSON.stringify({
            delaySeconds: expirationMinutes * 60,
            stack: stack,
            project: project,
            organization: organization,
          }),
        })
        .promise();

      console.log(
        `scheduled cleanup for stack ${organization}/${project}/${stack} in ${expirationMinutes} minutes!\n`
      );

      return {
        statusCode: 200,
        body: `scheduled cleanup for stack ${organization}/${project}/${stack}\n`,
      };
    }

    return { statusCode: 200, body: `noop!\n` };
  },
  role: lambdaRole,
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
  if (!sharedSecret || !webhookSig) {
    return undefined;
  }

  const payload = Buffer.from(
    req.body!.toString(),
    req.isBase64Encoded ? "base64" : "utf8"
  );
  const hmacAlg = crypto.createHmac("sha256", sharedSecret.result.get());
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

// This exposes our webhook callback to the world.
const webhookHandler = new awsx.apigateway.API("ttl-webhook-handler", {
  restApiArgs: {
    binaryMediaTypes: ["application/json"],
  },
  routes: [
    {
      path: "/",
      method: "POST",
      eventHandler: webhookCallback,
    },
  ],
});

// This uses the Pulumi service provider to provision a Pulumi webhook for
// ourselves. This sends events whenever stack operations occur.
const pulumiWebhook = new service.Webhook("stack-ttl-webhook", {
  payloadUrl: webhookHandler.url,
  active: true,
  displayName: "stack-ttl-webhook",
  organizationName: "pulumi",
  secret: sharedSecret.result,
});

// This state machine runs the Destroy lambda after waiting for the provided
// number of seconds -- potentially for days or weeks.
const cleanup = new aws.sfn.StateMachine("cleanup", {
  roleArn: sfnRole.arn,
  definition: destroyFunction.arn.apply((arn) => {
    return JSON.stringify({
      Comment: "Invokes a lambda to destroy a stack after a delay",
      StartAt: "Wait",
      States: {
        Wait: {
          Type: "Wait",
          SecondsPath: "$.delaySeconds",
          Next: "Destroy",
        },
        Destroy: {
          Type: "Task",
          Resource: "arn:aws:states:::lambda:invoke",
          Parameters: {
            "Payload.$": "$",
            FunctionName: arn,
          },
          End: true,
        },
      },
    });
  }),
});
