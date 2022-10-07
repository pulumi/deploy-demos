package main

import (
	"encoding/json"
	"fmt"
	"github.com/go-resty/resty/v2"
	"gopkg.in/alecthomas/kingpin.v2"
	"log"
	"os"
	"strconv"
)

const (
	url            = "https://api.pulumi.com/api/preview"
	deploymentsUri = "deployments"
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
	Operation string `json:"operation"`
}

type DeployResult struct {
	ID string `json:"id"`
}

type AuthError struct {
	Code    int    `json:"code"`
	Message string `json:"message"`
}

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
	debug   = app.Flag("debug", "enable debug logging").Default("true").Bool()

	requestCmd = app.Command("request", "Request a deploy")
	// request specific flags
	repoUrl   = requestCmd.Flag("repoUrl", "Repo url to use for deploy").Required().Envar("PULUMI_DEPLOY_REPO").String()
	repoDir   = requestCmd.Flag("repoDir", "Directory in Git repo to deploy").Required().String()
	operation = requestCmd.Flag("operation", "Operation to request").Default("update").String()
	branch    = requestCmd.Flag("branch", "The git branch to deploy").Default("refs/heads/main").String()

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

	client.SetDebug(*debug)

	switch kingpin.MustParse(app.Parse(os.Args[1:])) {

	case logsCmd.FullCommand():
		resp, err = client.R().
			SetHeader("Accept", "application/json").
			SetHeader("Authorization", fmt.Sprintf("token %s", *token)).
			Get(fmt.Sprintf("%s/%s/%s/%s/deployments/%s", url, *org, *project, *stack, *logId))

		fmt.Println(string(resp.Body()))

	case stepLogsCmd.FullCommand():
		resp, err = client.R().
			SetHeader("Accept", "application/json").
			SetHeader("Authorization", fmt.Sprintf("token %s", *token)).
			Get(fmt.Sprintf("%s/%s/%s/%s/deployments/%s/logs?step=%s&offset=0", url, *org, *project, *stack, *stepLogId, strconv.Itoa(*stepLogStep)))

		fmt.Println(string(resp.Body()))

	case requestCmd.FullCommand():
		fmt.Println("dispatching a deploy")

		var response DeployResult

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
					Operation: *operation,
				}}).
			SetResult(&response).
			SetError(&AuthError{}).
			SetHeader("Authorization", fmt.Sprintf("token %s", *token)).
			SetHeader("Accept", "application/json").
			Post(fmt.Sprintf("%s/%s/%s/%s/deployments", url, *org, *project, *stack))
		if err != nil {
			log.Fatalf("error creating deployment: %v", err)
		}

		if err := json.Unmarshal(resp.Body(), &response); err != nil {
			log.Fatalf("failed unmarshalling response into: json: %v", err)
		}

		switch resp.StatusCode() {
		case 401:
			log.Fatalf("auth error: %s", resp.Body())
		default:
			log.Printf("created deployment with id: %s\n", string(resp.Body()))
		}

	default:
		fmt.Println("nothing requested :(")
	}
}
