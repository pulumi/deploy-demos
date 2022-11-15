from os import getenv

import drivers.api as api


def main():
    org = getenv('PULUMI_ORG')
    if org is None:
        raise Exception("Missing `PULUMI_ORG` variable pointing to the desired Pulumi organization.")
    project = getenv('PULUMI_PROJECT', 'stack-readme-yaml')
    stack = getenv('PULUMI_STACK', 'dev')

    api.create_deployment(org, project, stack, payload={
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
    main()

