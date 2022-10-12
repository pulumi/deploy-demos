> **_NOTE:_**  This is a feature in private preview. By getting access to this repository you understand not speak publicly about the feature and not to discuss it with users outside of the private preview.  

# Pulumi Deploy

Pulumi Deploy is a new product to power infrastructure and platform automation. It consists of three components:

1. __The Programmatic Deployment API__ - run Pulumi programs (`pulumi up`, `pulumi refresh`, etc) on Pulumi Service hardware (api.pulumi.com).
2. __Deployment Visualization__ - rich UX to visualize deployment status, deployment logs, and queueing from via the Pulumi Service Console (app.pulumi.com). (coming soon!)
3. __`git push` to Deploy__ -  Configure a stack to deploy automatically in response to `git push` events by installing the Pulumi GitHub App.(coming soon!)

A deployment in the Pulumi Service runs on an isolated, single use deployment runner (a virtual machine). That runner will prepare the runtime environment, clone source code, set up any necessary environment variables, run the Pulumi program, and handle reporting logs and status back to the Pulumi Service.

This API enables many of the same scenarios as Automation API, like platform building, self-service infrastructure, customer infrastructure workflows and portals, and more. The main difference is that Automation API programs run on your hardware, where you're responsible for handling asynchrony, workflow, reporting status, cancellatios, etc. The Pulumi Deployment API takes care of workflow for you, providing API endpoints to monitor deployments, tail update logs, queue deployments, and cancel deployments. 

## Docs

- [API Docs](./docs/api-docs.md)
- [Git Push To Deploy](./docs/git-push-to-deploy.md)
- [Deployment Driver Sample (TypeScript)](./deployment-drivers/nodejs/typescript-driver/README.md)
- [Deployment Driver Sample (Go)](./deployment-drivers/go/cli/README.md)

## Examples

Deployment driver examples show using the Pulumi Deployment API to create deployments, monitor status, and tail logs.

- [typescript-driver](./deployment-drivers/nodejs/typescript-driver/) a deployment driver written in Typescript. It can deploy Pulumi programs written in any language.
- [Go CLI driver](./deployment-drivers/go/cli/) a deployment driver written in Typescript. It can deploy Pulumi programs written in any language.

## Pulumi Programs

We have a set of demo Pulumi programs that can be conveniently referenced as git source within this repo. They can be found in the [pulumi-programs](./pulumi-programs/) directory.

## Share feedback
We are really excited to start garnering feedback on Pulumi Deploy from users. Please feel free to open an issue in this repo for enhancements or bugs or ask to be invited to the private #pulumi-deploy-beta Slack channel to ask us questions.
