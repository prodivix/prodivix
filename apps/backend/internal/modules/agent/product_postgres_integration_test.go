package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type productRepositoryVector struct {
	Facts struct {
		Supplement json.RawMessage `json:"supplement"`
		Command    json.RawMessage `json:"command"`
	} `json:"facts"`
}

func readProductRepositoryVector(t *testing.T) productRepositoryVector {
	t.Helper()
	source, err := os.ReadFile(filepath.Join(
		"..", "..", "platform", "agentcontract", "testdata", "agent-product-vector.json",
	))
	if err != nil {
		t.Fatal(err)
	}
	var vector productRepositoryVector
	if err := json.Unmarshal(source, &vector); err != nil {
		t.Fatal(err)
	}
	return vector
}

func TestAgentProductPostgreSQLGate(t *testing.T) {
	databaseA, databaseB := openAgentPostgreSQL(t)
	seedAgentWorkspace(t, databaseA)
	repositoryA, repositoryB := NewRepository(databaseA), NewRepository(databaseB)
	control := readRepositoryVector(t)
	product := readProductRepositoryVector(t)
	ctx := context.Background()
	user := PrincipalAuthority{Kind: "user", PrincipalID: "user.test", ProjectID: "project.catalog", WorkspaceID: "workspace.catalog"}
	service := PrincipalAuthority{Kind: "service", PrincipalID: "agent.product-projector", ProjectID: "project.catalog", WorkspaceID: "workspace.catalog"}

	task, replayed, err := repositoryA.CreateTask(ctx, user, control.Facts.Task)
	if err != nil || replayed {
		t.Fatalf("create product Task = %#v replay=%v err=%v", task, replayed, err)
	}
	exerciseAgentRecoveryPostgreSQL(t, ctx, repositoryA, repositoryB, databaseA, task, control.RecoverySequence)

	if _, _, err := repositoryA.StoreProductSupplement(ctx, user, product.Facts.Supplement); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("user-authored product supplement error = %v, want ErrUnauthorized", err)
	}
	supplement, replayed, err := repositoryA.StoreProductSupplement(ctx, service, product.Facts.Supplement)
	if err != nil || replayed {
		t.Fatalf("store product supplement = %#v replay=%v err=%v", supplement, replayed, err)
	}
	replayedSupplement, replayed, err := repositoryB.StoreProductSupplement(ctx, service, product.Facts.Supplement)
	if err != nil || !replayed || replayedSupplement.SupplementDigest != supplement.SupplementDigest {
		t.Fatalf("replay product supplement = %#v replay=%v err=%v", replayedSupplement, replayed, err)
	}

	if _, _, err := repositoryA.StoreRunUserCommand(ctx, PrincipalAuthority{
		Kind: "user", PrincipalID: "user.other", ProjectID: user.ProjectID, WorkspaceID: user.WorkspaceID,
	}, "run.g4-v4.recovery-vector", product.Facts.Command); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("foreign Run command error = %v, want ErrUnauthorized", err)
	}
	command, replayed, err := repositoryA.StoreRunUserCommand(ctx, user, "run.g4-v4.recovery-vector", product.Facts.Command)
	if err != nil || replayed {
		t.Fatalf("store Run command = %#v replay=%v err=%v", command, replayed, err)
	}
	replayedCommand, replayed, err := repositoryB.StoreRunUserCommand(ctx, user, "run.g4-v4.recovery-vector", product.Facts.Command)
	if err != nil || !replayed || replayedCommand.CommandDigest != command.CommandDigest {
		t.Fatalf("replay Run command = %#v replay=%v err=%v", replayedCommand, replayed, err)
	}
	if _, _, err := repositoryA.StoreRunUserCommand(ctx, user, "run.foreign", product.Facts.Command); !errors.Is(err, ErrConflict) {
		t.Fatalf("path-drifted Run command error = %v, want ErrConflict", err)
	}
	stale := mutateProductCommandSnapshot(t, product.Facts.Command, supplement.SupplementDigest)
	if _, _, err := repositoryA.StoreRunUserCommand(ctx, user, "run.g4-v4.recovery-vector", stale); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale Run command error = %v, want ErrConflict", err)
	}

	bundle, err := repositoryB.GetProductLedgerBundle(ctx, user, "run.g4-v4.recovery-vector")
	if err != nil {
		t.Fatal(err)
	}
	if len(bundle.Events) != len(control.RecoverySequence) || len(bundle.Commands) != 1 || len(bundle.Supplement) == 0 || !bundle.ActorAuthorized {
		t.Fatalf("product bundle events=%d commands=%d supplement=%d authorized=%v", len(bundle.Events), len(bundle.Commands), len(bundle.Supplement), bundle.ActorAuthorized)
	}
	if bundle.CurrentRevision["workspaceRev"] != int64(42) || len(bundle.CurrentRevision["documents"].([]any)) != 1 {
		t.Fatalf("product current revision = %#v", bundle.CurrentRevision)
	}
	if _, err := databaseA.Exec(`UPDATE agent_run_user_commands SET kind = 'recover'
	WHERE workspace_id = $1 AND command_id = $2`, user.WorkspaceID, command.CommandID); err == nil {
		t.Fatal("immutable Run user command accepted UPDATE")
	}
	if _, err := databaseA.Exec(`DELETE FROM agent_product_supplements
	WHERE workspace_id = $1 AND supplement_id = $2`, user.WorkspaceID, supplement.SupplementID); err == nil {
		t.Fatal("immutable product supplement accepted DELETE")
	}
}

func mutateProductCommandSnapshot(t *testing.T, source json.RawMessage, snapshotDigest string) []byte {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	value := envelope["value"].(map[string]any)
	value["expectedSnapshotDigest"] = snapshotDigest
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != "commandDigest" {
			base[key] = entry
		}
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	value["commandDigest"] = digest
	encoded, err := canonicaljson.Bytes(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}
