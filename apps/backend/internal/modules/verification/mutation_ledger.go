package verification

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"time"
)

const (
	mutationSupersede  = "evidence.supersede"
	mutationProtect    = "retention.protect"
	mutationRelease    = "retention.release"
	mutationTombstone  = "evidence.tombstone"
	mutationRevocation = "trust.revoke"
)

type mutationLedgerRequest struct {
	WorkspaceID        string
	ActorID            string
	IdempotencyKeyHash string
	Operation          string
	RequestDigest      string
	RequestBytes       []byte
}

type mutationRequestEnvelope struct {
	Format      string `json:"format"`
	Version     int    `json:"version"`
	Operation   string `json:"operation"`
	WorkspaceID string `json:"workspaceId"`
	ActorID     string `json:"actorId"`
	Payload     any    `json:"payload"`
}

type supersedeMutationPayload struct {
	OldEvidenceID             string `json:"oldEvidenceId"`
	NewEvidenceID             string `json:"newEvidenceId"`
	Reason                    string `json:"reason"`
	ExpectedOldEvidenceState  string `json:"expectedOldEvidenceState"`
	ExpectedNewEvidenceState  string `json:"expectedNewEvidenceState"`
	ExpectedSupersessionState string `json:"expectedSupersessionState"`
}

type protectMutationPayload struct {
	EvidenceID              string `json:"evidenceId"`
	Kind                    string `json:"kind"`
	ExternalRef             string `json:"externalRef"`
	ExpectedEvidenceState   string `json:"expectedEvidenceState"`
	ExpectedProtectionState string `json:"expectedProtectionState"`
}

type releaseMutationPayload struct {
	EvidenceID              string `json:"evidenceId"`
	ProtectionID            string `json:"protectionId"`
	Kind                    string `json:"kind"`
	ExternalRef             string `json:"externalRef"`
	ExpectedProtectionState string `json:"expectedProtectionState"`
	ExpectedVersion         int64  `json:"expectedVersion"`
}

type tombstoneMutationPayload struct {
	EvidenceID    string `json:"evidenceId"`
	Reason        string `json:"reason"`
	ExpectedState string `json:"expectedState"`
}

type revocationMutationPayload struct {
	EvidenceID         string `json:"evidenceId,omitempty"`
	Issuer             string `json:"issuer,omitempty"`
	KeyID              string `json:"keyId,omitempty"`
	ReasonCode         string `json:"reasonCode"`
	Reason             string `json:"reason"`
	EffectiveAt        string `json:"effectiveAt"`
	ExpectedScopeState string `json:"expectedScopeState"`
}

type supersedeMutationResult struct {
	Superseded bool `json:"superseded"`
}

type retentionMutationResult struct {
	Protection RetentionProtection `json:"protection"`
}

type tombstoneMutationResult struct {
	Tombstoned bool `json:"tombstoned"`
}

type revocationMutationResult struct {
	RevocationID string `json:"revocationId"`
}

func prepareMutationLedgerRequest(
	workspaceID string,
	actorID string,
	idempotencyKey string,
	operation string,
	payload any,
) (mutationLedgerRequest, error) {
	if validateIdentifier(workspaceID, "mutation workspace id") != nil ||
		validateIdentifier(actorID, "mutation actor id") != nil ||
		validateMutationToken(idempotencyKey) != nil {
		return mutationLedgerRequest{}, ErrInvalid
	}
	switch operation {
	case mutationSupersede, mutationProtect, mutationRelease, mutationTombstone, mutationRevocation:
	default:
		return mutationLedgerRequest{}, ErrInvalid
	}
	requestBytes, err := canonicalBytes(mutationRequestEnvelope{
		Format:  "prodivix.verification-mutation-request",
		Version: 1, Operation: operation, WorkspaceID: workspaceID,
		ActorID: actorID, Payload: payload,
	})
	if err != nil || len(requestBytes) == 0 || len(requestBytes) > 32768 {
		return mutationLedgerRequest{}, ErrInvalid
	}
	return mutationLedgerRequest{
		WorkspaceID: workspaceID, ActorID: actorID,
		IdempotencyKeyHash: secretHash(idempotencyKey),
		Operation:          operation, RequestDigest: digestBytes(requestBytes),
		RequestBytes: requestBytes,
	}, nil
}

