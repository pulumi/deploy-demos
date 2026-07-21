// Copyright 2026, Pulumi Corporation. All rights reserved.

package com.pulumi.benchmark;

import com.pulumi.Pulumi;
import com.pulumi.aws.s3.Bucket;

public final class App {
    private App() {
    }

    public static void main(String[] args) {
        Pulumi.run(ctx -> {
            var bucket = new Bucket("bucket-time-bucket");
            ctx.export("bucketName", bucket.id());
        });
    }
}
