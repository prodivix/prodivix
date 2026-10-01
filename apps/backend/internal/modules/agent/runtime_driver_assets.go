package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"image/png"
	"net/http"
	"time"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	workspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
	"github.com/gin-gonic/gin"
)

type runtimeDriverAssetRequest struct {
	RuntimeDriverCoordinates
	CellID          string `json:"cellId"`
	BaselineEntryID string `json:"baselineEntryId"`
	AssetDigest     string `json:"assetDigest"`
}

func (gateway *RuntimeGateway) driverBaselineAsset(c *gin.Context) {
	var input runtimeDriverAssetRequest
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.driverCoordinates(c, input.RuntimeDriverCoordinates, false)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	blob, err := gateway.repository.runtimeDriverBaselineAsset(c.Request.Context(), c.Param("workspaceId"), c.Param("assetDocumentId"), input, lease, gateway.clock)
	if err != nil {
		respondDriverError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"assetDocumentId": c.Param("assetDocumentId"), "digest": blob.Reference.Digest, "mediaType": blob.Reference.MediaType, "contents": base64.StdEncoding.EncodeToString(blob.Contents)})
}

// A baseline read is a projection of one selected visual cell, never a general
// asset capability. Snapshot, baseline reference and exact blob share one TX.
func (repository *Repository) runtimeDriverBaselineAsset(ctx context.Context, workspaceID, assetDocumentID string, input runtimeDriverAssetRequest, lease RunLeaseAuthority, clock func() time.Time) (*workspace.WorkspaceAssetBlob, error) {
	if !canonicalDigestPattern.MatchString(input.AssetDigest) || input.CellID == "" || input.BaselineEntryID == "" {
		return nil, ErrInvalid
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	authorize := repository.runtimeDriverAuthorization(workspaceID, input.RuntimeDriverCoordinates, lease, clock, false)
	if err := authorize(ctx, tx); err != nil {
		return nil, err
	}
	var owner string
	var planBytes, runBytes, receiptBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT w.owner_id,j.plan_wire_bytes,v.snapshot_bytes,m.receipt_bytes
FROM agent_runtime_g3_driver_jobs j
JOIN verification_runs v ON v.workspace_id=j.workspace_id AND v.id=j.verification_run_id
JOIN agent_runtime_verification_runs l ON l.workspace_id=j.workspace_id AND l.verification_run_id=j.verification_run_id
JOIN agent_workspace_mutation_receipts m ON m.workspace_id=l.workspace_id AND m.receipt_id=l.mutation_receipt_id
JOIN workspaces w ON w.id=j.workspace_id WHERE j.workspace_id=$1 AND j.verification_run_id=$2`, workspaceID, input.VerificationRunID).Scan(&owner, &planBytes, &runBytes, &receiptBytes); err != nil {
		return nil, err
	}
	plan, _, err := g3.DecodeVerificationPlanWire(planBytes)
	if err != nil {
		return nil, err
	}
	run, _, err := g3.DecodeVerificationRunSnapshotWire(runBytes)
	if err != nil {
		return nil, err
	}
	selected := false
	for _, id := range run.SelectedCellIDs {
		if id == input.CellID {
			selected = true
		}
	}
	if !selected {
		return nil, ErrUnauthorized
	}
	var selectedCell *g3.VerificationPlanCell
	for i := range plan.Cells {
		if plan.Cells[i].ID == input.CellID {
			selectedCell = &plan.Cells[i]
		}
	}
	if selectedCell == nil || selectedCell.CheckKind != "visual" || selectedCell.BaselineSetRef == nil {
		return nil, ErrUnauthorized
	}
	ack, err := decodeMutationReceipt(receiptBytes)
	if err != nil {
		return nil, err
	}
	matches, err := workspaceRevisionMatchesTx(ctx, tx, workspaceID, ack.TargetRevision)
	if err != nil {
		return nil, err
	}
	if !matches {
		return nil, ErrConflict
	}
	store := workspace.NewWorkspaceStore(repository.db)
	snapshot, err := store.GetSnapshotForOwnerTx(ctx, tx, owner, workspaceID)
	if err != nil {
		return nil, err
	}
	reference, err := runtimeDriverBaselineReference(selectedCell, snapshot.Documents, assetDocumentID, input)
	if err != nil {
		return nil, err
	}
	blob, err := store.GetWorkspaceAssetBlobForOwnerTx(ctx, tx, owner, workspaceID, reference.Digest)
	if err != nil {
		return nil, err
	}
	if blob.Reference != reference {
		return nil, ErrConflict
	}
	configuration, err := png.DecodeConfig(bytes.NewReader(blob.Contents))
	if err != nil || configuration.Width < 1 || configuration.Height < 1 || configuration.Width > 16384 || configuration.Height > 16384 || int64(configuration.Width)*int64(configuration.Height) > 64*1024*1024 {
		return nil, ErrInvalid
	}
	if err := authorize(ctx, tx); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return blob, nil
}

func runtimeDriverBaselineReference(selectedCell *g3.VerificationPlanCell, documents []workspace.WorkspaceDocumentRecord, assetDocumentID string, input runtimeDriverAssetRequest) (workspace.WorkspaceAssetBlobReference, error) {
	if selectedCell == nil || selectedCell.CheckKind != "visual" || selectedCell.BaselineSetRef == nil || selectedCell.ID != input.CellID {
		return workspace.WorkspaceAssetBlobReference{}, ErrUnauthorized
	}
	var baselineDocument, assetDocument *workspace.WorkspaceDocumentRecord
	for i := range documents {
		doc := &documents[i]
		if doc.ID == selectedCell.BaselineSetRef.DocumentID {
			baselineDocument = doc
		}
		if doc.ID == assetDocumentID {
			assetDocument = doc
		}
	}
	if baselineDocument == nil || baselineDocument.Type != workspace.WorkspaceDocumentTypeVerificationBaselineSet || assetDocument == nil || assetDocument.Type != workspace.WorkspaceDocumentTypeAsset {
		return workspace.WorkspaceAssetBlobReference{}, ErrUnauthorized
	}
	baseline, digest, err := verificationcontract.ReadBaselineReferences(baselineDocument.ID, baselineDocument.Content)
	if err != nil {
		return workspace.WorkspaceAssetBlobReference{}, err
	}
	if digest != selectedCell.BaselineSetRef.Digest {
		return workspace.WorkspaceAssetBlobReference{}, ErrConflict
	}
	var entry *verificationcontract.BaselineReferenceEntry
	for i := range baseline.Entries {
		if baseline.Entries[i].ID == input.BaselineEntryID {
			entry = &baseline.Entries[i]
		}
	}
	if entry == nil || entry.Asset.AssetDocumentID != assetDocumentID || entry.Asset.Digest != input.AssetDigest || entry.Asset.MediaType != "image/png" || entry.ScenarioID != selectedCell.ScenarioID || entry.TargetID != selectedCell.TargetID || entry.FrameworkTarget != selectedCell.FrameworkTarget || entry.Surface != selectedCell.Surface || entry.BrowserEngine != selectedCell.BrowserEngine || entry.Viewport.ID != selectedCell.Viewport.ID || entry.Viewport.Width != int64(selectedCell.Viewport.Width) || entry.Viewport.Height != int64(selectedCell.Viewport.Height) || entry.ColorScheme != selectedCell.ColorScheme || entry.Motion != selectedCell.Motion || entry.Locale != selectedCell.Locale {
		return workspace.WorkspaceAssetBlobReference{}, ErrUnauthorized
	}
	reference, err := workspace.AssetBlobReferenceForDocument(*assetDocument)
	if err != nil {
		return workspace.WorkspaceAssetBlobReference{}, err
	}
	if reference.Digest != input.AssetDigest || reference.MediaType != "image/png" || reference.ByteLength > 16*1024*1024 {
		return workspace.WorkspaceAssetBlobReference{}, ErrUnauthorized
	}
	return reference, nil
}
