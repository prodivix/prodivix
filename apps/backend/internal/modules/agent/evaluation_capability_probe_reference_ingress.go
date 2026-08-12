package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityProbeReferenceIngressFormat       = "prodivix.agent-evaluation-capability-probe-reference-receipt-ingress"
	maximumEvaluationCapabilityProbeReferenceIngressBytes = 524_288
	maximumEvaluationCapabilityProbeReferenceReceiptBytes = 262_144
)

type evaluationCapabilityProbeReferenceIngress struct {
	NamespaceID            string
	RepositoryCommit       string
	AdmissionRequestDigest string
	Ordinal                int
	Kind                   string
	ReceiptDigest          string
	IngressDigest          string
	Entry                  map[string]any
	Value                  map[string]any
	Bytes                  []byte
}

type EvaluationCapabilityProbeReferenceReceiptRecord struct {
	NamespaceID         string
	RepositoryCommit    string
	RequestDigest       string
	Ordinal             int
	Kind                string
	ReceiptDigest       string
	SourceReceiptDigest string
	ReceiptBytes        []byte
	CreatedAt           time.Time
}

type evaluationCapabilityProbeReferenceIngressRepository interface {
	StoreEvaluationCapabilityProbeReferenceReceipt(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeReferenceIngress,
		time.Time,
	) (EvaluationCapabilityProbeReferenceReceiptRecord, bool, error)
}

func evaluationCapabilityProbeReferenceOrdinal(kind string) (int, bool) {
	for index, candidate := range evaluationCapabilityProbeReferenceKinds {
		if candidate == kind {
			return index, true
		}
	}
	return 0, false
}

