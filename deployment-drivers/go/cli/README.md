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

deployer request --repoDir typescript/aws/vpc --project ts_vpc --debug
```

### Checking the status

```
deployer logs --id <job_id> --project ts_vpc | jq .
```

### Getting step logs


```
deployer steps --id <job_id> --project ts_vpc --step 4 | jq .
```