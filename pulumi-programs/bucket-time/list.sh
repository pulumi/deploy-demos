#!/bin/bash
curl -L "https://api.pulumi.com/api/preview/pulumi/bucket-time/ced/deployments?page=1&pageSize=3" \
  -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  -H "Content-Type: application/json"