func decodeEvaluationCapabilityProbeReferenceIngress(
	source []byte,
	authority EvaluationAuthority,
) (evaluationCapabilityProbeReferenceIngress, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityProbeReferenceIngressBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "admissionRequestDigest", "entry", "ingressDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeReferenceIngressFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "admissionRequestDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ingressDigest")) {
		return evaluationCapabilityProbeReferenceIngress{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	entry, entryOK := objectMember(value, "entry")
	ordinal, ordinalOK := evaluationCapabilityProbeReferenceOrdinal(stringMember(entry, "kind"))
	base := cloneEvaluationObject(value)
	delete(base, "ingressDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationCapabilityProbeAdmissionVersion || !entryOK || !ordinalOK ||
		digestErr != nil || digest != stringMember(value, "ingressDigest") ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationCapabilityProbeReferenceIngress{}, ErrConflict
	}
	return evaluationCapabilityProbeReferenceIngress{
		NamespaceID: authority.NamespaceID, RepositoryCommit: stringMember(value, "repositoryCommit"),
		AdmissionRequestDigest: stringMember(value, "admissionRequestDigest"), Ordinal: ordinal,
		Kind: stringMember(entry, "kind"), ReceiptDigest: stringMember(entry, "receiptDigest"),
		IngressDigest: stringMember(value, "ingressDigest"), Entry: entry, Value: value,
		Bytes: append([]byte(nil), canonical...),
	}, nil
}

func validateEvaluationCapabilityProbeReferenceIngressEntry(
	ingress evaluationCapabilityProbeReferenceIngress,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
	expectedPreviousDigest string,
	expectedAuthorityIssuerID string,
) (map[string]any, []byte, time.Time, error) {
	entry := ingress.Entry
	receipt, receiptOK := objectMember(entry, "receipt")
	if !exactEvaluationKeys(entry, []string{"kind", "receipt", "receiptDigest"}) || !receiptOK ||
		ingress.Kind != evaluationCapabilityProbeReferenceKinds[ingress.Ordinal] ||
		stringMember(entry, "receiptDigest") != ingress.ReceiptDigest ||
		!evaluationDigestPattern.MatchString(ingress.ReceiptDigest) ||
		!exactEvaluationKeys(receipt, []string{
			"format", "version", "admissionRequestDigest", "providerConfigurationDigest",
			"modelLineageDigest", "qualificationCapabilityProfileDigest", "capabilityId",
			"probeProgramDigest", "profileProjectionDigest",
			"adapterDigest", "ownerImplementationDigest", "authorityIssuerId",
			"previousReceiptDigest", "observedAt", "sourceReceipt", "sourceReceiptDigest",
		}) || stringMember(receipt, "format") != evaluationCapabilityProbeReferenceFormats[ingress.Ordinal] ||
		stringMember(receipt, "admissionRequestDigest") != request.RequestDigest ||
		stringMember(receipt, "providerConfigurationDigest") != request.ProviderConfigurationDigest ||
		stringMember(receipt, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(receipt, "qualificationCapabilityProfileDigest") != request.QualificationCapabilityProfileDigest ||
		stringMember(receipt, "capabilityId") != request.CapabilityID ||
		stringMember(receipt, "probeProgramDigest") != request.ProbeProgramDigest ||
		stringMember(receipt, "profileProjectionDigest") != request.ProfileProjectionDigest ||
		stringMember(receipt, "adapterDigest") != request.AdapterDigest ||
		stringMember(receipt, "ownerImplementationDigest") != ownerImplementationDigest ||
		!validEvaluationAgentControlIdentity(stringMember(receipt, "authorityIssuerId")) ||
		(expectedAuthorityIssuerID != "" && stringMember(receipt, "authorityIssuerId") != expectedAuthorityIssuerID) {
		return nil, nil, time.Time{}, ErrConflict
	}
	version, versionOK := integerMember(receipt, "version")
	observedAt, observedErr := parseEvaluationServiceInstant(stringMember(receipt, "observedAt"))
	previous := receipt["previousReceiptDigest"]
	if !versionOK || version != evaluationCapabilityProbeAdmissionVersion || observedErr != nil ||
		(ingress.Ordinal == 0 && previous != nil) ||
		(ingress.Ordinal > 0 && stringMember(receipt, "previousReceiptDigest") != expectedPreviousDigest) ||
		!evaluationDigestPattern.MatchString(stringMember(receipt, "sourceReceiptDigest")) ||
		agentcontract.ValidateSanitizedAgentPayload(receipt["sourceReceipt"]) != nil {
		return nil, nil, time.Time{}, ErrConflict
	}
	sourceReceiptDigest, sourceErr := canonicaljson.Digest(receipt["sourceReceipt"])
	receiptDigest, digestErr := canonicaljson.Digest(receipt)
	receiptBytes, bytesErr := canonicaljson.Bytes(receipt)
	if sourceErr != nil || sourceReceiptDigest != stringMember(receipt, "sourceReceiptDigest") ||
		digestErr != nil || receiptDigest != ingress.ReceiptDigest || bytesErr != nil ||
		len(receiptBytes) == 0 || len(receiptBytes) > maximumEvaluationCapabilityProbeReferenceReceiptBytes {
		return nil, nil, time.Time{}, ErrConflict
	}
	sourceReceipt, sourceOK := objectMember(receipt, "sourceReceipt")
	if !sourceOK || validateEvaluationCapabilityProbeTypedSourceReceipt(
		sourceReceipt, ingress.Ordinal, request, ownerImplementationDigest,
		stringMember(receipt, "authorityIssuerId"), observedAt,
	) != nil {
		return nil, nil, time.Time{}, ErrConflict
	}
	return receipt, receiptBytes, observedAt, nil
}

func requireEvaluationCapabilityProbeResponseSpools(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	ingress evaluationCapabilityProbeReferenceIngress,
	receipt map[string]any,
) error {
	if ingress.Ordinal != 4 {
		return nil
	}
	sourceReceipt, sourceOK := objectMember(receipt, "sourceReceipt")
	rawSpools, spoolsOK := sourceReceipt["spoolReceipts"].([]any)
	if !sourceOK || !spoolsOK || len(rawSpools) < 1 {
		return ErrConflict
	}
	for _, raw := range rawSpools {
		spool, ok := raw.(map[string]any)
		sequence, sequenceOK := integerMember(spool, "sequence")
		ciphertextByteLength, byteLengthOK := integerMember(spool, "ciphertextByteLength")
		if !ok || !sequenceOK || !byteLengthOK {
			return ErrConflict
		}
		var exists int
		if err := tx.QueryRowContext(ctx, `SELECT 1
			FROM agent_evaluation_capability_probe_response_spools
			WHERE namespace_id=$1 AND repository_commit=$2 AND admission_request_digest=$3
				AND phase=$4 AND sequence=$5 AND spool_ref=$6 AND response_digest=$7
				AND transport_receipt_digest=$8 AND envelope_digest=$9 AND ciphertext_digest=$10
				AND ciphertext_byte_length=$11 AND ciphertext_byte_length=octet_length(ciphertext_bytes)
				AND aad_digest=$12 AND encryption_profile_digest=$13 AND key_ref_digest=$14
			FOR SHARE`, authority.NamespaceID, ingress.RepositoryCommit, ingress.AdmissionRequestDigest,
			stringMember(spool, "phase"), sequence, stringMember(spool, "spoolRef"),
			stringMember(spool, "responseDigest"), stringMember(spool, "transportReceiptDigest"),
			stringMember(spool, "envelopeDigest"), stringMember(spool, "ciphertextDigest"),
			ciphertextByteLength, stringMember(spool, "aadDigest"),
			stringMember(spool, "encryptionProfileDigest"), stringMember(spool, "keyRefDigest"),
		).Scan(&exists); errors.Is(err, sql.ErrNoRows) {
			return conflict("evaluation capability probe encrypted spool entry lacks durable ciphertext")
		} else if err != nil {
			return err
		}
	}
	var storedCount int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*)
		FROM agent_evaluation_capability_probe_response_spools
		WHERE namespace_id=$1 AND repository_commit=$2 AND admission_request_digest=$3`,
		authority.NamespaceID, ingress.RepositoryCommit, ingress.AdmissionRequestDigest,
	).Scan(&storedCount); err != nil {
		return err
	}
	if storedCount != len(rawSpools) {
		return conflict("evaluation capability probe encrypted spool durable set is incomplete")
	}
	return nil
}

func (repository *Repository) StoreEvaluationCapabilityProbeReferenceReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	ingress evaluationCapabilityProbeReferenceIngress,
	recordedAt time.Time,
) (EvaluationCapabilityProbeReferenceReceiptRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
	}
	if authority.NamespaceID != ingress.NamespaceID || recordedAt.IsZero() {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, ErrInvalid
	}
	recordedAt = recordedAt.UTC().Truncate(time.Millisecond)
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var requestBytes []byte
	var ownerImplementationDigest, state, stageDigest string
	var dispatchAckDigest sql.NullString
	if err := tx.QueryRowContext(writeContext, `SELECT request_bytes,owner_implementation_digest,state,stage_digest,dispatch_ack_digest
		FROM agent_evaluation_capability_probe_admissions
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 FOR UPDATE`,
		authority.NamespaceID, ingress.RepositoryCommit, ingress.AdmissionRequestDigest,
	).Scan(&requestBytes, &ownerImplementationDigest, &state, &stageDigest, &dispatchAckDigest); errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
	}
	request, err := decodeEvaluationCapabilityProbeAdmissionRequest(requestBytes, authority)
	if err != nil || request.RepositoryCommit != ingress.RepositoryCommit ||
		request.RequestDigest != ingress.AdmissionRequestDigest || state != "dispatched" ||
		!evaluationDigestPattern.MatchString(stageDigest) || dispatchAckDigest.Valid ||
		!evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, ErrConflict
	}
	previousDigest, authorityIssuerID := "", ""
	if ingress.Ordinal > 0 {
		var previousKind string
		var previousReceiptBytes []byte
		if err := tx.QueryRowContext(writeContext, `SELECT kind,receipt_digest,receipt_bytes
			FROM agent_evaluation_capability_probe_reference_receipts
			WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 AND ordinal=$4 FOR SHARE`,
			authority.NamespaceID, ingress.RepositoryCommit, ingress.AdmissionRequestDigest, ingress.Ordinal-1,
		).Scan(&previousKind, &previousDigest, &previousReceiptBytes); errors.Is(err, sql.ErrNoRows) {
			return EvaluationCapabilityProbeReferenceReceiptRecord{}, false,
				conflict("evaluation capability probe reference predecessor is missing")
		} else if err != nil {
			return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
		}
		previousReceipt, err := decodeCanonicalEvaluationObject(
			previousReceiptBytes, maximumEvaluationCapabilityProbeReferenceReceiptBytes,
		)
		if err != nil || previousKind != evaluationCapabilityProbeReferenceKinds[ingress.Ordinal-1] {
			return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, ErrConflict
		}
		authorityIssuerID = stringMember(previousReceipt, "authorityIssuerId")
	}
	receipt, receiptBytes, observedAt, err := validateEvaluationCapabilityProbeReferenceIngressEntry(
		ingress, request, ownerImplementationDigest, previousDigest, authorityIssuerID,
	)
	if err != nil || observedAt.After(recordedAt) {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, ErrConflict
	}
	if err := requireEvaluationCapabilityProbeResponseSpools(
		writeContext, tx, authority, ingress, receipt,
	); err != nil {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
	}
	record := EvaluationCapabilityProbeReferenceReceiptRecord{
		NamespaceID: authority.NamespaceID, RepositoryCommit: ingress.RepositoryCommit,
		RequestDigest: ingress.AdmissionRequestDigest, Ordinal: ingress.Ordinal, Kind: ingress.Kind,
		ReceiptDigest: ingress.ReceiptDigest, SourceReceiptDigest: stringMember(receipt, "sourceReceiptDigest"),
		ReceiptBytes: append([]byte(nil), receiptBytes...), CreatedAt: recordedAt,
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_capability_probe_reference_receipts (
		namespace_id,repository_commit,request_digest,ordinal,kind,receipt_digest,
		source_receipt_digest,receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10) ON CONFLICT DO NOTHING`,
		record.NamespaceID, record.RepositoryCommit, record.RequestDigest, record.Ordinal, record.Kind,
		record.ReceiptDigest, record.SourceReceiptDigest, string(record.ReceiptBytes), record.ReceiptBytes, record.CreatedAt,
	)
	if err != nil {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
	}
	if inserted == 0 {
		var existing EvaluationCapabilityProbeReferenceReceiptRecord
		if err := tx.QueryRowContext(writeContext, `SELECT namespace_id,repository_commit,request_digest,ordinal,kind,
			receipt_digest,source_receipt_digest,receipt_bytes,created_at
			FROM agent_evaluation_capability_probe_reference_receipts
			WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 AND ordinal=$4 FOR SHARE`,
			record.NamespaceID, record.RepositoryCommit, record.RequestDigest, record.Ordinal,
		).Scan(&existing.NamespaceID, &existing.RepositoryCommit, &existing.RequestDigest, &existing.Ordinal,
			&existing.Kind, &existing.ReceiptDigest, &existing.SourceReceiptDigest, &existing.ReceiptBytes,
			&existing.CreatedAt); err != nil || existing.Kind != record.Kind ||
			existing.ReceiptDigest != record.ReceiptDigest || existing.SourceReceiptDigest != record.SourceReceiptDigest ||
			!bytes.Equal(existing.ReceiptBytes, record.ReceiptBytes) {
			return EvaluationCapabilityProbeReferenceReceiptRecord{}, false,
				conflict("evaluation capability probe reference identity was reused")
		}
		record = existing
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityProbeReferenceReceiptRecord{}, false, err
	}
	return record, inserted == 0, nil
}

