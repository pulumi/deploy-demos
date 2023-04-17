import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";
import * as azure from "@pulumi/azure";
//import * as gcp from "@pulumi/gcp";

// Create an AWS resource (S3 Bucket)
const s3Bucket = new aws.s3.Bucket("my-bucket");

// Create Azure resources
const azureResourceGroup = new azure.core.ResourceGroup("my-resource-group", {location: "West US 2"});
const storageAccount =new azure.storage.Account("my-storage-account", {
    resourceGroupName: azureResourceGroup.name,
    location: azureResourceGroup.location,
    accountTier: "Standard",
    accountReplicationType: "LRS",
});
const storageContainer = new azure.storage.Container("my-storage-container", {
    storageAccountName: storageAccount.name,
    containerAccessType: "private",
});

// Create a GCP resource (GCS Bucket)
const gcsBucket = new gcp.storage.Bucket("my-bucket", {
    forceDestroy: true,
    location: "US",
    publicAccessPrevention: "enforced",
    uniformBucketLevelAccess: true,
});

// Export the names of the buckets
export const s3BucketName = s3Bucket.id;
export const storageContainerName = storageContainer.id;
export const gcsBucketUrl = gcsBucket.url;
