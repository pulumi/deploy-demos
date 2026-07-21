import pulumi
from pulumi_aws import s3

bucket = s3.Bucket("bucket-time-bucket")

pulumi.export("bucketName", bucket.id)
