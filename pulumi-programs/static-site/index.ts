import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// Create a bucket to serve our static site
const bucket = new aws.s3.Bucket("site-bucket");

// Configure the bucket as a website
const website = new aws.s3.BucketWebsiteConfigurationV2("site-config", {
    bucket: bucket.id,
    indexDocument: {
        suffix: "index.html",
    },
});

// Allow public bucket policies so the site is readable
const publicAccessBlock = new aws.s3.BucketPublicAccessBlock("public-access-block", {
    bucket: bucket.id,
    blockPublicAcls: true,
    ignorePublicAcls: true,
    blockPublicPolicy: false,
    restrictPublicBuckets: false,
});

// Create our index document from the site content in the environment
new aws.s3.BucketObject("index", {
    bucket: bucket,
    content: process.env["SITE_CONTENT"],
    key: "index.html",
    contentType: "text/html; charset=utf-8",
});

// Attach a policy so all bucket objects are readable
new aws.s3.BucketPolicy("bucket-policy", {
    bucket: bucket.id,
    policy: {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect":    "Allow",
            "Principal": "*",
            "Action": [ 
                "s3:GetObject",
            ],
            "Resource": [
                pulumi.interpolate`arn:aws:s3:::${bucket.id}/*`,
            ],
        }],
    },
}, { dependsOn: publicAccessBlock });

// Export the website URL
export const websiteUrl = pulumi.interpolate`http://${website.websiteEndpoint}`;
