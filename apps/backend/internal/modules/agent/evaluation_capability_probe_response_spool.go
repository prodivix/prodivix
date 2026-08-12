package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"net/http"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationCapabilityProbeResponseSpoolIngressFormat       = "prodivix.agent-evaluation-capability-probe-response-spool-ingress"
	maximumEvaluationCapabilityProbeResponseSpoolIngressBytes = 524_288
)

type evaluationCapabilityProbeResponseSpoolIngress struct {
	NamespaceID             string
	RepositoryCommit        string
	AdmissionRequestDigest  string
	Phase                   string
	Sequence                int64
	SpoolRef                string
	ResponseDigest          string
	TransportReceiptDigest  string
	EnvelopeDigest          string
	CiphertextDigest        string
	Ciphertext              []byte
	CiphertextByteLength    int64
	AADDigest               string
	EncryptionProfileDigest string
	KeyRefDigest            string
	SpooledAt               time.Time
	ExpiresAt               time.Time
	IngressDigest           string
}

type EvaluationCapabilityProbeResponseSpoolRecord struct {
	NamespaceID             string
	RepositoryCommit        string
	AdmissionRequestDigest  string
	Phase                   string
	Sequence                int64
	SpoolRef                string
	ResponseDigest          string
	TransportReceiptDigest  string
	EnvelopeDigest          string
	CiphertextDigest        string
	Ciphertext              []byte
	CiphertextByteLength    int64
	AADDigest               string
	EncryptionProfileDigest string
	KeyRefDigest            string
	SpooledAt               time.Time
	ExpiresAt               time.Time
}

type evaluationCapabilityProbeResponseSpoolRepository interface {
	StoreEvaluationCapabilityProbeResponseSpool(
		context.Context,
		EvaluationAuthority,
		evaluationCapabilityProbeResponseSpoolIngress,
	) (EvaluationCapabilityProbeResponseSpoolRecord, bool, error)
}

