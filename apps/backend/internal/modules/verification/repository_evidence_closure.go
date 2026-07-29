package verification

import (
	"context"
	"database/sql"
	"encoding/base64"
	"sort"
	"time"
)

func (repository *Repository) ClosureView(
	ctx context.Context,
	workspaceID string,
	filter ListFilter,
	observedAt time.Time,
) (ClosureView, error) {
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{
		ReadOnly: true, Isolation: sql.LevelRepeatableRead,
	})
	if err != nil {
		return ClosureView{}, err
	}
	defer func() { _ = tx.Rollback() }()

	filter.Limit = 100
	all := make([]EvidenceRecord, 0)
	for {
		page, err := listEvidenceInSnapshot(ctx, tx, workspaceID, filter, observedAt)
		if err != nil {
			return ClosureView{}, err
		}
		all = append(all, page.Records...)
		if len(all) > 1000 || (len(all) == 1000 && page.NextCursor != "") {
			return ClosureView{}, coded(
				"VER-6002",
				"Closure Evidence set exceeds the Backend query budget.",
				ErrInvalid,
			)
		}
		if page.NextCursor == "" {
			break
		}
		createdAt, id, err := DecodeEvidenceCursor(page.NextCursor)
		if err != nil {
			return ClosureView{}, err
		}
		filter.CursorCreatedAt, filter.CursorID = createdAt, id
	}

	records := make([]VerifiedViewRecord, 0, len(all))
	for _, record := range all {
		records = append(records, record.VerifiedView)
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].EvidenceID < records[right].EvidenceID
	})
	byID := make(map[string]struct{}, len(records))
	for _, record := range records {
		byID[record.EvidenceID] = struct{}{}
	}
	for _, record := range records {
		if record.SupersededByEvidenceID != "" {
			if _, exists := byID[record.SupersededByEvidenceID]; !exists {
				return ClosureView{}, coded(
					"VER-6002",
					"Closure Evidence supersession target is absent.",
					ErrConflict,
				)
			}
		}
	}

	if repository.closureSnapshotBarrier != nil {
		repository.closureSnapshotBarrier()
	}
	revocationDigest, err := effectiveRevocationDigest(
		ctx,
		tx,
		workspaceID,
		observedAt,
		records,
	)
	if err != nil {
		return ClosureView{}, err
	}
	view := ClosureView{
		Format:                   "prodivix.verification-evidence-view.v1",
		ClosureEvaluationInstant: formatInstant(observedAt),
		Records:                  records,
		RevocationRecordDigest:   revocationDigest,
	}
	viewDigest, _, err := digestWithoutField(view, "viewDigest")
	if err != nil {
		return ClosureView{}, err
	}
	view.ViewDigest = viewDigest
	if err := tx.Commit(); err != nil {
		return ClosureView{}, err
	}
	return view, nil
}

type evidenceCursor struct {
	CreatedAt string `json:"createdAt"`
	ID        string `json:"id"`
}

func encodeEvidenceCursor(createdAt time.Time, id string) (string, error) {
	encoded, err := canonicalBytes(evidenceCursor{
		CreatedAt: formatInstant(createdAt), ID: id,
	})
	if err != nil {
		return "", err
	}
	return base64.RawURLEncoding.EncodeToString(encoded), nil
}

func DecodeEvidenceCursor(value string) (time.Time, string, error) {
	if value == "" {
		return time.Time{}, "", nil
	}
	if len(value) > 1024 {
		return time.Time{}, "", ErrInvalid
	}
	decoded, err := base64.RawURLEncoding.DecodeString(value)
	if err != nil {
		return time.Time{}, "", ErrInvalid
	}
	var cursor evidenceCursor
	if err := jsonUnmarshalStrictStored(decoded, &cursor); err != nil ||
		validateIdentifier(cursor.ID, "cursor id") != nil {
		return time.Time{}, "", ErrInvalid
	}
	createdAt, err := parseInstant(cursor.CreatedAt)
	if err != nil {
		return time.Time{}, "", ErrInvalid
	}
	return createdAt, cursor.ID, nil
}
