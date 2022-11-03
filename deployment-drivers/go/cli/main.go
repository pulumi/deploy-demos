package main

import (
	"fmt"
	"github.com/go-resty/resty/v2"
	"gopkg.in/alecthomas/kingpin.v2"
	"log"
	"os"
	"strconv"
)

const (
	baseURL = "https://api.pulumi.com/api"
)

var (
	previewURL = fmt.Sprintf("%s/preview", baseURL)
	stackURL   = fmt.Sprintf("%s/stacks", baseURL)
)

type DeployData struct {
	SourceContext    SourceContext    `json:"sourceContext"`
	OperationContext OperationContext `json:"operationContext"`
}
type GitInfo struct {
	RepoURL string `json:"repoURL"`
	Branch  string `json:"branch"`
	RepoDir string `json:"repoDir"`
}
type SourceContext struct {
	GitInfo GitInfo `json:"git"`
}
type OperationContext struct {
	Operation   string            `json:"operation"`
	Environment map[string]string `json:"environmentVariables"`
	Commands    []string          `json:"preRunCommands"`
}

type CreateStackData struct {
	StackName string `json:"stackName"`
}

// type DeployResult struct {
// 	ID string `json:"id"`
// }

// type AuthError struct {
// 	Code    int    `json:"code"`
// 	Message string `json:"message"`
// }

func LogCommandOptions(cmd *kingpin.CmdClause) *string {
	flag := cmd.Flag("id", "The deploy id to retrieve logs for").Required().String()
	return flag
}

var (
	resp *resty.Response
	err  error

	app = kingpin.New("pulumi-deployer", "A helper cli to use pulumi-deploy")
	// global flags
	org     = app.Flag("org", "Organization to use").Required().Envar("PULUMI_ORG").String()
	stack   = app.Flag("stack", "Stack to deploy").Default("dev").String()
	project = app.Flag("project", "Project to deploy").Required().String()
	token   = app.Flag("token", "the Pulumi API token to use").Required().Envar("PULUMI_ACCESS_TOKEN").String()
	debug   = app.Flag("debug", "enable debug logging").Default("false").Bool()

	requestCmd = app.Command("request", "Request a deploy")
	// request specific flags
	repoUrl     = requestCmd.Flag("repoUrl", "Repo url to use for deploy").Required().Envar("PULUMI_DEPLOY_REPO").String()
	repoDir     = requestCmd.Flag("repoDir", "Directory in Git repo to deploy").Required().String()
	operation   = requestCmd.Flag("operation", "Operation to request").Default("update").String()
	branch      = requestCmd.Flag("branch", "The git branch to deploy").Default("refs/heads/main").String()
	environment = requestCmd.Flag("environment", "Environment variable to pass").StringMap()
	commands    = requestCmd.Flag("prerun-commands", "Commands to run before Pulumi runs").Strings()

	// logs specific flags
	logsCmd = app.Command("logs", "Logs for a deploy")
	logId   = LogCommandOptions(logsCmd)

	// stepLogs specific flags
	stepLogsCmd = app.Command("step", "Logs for a deploy")
	stepLogId   = LogCommandOptions(stepLogsCmd)
	stepLogStep = stepLogsCmd.Flag("step", "The step number to retrieve logs for").Default("1").Int()
)

func main() {
	kingpin.Version("0.0.1")

	client := resty.New()

	switch kingpin.MustParse(app.Parse(os.Args[1:])) {

	case logsCmd.FullCommand():
		client.SetDebug(*debug)
		resp, err = client.R().
			SetHeader("Accept", "application/json").
			SetHeader("Authorization", fmt.Sprintf("token %s", *token)).
			Get(fmt.Sprintf("%s/%s/%s/%s/deployments/%s", previewURL, *org, *project, *stack, *logId))

		fmt.Println(string(resp.Body()))

	case stepLogsCmd.FullCommand():
		client.SetDebug(*debug)
		resp, err = client.R().
			SetHeader("Accept", "application/json").
			SetHeader("Authorization", fmt.Sprintf("token %s", *token)).
			Get(fmt.Sprintf("%s/%s/%s/%s/deployments/%s/logs?step=%s&offset=100", previewURL, *org, *project, *stack, *stepLogId, strconv.Itoa(*stepLogStep)))

		fmt.Println(string(resp.Body()))

	case requestCmd.FullCommand():
		createDeployment(client)

	default:
		fmt.Println("nothing requested :(")
	}
}

func createDeployment(client *resty.Client) {
	client.SetDebug(*debug)
	resp, err = client.R().
		SetBody(DeployData{
			SourceContext: SourceContext{
				GitInfo: GitInfo{
					RepoURL: *repoUrl,
					Branch:  *branch,
					RepoDir: *repoDir,
				},
			},
			OperationContext: OperationContext{
				Operation:   *operation,
				Environment: *environment,
				Commands:    *commands,
			}}).
		SetHeader("Authorization", fmt.Sprintf("token %s", *token)).
		SetHeader("Accept", "application/json").
		Post(fmt.Sprintf("%s/%s/%s/%s/deployments", previewURL, *org, *project, *stack))
	if err != nil {
		log.Fatalf("error creating deployment: %v", err)
	}

	switch resp.StatusCode() {
	case 401:
		log.Fatalf("auth error: %s", resp.Body())
	case 404:
		log.Printf("stack '%s/%s' doesn't exist, creating it.\n", *project, *stack)
		resp, err = client.R().
			SetBody(CreateStackData{
				StackName: *stack,
			}).
			SetHeader("Authorization", fmt.Sprintf("token %s", *token)).
			SetHeader("Accept", "application/json").
			Post(fmt.Sprintf("%s/%s/%s", stackURL, *org, *project))
		if resp.StatusCode() == 200 {
			log.Printf("created stack '%s/%s', now creating deployment.\n", *project, *stack)
			createDeployment(client)
		} else {
			log.Fatalf("Error: %s", string(resp.Body()))
		}
	default:
		log.Printf("created deployment with id: %s\n", string(resp.Body()))
	}
}
