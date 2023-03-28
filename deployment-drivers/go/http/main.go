package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"log"
	"net/http"

	"github.com/julienschmidt/httprouter"
)

// createSiteRequest defines the body of a request to the "create site" REST API.
type createSiteRequest struct {
	// The name of the site.
	ID string `json:"id"`
	// The content of the site's index.html.
	Content string `json:"content"`
}

// updateSiteRequest defines the body of a request to the "update site" REST API.
type updateSiteRequest struct {
	// The content of the site's index.html.
	Content string `json:"content"`
}

// getSiteResponse defines the body of a response from the "create site" and "get site" REST APIs.
type getSiteResponse struct {
	ID     string `json:"id"`
	URL    string `json:"url,omitempty"`
	Status string `json:"status,omitempty"`
}

// internalServerError is a helper that writes a 500 response to w and logs the error to the terminal.
func internalServerError(w http.ResponseWriter, err error) {
	w.WriteHeader(http.StatusInternalServerError)
	fmt.Fprintf(w, "Internal Server Error")
	log.Printf("Internal Server Error: %v", err)
}

// siteNotFound is a helper that writes a 404 response to w.
func siteNotFound(w http.ResponseWriter, id string) {
	w.WriteHeader(http.StatusNotFound)
	fmt.Fprintf(w, "Site '%s' not found", id)
}

// A siteServer serves the REST API that provides CRUD operations for static sites.
type siteServer struct {
	// The Pulumi API client.
	client *pulumiClient

	// The repository, branch, and directory that hold the Pulumi program that manages each site's resources.
	repository string
	branch     string
	dir        string

	// The AWS region, IAM Role, and session name used for deployments.
	region      string
	roleARN     string
	sessionName string

	// The org and project that will hold the stacks that back each static site.
	org     string
	project string
}

// updateStack is a helper that creates a deployment that will update the static site's underlying stack with the
// given contents.
func (s *siteServer) updateStack(ctx context.Context, stack, content string) error {
	return s.client.createDeployment(ctx, s.org, s.project, stack, createDeploymentRequest{
		DeploymentSettings: DeploymentSettings{
			OperationContext: &operationContext{
				Environment: map[string]string{
					"SITE_CONTENT": content,
				},
			},
		},
		InheritSettings: true,
		Operation:       "update",
	})
}

// create implements the Create operation for a static site.
//
// The Create operation has three steps:
// 1. Create the underlying Pulumi stack for the static site. The name of the stack will be the name of the site.
// 2. Configure deployments for the Pulumi stack. Deployments will use the program at the configured GitHub repository,
//    branch, and directory, will obtain temporary credentials via OIDC using the configured AWS IAM Role ARN and
//    session name, and will deploy to the configured region. Furthermore, deployments will run if the Pulumi program
//    is updated by commits that are pushed to its branch and affect files in its directory.
// 3. Using the Deployments API, start a deployment using for the Pulumi stack that will run the initial update.
func (s *siteServer) create(w http.ResponseWriter, r *http.Request, _ httprouter.Params) {
	var create createSiteRequest
	if err := json.NewDecoder(r.Body).Decode(&create); err != nil {
		w.WriteHeader(400)
		fmt.Fprintf(w, "failed to parse create request")
		return
	}

	// Create the Pulumi stack.
	stack := create.ID
	err := s.client.createStack(r.Context(), s.org, s.project, stack)
	switch err {
	case nil:
		// OK
	case errStackExists:
		w.WriteHeader(http.StatusConflict)
		fmt.Fprintf(w, "site already exists")
		return
	default:
		internalServerError(w, fmt.Errorf("creating stack: %w", err))
		return
	}

	// Configure deployment settings for the stack.
	var paths []string
	if s.dir != "" {
		paths = []string{s.dir + "/**"}
	}
	err = s.client.patchDeploymentSettings(r.Context(), s.org, s.project, stack, DeploymentSettings{
		SourceContext: &sourceContext{
			Git: gitContext{
				Branch:  s.branch,
				RepoDir: s.dir,
			},
		},
		OperationContext: &operationContext{
			Environment: map[string]string{
				"AWS_REGION": s.region,
			},
			OIDC: &oidcContext{
				AWS: &awsOIDCContext{
					RoleARN:     s.roleARN,
					SessionName: s.sessionName,
				},
			},
		},
		GitHub: &gitHubContext{
			Repository:          s.repository,
			Paths:               paths,
			DeployCommits:       true,
			PreviewPullRequests: false,
		},
	})
	if err != nil {
		internalServerError(w, fmt.Errorf("patching deployment settings: %w", err))
		return
	}

	// Run a deployment for the stack's initial update.
	if err := s.updateStack(r.Context(), stack, create.Content); err != nil {
		internalServerError(w, fmt.Errorf("starting deployment: %w", err))
		return
	}

	w.WriteHeader(http.StatusAccepted)
	if err := json.NewEncoder(w).Encode(&getSiteResponse{ID: stack}); err != nil {
		log.Printf("writing response: %v", err)
	}
}

