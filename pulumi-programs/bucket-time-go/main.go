package main

import (
	"github.com/pulumi/pulumi-aws/sdk/v7/go/aws/s3"
	"github.com/pulumi/pulumi/sdk/v3/go/pulumi"
)

func main() {
	pulumi.Run(func(ctx *pulumi.Context) error {
		bucket, err := s3.NewBucket(ctx, "bucket-time-bucket", nil)
		if err != nil {
			return err
		}

		ctx.Export("bucketId", bucket.ID())
		return nil
	})
}
