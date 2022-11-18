import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as gcp from "@pulumi/gcp";

// Create an AWS resource (S3 Bucket)
const s3Bucket = new aws.s3.Bucket("my-bucket");

// Create a GCP resource (GCS Bucket)
const gcsBucket = new gcp.storage.Bucket("my-bucket", {
    forceDestroy: true,
    location: "US",
    publicAccessPrevention: "enforced",
    uniformBucketLevelAccess: true,
});

// Export the names of the buckets
export const s3BucketName = s3Bucket.id;
export const gcsBucketUrl = gcsBucket.url;
