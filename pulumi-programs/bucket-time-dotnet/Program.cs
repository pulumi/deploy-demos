using Pulumi;
using Pulumi.Aws.S3;

return await Deployment.RunAsync(() =>
{
    var bucket = new Bucket("my-bucket");

    return new Dictionary<string, object?>
    {
        ["bucketId"] = bucket.Id,
    };
});
