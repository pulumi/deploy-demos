import logging
from os import getenv
from sys import exit as sysexit

import requests

backend_url = "https://api.pulumi.com/api"


def create_request(action, suffix, payload=None):
    final_url = f'{backend_url}/{suffix}'
    access_token = getenv('PULUMI_ACCESS_TOKEN')
    headers = {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        'Authorization': f'token {access_token}'
    }
    return requests.request(
        method=action,
        url=final_url,
        headers=headers,
        json=payload
    )


def generate_call(action, suffix, payload=None):
    res = create_request(action, suffix, payload)
    try:
        res.raise_for_status()
        logging.info(res.status_code)
    except requests.exceptions.HTTPError as e:
        logging.error(f'HTTP error: {e}')
        sysexit(f"Failed to call {suffix} due to an HTTP error: {res.status_code} {res.reason}")
    except requests.exceptions.RequestException as e:
        logging.critical(e)
        sysexit(f"Failed to call {suffix}: {e}")
    return res.status_code


def create_stack(org, project, stack):
    url_suffix = f'stacks/{org}/{project}'
    payload = {"stackName": stack}
    return generate_call("POST", url_suffix, payload)


def create_deployment(org, project, stack, payload):
    url_suffix = f'preview/{org}/{project}/{stack}/deployments'
    operation = payload['operationContext']['operation']
    logging.info(f"Attempting a {operation} against {url_suffix}")
    print(f"Attempting a {operation} against {url_suffix}")
    res = create_request('POST', url_suffix, payload)

    try:
        res.raise_for_status()
        logging.info(res.status_code)
        response_json = res.json()
        print(f"""Deployment successfully created.
Deployment ID: {response_json['id']}
Console link: {response_json['consoleUrl']}""")
    except requests.exceptions.HTTPError as e:
        if res.status_code == 404:
            print("Stack doesn't exist, creating it")
            create_stack(org, project, stack)
            return generate_call('POST', url_suffix, payload)
        logging.error(f'HTTP error: {e}')
        sysexit(f"Failed to call {url_suffix} due to an HTTP error: {res.status_code} {res.reason}")
    except requests.exceptions.RequestException as e:
        logging.critical(e)
        sysexit(f"Failed to call {url_suffix}: {e}")
    return res.status_code

