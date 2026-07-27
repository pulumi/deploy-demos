//go:build live

// Live verification of the GA Deployments API wiring against api.pulumi.com.
// Excluded from normal builds by the `live` tag; run with:
//
//	go test -tags live -run TestLive -v ./...
//
// Requires PULUMI_ACCESS_TOKEN and a LIVE_ORG/LIVE_PROJECT/LIVE_STACK that the
// token can read.
package main

import (
	"context"
	"os"
	"testing"
)

func liveClient(t *testing.T) (*pulumiClient, string, string, string) {
	t.Helper()
	token := os.Getenv("PULUMI_ACCESS_TOKEN")
	if token == "" {
		t.Skip("PULUMI_ACCESS_TOKEN not set")
	}
	org, project, stack := os.Getenv("LIVE_ORG"), os.Getenv("LIVE_PROJECT"), os.Getenv("LIVE_STACK")
	if org == "" || project == "" || stack == "" {
		t.Skip("LIVE_ORG/LIVE_PROJECT/LIVE_STACK not set")
	}
	return newPulumiClient(token), org, project, stack
}

func TestLiveListStackDeployments(t *testing.T) {
	c, org, project, stack := liveClient(t)
	resp, err := c.listStackDeployments(context.Background(), org, project, stack, 1)
	if err != nil {
		t.Fatalf("listStackDeployments: %v", err)
	}
	t.Logf("total=%d itemsPerPage=%d returned=%d", resp.Total, resp.ItemsPerPage, len(resp.Deployments))
	// Total is the server's count of all deployments; a decode that silently
	// produced a zero-value struct would leave it at 0 alongside a 200.
	if resp.Total != len(resp.Deployments) && len(resp.Deployments) == 0 {
		t.Fatalf("decoded empty deployments but server reports total=%d — envelope shape mismatch", resp.Total)
	}
	for i, d := range resp.Deployments {
		if d.Status == "" {
			t.Errorf("deployments[%d].status decoded empty — json tag mismatch", i)
		}
	}
}

func TestLiveGetStackCurrentDeploymentStatus(t *testing.T) {
	c, org, project, stack := liveClient(t)
	status, err := c.getStackCurrentDeploymentStatus(context.Background(), org, project, stack)
	if err != nil {
		t.Fatalf("getStackCurrentDeploymentStatus: %v", err)
	}
	t.Logf("current deployment status = %q", status)
	if status == "" {
		t.Log("no deployments on this stack (empty status is correct here)")
	}
}
