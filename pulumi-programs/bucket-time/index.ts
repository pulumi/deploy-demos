import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as awsx from "@pulumi/awsx";

// Create an AWS resource (S3 Bucket)
const bucket = new aws.s3.Bucket("my-bucket");

// Create a second S3 bucket
const bucket2 = new aws.s3.Bucket("my-bucket-2");

// Export the name of the bucket
export const bucketName = bucket.id;