// get implements the Read operation for a static site.
//
// The status of the site is determined by the status of the stack's current deployment, if any.
func (s *siteServer) get(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	id := params.ByName("id")

	deploymentStatus, err := s.client.getStackCurrentDeploymentStatus(r.Context(), s.org, s.project, id)
	if err != nil {
		if err == errStackNotFound {
			siteNotFound(w, id)
		} else {
			internalServerError(w, fmt.Errorf("getting stack: %w", err))
		}
		return
	}
	status := "READY"
	switch deploymentStatus {
	case "not-started", "accepted", "running":
		status = "DEPLOYING"
	}

	outputs, err := s.client.getStackOutputs(r.Context(), s.org, s.project, id)
	if err != nil {
		if err == errStackNotFound {
			siteNotFound(w, id)
		} else {
			internalServerError(w, fmt.Errorf("getting stack outputs: %w", err))
		}
		return
	}
	url, _ := outputs["websiteUrl"].(string)

	resp := getSiteResponse{
		ID:     id,
		URL:    url,
		Status: status,
	}
	if err = json.NewEncoder(w).Encode(&resp); err != nil {
		log.Printf("encoding response: %v", err)
	}
}

// update implements the Update operation for a static site.
//
// Each update creates a new deployment for the site's stack. Updates are queued and will be processed in the order in
// which they are received.
func (s *siteServer) update(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	id := params.ByName("id")

	var update updateSiteRequest
	if err := json.NewDecoder(r.Body).Decode(&update); err != nil {
		w.WriteHeader(400)
		fmt.Fprintf(w, "failed to parse update request")
		return
	}

	err := s.updateStack(r.Context(), id, update.Content)
	switch err {
	case nil:
		w.WriteHeader(http.StatusAccepted)
	case errStackNotFound:
		siteNotFound(w, id)
	default:
		internalServerError(w, fmt.Errorf("starting deployment: %w", err))
	}
}

// delete implements the Delete operation for a static site.
//
// Site deletion requires two calls to this API: one to destroy the site's resources and another to delete the site's
// stack. The `rm` query parameter controls this behavior: when present, the site's stack will be deleted, and when
// absent, the site's resources will be destroyed.
func (s *siteServer) delete(w http.ResponseWriter, r *http.Request, params httprouter.Params) {
	id := params.ByName("id")

	var err error
	var statusOK int
	if !r.URL.Query().Has("rm") {
		err = s.client.createDeployment(r.Context(), s.org, s.project, id, createDeploymentRequest{
			InheritSettings: true,
			Operation:       "destroy",
		})
		statusOK = http.StatusAccepted
	} else {
		err = s.client.deleteStack(r.Context(), s.org, s.project, id)
		statusOK = http.StatusOK
	}
	switch err {
	case nil:
		w.WriteHeader(statusOK)
	case errStackNotFound:
		siteNotFound(w, id)
	default:
		internalServerError(w, fmt.Errorf("starting deployment: %w", err))
	}
}

func main() {
	// Parse our command line args.
	repository := flag.String("repo", "", "the GitHub repository that contains the site's Pulumi program")
	branch := flag.String("branch", "main", "the git branch that contains the site's Pulumi program")
	dir := flag.String("dir", "", "the subdirectory of the git repository that contains the site's Pulumi program")
	region := flag.String("region", "us-west-2", "the AWS region to deploy to")
	roleARN := flag.String("role-arn", "", "the AWS IAM Role ARN to use for OIDC integration")
	sessionName := flag.String("session-name", "site-deploy", "the session name to use for AWS OIDC integration")
	apiToken := flag.String("token", "", "the Pulumi API token to use")
	org := flag.String("org", "", "the Pulumi organization to use")
	project := flag.String("project", "", "the Pulumi project to deploy")
	addr := flag.String("addr", ":8080", "the address to listen on")
	flag.Parse()

	if *repository == "" {
		log.Fatal("the -repo flag is required")
	}
	if *roleARN == "" {
		log.Fatal("the -role-arn flag is required")
	}
	if *apiToken == "" {
		log.Fatal("the -token flag is required")
	}
	if *project == "" {
		log.Fatal("the -project flag is required")
	}

	// Create a new Pulumi API client using the provided API token.
	client := newPulumiClient(*apiToken)

	// If no org was provided, use the current user's first organization.
	if *org == "" {
		orgs, err := client.getCurrentOrgs()
		if err != nil {
			log.Fatalf("getting default organization: %v", err)
		}
		*org = orgs[0]
	}

	// Create a server for the static site REST API and start serving.
	server := &siteServer{
		client:      client,
		repository:  *repository,
		branch:      *branch,
		dir:         *dir,
		region:      *region,
		roleARN:     *roleARN,
		sessionName: *sessionName,
		org:         *org,
		project:     *project,
	}
	router := httprouter.New()
	router.POST("/sites", server.create)
	router.GET("/sites/:id", server.get)
	router.POST("/sites/:id", server.update)
	router.DELETE("/sites/:id", server.delete)

	http.ListenAndServe(*addr, router)
}
