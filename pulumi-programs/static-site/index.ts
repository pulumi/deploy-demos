import * as pulumi from "@pulumi/pulumi";
import * as aws from "@pulumi/aws";

// AWS-managed CachingOptimized: a 24h default TTL that an origin Cache-Control
// header overrides — which is how the index object below stays fresh.
const CACHING_OPTIMIZED_POLICY_ID = "658327ea-f89d-4fab-a63d-7e88639e58f6";

// forceDestroy because a bucket holding anything beyond index.html would refuse to
// delete, and a failed destroy strands the distribution below.
const bucket = new aws.s3.Bucket("site-bucket", { forceDestroy: true });

// The site itself, from the content the driver deploys with.
//
// no-cache is load-bearing: drivers update a site by rewriting this object, and
// under the cache policy's 24h default TTL the edge would keep serving the old body
// long after the deployment reported success.
new aws.s3.BucketObject("index", {
    bucket: bucket,
    content: process.env["SITE_CONTENT"],
    key: "index.html",
    contentType: "text/html; charset=utf-8",
    cacheControl: "no-cache",
});

// The CloudFront service policy below is the only grant this bucket needs, so every
// public-access path can stay shut.
const publicAccessBlock = new aws.s3.BucketPublicAccessBlock("public-access-block", {
    bucket: bucket.id,
    blockPublicAcls: true,
    ignorePublicAcls: true,
    blockPublicPolicy: true,
    restrictPublicBuckets: true,
});

// Origin Access Control lets the distribution sign its requests to S3, which is what
// allows the bucket to stay private.
const originAccessControl = new aws.cloudfront.OriginAccessControl("site-oac", {
    originAccessControlOriginType: "s3",
    signingBehavior: "always",
    signingProtocol: "sigv4",
});

const originId = "site-bucket-origin";

// Distributions are account-global and quota-limited — 200 per account, each needing
// an origin access control against a lower ceiling of 100 — so an interrupted destroy
// strands one and eventually creates start failing. The stack name in `comment` is
// what makes a sweep possible:
//
//     aws cloudfront list-distributions --query 'DistributionList.Items[].[Id,Comment]'
//     aws cloudfront list-origin-access-controls
//
// Roll this program back by destroying the demo stacks, not by reverting the commit:
// the driver deploys on commit, so a revert tears down every live site's distribution
// and brings it back at a different URL.
//
// No loggingConfig: deliberate for a throwaway demo, at the cost of having no
// server-side trace when the origin refuses a request.
const distribution = new aws.cloudfront.Distribution("site-distribution", {
    enabled: true,
    comment: `${pulumi.getProject()}/${pulumi.getStack()}`,
    // Serves index.html for "/", and keeps the empty-key request off the origin —
    // which the ListBucket grant below would otherwise answer with a bucket listing.
    defaultRootObject: "index.html",
    origins: [{
        originId,
        // The regional domain name, not the website endpoint — S3 website endpoints
        // don't speak SigV4, so OAC-signed requests only work against the REST API.
        domainName: bucket.bucketRegionalDomainName,
        originAccessControlId: originAccessControl.id,
    }],
    defaultCacheBehavior: {
        targetOriginId: originId,
        viewerProtocolPolicy: "redirect-to-https",
        allowedMethods: ["GET", "HEAD"],
        cachedMethods: ["GET", "HEAD"],
        cachePolicyId: CACHING_OPTIMIZED_POLICY_ID,
    },
    // North America and Europe only. A demo serving one HTML object has no use for
    // the global edge footprint the default price class pays for.
    priceClass: "PriceClass_100",
    restrictions: {
        geoRestriction: {
            restrictionType: "none",
        },
    },
    viewerCertificate: {
        cloudfrontDefaultCertificate: true,
    },
    tags: {
        Project: pulumi.getProject(),
        Stack: pulumi.getStack(),
    },
});

// Grant read access to this distribution alone. The SourceArn condition is what stops
// any other account's distribution from being pointed at this bucket.
new aws.s3.BucketPolicy("bucket-policy", {
    bucket: bucket.id,
    policy: {
        "Version": "2012-10-17",
        "Statement": [{
            "Effect":    "Allow",
            "Principal": { "Service": "cloudfront.amazonaws.com" },
            "Action": [
                "s3:GetObject",
            ],
            "Resource": [
                pulumi.interpolate`arn:aws:s3:::${bucket.id}/*`,
            ],
            "Condition": {
                "StringEquals": {
                    "AWS:SourceArn": distribution.arn,
                },
            },
        }, {
            // Granted so a missing key comes back 404 rather than 403: without it S3
            // won't say whether an object is absent or merely unreadable. Scoped to
            // the bucket itself, where GetObject is scoped to its contents — which is
            // also why defaultRootObject above has to stay set.
            "Effect":    "Allow",
            "Principal": { "Service": "cloudfront.amazonaws.com" },
            "Action": [
                "s3:ListBucket",
            ],
            "Resource": [
                pulumi.interpolate`arn:aws:s3:::${bucket.id}`,
            ],
            "Condition": {
                "StringEquals": {
                    "AWS:SourceArn": distribution.arn,
                },
            },
        }],
    },
    // The block must be tightened before the policy is written, or the policy briefly
    // exists while public access is still permitted.
}, { dependsOn: publicAccessBlock });

// https, terminated at CloudFront's default certificate.
export const websiteUrl = pulumi.interpolate`https://${distribution.domainName}`;