func (repository *Repository) LoadEvaluationCapabilityProbeReferenceBundle(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
	probeEvidence json.RawMessage,
) ([]byte, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	if authority.NamespaceID != request.NamespaceID ||
		!evaluationDigestPattern.MatchString(ownerImplementationDigest) || len(probeEvidence) == 0 {
		return nil, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(readContext, &sql.TxOptions{Isolation: sql.LevelSerializable, ReadOnly: true})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	var state, storedOwnerImplementation, stageDigest string
	var dispatchAckDigest sql.NullString
	if err := tx.QueryRowContext(readContext, `SELECT state,owner_implementation_digest,stage_digest,dispatch_ack_digest
		FROM agent_evaluation_capability_probe_admissions
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 FOR SHARE`,
		authority.NamespaceID, request.RepositoryCommit, request.RequestDigest,
	).Scan(&state, &storedOwnerImplementation, &stageDigest, &dispatchAckDigest); err != nil {
		if errors.Is(err, sql.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, err
	}
	if state != "dispatched" || dispatchAckDigest.Valid || storedOwnerImplementation != ownerImplementationDigest ||
		!evaluationDigestPattern.MatchString(stageDigest) {
		return nil, ErrConflict
	}
	rows, err := tx.QueryContext(readContext, `SELECT ordinal,kind,receipt_digest,receipt_bytes
		FROM agent_evaluation_capability_probe_reference_receipts
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3
		ORDER BY ordinal ASC FOR SHARE`, authority.NamespaceID, request.RepositoryCommit, request.RequestDigest)
	if err != nil {
		return nil, err
	}
	entries := make([]any, 0, len(evaluationCapabilityProbeReferenceKinds))
	for rows.Next() {
		var ordinal int
		var kind, receiptDigest string
		var receiptBytes []byte
		if err := rows.Scan(&ordinal, &kind, &receiptDigest, &receiptBytes); err != nil {
			_ = rows.Close()
			return nil, err
		}
		if ordinal != len(entries) || ordinal >= len(evaluationCapabilityProbeReferenceKinds) ||
			kind != evaluationCapabilityProbeReferenceKinds[ordinal] {
			_ = rows.Close()
			return nil, conflict("evaluation capability probe reference order drifted")
		}
		receipt, err := decodeCanonicalEvaluationObject(receiptBytes, maximumEvaluationCapabilityProbeReferenceReceiptBytes)
		if err != nil {
			_ = rows.Close()
			return nil, err
		}
		entries = append(entries, map[string]any{"kind": kind, "receipt": receipt, "receiptDigest": receiptDigest})
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	if len(entries) != len(evaluationCapabilityProbeReferenceKinds) {
		return nil, conflict("evaluation capability probe reference set is incomplete")
	}
	bundle, err := canonicaljson.Bytes(entries)
	if err != nil {
		return nil, err
	}
	evidence, err := decodeCanonicalEvaluationObject(probeEvidence, 65_536)
	if err != nil {
		return nil, err
	}
	validated, _, err := evaluationCapabilityProbeReferenceBundle(
		bundle, evidence, request, ownerImplementationDigest,
	)
	if err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return validated, nil
}

func (handler *EvaluationServiceHandler) evaluationCapabilityProbeReferenceIngressRoute(request *http.Request) bool {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(segments) == 4 && segments[0] == "v1" && segments[1] == "evaluations" &&
		segments[2] == handler.authority.NamespaceID && validEvaluationServiceIdentity(segments[2]) &&
		segments[3] == "capability-probe-reference-receipts"
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityProbeReferenceIngress(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityProbeReferenceIngressRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityProbeReferenceIngressBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	ingress, err := decodeEvaluationCapabilityProbeReferenceIngress(source, handler.authority)
	if err != nil || !exactEvaluationIdempotencyHeader(request, ingress.IngressDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	record, replayed, err := repository.StoreEvaluationCapabilityProbeReferenceReceipt(
		request.Context(), handler.authority, ingress, handler.clock().UTC().Truncate(time.Millisecond),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, map[string]any{
		"format":  "prodivix.agent-evaluation-capability-probe-reference-receipt-ingress-response",
		"version": evaluationCapabilityProbeAdmissionVersion, "ingressDigest": ingress.IngressDigest,
		"admissionRequestDigest": record.RequestDigest, "kind": record.Kind,
		"ordinal": record.Ordinal, "receiptDigest": record.ReceiptDigest, "replayed": replayed,
	})
}
