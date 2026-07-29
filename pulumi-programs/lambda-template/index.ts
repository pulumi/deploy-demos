import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import { iam } from "@pulumi/aws"

const computeCodePaths = async (code: string) => {
    let codePaths: pulumi.asset.AssetMap = {
        // Always include the serialized function.
        ["__index.js"]: new pulumi.asset.StringAsset(code),
    };

    // No exclusions: Node 18+ runtimes ship no bundled AWS SDK, so anything the handler
    // imports has to travel in the bundle.
    const modulePaths = await pulumi.runtime.computeCodePaths({});

    for (const [path, asset] of modulePaths) {
        codePaths[path] = asset;
    }

    return codePaths;
}


const defaultHandler = `
exports.handler =  async function(event, context) {
    console.log("EVENT:  " + JSON.stringify(event, null, 2))
    return context.logStreamName
  }
`;

let fn = process.env.LAMBDA_CODE || defaultHandler;

let code = pulumi.output(new pulumi.asset.AssetArchive(computeCodePaths(fn)));

let role: aws.iam.Role;

const lambdaRolePolicy = {
    "Version": "2012-10-17",
    "Statement": [
        {
            "Action": "sts:AssumeRole",
            "Principal": {
                "Service": "lambda.amazonaws.com",
            },
            "Effect": "Allow",
            "Sid": "",
        },
    ],
};

// Attach a role and then, if there are policies, attach those too.
role = new aws.iam.Role("lambdaRole", {
    assumeRolePolicy: JSON.stringify(lambdaRolePolicy),
});



const policies = [iam.ManagedPolicy.LambdaFullAccess, iam.ManagedPolicy.CloudWatchFullAccess,
iam.ManagedPolicy.CloudWatchEventsFullAccess, iam.ManagedPolicy.AmazonS3FullAccess,
iam.ManagedPolicy.AmazonDynamoDBFullAccess, iam.ManagedPolicy.AmazonSQSFullAccess,
iam.ManagedPolicy.AmazonKinesisFullAccess, iam.ManagedPolicy.AmazonCognitoPowerUser,
iam.ManagedPolicy.AWSXrayWriteOnlyAccess,
]

let policyIndex = 0;
for (const policy of policies) {
    const attachment = new iam.RolePolicyAttachment(`policy-${policyIndex}`, {
        role: role,
        policyArn: policy,
    });
    policyIndex++;
}



let lambdaFn = new aws.lambda.Function("fn", {
    code,
    role: role.arn,
    runtime: aws.lambda.Runtime.NodeJS24dX,
    handler: "__index.handler",
});

export let invokeARN = lambdaFn.invokeArn;
