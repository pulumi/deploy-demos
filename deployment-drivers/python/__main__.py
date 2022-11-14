import drivers.api as api


def call_me():
    api.create_deployment('stack-readme-yaml', payload={
        "sourceContext": {
            "git": {
                "repoURL": "https://github.com/pulumi/examples.git",
                "branch": "refs/heads/master",
                "repoDir": "stack-readme-yaml"
            }
        },
        "operationContext": {
            "operation": "destroy"
        }
    })


if __name__ == "__main__":
    call_me()

