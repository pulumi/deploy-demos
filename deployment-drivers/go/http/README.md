# Pulumi Over HTTP - Static Websites as a RESTful API

This application demonstrates how to use the Deployment API to expose infrastructure as RESTful resources. In our case, we've defined and exposed a static website `site` that exposes all of the `CRUD` operations. Users can hit our REST endpoint and create custom static websites by specifying the `content` field in the `POST` body. The infrastructure is defined as a separate Pulumi program in a GitHub repository. Each static website's stack is configured so that the stack is automatically updated if the underlying Pulumi program changes.

In one terminal window, run the HTTP server that uses Pulumi Deploy:

```bash
$ go run main.go
```

Open another terminal window to execute some `curl` commands and create some sites:

```bash
# create "hello" site
$ curl --header "Content-Type: application/json"   --request POST   --data '{"id":"hello","content":"hello world\n"}'   http://localhost:8080/sites
{"id":"hello"}
# wait for the site to become ready
$ curl http://localhost:8080/sites/hello
{"id":"hello","status":"DEPLOYING"}
$ curl http://localhost:8080/sites/hello
{"id":"hello","url":"s3-website-bucket-549d9d3.s3-website-us-west-2.amazonaws.com","status":"READY"}
# curl our "hello" site
$ curl s3-website-bucket-549d9d3.s3-website-us-west-2.amazonaws.com
hello world
# update our "hello" site content
$ curl --header "Content-Type: application/json"   --request POST   --data '{"id":"hello","content":"hello updated world!\n"}'   http://localhost:8080/sites/hello
{"id":"hello","url":"s3-website-bucket-549d9d3.s3-website-us-west-2.amazonaws.com"}
# wait for the site to become ready
$ curl http://localhost:8080/sites/hello
{"id":"hello","url":"s3-website-bucket-549d9d3.s3-website-us-west-2.amazonaws.com","status":"DEPLOYING"}
$ curl http://localhost:8080/sites/hello
{"id":"hello","url":"s3-website-bucket-549d9d3.s3-website-us-west-2.amazonaws.com","status":"DEPLOYING"}
# curl our updated hello site
$ curl s3-website-bucket-549d9d3.s3-website-us-west-2.amazonaws.com
hello updated world!
# destroy our "hello" site
$ curl --request DELETE http://localhost:8080/sites/hello
# wait for the site to destroy
$ curl http://localhost:8080/sites/hello
{"id":"hello","url":"s3-website-bucket-549d9d3.s3-website-us-west-2.amazonaws.com","status":"DEPLOYING"}
$ curl http://localhost:8080/sites/hello
{"id":"hello","status":"READY"}
# delete the site
$ curl --request DELETE http://localhost:8080/sites/hello?rm=true
```
