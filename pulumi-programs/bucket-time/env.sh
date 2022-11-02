#!/bin/bash

curl -s -XPOST -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  https://api.pulumi.com/api/preview/console/stacks/pulumi/bucket-time/ced/deployment/settings/environment \
  -d "{\"name\": \"AWS_SECRET_ACCESS_KEY\", \"value\": \"$AWS_SECRET_ACCESS_KEY\", \"encrypt\": true}" > /dev/null

curl -s -XPOST -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  https://api.pulumi.com/api/preview/console/stacks/pulumi/bucket-time/ced/deployment/settings/environment \
  -d "{\"name\": \"AWS_ACCESS_KEY_ID\", \"value\": \"$AWS_ACCESS_KEY_ID\", \"encrypt\": false}" > /dev/null

curl -s -XPOST -H "Content-Type: application/json" -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  https://api.pulumi.com/api/preview/console/stacks/pulumi/bucket-time/ced/deployment/settings/environment \
  -d "{\"name\": \"AWS_SESSION_TOKEN\", \"value\": \"$AWS_SESSION_TOKEN\", \"encrypt\": false}" > /dev/null

# Remove stack from our policy group to speed things up
curl -s 'https://api.pulumi.com/api/orgs/pulumi/policygroups/default-policy-group' \
  -X 'PATCH' \
  -H 'Content-Type: application/json' \
  -H 'Pragma: no-cache' \
  -H 'Accept: application/vnd.pulumi+6' \
  -H "Authorization: token $PULUMI_ACCESS_TOKEN" \
  -H 'Accept-Language: en-US,en;q=0.9' \
  -H 'Accept-Encoding: gzip, deflate, br' \
  -H 'Cache-Control: no-cache' \
  -H 'Host: api.pulumi.com' \
  -H 'Origin: https://app.pulumi.com' \
  -H 'Content-Length: 61' \
  -H 'User-Agent: Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/15.5 Safari/605.1.15' \
  -H 'Referer: https://app.pulumi.com/' \
  -H 'Connection: keep-alive' \
  --data-binary '{"removeStack":{"name":"ced","routingProject":"bucket-time"}}' > /dev/null
