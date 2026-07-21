// Copyright 2026, Pulumi Corporation. All rights reserved.

package com.pulumi.benchmark;

import com.pulumi.Pulumi;
import com.pulumi.aws.s3.Bucket;
import com.pulumi.aws.s3.BucketArgs;

public final class App {
    private App() {
    }

    public static void main(String[] args) {
        Pulumi.run(ctx -> {
            // bucketPrefix rather than a fixed name: S3 names are globally unique, so a fixed
            // name collides across concurrent matrix arms. The kmosher- prefix is also what the
            // bench OIDC role's policy grants, so dropping it fails with AccessDenied.
            var bucket = new Bucket("bucket-time-bucket", BucketArgs.builder()
                    .bucketPrefix("kmosher-bench-")
                    .build());
            ctx.export("bucketName", bucket.id());
        });
    }
}
