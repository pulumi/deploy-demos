# Pulumi Deploy

`Pulumi Deploy` is a new product to power infrastructure and plaform automation. It consists of three components:

1. __The Programmatic Deployment API__ - run Pulumi programs (`pulumi up`, `pulumi refresh`, etc) on Pulumi Service hardware (api.pulumi.com).
2. __Deployment Visualization__ - rich UX to visualize deployment status, deployment logs, and queueing from via the Pulumi Service Console (app.pulumi.com). (coming soon!)
3. __`git push` to Deploy__ -  Configure a stack to deploy automatically in response to `git push` events by installing the Pulumi GitHub App.(coming soon!)

A deployment in the pulumi service runs on an isolated, single use deployment runner (a VM). That runner will prepare the runtime environment, clone source code, set up any necessary environment variables, run the pulumi program, and handle reporting logs and status back to the Pulumi Service.

This API enables many of the same scenarios as Automation API, like platform building, self-service infrastructure, customer infra workflows and portals, and more. The main difference is that Automation API programs run on your hardware, where you're responsible for handling asynchrony, workflow, reporting status, cancellatios, etc. 

The Pulumi Deployment API takes care of workflow for you, providing API endpoints to monitor deployments, tail update logs, queue, and cancel deployments. 

## Docs

- [API Docs](./docs/api-docs.md)
- [Git Push To Deploy](./docs/git-push-to-deploy.md)
- [Deployment Driver Sample](./deployment-drivers/nodejs/typescript-driver/README.md)

## Examples

Deployment driver examples show using the Pulumi Deployment API to create deployments, monitor status, and tail logs.

- [typescript-driver](./deployment-drivers/nodejs/typescript-driver/) a deployment driver written in typescript. It can deploy pulumi programs written in any language.

## Pulumi Programs

We have a set of demo pulumi programs that can be conveniently referenced as git source within this repo. They can be found in the [pulumi-programs](./pulumi-programs/) directory.
