package main

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"path"

	"github.com/go-resty/resty/v2"
	"github.com/pulumi/pulumi/sdk/v3/go/common/apitype"
)

const pulumiURL = "https://api.pulumi.com/api"

// DeploymentSettings defines a settings payload for the Deployment API.
type DeploymentSettings struct {
	SourceContext    *sourceContext    `json:"sourceContext,omitempty"`
	OperationContext *operationContext `json:"operationContext,omitempty"`
	GitHub           *gitHubContext    `json:"gitHub,omitempty"`
}

// sourceContext holds source-control-related configuration for the Deployment API.
type sourceContext struct {
	Git gitContext
}

// gitContext holds git-related configuration for the Deployment API.
type gitContext struct {
	// The git branch to deploy
	Branch string `json:"branch,omitempty"`
	// The directory that contains the Pulumi program to deploy.
	RepoDir string `json:"repoDir,omitempty"`
}

// operationContext holds operation-related configuration for the Deployment API.
type operationContext struct {
	// Environment variables to set during a deployment
	Environment map[string]string `json:"environmentVariables,omitempty"`
	// Settings for authentication with cloud providers via OIDC.
	OIDC *oidcContext `json:"oidc,omitempty"`
}

// oidcContext holds OIDC-related configuration for the Deployment API.
type oidcContext struct {
	AWS *awsOIDCContext `json:"aws,omitempty"`
}

// awsOIDCContext holds configuration for integrating with AWS via OIDC for credential exchange.
type awsOIDCContext struct {
	// The ARN of the role to use for OIDC
	RoleARN string `json:"roleArn,omitempty"`
	// The name of the temporary session used for OIDC
	SessionName string `json:"sessionName,omitempty"`
}

// gitHubContext holds GitHub-related configuration for the Deployment API.
type gitHubContext struct {
	// The slug of the repository that contains the Pulumi program to deploy (e.g. "pulumi/deploy-demos")
	Repository string `json:"repository,omitempty"`
	// Path filters that control whether or not a deployment runs based on the files changed by a pull request or commit.
	Paths []string `json:"paths,omitempty"`
	// Whether or not to run a deployment when commits are pushed to the configured branch.
	DeployCommits bool `json:"deployCommits,omitempty"`
	// Whether or not to run previews for pull requests against the configured branch.
	PreviewPullRequests bool `json:"previewPullRequests,omitempty"`
}

// createDeploymentRequest defines the body of a request to the "create deployment" REST API.
type createDeploymentRequest struct {
	// Any settings for this deployment. If InheritSettings is true, these settings will be merged with the target
	// stack's saved settings. Otherwise, they will be used literally.
	DeploymentSettings

	// True to merge the deployment settings configured for the target stack with the deployment settings
	// present in the request or false to only use the settings in the request.
	InheritSettings bool `json:"inheritSettings"`
	// The Pulumi operation to perform. One of "preview", "update", "refresh", or "destroy".
	Operation string `json:"operation"`
}

// listDeploymentRequest defines the body of a request to the "list deployments" REST API.
type listDeploymentsResponse struct {
	// Status is the current status of the deployment.
	Status string `json:"status"`
}

var errStackExists = errors.New("stack already exists")
var errStackNotFound = errors.New("stack not found")

type pulumiClient struct {
	client *resty.Client
	token  string
}

func newPulumiClient(token string) *pulumiClient {
	return &pulumiClient{
		client: resty.New(),
		token:  token,
	}
}

func (c *pulumiClient) createStack(ctx context.Context, org, project, stack string) error {
	// createStackRequest defines the body of a request to the "create stack" REST API.
	type createStackRequest struct {
		// The name of the stack to create.
		StackName string `json:"stackName"`
	}

	resp, err := c.client.R().
		SetContext(ctx).
		SetBody(createStackRequest{StackName: stack}).
		SetHeader("Authorization", "token "+c.token).
		SetHeader("Accept", "application/json").
		Post(pulumiURL + path.Join("/stacks", org, project))
	if err != nil {
		return err
	}
	switch resp.StatusCode() {
	case http.StatusOK:
		return nil
	case http.StatusConflict:
		return errStackExists
	default:
		return fmt.Errorf("%v: %s", resp.StatusCode(), string(resp.Body()))
	}
}

func (c *pulumiClient) deleteStack(ctx context.Context, org, project, stack string) error {
	resp, err := c.client.R().
		SetContext(ctx).
		SetHeader("Authorization", "token "+c.token).
		SetHeader("Accept", "application/json").
		Delete(pulumiURL + path.Join("/stacks", org, project, stack))
	if err != nil {
		return err
	}
	switch resp.StatusCode() {
	case http.StatusNoContent:
		return nil
	case http.StatusNotFound:
		return errStackNotFound
	default:
		return fmt.Errorf("%v: %s", resp.StatusCode(), string(resp.Body()))
	}
}

func (c *pulumiClient) patchDeploymentSettings(ctx context.Context, org, project, stack string, settings DeploymentSettings) error {
	resp, err := c.client.R().
		SetContext(ctx).
		SetBody(settings).
		SetHeader("Authorization", "token "+c.token).
		SetHeader("Accept", "application/json").
		Post(pulumiURL + path.Join("/preview", org, project, stack, "deployment", "settings"))
	if err != nil {
		return err
	}
	switch resp.StatusCode() {
	case http.StatusOK:
		return nil
	case http.StatusNotFound:
		return errStackNotFound
	default:
		return fmt.Errorf("%v: %s", resp.StatusCode(), string(resp.Body()))
	}
}