// lockMutationRequest serializes one principal-scoped invocation key before
// checking the append-only ledger. The lock contains only hashes and releases
// with the surrounding effect transaction.
func lockMutationRequest(
	ctx context.Context,
	tx *sql.Tx,
	request mutationLedgerRequest,
) ([]byte, bool, error) {
	lockIdentity := fmt.Sprintf(
		"verification-mutation:%s:%s:%s",
		request.WorkspaceID, request.ActorID, request.IdempotencyKeyHash,
	)
	if _, err := tx.ExecContext(
		ctx,
		`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
		lockIdentity,
	); err != nil {
		return nil, false, err
	}
	var operation, requestDigest string
	var requestBytes, resultBytes []byte
	err := tx.QueryRowContext(ctx, `SELECT operation, request_digest, request_bytes, result_bytes
FROM verification_mutation_requests
WHERE workspace_id = $1 AND actor_id = $2 AND idempotency_key_hash = $3`,
		request.WorkspaceID, request.ActorID, request.IdempotencyKeyHash,
	).Scan(&operation, &requestDigest, &requestBytes, &resultBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, false, nil
	}
	if err != nil {
		return nil, false, err
	}
	if operation != request.Operation ||
		requestDigest != request.RequestDigest ||
		digestBytes(requestBytes) != requestDigest ||
		!bytes.Equal(requestBytes, request.RequestBytes) ||
		len(resultBytes) == 0 {
		return nil, false, ErrConflict
	}
	return resultBytes, true, nil
}

func lockMutationResource(ctx context.Context, tx *sql.Tx, identity string) error {
	_, err := tx.ExecContext(
		ctx,
		`SELECT pg_advisory_xact_lock(hashtextextended($1, 0))`,
		"verification-resource:"+identity,
	)
	return err
}

func storeMutationResult(
	ctx context.Context,
	tx *sql.Tx,
	request mutationLedgerRequest,
	result any,
	createdAt time.Time,
) error {
	resultBytes, err := canonicalBytes(result)
	if err != nil || len(resultBytes) == 0 || len(resultBytes) > 32768 {
		return ErrInvalid
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO verification_mutation_requests (
	workspace_id, actor_id, idempotency_key_hash, operation,
	request_digest, request_json, request_bytes, result_json, result_bytes, created_at
) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8::jsonb, $9, $10)`,
		request.WorkspaceID, request.ActorID, request.IdempotencyKeyHash,
		request.Operation, request.RequestDigest, string(request.RequestBytes),
		request.RequestBytes, string(resultBytes), resultBytes, createdAt.UTC(),
	)
	if isPostgreSQLUniqueViolation(err) {
		return ErrConflict
	}
	return err
}

func decodeMutationResult[T any](body []byte) (T, error) {
	var result T
	if err := jsonUnmarshalStrictStored(body, &result); err != nil {
		return result, ErrConflict
	}
	canonical, err := canonicalBytes(result)
	if err != nil || !bytes.Equal(canonical, body) {
		return result, ErrConflict
	}
	return result, nil
}

func runMutationWithRetry[T any](
	ctx context.Context,
	operation func() (T, bool, error),
) (T, bool, error) {
	var zero T
	var last error
	for attempt := 0; attempt < 4; attempt++ {
		result, replayed, err := operation()
		if err == nil {
			return result, replayed, nil
		}
		if isPostgreSQLUniqueViolation(err) {
			return zero, false, ErrConflict
		}
		last = err
		if !retryablePostgreSQLTransaction(err) {
			return zero, false, err
		}
		if err := ctx.Err(); err != nil {
			return zero, false, err
		}
	}
	return zero, false, last
}

func isPostgreSQLUniqueViolation(err error) bool {
	if err == nil {
		return false
	}
	var sqlState interface{ SQLState() string }
	return errors.As(err, &sqlState) && sqlState.SQLState() == "23505"
}
