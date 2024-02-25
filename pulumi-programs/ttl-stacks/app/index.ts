import * as automation from "@pulumi/pulumi/automation";

type input = {
  organization: string;
  project: string;
  stack: string;
};

export const handler = async ({ organization, project, stack }: input) => {
  console.log(`processing destroy for ${organization}/${project}/${stack}\n`);

  const stackName = automation.fullyQualifiedStackName(
    organization,
    project,
    stack
  );

  const stackToDestroy = await automation.RemoteWorkspace.selectStack(
    {
      stackName: stackName,
      url: "https://github.com/pulumi/deploy-demos.git",
      branch: "refs/heads/ced",
      projectPath: `pulumi-programs/${project}`,
      auth: {
        personalAccessToken: process.env.GITHUB_ACCESS_TOKEN,
      },
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

  console.log(`destroy queued: ${organization}/${project}/${stack}\n`);

  await stackToDestroy.destroy();

  console.log("done!");
};
