import pulumi
from pulumi_aws import s3

bucket = s3.Bucket("bucket-time-bucket", bucket_prefix="kmosher-bench-")

pulumi.export("bucketName", bucket.id)