func decodeEvaluationCapabilityProbeResponseSpoolIngress(
	source []byte,
	authority EvaluationAuthority,
) (evaluationCapabilityProbeResponseSpoolIngress, error) {
	value, _, err := decodeEvaluationJSONObject(source, maximumEvaluationCapabilityProbeResponseSpoolIngressBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "admissionRequestDigest",
		"phase", "sequence", "spoolRef", "responseDigest", "transportReceiptDigest",
		"envelopeDigest", "ciphertextDigest", "ciphertextBase64", "ciphertextByteLength",
		"aadDigest", "encryptionProfileDigest", "keyRefDigest", "spooledAt", "expiresAt",
		"ingressDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeResponseSpoolIngressFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "admissionRequestDigest")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "phase")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "spoolRef")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "responseDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "transportReceiptDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "envelopeDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ciphertextDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "aadDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "encryptionProfileDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "keyRefDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ingressDigest")) {
		return evaluationCapabilityProbeResponseSpoolIngress{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	sequence, sequenceOK := integerMember(value, "sequence")
	byteLength, byteLengthOK := integerMember(value, "ciphertextByteLength")
	spooledAt, spooledErr := parseEvaluationServiceInstant(stringMember(value, "spooledAt"))
	expiresAt, expiresErr := parseEvaluationServiceInstant(stringMember(value, "expiresAt"))
	ciphertextText, ciphertextTextOK := value["ciphertextBase64"].(string)
	ciphertext, ciphertextErr := base64.StdEncoding.DecodeString(ciphertextText)
	base := cloneEvaluationObject(value)
	delete(base, "ingressDigest")
	digest, digestErr := canonicaljson.Digest(base)
	ciphertextHash := fmt.Sprintf("sha256-%x", sha256.Sum256(ciphertext))
	if !versionOK || version != evaluationCapabilityProbeAdmissionVersion || !sequenceOK || sequence < 0 ||
		!byteLengthOK || byteLength < 1 || byteLength > 262_144 ||
		spooledErr != nil || expiresErr != nil || !expiresAt.After(spooledAt) ||
		!ciphertextTextOK || ciphertextErr != nil || base64.StdEncoding.EncodeToString(ciphertext) != ciphertextText ||
		int64(len(ciphertext)) != byteLength || ciphertextHash != stringMember(value, "ciphertextDigest") ||
		digestErr != nil || digest != stringMember(value, "ingressDigest") {
		return evaluationCapabilityProbeResponseSpoolIngress{}, ErrConflict
	}
	return evaluationCapabilityProbeResponseSpoolIngress{
		NamespaceID:            authority.NamespaceID,
		RepositoryCommit:       stringMember(value, "repositoryCommit"),
		AdmissionRequestDigest: stringMember(value, "admissionRequestDigest"),
		Phase:                  stringMember(value, "phase"), Sequence: sequence,
		SpoolRef: stringMember(value, "spoolRef"), ResponseDigest: stringMember(value, "responseDigest"),
		TransportReceiptDigest: stringMember(value, "transportReceiptDigest"),
		EnvelopeDigest:         stringMember(value, "envelopeDigest"), CiphertextDigest: stringMember(value, "ciphertextDigest"),
		Ciphertext: append([]byte(nil), ciphertext...), CiphertextByteLength: byteLength,
		AADDigest:               stringMember(value, "aadDigest"),
		EncryptionProfileDigest: stringMember(value, "encryptionProfileDigest"),
		KeyRefDigest:            stringMember(value, "keyRefDigest"),
		SpooledAt:               spooledAt, ExpiresAt: expiresAt, IngressDigest: stringMember(value, "ingressDigest"),
	}, nil
}

func evaluationCapabilityProbeMaximumResponseBytes(request evaluationCapabilityProbeAdmissionRequest) (int64, error) {
	hardLimits, ok := objectMember(request.ProbeProgram, "hardLimits")
	maximumResponseBytes, maximumOK := integerMember(hardLimits, "maximumResponseBytes")
	if !ok || !maximumOK || maximumResponseBytes < 1 || maximumResponseBytes > 262_144 {
		return 0, ErrConflict
	}
	return maximumResponseBytes, nil
}

func (repository *Repository) StoreEvaluationCapabilityProbeResponseSpool(
	ctx context.Context,
	authority EvaluationAuthority,
	ingress evaluationCapabilityProbeResponseSpoolIngress,
) (EvaluationCapabilityProbeResponseSpoolRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, err
	}
	if authority.NamespaceID != ingress.NamespaceID {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, ErrInvalid
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var requestBytes []byte
	var state, stageDigest string
	var dispatchAckDigest sql.NullString
	var dispatchedAt time.Time
	if err := tx.QueryRowContext(writeContext, `SELECT request_bytes,state,stage_digest,dispatch_ack_digest,dispatched_at
		FROM agent_evaluation_capability_probe_admissions
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3 FOR UPDATE`,
		authority.NamespaceID, ingress.RepositoryCommit, ingress.AdmissionRequestDigest,
	).Scan(&requestBytes, &state, &stageDigest, &dispatchAckDigest, &dispatchedAt); errors.Is(err, sql.ErrNoRows) {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, err
	}
	request, err := decodeEvaluationCapabilityProbeAdmissionRequest(requestBytes, authority)
	expectedPhase, phaseOK := evaluationCapabilityProbeNetworkRoundTripPhase(request, ingress.Sequence)
	maximumResponseBytes, maximumErr := evaluationCapabilityProbeMaximumResponseBytes(request)
	if err != nil || !phaseOK || maximumErr != nil || state != "dispatched" ||
		!evaluationDigestPattern.MatchString(stageDigest) || dispatchAckDigest.Valid || dispatchedAt.IsZero() ||
		ingress.Phase != expectedPhase || ingress.CiphertextByteLength > maximumResponseBytes ||
		ingress.SpooledAt.Before(dispatchedAt.UTC().Truncate(time.Millisecond)) || ingress.ExpiresAt.Before(request.MinimumExpiresAt) {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, ErrConflict
	}
	record := EvaluationCapabilityProbeResponseSpoolRecord{
		NamespaceID: ingress.NamespaceID, RepositoryCommit: ingress.RepositoryCommit,
		AdmissionRequestDigest: ingress.AdmissionRequestDigest, Phase: ingress.Phase, Sequence: ingress.Sequence,
		SpoolRef: ingress.SpoolRef, ResponseDigest: ingress.ResponseDigest,
		TransportReceiptDigest: ingress.TransportReceiptDigest, EnvelopeDigest: ingress.EnvelopeDigest,
		CiphertextDigest: ingress.CiphertextDigest, Ciphertext: append([]byte(nil), ingress.Ciphertext...),
		CiphertextByteLength: ingress.CiphertextByteLength, AADDigest: ingress.AADDigest,
		EncryptionProfileDigest: ingress.EncryptionProfileDigest, KeyRefDigest: ingress.KeyRefDigest,
		SpooledAt: ingress.SpooledAt, ExpiresAt: ingress.ExpiresAt,
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_capability_probe_response_spools (
		namespace_id,repository_commit,admission_request_digest,phase,sequence,spool_ref,
		response_digest,transport_receipt_digest,envelope_digest,ciphertext_digest,ciphertext_bytes,
		ciphertext_byte_length,aad_digest,encryption_profile_digest,key_ref_digest,spooled_at,expires_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
	ON CONFLICT DO NOTHING`, record.NamespaceID, record.RepositoryCommit, record.AdmissionRequestDigest,
		record.Phase, record.Sequence, record.SpoolRef, record.ResponseDigest, record.TransportReceiptDigest,
		record.EnvelopeDigest, record.CiphertextDigest, record.Ciphertext, record.CiphertextByteLength,
		record.AADDigest, record.EncryptionProfileDigest, record.KeyRefDigest, record.SpooledAt, record.ExpiresAt)
	if err != nil {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, err
	}
	if inserted == 0 {
		var existing EvaluationCapabilityProbeResponseSpoolRecord
		if err := tx.QueryRowContext(writeContext, `SELECT namespace_id,repository_commit,admission_request_digest,
			phase,sequence,spool_ref,response_digest,transport_receipt_digest,envelope_digest,ciphertext_digest,
			ciphertext_bytes,ciphertext_byte_length,aad_digest,encryption_profile_digest,key_ref_digest,spooled_at,expires_at
			FROM agent_evaluation_capability_probe_response_spools
			WHERE namespace_id=$1 AND repository_commit=$2 AND admission_request_digest=$3 AND phase=$4 AND sequence=$5
			FOR SHARE`, record.NamespaceID, record.RepositoryCommit, record.AdmissionRequestDigest,
			record.Phase, record.Sequence).Scan(&existing.NamespaceID, &existing.RepositoryCommit,
			&existing.AdmissionRequestDigest, &existing.Phase, &existing.Sequence, &existing.SpoolRef,
			&existing.ResponseDigest, &existing.TransportReceiptDigest, &existing.EnvelopeDigest,
			&existing.CiphertextDigest, &existing.Ciphertext, &existing.CiphertextByteLength,
			&existing.AADDigest, &existing.EncryptionProfileDigest, &existing.KeyRefDigest,
			&existing.SpooledAt, &existing.ExpiresAt); err != nil || existing.SpoolRef != record.SpoolRef ||
			existing.ResponseDigest != record.ResponseDigest ||
			existing.TransportReceiptDigest != record.TransportReceiptDigest ||
			existing.EnvelopeDigest != record.EnvelopeDigest || existing.CiphertextDigest != record.CiphertextDigest ||
			!bytes.Equal(existing.Ciphertext, record.Ciphertext) ||
			existing.CiphertextByteLength != record.CiphertextByteLength || existing.AADDigest != record.AADDigest ||
			existing.EncryptionProfileDigest != record.EncryptionProfileDigest || existing.KeyRefDigest != record.KeyRefDigest ||
			!existing.SpooledAt.Equal(record.SpooledAt) || !existing.ExpiresAt.Equal(record.ExpiresAt) {
			return EvaluationCapabilityProbeResponseSpoolRecord{}, false,
				conflict("evaluation capability probe response spool identity was reused")
		}
		record = existing
	}
	if err := tx.Commit(); err != nil {
		return EvaluationCapabilityProbeResponseSpoolRecord{}, false, err
	}
	return record, inserted == 0, nil
}

func (handler *EvaluationServiceHandler) evaluationCapabilityProbeResponseSpoolIngressRoute(request *http.Request) bool {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(segments) == 4 && segments[0] == "v1" && segments[1] == "evaluations" &&
		segments[2] == handler.authority.NamespaceID && validEvaluationServiceIdentity(segments[2]) &&
		segments[3] == "capability-probe-response-spools"
}

func (handler *EvaluationServiceHandler) handleEvaluationCapabilityProbeResponseSpoolIngress(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodPost || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationCapabilityProbeResponseSpoolRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationCapabilityProbeResponseSpoolIngressBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	ingress, err := decodeEvaluationCapabilityProbeResponseSpoolIngress(source, handler.authority)
	if err != nil || !exactEvaluationIdempotencyHeader(request, ingress.IngressDigest) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	record, replayed, err := repository.StoreEvaluationCapabilityProbeResponseSpool(
		request.Context(), handler.authority, ingress,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, map[string]any{
		"format":        "prodivix.agent-evaluation-capability-probe-response-spool-ingress-response",
		"version":       evaluationCapabilityProbeAdmissionVersion,
		"ingressDigest": ingress.IngressDigest, "admissionRequestDigest": record.AdmissionRequestDigest,
		"phase": record.Phase, "sequence": record.Sequence, "spoolRef": record.SpoolRef,
		"ciphertextDigest": record.CiphertextDigest, "replayed": replayed,
	})
}
