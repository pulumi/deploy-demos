# Terraform-provider naming via the Pulumi bridge: aws_s3_bucket, not aws:s3:Bucket.
# Without an explicit prefix the bridge autonames buckets "terraform-<hash>".
resource "aws_s3_bucket" "bucket_time_bucket" {
  bucket_prefix = "kmosher-bench-"
}

output "bucketName" {
  value = aws_s3_bucket.bucket_time_bucket.id
}
