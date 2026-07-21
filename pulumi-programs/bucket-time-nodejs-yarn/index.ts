import * as aws from "@pulumi/aws";

// bucketPrefix rather than a fixed name: S3 names are globally unique, so a fixed name
// would collide between parallel benchmark slots.
const bucket = new aws.s3.Bucket("bucket-time-bucket", {
    bucketPrefix: "kmosher-bench-",
});

export const bucketName = bucket.id;
