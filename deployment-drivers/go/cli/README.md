# Pulumi Deploy CLI

A simple CLI to interact with Pulumi deploy

## Building

```
go build -o deployer main.go
```

## Usage

### Requesting a deploy

```
export PULUMI_ORG=jaxxstorm
export PULUMI_ACCESS_TOKEN=my-super-secret-token
export PULUMI_DEPLOY_REPO="https://github.com/jaxxstorm/pulumi-examples.git"

deployer request --repoDir typescript/aws/vpc --project ts_vpc --token pul-3e609fc9f573bae40d65f7181b292744dced674f --org jaxxstorm --repoUrl https://github.com/jaxxstorm/pulumi-examples.git --debug --environment=AWS_ACCESS_KEY=${AWS_ACCESS_KEY_ID} --environment=AWS_SECRET_ACCESS_KEY=${AWS_SECRET_ACCESS_KEY} --environment=AWS_SESSION_TOKEN=${AWS_SESSION_TOKEN} --environment=AWS_REGION=us-west-2
```

### Checking the status

```
deployer logs --id <job_id> --project ts_vpc | jq .
```

### Getting step logs


```
deployer steps --id <job_id> --project ts_vpc --step 4 | jq .
```
