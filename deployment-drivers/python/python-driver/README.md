# Deployment Driver
A python program to:
- create deployments via the Pulumi Deployment API
- monitor status of deployments
- print and tail deployment logs

A deployment in the pulumi service runs on an isolated, single use deployment runner (a VM). That runner will prepare the runtime environment, clone source code, set up any necessary environment variables, run the pulumi program, and handle reporting logs and status back to the Pulumi Service.

## Pre-requisites

1. Python 3.10+
2. [Poetry](https://python-poetry.org/docs/)

Install the required dependencies with:
```shell
poetry install
```

## Environment Variables and Credentials

The driver expects a set of common environment variables to be exported in the shell you run your program. You'll need to collect:

1. `PULUMI_ACCESS_TOKEN`: [pulumi access token](https://www.pulumi.com/docs/intro/pulumi-service/accounts/#creating-access-tokens)
2. AWS Credentials for examples that create cloud resources (`AWS_ACCESS_KEY`, etc).
3. `PULUMI_ORG`: set this variable to your pulumi username or organization name that contains your stack.
4. `PULUMI_STACK`: defaults to `dev`

## Running the program

This program runs a deployment for the [stack-readme-yaml](https://github.com/pulumi/examples/tree/master/stack-readme-yaml) program.
To customize the request, you can edit the [`__main__.py`](__main__.py) file.

You can run the program with:

```console
$ export PULUMI_ACCESS_TOKEN=....
$ PULUMI_ORG={your-org-name} python .
```
