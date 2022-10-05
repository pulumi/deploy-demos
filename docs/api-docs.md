

## Preview Access

Currently the APIs that power Deployments are gated behind a `/preview` url. You'll need to make sure that your org has been granted access to these APIs. Right now the `pulumi` org has been granted, so any projects in that org should work. If you need additional access, please reach out to the team in the [#pulumi-deploy](https://pulumi.slack.com/archives/C0289AASSG4) channel. 

## Create a Deployment

A deployment consists of two main pieces, a `Source` and a `Operation`. The `Source` defined where the source code for your project is located. Right now, only git repos are supported. An `Operation` defines how the Pulumi project is to be executed. The Go structs for the requests are located in the service repo here: https://github.com/pulumi/pulumi-service/blob/master/pkg/apitype/deployments.go#L91

### Sample

The following example defines the source to be the pulumi examples repo, targeting the `aws-ts-s3-folder` directory inside the repo once cloned. After that it will run any `preRun` commands which in the example echo's out `"hello world"`.  Pulumi Deploy will then detect that the project is a typescript project and run an `npm install` for you. Finally, it will run a `pulumi update` against the stack. 

In addition to the payload, the request URL matches the org/project/stack like it does today, so in this example, I'm using the org `stevesloka`, with the project `aws-ts-s3-folder` and the stack `dev`.

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

### Status

You can get the status of your Deployment via the Project's Stack Page in the Pulumi Service, or by querying the API at: `/api/preview/deployments/{orgName}/{projectName}/{stackName}/{deploymentId}`

Example: 
```
$ curl -i -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \                              
https://api.pulumi.com/api/preview/stevesloka/aws-ts-s3-folder/dev/deployments/08a4e65c-f1f8-4b47-8f7a-cdac9788dcad
HTTP/2 200 
date: Wed, 24 Aug 2022 17:44:06 GMT
content-type: application/json
content-length: 138
x-pulumi-request-id: e5834a89-edc9-403a-81dc-3f71cf6efb54

{"ID":"08a4e65c-f1f8-4b47-8f7a-cdac9788dcad","Created":"2022-08-24 17:41:00.224","Modified":"2022-08-24 17:41:07.929","Status":"running"}
```

### Logs

You can get the logs from the Deployments from the following endpoint: `/api/preview/{orgName}/{projectName}/{stackName}/deployments/{deploymentId}/logs`

There are a set of query parameters which are available:

- `job`: The job to request logs for (for now always zero).   
- `step`:  The step of the Deployment to return logs
- `offset`: The line offset from the beginning of the step logs returned as nextOffset from the response
- `count` (default: 100): represents the batch size of lines to return

Example: 

## GET Deployment/{id}

First get all the steps of the Deployment:
```
curl -i -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
 http://localhost:8080/api/preview/k8s/resource-test/dev/deployments/2ee5b292-28bb-44a5-8532-b6ac32f4ec49                               
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

## GET Deployment/{id}/logs

Get Logs for a Deployment starting at the zero offset and a count size of 10, meaning only 10 lines are returned. 
GET Deployment/{id}/logs/{job}?step=5&count=10&offset=0
```
curl -i -XGET -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
 http://localhost:8080/api/preview/k8s/resource-test/dev/deployments/2ee5b292-28bb-44a5-8532-b6ac32f4ec49/logs/?step=5&count=10&offset=0

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
 http://localhost:8080/api/preview/k8s/resource-test/dev/deployments/2ee5b292-28bb-44a5-8532-b6ac32f4ec49/logs/?step=5&count=10&offset=10
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

