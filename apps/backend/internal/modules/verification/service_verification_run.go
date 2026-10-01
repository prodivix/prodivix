package verification

import (
	"context"
	"database/sql"
	"encoding/json"
)

func (service *Service) CreateVerificationRun(
	ctx context.Context,
	principalID string,
	workspaceID string,
	payload json.RawMessage,
) (VerificationRunSnapshotWire, bool, error) {
	return service.createVerificationRun(ctx, principalID, workspaceID, payload, nil)
}

// CreateVerificationRunWithAuthorization preserves G3 wire/provenance admission while
// letting a caller validate a narrower durable authority in the actual write transaction.
// The callback must be idempotent and confined to this transaction: it runs
// before G3 locks and again after acquisition to refresh time-bound authority.
func (service *Service) CreateVerificationRunWithAuthorization(ctx context.Context, principalID, workspaceID string, payload json.RawMessage, authorize func(context.Context, *sql.Tx) error) (VerificationRunSnapshotWire, bool, error) {
	if authorize == nil {
		return VerificationRunSnapshotWire{}, false, ErrUnauthorized
	}
	return service.createVerificationRun(ctx, principalID, workspaceID, payload, authorize)
}

func (service *Service) createVerificationRun(ctx context.Context, principalID, workspaceID string, payload json.RawMessage, authorize func(context.Context, *sql.Tx) error) (VerificationRunSnapshotWire, bool, error) {
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
	return service.repository.createVerificationRun(
		ctx,
		principalID,
		wire,
		canonical,
		authorize,
	)
}

func (service *Service) AppendVerificationRunEvent(
	ctx context.Context,
	principalID string,
	workspaceID string,
	runID string,
	payload json.RawMessage,
) (VerificationRunSnapshotWire, bool, error) {
	return service.appendVerificationRunEvent(ctx, principalID, workspaceID, runID, payload, nil)
}

// AppendVerificationRunEventWithAuthorization uses the same repeatable transaction
// authorization contract as CreateVerificationRunWithAuthorization.
func (service *Service) AppendVerificationRunEventWithAuthorization(ctx context.Context, principalID, workspaceID, runID string, payload json.RawMessage, authorize func(context.Context, *sql.Tx) error) (VerificationRunSnapshotWire, bool, error) {
	if authorize == nil {
		return VerificationRunSnapshotWire{}, false, ErrUnauthorized
	}
	return service.appendVerificationRunEvent(ctx, principalID, workspaceID, runID, payload, authorize)
}

func (service *Service) appendVerificationRunEvent(ctx context.Context, principalID, workspaceID, runID string, payload json.RawMessage, authorize func(context.Context, *sql.Tx) error) (VerificationRunSnapshotWire, bool, error) {
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
	return service.repository.appendVerificationRunEvent(
		ctx,
		principalID,
		workspaceID,
		runID,
		wire,
		canonical,
		authorize,
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
