import * as pulumi from "@pulumi/pulumi";

for(var i = 0; i < 100; i++){
    pulumi.log.info("I am deploying...");
}
