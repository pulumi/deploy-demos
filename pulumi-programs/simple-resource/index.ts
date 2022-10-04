import * as pulumi from "@pulumi/pulumi";

for(var i = 0; i < 1000; i++){
    pulumi.log.info("I am deploying...");
}
