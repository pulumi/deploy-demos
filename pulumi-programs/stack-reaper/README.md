# Stack Reaper

The stack reaper is a piece of infrastructure that allows you to set a stack tag that triggers automatic destroy via the Pulumi Deployment API after the expiration time passes.

After deploying this program you can do the following on any program in your pulumi organization:

```console
# on any stack in your organization
$ pulumi stack tag set reap 30 # minutes to wait until destroying the stack
$ pulumi up 
# 30 minutes later the stack will be cleaned up via the Pulumi Deployment API
```

![](./deploy-stack-reaper.gif)

## Setup

1. Install prerequisites:

    ```bash
    npm install
    ```

1. Create a new Pulumi stack, which is an isolated deployment target for this example:

    ```bash
    pulumi stack init
    ```

1. Set required configuration

    Using the pulumi deployment API requires a [pulumi access token](https://www.pulumi.com/docs/intro/pulumi-service/accounts/#access-tokens). 

    ```bash
    pulumi config set aws:region us-west-2
    pulumi config set pulumiAccessToken xxxxxxxxxxxxxxxxx # your access token value
    ```

1. Execute the Pulumi program:

    ```bash
    pulumi up
    ```

1. Retrieve our new URL:

    ```bash
    pulumi stack output url
    ```

1. Create a [Pulumi webhook](https://www.pulumi.com/docs/intro/console/extensions/webhooks/). Use the output from the previous step as the `Payload URL`.

You should now be able to `pulumi stack tag set reap X && pulumi up` (X=minutes) to create stacks that destroy themselves after the specified expiry.
