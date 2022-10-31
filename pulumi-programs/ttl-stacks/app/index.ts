import * as aws from "@pulumi/aws";
import * as pulumi from "@pulumi/pulumi";

export const handler: aws.sqs.QueueEventHandler = async (e) => {
  console.log("queue processor running");
  const messagesToRetry = [];
  for (let rec of e.Records) {
    const message = JSON.parse(rec.body);
    const organization = message.organization;
    const project = message.project;
    const stack = message.stack;
    const expiration = new Date(message.expiration);
    const now = new Date();
    console.log(
      `processing message with expiration ${expiration} for stack ${organization}/${project}/${stack}\n`
    );

    // if we're already past the expiry, then schedule a destroy for the
    // stack. we'll pass in the ambiently available lambda environment
    // variables to the deployment. in addition, we'll do some additional
    // work to set up a "dummy" directory with a `pulumi.yaml` file needed
    // for the destory, and run a pulumi refresh to hydrate the last applied
    // config
    if (expiration < now) {
      console.log(
        `stack has expired, scheduling destroy: ${organization}/${project}/${stack}\n`
      );

      const stackToDestroy =
        await pulumi.automation.RemoteWorkspace.createOrSelectStack(
          {
            stackName: stack,
            url: "https://github.com/pulumi/deploy-demos.git",
            branch: "refs/heads/ced",
            projectPath: `pulumi-programs/${stack}`,
          },
          {
            envVars: {
              AWS_REGION: "us-west-2",
              AWS_ACCESS_KEY_ID: process.env.AWS_ACCESS_KEY_ID ?? "",
              AWS_SECRET_ACCESS_KEY: {
                secret: process.env.AWS_SECRET_ACCESS_KEY ?? "",
              },
              AWS_SESSION_TOKEN: {
                secret: process.env.AWS_SESSION_TOKEN ?? "",
              },
            },
          }
        );

      stackToDestroy.destroy();

      console.log(`destroy queued: ${organization}/${project}/${stack}\n`);

      // continue to the next message (right now it is one message per
      // batch); if we make it through the loop without error, then the batch
      // is marked as complete an will not be retried.
      continue;
    }

    messagesToRetry.push({ itemIdentifier: rec.messageId });

    // if we're not past the expiry, we'll just throw an error so the message
    // gets reprocessed. TODO: we should process more than one message per
    // run and should return partial batch success pending
    // https://github.com/pulumi/pulumi-aws/issues/2048
    throw new Error(
      `waitng until ${expiration} to destroy stack ${organization}/${project}/${stack}!\n`
    );
  }
};
