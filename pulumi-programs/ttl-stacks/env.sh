#!/bin/bash

curl -XPOST -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  https://api.pulumi.com/api/preview/console/stacks/pulumi/bucket-time/ced/deployment/settings/environment \
  -d "{\"name\": \"AWS_SECRET_ACCESS_KEY\", \"value\": \"$AWS_SECRET_ACCESS_KEY\", \"encrypt\": true}"

curl -XPOST -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  https://api.pulumi.com/api/preview/console/stacks/pulumi/ttl-stacks/ced/deployment/settings/environment \
  -d "{\"name\": \"AWS_SECRET_ACCESS_KEY\", \"value\": \"$AWS_SECRET_ACCESS_KEY\", \"encrypt\": true}"

curl -XPOST -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  https://api.pulumi.com/api/preview/console/stacks/pulumi/ttl-stacks/ced/deployment/settings/environment \
  -d "{\"name\": \"AWS_ACCESS_KEY_ID\", \"value\": \"$AWS_ACCESS_KEY_ID\", \"encrypt\": false}"

curl -XPOST -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  https://api.pulumi.com/api/preview/console/stacks/pulumi/ttl-stacks/ced/deployment/settings/environment \
  -d "{\"name\": \"AWS_SESSION_TOKEN\", \"value\": \"$AWS_SESSION_TOKEN\", \"encrypt\": false}"
