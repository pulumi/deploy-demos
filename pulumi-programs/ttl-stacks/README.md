# TTL Stacks

> Automatically destroy stacks that are older than their TTL.  

Deploy automation with Pulumi that uses Pulumi Deploy to automatically trigger stack destroy on any stacks tagged with `pulumi:ttl` stack tag that are past the configured TTL value.

This stack deploys a cron job to AWS that runs every 30 minutes to identify stacks that need to be destroyed.  

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
    If using with private GitHub repos, an optional GitHub access token can also be provided. 

    ```bash
    pulumi config set aws:region us-west-2
    pulumi config set --secret pulumiAccessToken xxxxxxxxxxxxxxxxx # your Pulumi access token
    pulumi config set --secret githubToken xxxxxxxxxxxxxxxxx # (optional) your GitHub access token
    ```

1. Execute the Pulumi program:

    ```bash
    pulumi up
    ```

1. Tag a stack.

    You can now add the `pulumi:ttl` tag to any stack.  This can be done either on the stack page at https://app.pulumi.com/<org>/<project>/<stack>, or via `pulumi stack tag set pulumi:ttl 24`.  
    The value set for the tag should be the number of hours the stack should live after it was created.

1. When you are done, cleanup:

    ```bash
    pulumi destroy
    ```  

    (or just tag the stack with `pulumi:ttl` set to 0 to cause the stack to destroy itself! :-))
