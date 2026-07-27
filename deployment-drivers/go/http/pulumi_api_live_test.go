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
	resp, err := c.listStackDeployments(context.Background(), org, project, stack)
	if err != nil {
		t.Fatalf("listStackDeployments: %v", err)
	}
	t.Logf("total=%d itemsPerPage=%d returned=%d", resp.Total, resp.ItemsPerPage, len(resp.Deployments))

	// The point of this test is to catch a wrong json tag on the envelope, and a
	// wrong tag decodes to the zero value rather than erroring. So every assertion
	// here has to be one that all-zero values fail: requiring a non-empty slice is
	// what makes the per-item checks below reachable at all.
	if len(resp.Deployments) == 0 {
		t.Fatalf("decoded zero deployments (total=%d) — either the envelope tags are wrong "+
			"or %s/%s/%s has no deployment history; point LIVE_* at a stack that has one",
			resp.Total, org, project, stack)
	}
	if resp.Total < len(resp.Deployments) {
		t.Errorf("total=%d is less than the %d deployments returned — envelope shape mismatch",
			resp.Total, len(resp.Deployments))
	}
	if resp.ItemsPerPage == 0 {
		t.Error("itemsPerPage decoded 0 — json tag mismatch")
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

	// An empty status is only correct for a stack with no deployment history; on a
	// stack that has one it means the decode dropped the field, which is the failure
	// this test exists to catch. Tie the two together rather than tolerating "".
	resp, err := c.listStackDeployments(context.Background(), org, project, stack)
	if err != nil {
		t.Fatalf("listStackDeployments: %v", err)
	}
	if len(resp.Deployments) == 0 {
		t.Skipf("%s/%s/%s has no deployments; nothing to assert", org, project, stack)
	}

	switch status {
	case "not-started", "accepted", "running", "succeeded", "failed", "aborted", "skipped":
	case "":
		t.Fatalf("empty status for a stack with %d deployments — json tag mismatch", resp.Total)
	default:
		t.Fatalf("unrecognized deployment status %q", status)
	}
}
