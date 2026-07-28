package verification

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"time"
)

type sqlExecutor interface {
	ExecContext(context.Context, string, ...any) (sql.Result, error)
}

func appendAudit(
	ctx context.Context,
	executor sqlExecutor,
	workspaceID string,
	evidenceID string,
	promotionID string,
	actorID string,
	kind string,
	details any,
	occurredAt time.Time,
) error {
	encoded, err := canonicalBytes(details)
	if err != nil {
		return err
	}
	_, err = executor.ExecContext(ctx, `INSERT INTO verification_audit_events (
	workspace_id, evidence_id, promotion_id, actor_id, kind, details_json, occurred_at
) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7)`,
		workspaceID, nullableString(evidenceID), nullableString(promotionID),
		actorID, kind, string(encoded), occurredAt.UTC())
	return err
}

func jsonUnmarshalStrictStored(body []byte, target any) error {
	if len(body) == 0 {
		return io.ErrUnexpectedEOF
	}
	if err := validateJSONUnicodeEscapes(body); err != nil {
		return invalidJSONUnicodeEscapeError(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return err
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return errors.New("stored JSON has trailing content")
	}
	return nil
}
