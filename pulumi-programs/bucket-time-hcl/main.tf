# Terraform-provider naming via the Pulumi bridge: aws_s3_bucket, not aws:s3:Bucket.
resource "aws_s3_bucket" "bucket_time_bucket" {
}

output "bucketName" {
  value = aws_s3_bucket.bucket_time_bucket.id
}
