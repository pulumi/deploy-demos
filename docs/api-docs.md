

## Preview Access

Currently, the APIs that power Deployments are gated behind a `/preview` url.
You'll need to make sure that your org has been granted access to these APIs, please reach out to the team in the [#pulumi-deploy-beta] channel in the Pulumi Community Slack with any issues or questions. 

## Create a Deployment

A deployment consists of two main pieces, a `Source` and a `Operation`.
The `Source` defined where the source code for your project is located.
Right now, only git repos are supported.
An `Operation` defines how the Pulumi project is to be executed.

### Operation Context

- **preRunCommands** (list): A list of commands to run before the Pulumi command is executed
- **operation** (string): The Pulumi command to execute (`update`, `preview`, `refresh`, `destroy`)
- **environmentVariables** (map[string]Secret: A list of environment variables to set for the operation 

Secret types have the following structure:
```json
  "key": {
    "secret": "value"
  },
  "key": "value"
```

#### Example

```json
{
  "preRunCommands": [
    "npm install -g yarn",
    "go get sigs.k8s.io/kind@v0.16.0"
  ],
  "operation": "update",
  "environmentVariables": {
    "AWS_REGION": "us-east-2",
    "CUSTOM_VARIABLE": "foo"
  }
}
```

### Source Context

Currently, only git repos are supported as a source.

- **repoURL** (string): The URL of the git repo
- **branch** (string): The branch to use
- **repoDir** (string): The directory to work from in the project's source repository where Pulumi.yaml is located. It is used in case Pulumi.yaml is not in the project source root
- **commit** (string): (optional) Commit is the hash of the commit to deploy. If used, HEAD will be in detached mode. This is mutually exclusive with the Branch setting. Either value needs to be specified
- **gitAuth** (object): (optional) GitAuth is the authentication information for the git repo. If not specified, the repo is assumed to be public. Only one type is supported at time.
  - **accessToken** (secret): The access token to use
  - **sshAuth** (object): (optional) SSHAuth is the authentication information for the git repo
    - **privateKey** (secret): The private key to use
    - **password** (secret, optional): The password to use
  - **basicAuth** (object): Basic auth information
    - **userName** (secret): The username to use for authentication
    - **password** (secret): The password to use for authentication 

Secret types have the following structure:
```json
  "key": {
    "secret": "value"
  },
  "key": "value"
```

### Example

```json
{
  "git": {
    "repoURL": "https://github.com/pulumi/examples.git",
    "branch": "refs/heads/master",
    "repoDir": "aws-ts-s3-folder",
    "gitAuth": {
      "accessToken": {
        "secret": "myAccessToken"
      },
      "sshAuth": {
        "privateKey": ,"myPrivateKey",
        "password": "myPassword"
      },
      "basicAuth": {
        "userName": "myUserName",
        "password": "myPassword"
      }
    }
  }
}
```

## Sample Requests

The following example defines the source to be the pulumi examples repo, targeting the `aws-ts-s3-folder` directory inside the repo once cloned.
After that it will run any `preRun` commands which in the example echo's out `"hello world"`.
Pulumi Deploy will then detect that the project is a typescript project and run an `npm install` for you.
Finally, it will run a `pulumi update` against the stack. 

In addition to the payload, the request URL matches the `org/project/stack` like it does today, so in this example, I'm using the org `stevesloka`, with the project `aws-ts-s3-folder` and the stack `dev`.

```
$ curl -i -XPOST -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
 http://api.pulumi.com/api/preview/stevesloka/aws-ts-s3-folder/dev/deployments -d '{
    "sourceContext": {
        "git": {
            "repoURL": "https://github.com/pulumi/examples.git",
            "branch": "refs/heads/master",
            "repoDir": "aws-ts-s3-folder"
        }
    },
    "operationContext": {
        "operation": "update",
        "preRunCommands": [
            "echo \"hello world\""
        ],
        "environmentVariables": {
            "AWS_REGION": "us-west-2",
            "AWS_ACCESS_KEY_ID": "<id>",
            "AWS_SECRET_ACCESS_KEY": "<key>",
            "AWS_SESSION_TOKEN": "<token>"
        }
    }
}'
```

### Get Deployment 

Request details of your Deployment by querying the API at: `/api/preview/{orgName}/{projectName}/{stackName}/deployments/{deploymentId}`

Example: 
```
$ curl -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \                              
https://api.pulumi.com/api/preview/stevesloka/aws-ts-s3-folder/dev/deployments/08a4e65c-f1f8-4b47-8f7a-cdac9788dcad

{"ID":"08a4e65c-f1f8-4b47-8f7a-cdac9788dcad","Created":"2022-08-24 17:41:00.224","Modified":"2022-08-24 17:41:07.929","Status":"running"}
```

### Get Deployment List

Request a list of Deployments by querying the API at: `/api/preview/{orgName}/{projectName}/{stackName}/deployments`

There are a set of query parameters which are available:

- **status** (string, optional): Filter on a specific status (valid: `accepted`, `running`, `succeeded`, `failed`, `not-started`)
- **page** (int, optional): The page of results to return (min: 1)
- **pageSize** (int, optional): The number of results to return per page (min: 1, max: 100)

Example: 
```
 $ curl -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
 http://localhost:8080/api/preview/stevesloka/aws-ts-s3-folder/dev/deployments?page=1&pageSize=5&status=running
```

### Logs

You can get the logs from the Deployments from the following endpoint: `/api/preview/{orgName}/{projectName}/{stackName}/deployments/{deploymentId}/logs`

#### Step Logs

Step logs return logs by step of the execution.
This is helpful to walk through specific logs of a single step, or start requesting logs in the middle of the Deployment.

There are a set of query parameters which are available:

- **job**: The job to request logs for (for now always zero).   
- **step**:  The step of the Deployment to return logs
- **offset**: The line offset from the beginning of the step logs returned as nextOffset from the response
- **count** (default: 100): represents the batch size of lines to return

##### Example: 

First get all the steps of the Deployment, in this example there are 5 total steps for the Deployment.

GET Deployment/{id}
```
curl -i -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
 https://api.pulumi.com/api/preview/k8s/resource-test/dev/deployments/2ee5b292-28bb-44a5-8532-b6ac32f4ec49                               
{
    "id": "2ee5b292-28bb-44a5-8532-b6ac32f4ec49",
    "created": "2022-09-14 18:06:41.669",
    "modified": "2022-09-15 16:12:11.132",
    "status": "succeeded",
    "jobs": [
        {
            "status": "succeeded",
            "started": "2022-09-14T18:06:50.925931Z",
            "lastUpdated": "2022-09-14T18:07:44.012244Z",
            "steps": [
                {
                    "name": "Get Source",
                    "status": "succeeded",
                    "started": "2022-09-14T18:06:51.621171Z",
                    "lastUpdated": "2022-09-14T18:06:54.316488Z"
                },
                {
                    "name": "Download Dependencies",
                    "status": "succeeded",
                    "started": "2022-09-14T18:06:54.327423Z",
                    "lastUpdated": "2022-09-14T18:07:22.489834Z"
                },
                {
                    "name": "PreRunCommand-1",
                    "status": "succeeded",
                    "started": "2022-09-14T18:07:22.505616Z",
                    "lastUpdated": "2022-09-14T18:07:22.537334Z"
                },
                {
                    "name": "PreRunCommand-2",
                    "status": "succeeded",
                    "started": "2022-09-14T18:07:22.548266Z",
                    "lastUpdated": "2022-09-14T18:07:22.639818Z"
                },
                {
                    "name": "Pulumi Operation",
                    "status": "succeeded",
                    "started": "2022-09-14T18:07:22.665019Z",
                    "lastUpdated": "2022-09-14T18:07:44.012244Z"
                }
            ]
        }
    ]
}
```

Get Logs for a Deployment starting at the zero offset and a count size of 10, meaning only 10 lines are returned. 

GET Deployment/{id}/logs/{job}?step=5&count=10&offset=0
```
curl -i -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
 https://api.pulumi.com/api/preview/k8s/resource-test/dev/deployments/2ee5b292-28bb-44a5-8532-b6ac32f4ec49/logs/?step=5&count=10&offset=0

{
    "nextOffset": 10,
    "lines": [
        {
            "timestamp": "2022-09-14T18:07:26.012974756Z",
            "line": "Updating (k8s/dev)\n"
        },
        {
            "timestamp": "2022-09-14T18:07:26.013002465Z",
            "line": "\n"
        },
        {
            "timestamp": "2022-09-14T18:07:26.637569798Z",
            "line": "\n"
        },
        {
            "timestamp": "2022-09-14T18:07:30.834521134Z",
            "line": "    pulumi:pulumi:Stack resource-test-dev running \n"
        },
        {
            "timestamp": "2022-09-14T18:07:39.927540055Z",
            "line": "    pulumi:pulumi:Stack resource-test-dev running Done!\n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.210973346Z",
            "line": "    pulumi:pulumi:Stack resource-test-dev  1 message\n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.211008513Z",
            "line": " \n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.211811513Z",
            "line": "Diagnostics:\n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.211861221Z",
            "line": "  pulumi:pulumi:Stack (resource-test-dev):\n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.211863638Z",
            "line": "    Done!\n"
        }
    ]
}
```

No more logs are available, so nextOffset is missing from the response:
```
$ curl -i -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
 https://api.pulumi.com/api/preview/k8s/resource-test/dev/deployments/2ee5b292-28bb-44a5-8532-b6ac32f4ec49/logs/?step=5&count=10&offset=10
{
    "lines": [
        {
            "timestamp": "2022-09-14T18:07:40.212081846Z",
            "line": " \n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.212939055Z",
            "line": "Resources:\n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.21295843Z",
            "line": "    1 unchanged\n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.212960471Z",
            "line": "\n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.212963346Z",
            "line": "Duration: 14s\n"
        },
        {
            "timestamp": "2022-09-14T18:07:40.21296468Z",
            "line": "\n"
        },
        {
            "timestamp": "2022-09-14T18:07:43.987098792Z",
            "line": "No permalink found - ignoring. Stack.Name k8s/resource-test/dev\n"
        },
        {
            "timestamp": "2022-09-14T18:07:43.990232876Z",
            "line": "Succeeded: auto.UpdateSummary{Version:12, Kind:\"update\", StartTime:\"2022-09-14T18:07:26.000Z\", Message:\"add dockerfile for test\", Environment:map[string]string{\"ci.build.id\":\"2ee5b292-28bb-44a5-8532-b6ac32f4ec49\", \"ci.system\":\"Pulumi Deploy\", \"exec.agent\":\"pulumi-deploy-executor\", \"exec.kind\":\"auto.local\", \"git.author\":\"Steve Sloka\", \"git.author.email\":\"steve@pulumi.com\", \"git.committer\":\"Steve Sloka\", \"git.committer.email\":\"steve@pulumi.com\", \"git.dirty\":\"true\", \"git.head\":\"4427e17a4b3961cadc61503062192eee172d1a18\", \"git.headName\":\"refs/heads/master\", \"vcs.kind\":\"github.com\", \"vcs.owner\":\"stevesloka\", \"vcs.repo\":\"resource-test\"}, Config:auto.ConfigMap{}, Result:\"succeeded\", EndTime:(*string)(0xc000194470), ResourceChanges:(*map[string]int)(0xc000186110)}: \n"
        }
    ]
}
```

#### Streaming Logs

Streaming logs start at the beginning and provide a `token` which can be used to get the next set of logs.
The `token` is a string that contains the `job`, `offset` and `step` of the next set of logs, but the requestor doesn't need to be concerned with the details.
This is helpful to walk through logs from the beginning passing back the `token` to get the next set of logs.
The API maintains state of the logs and will return the next set of logs until there are no more logs available.

There are a set of query parameters which are available:

- **nextToken**: Returned in the previous response, this is used to get the next set of logs.

##### Example:

GET Deployment/{id}/logs
```
curl -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
https://api.pulumi.com/api/preview/stevesloka/aws-ts-s3-folder/dev/deployments/6b1ec06b-4f41-4cce-a7c9-13ceded14db2/logs
{
  "lines": [
    {
      "header": "Download deployment executor",
      "timestamp": "0001-01-01T00:00:00Z"
    },
    {
      "timestamp": "2022-10-06T22:34:02.058756202Z",
      "line": "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current\n"
    },
    {
      "timestamp": "2022-10-06T22:34:02.059046831Z",
      "line": "                                 Dload  Upload   Total   Spent    Left  Speed\n"
    },
    {
      "timestamp": "2022-10-06T22:34:02.736395042Z",
      "line": "\r  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0\r100  3905    0  3905    0     0  10728      0 --:--:-- --:--:-- --:--:-- 10698\r100 11.9M    0 11.9M    0     0  17.6M      0 --:--:-- --:--:-- --:--:-- 17.6M\n"
    },
    {
      "header": "Get Source",
      "timestamp": "0001-01-01T00:00:00Z"
    },
    {
      "timestamp": "2022-10-06T22:34:22.732527584Z",
      "line": "Successfully cloned: https://github.com/pulumi/examples.git\n"
    },
    {
      "header": "Download Dependencies",
      "timestamp": "0001-01-01T00:00:00Z"
    }
  ],
  "nextToken": "0.2.1"
}
```

GET Deployment/{id}/logs?nextToken={token}
```
```json
curl -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
https://api.pulumi.com/api/preview/stevesloka/aws-ts-s3-folder/dev/deployments/6b1ec06b-4f41-4cce-a7c9-13ceded14db2/logs\?nextToken\=0.2.1 | jq
{
  "lines": [
    {
      "header": "Download deployment executor",
      "timestamp": "0001-01-01T00:00:00Z"
    },
    {
      "timestamp": "2022-10-06T22:34:02.058756202Z",
      "line": "  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current\n"
    },
    {
      "timestamp": "2022-10-06T22:34:02.059046831Z",
      "line": "                                 Dload  Upload   Total   Spent    Left  Speed\n"
    },
    {
      "timestamp": "2022-10-06T22:34:02.736395042Z",
      "line": "\r  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0\r100  3905    0  3905    0     0  10728      0 --:--:-- --:--:-- --:--:-- 10698\r100 11.9M    0 11.9M    0     0  17.6M      0 --:--:-- --:--:-- --:--:-- 17.6M\n"
    },
    {
      "header": "Get Source",
      "timestamp": "0001-01-01T00:00:00Z"
    },
    {
      "timestamp": "2022-10-06T22:34:22.732527584Z",
      "line": "Successfully cloned: https://github.com/pulumi/examples.git\n"
    },
    {
      "header": "Download Dependencies",
      "timestamp": "0001-01-01T00:00:00Z"
    },
    {
      "timestamp": "2022-10-06T22:34:43.207012804Z",
      "line": "npm WARN deprecated querystring@0.2.0: The querystring API is considered Legacy. new code should use the URLSearchParams API instead.\n"
    },
    {
      "timestamp": "2022-10-06T22:34:43.236380318Z",
      "line": "npm WARN deprecated read-package-tree@5.3.1: The functionality that this package provided is now in @npmcli/arborist\n"
    },
    {
      "timestamp": "2022-10-06T22:34:50.108263451Z",
      "line": "\n"
    },
    {
      "timestamp": "2022-10-06T22:34:50.108270709Z",
      "line": "added 163 packages, and audited 164 packages in 12s\n"
    }
  ]
}
```

