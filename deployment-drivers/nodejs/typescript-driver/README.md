# Deployment Driver
A typescript program to:
- create deployments via the Pulumi Deployment API
- monitor status of deployments
- print and tail deployment logs

A deployment in the pulumi service runs on an isolated, single use deployment runner (a VM). That runner will prepare the runtime environment, clone source code, set up any necessary environment variables, run the pulumi program, and handle reporting logs and status back to the Pulumi Service.

## Pre-requisites

1. NodeJS 18+
2. TypeScript 4.2+

## Environment Variables and Credentials

The driver expects a set of common environment variables to be exported in the shell you run your program. You'll need to collect:

1. `PULUMI_ACCESS_TOKEN`: [pulumi access token ](https://www.pulumi.com/docs/intro/pulumi-service/accounts/#creating-access-tokens)
2. `GITHUB_ACCESS_TOKEN`: [GitHub PAT](https://docs.github.com/en/authentication/keeping-your-account-and-data-secure/creating-a-personal-access-token) (This PAT needs `repo` scope).
3. AWS Credentials for examples that create cloud resources (`AWS_ACCESS_KEY`, etc). 
4. `ORG_NAME`: set this variable to your pulumi username or organization name that contains your stack
5. `STACK_NAME`: defaults to `dev`

## Running the program

You'll need to create a stack for the project you'd like to deploy before running the driver programs. For instance:

```console
$ cd ../../pulumi-programs/simple-resource
$ pulumi stack init dev
```

`cd` back into the deployment driver directory. With the stack created, you can run the deployment driver: 

```console
# from /typescript-driver
$ yarn install
$ export PULUMI_ACCESS_TOKEN=...
$ export GITHUB_ACCESS_TOKEN=...
$ export ORG_NAME=...
$ # splat your AWS creds into env vars
$ yarn start
```

The program will create a deployment, and then poll and print status and logs until it reaches a terminal state.

You can edit the driver to change which pulumi program gets deployed. There are four supported projects:

1. `bucket-time`: A TypeScript program that deploys an AWS S3 bucket
2. `go-bucket`: A Go program that deploys
3. `lambda-template`: A TypeScript program that deploys an AWS Lambda.
4. `simple-resource`: A TypeScript program that creates no cloud resources. Just to get started.