func (c *pulumiClient) createDeployment(ctx context.Context, org, project, stack string, req createDeploymentRequest) error {
	resp, err := c.client.R().
		SetContext(ctx).
		SetBody(req).
		SetHeader("Authorization", "token "+c.token).
		SetHeader("Accept", "application/json").
		Post(pulumiURL + path.Join("/preview", org, project, stack, "deployments"))
	if err != nil {
		return err
	}
	switch resp.StatusCode() {
	case http.StatusAccepted:
		return nil
	case http.StatusNotFound:
		return errStackNotFound
	default:
		return fmt.Errorf("%v: %s", resp.StatusCode(), string(resp.Body()))
	}
}

func (c *pulumiClient) listStackDeployments(ctx context.Context, org, project, stack string, page int) ([]listDeploymentsResponse, error) {
	resp, err := c.client.R().
		SetContext(ctx).
		SetHeader("Authorization", "token "+c.token).
		SetHeader("Accept", "application/json").
		SetDoNotParseResponse(true).
		Get(pulumiURL + path.Join("/preview", org, project, stack, fmt.Sprintf("deployments?page=%v", page)))
	if err != nil {
		return nil, err
	}
	switch resp.StatusCode() {
	case http.StatusOK:
		// OK
	case http.StatusNotFound:
		return nil, errStackNotFound
	default:
		return nil, fmt.Errorf("%v: %s", resp.StatusCode(), string(resp.Body()))
	}
	defer resp.RawBody().Close()

	var respBody []listDeploymentsResponse
	if err = json.NewDecoder(resp.RawBody()).Decode(&respBody); err != nil {
		return nil, err
	}
	return respBody, nil
}

func (c *pulumiClient) getStackCurrentDeploymentStatus(ctx context.Context, org, project, stack string) (string, error) {
	for page, lastDeploymentStatus := 1, ""; ; page++ {
		deployments, err := c.listStackDeployments(ctx, org, project, stack, page)
		if err != nil {
			return "", err
		}
		if len(deployments) == 0 {
			return lastDeploymentStatus, nil
		}
		lastDeploymentStatus = deployments[len(deployments)-1].Status
	}
}

func (c *pulumiClient) getStackOutputs(ctx context.Context, org, project, stack string) (map[string]interface{}, error) {
	resp, err := c.client.R().
		SetContext(ctx).
		SetHeader("Authorization", "token "+c.token).
		SetHeader("Accept", "application/json").
		SetDoNotParseResponse(true).
		Get(pulumiURL + path.Join("/stacks", org, project, stack, "export"))
	if err != nil {
		return nil, err
	}
	switch resp.StatusCode() {
	case http.StatusOK:
		// OK
	case http.StatusNotFound:
		return nil, errStackNotFound
	default:
		return nil, fmt.Errorf("%v: %s", resp.StatusCode(), string(resp.Body()))
	}
	defer resp.RawBody().Close()

	var respBody apitype.UntypedDeployment
	if err = json.NewDecoder(resp.RawBody()).Decode(&respBody); err != nil {
		return nil, err
	}
	if respBody.Version != apitype.DeploymentSchemaVersionCurrent {
		return nil, nil
	}
	var state apitype.DeploymentV3
	if err = json.Unmarshal([]byte(respBody.Deployment), &state); err != nil {
		return nil, fmt.Errorf("unmarshaling deployment: %w", err)
	}
	var stackResource *apitype.ResourceV3
	for _, r := range state.Resources {
		if r.Type == "pulumi:pulumi:Stack" {
			stackResource = &r
			break
		}
	}
	if stackResource == nil {
		return nil, nil
	}
	return stackResource.Outputs, nil
}

func (c *pulumiClient) getCurrentOrgs() ([]string, error) {
	// organizationSummary describes summary information about a Pulumi organization.
	type organizationSummary struct {
		// The short name of the Pulumi organization (e.g. "pulumi").
		GitHubLogin string `json:"githubLogin"`
	}

	// getUserResponse defines the body of a response from the "get current user" REST API.
	type getUserResponse struct {
		// The set of organizations the user belongs to.
		Organizations []organizationSummary `json:"organizations"`
	}

	resp, err := c.client.R().
		SetHeader("Authorization", "token "+c.token).
		SetHeader("Accept", "application/json").
		SetDoNotParseResponse(true).
		Get(pulumiURL + "/user")
	if err != nil {
		return nil, err
	}
	if resp.StatusCode() != http.StatusOK {
		return nil, fmt.Errorf("%v: %v", resp.StatusCode(), (string(resp.Body())))
	}
	defer resp.RawBody().Close()

	var body getUserResponse
	if err := json.NewDecoder(resp.RawBody()).Decode(&body); err != nil {
		return nil, fmt.Errorf("decoding user response: %w", err)
	}

	orgs := make([]string, len(body.Organizations))
	for i, o := range body.Organizations {
		orgs[i] = o.GitHubLogin
	}
	return orgs, nil
}
