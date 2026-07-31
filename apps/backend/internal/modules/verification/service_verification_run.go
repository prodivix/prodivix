package verification

import (
	"context"
	"encoding/json"
)

func (service *Service) CreateVerificationRun(
	ctx context.Context,
	principalID string,
	workspaceID string,
	payload json.RawMessage,
) (VerificationRunSnapshotWire, bool, error) {
	if err := service.requirePermission(
		ctx,
		principalID,
		workspaceID,
		"workspace.write",
	); err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	wire, canonical, err := decodeVerificationRunSnapshotWire(payload)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	if wire.WorkspaceID != workspaceID {
		return VerificationRunSnapshotWire{}, false, coded(
			"VER-4002",
			"Verification run workspace identity does not match the route.",
			ErrInvalid,
		)
	}
	if err := validateInitialVerificationRun(
		wire.VerificationRunSnapshot,
	); err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	if service.candidates.containsSensitiveText(canonical) {
		return VerificationRunSnapshotWire{}, false, coded(
			"VER-5002",
			"Verification run snapshot contains sensitive material.",
			ErrInvalid,
		)
	}
	return service.repository.CreateVerificationRun(
		ctx,
		principalID,
		wire,
		canonical,
	)
}

func (service *Service) AppendVerificationRunEvent(
	ctx context.Context,
	principalID string,
	workspaceID string,
	runID string,
	payload json.RawMessage,
) (VerificationRunSnapshotWire, bool, error) {
	if err := service.requirePermission(
		ctx,
		principalID,
		workspaceID,
		"workspace.write",
	); err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	if validateIdentifier(runID, "runId") != nil {
		return VerificationRunSnapshotWire{}, false, ErrInvalid
	}
	wire, canonical, err := decodeVerificationRunEventWire(payload)
	if err != nil {
		return VerificationRunSnapshotWire{}, false, err
	}
	if wire.RunID != runID {
		return VerificationRunSnapshotWire{}, false, coded(
			"VER-4002",
			"Verification run event identity does not match the route.",
			ErrInvalid,
		)
	}
	if service.candidates.containsSensitiveText(canonical) {
		return VerificationRunSnapshotWire{}, false, coded(
			"VER-5002",
			"Verification run event contains sensitive material.",
			ErrInvalid,
		)
	}
	return service.repository.AppendVerificationRunEvent(
		ctx,
		principalID,
		workspaceID,
		runID,
		wire,
		canonical,
	)
}

func (service *Service) GetVerificationRun(
	ctx context.Context,
	principalID string,
	workspaceID string,
	runID string,
	afterCursor int64,
) (VerificationRunRecord, error) {
	if err := service.requirePermission(
		ctx,
		principalID,
		workspaceID,
		"workspace.read",
	); err != nil {
		return VerificationRunRecord{}, err
	}
	if validateIdentifier(runID, "runId") != nil ||
		!validRevision(afterCursor) {
		return VerificationRunRecord{}, ErrInvalid
	}
	return service.repository.GetVerificationRun(
		ctx,
		workspaceID,
		runID,
		afterCursor,
	)
}

func (service *Service) ListVerificationRuns(
	ctx context.Context,
	principalID string,
	workspaceID string,
	workspaceRevision *int64,
	planDigest string,
	limit int,
) ([]VerificationRunSnapshotWire, error) {
	if err := service.requirePermission(
		ctx,
		principalID,
		workspaceID,
		"workspace.read",
	); err != nil {
		return nil, err
	}
	if (workspaceRevision != nil && !validRevision(*workspaceRevision)) ||
		(planDigest != "" && !digestPattern.MatchString(planDigest)) ||
		limit < 1 ||
		limit > 100 {
		return nil, ErrInvalid
	}
	return service.repository.ListVerificationRuns(
		ctx,
		workspaceID,
		workspaceRevision,
		planDigest,
		limit,
	)
}
