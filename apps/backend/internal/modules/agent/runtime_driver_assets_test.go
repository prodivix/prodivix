package agent

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"testing"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
)

func binaryDriverAssetDigest(contents []byte) string {
	digest := sha256.Sum256(contents)
	return "sha256-" + hex.EncodeToString(digest[:])
}

func runtimeBaselineFixture(t *testing.T) (*g3.VerificationPlanCell, []workspace.WorkspaceDocumentRecord, runtimeDriverAssetRequest) {
	t.Helper()
	digest := runtimeTestDigest(t, map[string]any{"png": "fixture"}, "unused")
	entry := map[string]any{"id": "baseline.test", "scenarioId": "scenario.test", "stepId": "step.test", "targetId": "target.test", "frameworkTarget": "react-vite", "surface": "preview", "browserEngine": "chromium", "viewport": map[string]any{"id": "desktop", "width": 1280, "height": 720}, "colorScheme": "light", "motion": "full", "locale": "en-US", "devicePixelRatio": 1, "asset": map[string]any{"assetDocumentId": "asset.test", "digest": digest, "mediaType": "image/png"}, "normalizerDigest": digest, "compatibilityProfileDigest": digest, "adoptedAt": "2026-08-01T09:00:00.000Z", "adoptedBy": "user.test"}
	baseline, _ := json.Marshal(map[string]any{"wireVersion": 1, "id": "baseline.test", "name": "Fixture", "entries": []any{entry}})
	_, baselineDigest, err := verificationcontract.ReadBaselineReferences("baseline.test", baseline)
	if err != nil {
		t.Fatal(err)
	}
	asset, _ := json.Marshal(map[string]any{"mime": "image/png", "size": 64, "blob": map[string]any{"kind": "workspace-blob", "digest": digest, "mediaType": "image/png", "byteLength": 64}})
	documents := []workspace.WorkspaceDocumentRecord{{ID: "baseline.test", Type: workspace.WorkspaceDocumentTypeVerificationBaselineSet, Content: baseline}, {ID: "asset.test", Type: workspace.WorkspaceDocumentTypeAsset, Content: asset}}
	cell := &g3.VerificationPlanCell{ID: "cell.test", CheckKind: "visual", ScenarioID: "scenario.test", TargetID: "target.test", FrameworkTarget: "react-vite", Surface: "preview", BrowserEngine: "chromium", Viewport: g3.ViewportIdentity{ID: "desktop", Width: 1280, Height: 720}, ColorScheme: "light", Motion: "full", Locale: "en-US", BaselineSetRef: &g3.VerificationPlanDocumentDigestRef{DocumentID: "baseline.test", Digest: baselineDigest}}
	return cell, documents, runtimeDriverAssetRequest{CellID: cell.ID, BaselineEntryID: "baseline.test", AssetDigest: digest}
}

func TestRuntimeDriverBaselineBindsSelectedVisualIdentity(t *testing.T) {
	cell, documents, request := runtimeBaselineFixture(t)
	reference, err := runtimeDriverBaselineReference(cell, documents, "asset.test", request)
	if err != nil || reference.Digest != request.AssetDigest || reference.MediaType != "image/png" {
		t.Fatalf("reference=%#v err=%v", reference, err)
	}
	for _, mutate := range []func(*g3.VerificationPlanCell, *runtimeDriverAssetRequest){
		func(c *g3.VerificationPlanCell, r *runtimeDriverAssetRequest) { c.CheckKind = "unit" },
		func(c *g3.VerificationPlanCell, r *runtimeDriverAssetRequest) { c.ScenarioID = "scenario.foreign" },
		func(c *g3.VerificationPlanCell, r *runtimeDriverAssetRequest) { c.Viewport.Width++ },
		func(c *g3.VerificationPlanCell, r *runtimeDriverAssetRequest) { r.CellID = "cell.foreign" },
		func(c *g3.VerificationPlanCell, r *runtimeDriverAssetRequest) { r.BaselineEntryID = "baseline.foreign" },
		func(c *g3.VerificationPlanCell, r *runtimeDriverAssetRequest) {
			r.AssetDigest = runtimeTestDigest(t, map[string]any{"foreign": true}, "unused")
		},
	} {
		changedCell, changedRequest := *cell, request
		mutate(&changedCell, &changedRequest)
		if _, err := runtimeDriverBaselineReference(&changedCell, documents, "asset.test", changedRequest); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("foreign visual identity accepted: %v", err)
		}
	}
	changed := *cell
	changed.BaselineSetRef = &g3.VerificationPlanDocumentDigestRef{DocumentID: "baseline.test", Digest: request.AssetDigest}
	if _, err := runtimeDriverBaselineReference(&changed, documents, "asset.test", request); !errors.Is(err, ErrConflict) {
		t.Fatalf("stale baseline accepted: %v", err)
	}
}

func TestRuntimeDriverAssetAuthorizationAndBlobOwnerPostgreSQLGate(t *testing.T) {
	h, coordinates, input, plan := runtimeDriverHarness(t)
	ctx := context.Background()
	if _, err := h.repositoryA.RuntimeDriverContext(ctx, h.task.WorkspaceID, coordinates, h.lease, input.Clock, plan); err != nil {
		t.Fatal(err)
	}
	request := runtimeDriverAssetRequest{RuntimeDriverCoordinates: coordinates, CellID: "cell.runtime.test", BaselineEntryID: "baseline.test", AssetDigest: coordinates.RequestDigest}
	if _, err := h.repositoryA.runtimeDriverBaselineAsset(ctx, h.task.WorkspaceID, "asset.test", request, h.lease, input.Clock); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("nonvisual cell asset permission=%v", err)
	}
	if _, err := h.repositoryA.runtimeDriverBaselineAsset(ctx, h.task.WorkspaceID, "asset.test", request, h.lease, func() time.Time { return mustAgentTime(t, "2026-08-02T03:00:00.000Z") }); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("expired lease asset permission=%v", err)
	}
	store := workspace.NewWorkspaceStore(h.databaseA)
	contents := []byte("exact bounded asset bytes")
	digest := binaryDriverAssetDigest(contents)
	if _, err := store.PutWorkspaceAssetBlob(ctx, "user.test", h.task.WorkspaceID, digest, "image/png", contents); err != nil {
		t.Fatal(err)
	}
	tx, err := h.databaseA.BeginTx(ctx, nil)
	if err != nil {
		t.Fatal(err)
	}
	defer tx.Rollback()
	blob, err := store.GetWorkspaceAssetBlobForOwnerTx(ctx, tx, "user.test", h.task.WorkspaceID, digest)
	if err != nil || string(blob.Contents) != string(contents) {
		t.Fatalf("exact transactional blob read=%#v err=%v", blob, err)
	}
	if _, err := store.GetWorkspaceAssetBlobForOwnerTx(ctx, tx, "user.foreign", h.task.WorkspaceID, digest); !errors.Is(err, workspace.ErrWorkspaceNotFound) {
		t.Fatalf("foreign owner read=%v", err)
	}
}
