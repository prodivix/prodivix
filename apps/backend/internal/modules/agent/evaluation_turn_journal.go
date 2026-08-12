package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/base64"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationTransportDispatchIntentFormat = "prodivix.agent-evaluation-transport-dispatch-intent"
	evaluationTransportReceiptFormat        = "prodivix.agent-evaluation-transport-receipt"
	evaluationResultSpoolAADFormat          = "prodivix.agent-evaluation-provider-result-spool-aad"
	evaluationResultSpoolEnvelopeFormat     = "prodivix.agent-evaluation-provider-result-spool-envelope"
	evaluationResultSpoolReceiptFormat      = "prodivix.agent-evaluation-provider-result-spool-receipt"
	evaluationResultSpoolDispositionFormat  = "prodivix.agent-evaluation-provider-result-spool-disposition-receipt"
	evaluationResultSpoolAccessFormat       = "prodivix.agent-evaluation-provider-result-spool-access-receipt"
	maximumEvaluationSpoolCiphertextBytes   = 16_777_216
	maximumEvaluationSpoolEnvelopeBytes     = 22_369_622
	maximumEvaluationSpoolRetention         = 24 * time.Hour
)

type EvaluationTransportDispatchIntentRecord struct {
	NamespaceID             string
	PlanDigest              string
	RepositoryCommit        string
	AttemptID               string
	DescriptorDigest        string
	DescriptorBytes         []byte
	TurnIndex               int64
	BudgetReservationID     string
	IntentID                string
	InvocationID            string
	ProtocolFamily          string
	ProviderConfigurationID string
	ModelLineageDigest      string
	InferenceConfigDigest   string
	DemandDigest            string
	RequestDigest           string
	EndpointID              string
	EndpointClass           string
	RequestBodyDigest       string
	RequestBytes            int64
	IntentDigest            string
	IntentBytes             []byte
	CreatedAt               time.Time
}

type EvaluationTransportReceiptRecord struct {
	NamespaceID             string
	PlanDigest              string
	RepositoryCommit        string
	AttemptID               string
	DescriptorDigest        string
	TurnIndex               int64
	IntentDigest            string
	ReceiptID               string
	InvocationID            string
	ProviderConfigurationID string
	ProviderRequestID       string
	DispatchState           string
	Outcome                 string
	ResponseBodyDigest      string
	ReceiptDigest           string
	ReceiptBytes            []byte
	StartedAt               time.Time
	CompletedAt             time.Time
	ClosedAt                time.Time
}

type EvaluationProviderResultSpoolReceiptRecord struct {
	NamespaceID              string
	PlanDigest               string
	RepositoryCommit         string
	AttemptID                string
	DescriptorDigest         string
	TurnIndex                int64
	InvocationID             string
	SpoolRef                 string
	DispatchIntentDigest     string
	TransportReceiptDigest   string
	Algorithm                string
	EncryptionProfileDigest  string
	KeyRefDigest             string
	KeyID                    string
	KeyVersion               int64
	AADDigest                string
	EnvelopeDigest           string
	CiphertextDigest         string
	CiphertextSizeBytes      int64
	ResponseBodyDigest       string
	NormalizedEventSetDigest string
	ResponseDigest           string
	OpaqueContinuationDigest string
	RetentionClass           string
	RetentionPolicyDigest    string
	ReceiptDigest            string
	ReceiptBytes             []byte
	CreatedAt                time.Time
	ExpiresAt                time.Time
}

type EvaluationProviderResultSpoolDispositionRecord struct {
	NamespaceID           string
	PlanDigest            string
	RepositoryCommit      string
	AttemptID             string
	DescriptorDigest      string
	TurnIndex             int64
	InvocationID          string
	SpoolRef              string
	SpoolReceiptDigest    string
	Disposition           string
	RetentionPolicyDigest string
	RetainedUntil         *time.Time
	DisposedAt            time.Time
	ReceiptDigest         string
	ReceiptBytes          []byte
}

type EvaluationAttemptTurnRecord struct {
	AttemptID           string
	DescriptorDigest    string
	TurnIndex           int64
	BudgetReservationID string
	State               string
	DispatchIntent      EvaluationTransportDispatchIntentRecord
	TransportReceipt    *EvaluationTransportReceiptRecord
	ResultSpoolReceipt  *EvaluationProviderResultSpoolReceiptRecord
	ClosedAt            *time.Time
	TurnDigest          string
}

type EvaluationEncryptedResultSpool struct {
	AAD                   []byte
	Envelope              []byte
	ResponseDigest        string
	RetentionPolicyDigest string
	ExpiresAt             time.Time
}

type EvaluationEncryptedResultSpoolRead struct {
	EvaluationEncryptedResultSpool
	ResultSpoolReceipt EvaluationProviderResultSpoolReceiptRecord
	AccessReceipt      []byte
}

type evaluationAttemptDescriptor struct {
	PlanDigest                 string
	AttemptID                  string
	DescriptorDigest           string
	CapabilityDescriptorDigest string
	ShardID                    string
	CaseID                     string
	TargetID                   string
	Value                      map[string]any
	Canonical                  []byte
}

type evaluationTransportDispatchIntent struct {
	EvaluationTransportDispatchIntentRecord
	Value map[string]any
}

type evaluationTransportReceipt struct {
	EvaluationTransportReceiptRecord
	RequestDigest        string
	ProtocolFamily       string
	EndpointID           string
	EndpointClass        string
	RequestBodyDigest    string
	RequestBytes         int64
	ResponseBytes        int64
	ResponseHeaderDigest string
	Value                map[string]any
}

type evaluationProviderResultSpoolAAD struct {
	NamespaceDigest          string
	PlanDigest               string
	RepositoryCommit         string
	AttemptID                string
	DescriptorDigest         string
	TurnIndex                int64
	InvocationID             string
	DispatchIntentDigest     string
	TransportReceiptDigest   string
	ResponseBodyDigest       string
	NormalizedEventSetDigest string
	OpaqueContinuationDigest string
	Digest                   string
	Value                    map[string]any
	Canonical                []byte
}

type evaluationProviderResultSpoolEnvelope struct {
	SpoolID                 string
	Algorithm               string
	KeyID                   string
	KeyVersion              int64
	KeyRefDigest            string
	EncryptionProfileDigest string
	Nonce                   []byte
	AuthenticationTag       []byte
	Ciphertext              []byte
	CiphertextDigest        string
	CiphertextSizeBytes     int64
	AADDigest               string
	EnvelopeDigest          string
	Value                   map[string]any
	Canonical               []byte
}

func decodeEvaluationAttemptDescriptor(source []byte) (evaluationAttemptDescriptor, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, 1_048_576)
	if err != nil || !exactEvaluationKeys(value, []string{
		"attemptId", "planDigest", "shardId", "caseId", "capabilityDescriptorDigest", "targetId", "targetDigest", "riskClass",
		"repetitionIndex", "samplingIdentityDigest", "descriptorDigest",
	}, "contextTier", "mediaRepresentationTier") {
		return evaluationAttemptDescriptor{}, invalid("evaluation attempt descriptor is invalid")
	}
	for _, field := range []string{"attemptId", "shardId", "caseId", "targetId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationAttemptDescriptor{}, err
		}
	}
	for _, field := range []string{"planDigest", "capabilityDescriptorDigest", "targetDigest", "samplingIdentityDigest", "descriptorDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationAttemptDescriptor{}, err
		}
	}
	repetition, err := evaluationCount(value["repetitionIndex"], "evaluation descriptor repetition")
	if err != nil || !oneOfString(stringMember(value, "riskClass"), "ordinary", "critical", "high-assurance") {
		return evaluationAttemptDescriptor{}, invalid("evaluation attempt descriptor sampling is invalid")
	}
	if contextTier, exists := value["contextTier"]; exists && !oneOfString(fmt.Sprint(contextTier), "small", "representative", "near-limit") {
		return evaluationAttemptDescriptor{}, invalid("evaluation attempt descriptor context tier is invalid")
	}
	if mediaTier, exists := value["mediaRepresentationTier"]; exists && !oneOfString(fmt.Sprint(mediaTier), "source-faithful", "representative-transform", "near-limit-transform") {
		return evaluationAttemptDescriptor{}, invalid("evaluation attempt descriptor media tier is invalid")
	}
	samplingBase := map[string]any{
		"planDigest": value["planDigest"], "caseId": value["caseId"],
		"capabilityDescriptorDigest": value["capabilityDescriptorDigest"], "targetId": value["targetId"],
		"targetDigest": value["targetDigest"], "riskClass": value["riskClass"], "repetitionIndex": repetition,
	}
	if contextTier, exists := value["contextTier"]; exists {
		samplingBase["contextTier"] = contextTier
	}
	if mediaTier, exists := value["mediaRepresentationTier"]; exists {
		samplingBase["mediaRepresentationTier"] = mediaTier
	}
	samplingDigest, digestErr := canonicaljson.Digest(samplingBase)
	shardDigest, shardErr := canonicaljson.Digest(map[string]any{"targetId": value["targetId"]})
	descriptorBase := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != "descriptorDigest" {
			descriptorBase[key] = entry
		}
	}
	descriptorDigest, descriptorErr := canonicaljson.Digest(descriptorBase)
	attemptID := stringMember(value, "attemptId")
	if digestErr != nil || shardErr != nil || descriptorErr != nil || samplingDigest != stringMember(value, "samplingIdentityDigest") ||
		attemptID != "evaluation-attempt:"+strings.TrimPrefix(samplingDigest, "sha256-") ||
		stringMember(value, "shardId") != "evaluation-shard:"+strings.TrimPrefix(shardDigest, "sha256-") ||
		descriptorDigest != stringMember(value, "descriptorDigest") {
		return evaluationAttemptDescriptor{}, invalid("evaluation attempt descriptor digest drifted")
	}
	return evaluationAttemptDescriptor{
		PlanDigest: stringMember(value, "planDigest"), AttemptID: attemptID,
		DescriptorDigest: descriptorDigest, CapabilityDescriptorDigest: stringMember(value, "capabilityDescriptorDigest"),
		ShardID: stringMember(value, "shardId"),
		CaseID:  stringMember(value, "caseId"), TargetID: stringMember(value, "targetId"),
		Value: value, Canonical: canonical,
	}, nil
}

func decodeEvaluationTransportDispatchIntent(source []byte) (evaluationTransportDispatchIntent, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "intentId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "protocolFamily", "providerConfigurationId", "modelLineageDigest",
		"inferenceConfigurationDigest", "invocationId", "budgetReservationId", "demandDigest",
		"requestDigest", "endpointId", "endpointClass", "requestBodyDigest", "requestBytes", "createdAt", "intentDigest",
	}) || value["format"] != evaluationTransportDispatchIntentFormat {
		return evaluationTransportDispatchIntent{}, invalid("evaluation transport dispatch intent is invalid")
	}
	version, ok := integerMember(value, "version")
	if !ok || version != 1 {
		return evaluationTransportDispatchIntent{}, invalid("evaluation transport dispatch intent version is invalid")
	}
	for _, field := range []string{"intentId", "attemptId", "providerConfigurationId", "invocationId", "budgetReservationId", "endpointId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationTransportDispatchIntent{}, err
		}
	}
	for _, field := range []string{"planDigest", "descriptorDigest", "modelLineageDigest", "inferenceConfigurationDigest", "demandDigest", "requestDigest", "requestBodyDigest", "intentDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationTransportDispatchIntent{}, err
		}
	}
	turnIndex, turnErr := evaluationCount(value["turnIndex"], "evaluation transport turn index")
	requestBytes, err := evaluationCount(value["requestBytes"], "evaluation transport request bytes")
	createdAt, timeErr := evaluationInstant(value["createdAt"], "evaluation transport dispatch time")
	if turnErr != nil || err != nil || requestBytes > maximumEvaluationSpoolCiphertextBytes || timeErr != nil ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
		!oneOfString(stringMember(value, "endpointClass"), "first-party-hosted", "aggregator", "self-hosted", "local") ||
		!evaluationCanonicalObjectDigest(value, "intentDigest") {
		return evaluationTransportDispatchIntent{}, invalid("evaluation transport dispatch intent authority is invalid")
	}
	return evaluationTransportDispatchIntent{EvaluationTransportDispatchIntentRecord: EvaluationTransportDispatchIntentRecord{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turnIndex,
		IntentID: stringMember(value, "intentId"), InvocationID: stringMember(value, "invocationId"),
		ProtocolFamily: stringMember(value, "protocolFamily"), ProviderConfigurationID: stringMember(value, "providerConfigurationId"),
		ModelLineageDigest: stringMember(value, "modelLineageDigest"), InferenceConfigDigest: stringMember(value, "inferenceConfigurationDigest"),
		BudgetReservationID: stringMember(value, "budgetReservationId"), DemandDigest: stringMember(value, "demandDigest"),
		RequestDigest: stringMember(value, "requestDigest"), EndpointID: stringMember(value, "endpointId"),
		EndpointClass: stringMember(value, "endpointClass"), RequestBodyDigest: stringMember(value, "requestBodyDigest"),
		RequestBytes: requestBytes, IntentDigest: stringMember(value, "intentDigest"), IntentBytes: canonical, CreatedAt: createdAt,
	}, Value: value}, nil
}

func decodeEvaluationTransportReceipt(source []byte) (evaluationTransportReceipt, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "receiptId", "protocolFamily", "providerConfigurationId", "invocationId",
		"dispatchIntentDigest", "requestDigest", "endpointId", "endpointClass", "requestBodyDigest", "requestBytes",
		"responseBytes", "sseEventCount", "dispatchState", "outcome", "startedAt", "completedAt", "receiptDigest",
	}, "httpStatus", "responseHeaderDigest", "responseBodyDigest", "providerRequestId", "providerIdentityKind",
		"providerResponseId", "resolvedModelId", "resolvedModelVersion", "errorCategory") || value["format"] != evaluationTransportReceiptFormat {
		return evaluationTransportReceipt{}, invalid("evaluation transport receipt is invalid")
	}
	version, ok := integerMember(value, "version")
	if !ok || version != 1 {
		return evaluationTransportReceipt{}, invalid("evaluation transport receipt version is invalid")
	}
	for _, field := range []string{"receiptId", "providerConfigurationId", "invocationId", "endpointId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationTransportReceipt{}, err
		}
	}
	for _, field := range []string{"dispatchIntentDigest", "requestDigest", "requestBodyDigest", "receiptDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationTransportReceipt{}, err
		}
	}
	for _, field := range []string{"responseHeaderDigest", "responseBodyDigest"} {
		if _, err := optionalEvaluationAuthenticityDigest(value, field); err != nil {
			return evaluationTransportReceipt{}, err
		}
	}
	for _, field := range []string{"providerRequestId", "providerResponseId", "resolvedModelId", "resolvedModelVersion"} {
		if _, err := optionalEvaluationAuthenticityIdentity(value, field); err != nil {
			return evaluationTransportReceipt{}, err
		}
	}
	requestBytes, requestErr := evaluationCount(value["requestBytes"], "evaluation transport request bytes")
	responseBytes, responseErr := evaluationCount(value["responseBytes"], "evaluation transport response bytes")
	_, eventErr := evaluationCount(value["sseEventCount"], "evaluation transport SSE event count")
	startedAt, startErr := evaluationInstant(value["startedAt"], "evaluation transport start")
	completedAt, completeErr := evaluationInstant(value["completedAt"], "evaluation transport completion")
	dispatchState, outcome := stringMember(value, "dispatchState"), stringMember(value, "outcome")
	providerIdentityKind, hasProviderIdentityKind := value["providerIdentityKind"].(string)
	_, hasProviderResponseID := value["providerResponseId"].(string)
	_, hasErrorCategory := value["errorCategory"].(string)
	responseMetadata := value["httpStatus"] != nil || value["responseHeaderDigest"] != nil || value["responseBodyDigest"] != nil ||
		value["providerRequestId"] != nil || hasProviderIdentityKind || hasProviderResponseID || value["resolvedModelId"] != nil || value["resolvedModelVersion"] != nil
	validCompleted := outcome != "completed" || dispatchState == "dispatched" && value["responseHeaderDigest"] != nil &&
		value["responseBodyDigest"] != nil && value["providerRequestId"] != nil && !hasErrorCategory
	if requestErr != nil || responseErr != nil || eventErr != nil || requestBytes > maximumEvaluationSpoolCiphertextBytes ||
		responseBytes > maximumEvaluationSpoolCiphertextBytes || startErr != nil || completeErr != nil || completedAt.Before(startedAt) ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
		!oneOfString(stringMember(value, "endpointClass"), "first-party-hosted", "aggregator", "self-hosted", "local") ||
		!oneOfString(dispatchState, "dispatched", "not-dispatched") || !oneOfString(outcome, "completed", "failed", "post-dispatch-unknown") ||
		(hasProviderIdentityKind != hasProviderResponseID) || (hasProviderIdentityKind && !oneOfString(providerIdentityKind, "interaction-id", "message-id", "response-id")) ||
		(outcome != "completed" && !hasErrorCategory) || (outcome == "post-dispatch-unknown" && dispatchState != "dispatched") ||
		(dispatchState == "not-dispatched" && (outcome != "failed" || responseMetadata || responseBytes != 0)) || !validCompleted ||
		!evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return evaluationTransportReceipt{}, invalid("evaluation transport receipt authority is invalid")
	}
	if raw, exists := value["httpStatus"]; exists {
		status, err := evaluationCount(raw, "evaluation transport HTTP status")
		if err != nil || status < 100 || status > 599 || outcome == "completed" && (status < 200 || status > 299) {
			return evaluationTransportReceipt{}, invalid("evaluation transport HTTP status is invalid")
		}
	}
	return evaluationTransportReceipt{
		EvaluationTransportReceiptRecord: EvaluationTransportReceiptRecord{
			ReceiptID: stringMember(value, "receiptId"), InvocationID: stringMember(value, "invocationId"),
			ProviderConfigurationID: stringMember(value, "providerConfigurationId"), ProviderRequestID: stringMember(value, "providerRequestId"),
			IntentDigest: stringMember(value, "dispatchIntentDigest"), DispatchState: dispatchState, Outcome: outcome,
			ResponseBodyDigest: stringMember(value, "responseBodyDigest"), ReceiptDigest: stringMember(value, "receiptDigest"),
			ReceiptBytes: canonical, StartedAt: startedAt, CompletedAt: completedAt,
		},
		RequestDigest: stringMember(value, "requestDigest"), ProtocolFamily: stringMember(value, "protocolFamily"),
		EndpointID: stringMember(value, "endpointId"), EndpointClass: stringMember(value, "endpointClass"),
		RequestBodyDigest: stringMember(value, "requestBodyDigest"), RequestBytes: requestBytes, ResponseBytes: responseBytes,
		ResponseHeaderDigest: stringMember(value, "responseHeaderDigest"), Value: value,
	}, nil
}

func decodeEvaluationProviderResultSpoolAAD(source []byte) (evaluationProviderResultSpoolAAD, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationServiceControlBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceDigest", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "invocationId", "dispatchIntentDigest", "transportReceiptDigest", "responseBodyDigest", "normalizedEventSetDigest",
	}, "opaqueContinuationDigest") || value["format"] != evaluationResultSpoolAADFormat {
		return evaluationProviderResultSpoolAAD{}, invalid("evaluation result spool AAD is invalid")
	}
	version, ok := integerMember(value, "version")
	turnIndex, turnErr := evaluationCount(value["turnIndex"], "evaluation result spool turn index")
	if !ok || version != 1 || turnErr != nil || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationProviderResultSpoolAAD{}, invalid("evaluation result spool AAD partition is invalid")
	}
	if _, err := evaluationAuthenticityIdentity(value["attemptId"], "attempt id"); err != nil {
		return evaluationProviderResultSpoolAAD{}, err
	}
	if _, err := evaluationAuthenticityIdentity(value["invocationId"], "invocation id"); err != nil {
		return evaluationProviderResultSpoolAAD{}, err
	}
	for _, field := range []string{"namespaceDigest", "planDigest", "descriptorDigest", "dispatchIntentDigest", "transportReceiptDigest", "responseBodyDigest", "normalizedEventSetDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationProviderResultSpoolAAD{}, err
		}
	}
	opaqueDigest, err := optionalEvaluationAuthenticityDigest(value, "opaqueContinuationDigest")
	if err != nil {
		return evaluationProviderResultSpoolAAD{}, err
	}
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		return evaluationProviderResultSpoolAAD{}, err
	}
	return evaluationProviderResultSpoolAAD{
		NamespaceDigest: stringMember(value, "namespaceDigest"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), AttemptID: stringMember(value, "attemptId"),
		DescriptorDigest: stringMember(value, "descriptorDigest"), TurnIndex: turnIndex,
		InvocationID: stringMember(value, "invocationId"), DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"),
		TransportReceiptDigest: stringMember(value, "transportReceiptDigest"), ResponseBodyDigest: stringMember(value, "responseBodyDigest"),
		NormalizedEventSetDigest: stringMember(value, "normalizedEventSetDigest"), OpaqueContinuationDigest: opaqueDigest,
		Digest: digest, Value: value, Canonical: canonical,
	}, nil
}

func decodeEvaluationProviderResultSpoolEnvelope(source []byte) (evaluationProviderResultSpoolEnvelope, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationSpoolEnvelopeBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "spoolId", "algorithm", "keyId", "keyVersion", "keyRefDigest", "encryptionProfileDigest",
		"nonceBase64Url", "authenticationTagBase64Url", "ciphertextBase64Url", "ciphertextDigest", "ciphertextSizeBytes", "aadDigest", "envelopeDigest",
	}) || value["format"] != evaluationResultSpoolEnvelopeFormat || stringMember(value, "algorithm") != "aes-256-gcm" {
		return evaluationProviderResultSpoolEnvelope{}, invalid("evaluation result spool envelope is invalid")
	}
	version, versionOK := integerMember(value, "version")
	keyVersion, keyErr := evaluationCount(value["keyVersion"], "evaluation spool key version")
	ciphertextSize, sizeErr := evaluationCount(value["ciphertextSizeBytes"], "evaluation spool ciphertext size")
	if !versionOK || version != 1 || keyErr != nil || keyVersion < 1 || sizeErr != nil || ciphertextSize < 1 || ciphertextSize > maximumEvaluationSpoolCiphertextBytes {
		return evaluationProviderResultSpoolEnvelope{}, invalid("evaluation result spool envelope bounds are invalid")
	}
	for _, field := range []string{"spoolId", "keyId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationProviderResultSpoolEnvelope{}, err
		}
	}
	for _, field := range []string{"keyRefDigest", "encryptionProfileDigest", "ciphertextDigest", "aadDigest", "envelopeDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationProviderResultSpoolEnvelope{}, err
		}
	}
	decode := func(field string, maximum int) ([]byte, error) {
		encoded, ok := value[field].(string)
		if !ok || encoded == "" {
			return nil, invalid("evaluation result spool " + field + " is invalid")
		}
		decoded, err := base64.RawURLEncoding.DecodeString(encoded)
		if err != nil || len(decoded) > maximum || base64.RawURLEncoding.EncodeToString(decoded) != encoded {
			return nil, invalid("evaluation result spool " + field + " is not canonical base64url")
		}
		return decoded, nil
	}
	nonce, nonceErr := decode("nonceBase64Url", 12)
	tag, tagErr := decode("authenticationTagBase64Url", 16)
	ciphertext, ciphertextErr := decode("ciphertextBase64Url", maximumEvaluationSpoolCiphertextBytes)
	if nonceErr != nil || tagErr != nil || ciphertextErr != nil || len(nonce) != 12 || len(tag) != 16 || int64(len(ciphertext)) != ciphertextSize {
		return evaluationProviderResultSpoolEnvelope{}, invalid("evaluation result spool envelope encoding is invalid")
	}
	ciphertextDigest := fmt.Sprintf("sha256-%x", sha256.Sum256(ciphertext))
	authority := map[string]any{
		"algorithm": value["algorithm"], "keyId": value["keyId"], "keyVersion": keyVersion,
		"keyRefDigest": value["keyRefDigest"], "encryptionProfileDigest": value["encryptionProfileDigest"],
		"nonceBase64Url": value["nonceBase64Url"], "authenticationTagBase64Url": value["authenticationTagBase64Url"],
		"ciphertextDigest": value["ciphertextDigest"], "ciphertextSizeBytes": ciphertextSize, "aadDigest": value["aadDigest"],
	}
	envelopeDigest, digestErr := canonicaljson.Digest(authority)
	if digestErr != nil || ciphertextDigest != stringMember(value, "ciphertextDigest") || envelopeDigest != stringMember(value, "envelopeDigest") {
		return evaluationProviderResultSpoolEnvelope{}, invalid("evaluation result spool envelope digest drifted")
	}
	return evaluationProviderResultSpoolEnvelope{
		SpoolID: stringMember(value, "spoolId"), Algorithm: "aes-256-gcm", KeyID: stringMember(value, "keyId"),
		KeyVersion: keyVersion, KeyRefDigest: stringMember(value, "keyRefDigest"),
		EncryptionProfileDigest: stringMember(value, "encryptionProfileDigest"), Nonce: nonce, AuthenticationTag: tag,
		Ciphertext: ciphertext, CiphertextDigest: ciphertextDigest, CiphertextSizeBytes: ciphertextSize,
		AADDigest: stringMember(value, "aadDigest"), EnvelopeDigest: envelopeDigest, Value: value, Canonical: canonical,
	}, nil
}

func decodeEvaluationProviderResultSpoolReceipt(source []byte) (EvaluationProviderResultSpoolReceiptRecord, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "spoolRef", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "invocationId", "dispatchIntentDigest", "transportReceiptDigest", "algorithm",
		"encryptionProfileDigest", "keyRefDigest", "keyId", "keyVersion", "aadDigest", "envelopeDigest",
		"ciphertextDigest", "ciphertextSizeBytes", "responseBodyDigest", "normalizedEventSetDigest", "responseDigest",
		"retentionClass", "retentionPolicyDigest", "createdAt", "expiresAt", "receiptDigest",
	}, "opaqueContinuationDigest") || value["format"] != evaluationResultSpoolReceiptFormat ||
		stringMember(value, "algorithm") != "aes-256-gcm" || stringMember(value, "retentionClass") != "attempt-resume-only" {
		return EvaluationProviderResultSpoolReceiptRecord{}, invalid("evaluation result spool receipt is invalid")
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnErr := evaluationCount(value["turnIndex"], "evaluation result spool turn index")
	keyVersion, keyErr := evaluationCount(value["keyVersion"], "evaluation result spool key version")
	ciphertextSize, sizeErr := evaluationCount(value["ciphertextSizeBytes"], "evaluation result spool ciphertext size")
	createdAt, createdErr := evaluationInstant(value["createdAt"], "evaluation result spool creation")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "evaluation result spool expiry")
	if !versionOK || version != 1 || turnErr != nil || keyErr != nil || keyVersion < 1 || sizeErr != nil ||
		ciphertextSize < 1 || ciphertextSize > maximumEvaluationSpoolCiphertextBytes || createdErr != nil ||
		expiresErr != nil || !expiresAt.After(createdAt) || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return EvaluationProviderResultSpoolReceiptRecord{}, invalid("evaluation result spool receipt bounds are invalid")
	}
	for _, field := range []string{"spoolRef", "attemptId", "invocationId", "keyId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return EvaluationProviderResultSpoolReceiptRecord{}, err
		}
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "dispatchIntentDigest", "transportReceiptDigest", "encryptionProfileDigest",
		"keyRefDigest", "aadDigest", "envelopeDigest", "ciphertextDigest", "responseBodyDigest",
		"normalizedEventSetDigest", "responseDigest", "retentionPolicyDigest", "receiptDigest",
	} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return EvaluationProviderResultSpoolReceiptRecord{}, err
		}
	}
	opaqueDigest, err := optionalEvaluationAuthenticityDigest(value, "opaqueContinuationDigest")
	if err != nil || !evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return EvaluationProviderResultSpoolReceiptRecord{}, invalid("evaluation result spool receipt digest drifted")
	}
	return EvaluationProviderResultSpoolReceiptRecord{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		TurnIndex: turnIndex, InvocationID: stringMember(value, "invocationId"), SpoolRef: stringMember(value, "spoolRef"),
		DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"), TransportReceiptDigest: stringMember(value, "transportReceiptDigest"),
		Algorithm: "aes-256-gcm", EncryptionProfileDigest: stringMember(value, "encryptionProfileDigest"),
		KeyRefDigest: stringMember(value, "keyRefDigest"), KeyID: stringMember(value, "keyId"), KeyVersion: keyVersion,
		AADDigest: stringMember(value, "aadDigest"), EnvelopeDigest: stringMember(value, "envelopeDigest"),
		CiphertextDigest: stringMember(value, "ciphertextDigest"), CiphertextSizeBytes: ciphertextSize,
		ResponseBodyDigest: stringMember(value, "responseBodyDigest"), NormalizedEventSetDigest: stringMember(value, "normalizedEventSetDigest"),
		ResponseDigest: stringMember(value, "responseDigest"), OpaqueContinuationDigest: opaqueDigest,
		RetentionClass: "attempt-resume-only", RetentionPolicyDigest: stringMember(value, "retentionPolicyDigest"),
		ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: canonical, CreatedAt: createdAt, ExpiresAt: expiresAt,
	}, nil
}

func decodeEvaluationProviderResultSpoolDisposition(source []byte) (EvaluationProviderResultSpoolDispositionRecord, error) {
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "spoolRef", "spoolReceiptDigest", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "turnIndex", "invocationId", "disposition", "retentionPolicyDigest", "disposedAt", "receiptDigest",
	}, "retainedUntil") || value["format"] != evaluationResultSpoolDispositionFormat {
		return EvaluationProviderResultSpoolDispositionRecord{}, invalid("evaluation result spool disposition is invalid")
	}
	version, versionOK := integerMember(value, "version")
	turnIndex, turnErr := evaluationCount(value["turnIndex"], "evaluation result spool disposition turn")
	disposedAt, disposedErr := evaluationInstant(value["disposedAt"], "evaluation result spool disposition time")
	if !versionOK || version != 1 || turnErr != nil || disposedErr != nil ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return EvaluationProviderResultSpoolDispositionRecord{}, invalid("evaluation result spool disposition partition is invalid")
	}
	for _, field := range []string{"spoolRef", "attemptId", "invocationId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return EvaluationProviderResultSpoolDispositionRecord{}, err
		}
	}
	for _, field := range []string{"spoolReceiptDigest", "planDigest", "descriptorDigest", "retentionPolicyDigest", "receiptDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return EvaluationProviderResultSpoolDispositionRecord{}, err
		}
	}
	disposition := stringMember(value, "disposition")
	var retainedUntil *time.Time
	if raw, exists := value["retainedUntil"]; exists {
		parsed, err := evaluationInstant(raw, "evaluation result spool retained-until")
		if err != nil {
			return EvaluationProviderResultSpoolDispositionRecord{}, err
		}
		retainedUntil = &parsed
	}
	if disposition == "consumed-and-destroyed" && retainedUntil != nil || disposition == "retained-encrypted" &&
		(retainedUntil == nil || !retainedUntil.After(disposedAt)) || !oneOfString(disposition, "consumed-and-destroyed", "retained-encrypted") ||
		!evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return EvaluationProviderResultSpoolDispositionRecord{}, invalid("evaluation result spool disposition authority is invalid")
	}
	return EvaluationProviderResultSpoolDispositionRecord{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
		TurnIndex: turnIndex, InvocationID: stringMember(value, "invocationId"), SpoolRef: stringMember(value, "spoolRef"),
		SpoolReceiptDigest: stringMember(value, "spoolReceiptDigest"), Disposition: disposition,
		RetentionPolicyDigest: stringMember(value, "retentionPolicyDigest"), RetainedUntil: retainedUntil,
		DisposedAt: disposedAt, ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: canonical,
	}, nil
}

func evaluationNamespaceDigest(namespaceID string) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-model-evaluation-response-spool-namespace", "version": int64(1), "namespaceId": namespaceID,
	})
}

func evaluationProviderResultSpoolID(aad evaluationProviderResultSpoolAAD) (string, error) {
	digest, err := canonicaljson.Digest(map[string]any{
		"namespaceDigest": aad.NamespaceDigest, "planDigest": aad.PlanDigest, "repositoryCommit": aad.RepositoryCommit,
		"attemptId": aad.AttemptID, "descriptorDigest": aad.DescriptorDigest, "turnIndex": aad.TurnIndex,
		"invocationId": aad.InvocationID,
	})
	if err != nil {
		return "", err
	}
	return "evaluation-result-spool:" + strings.TrimPrefix(digest, "sha256-"), nil
}

func evaluationAttemptStableReservationID(planDigest, shardID, descriptorDigest string) (string, error) {
	digest, err := canonicaljson.Digest(map[string]any{
		"planDigest": planDigest, "shardId": shardID, "descriptorDigest": descriptorDigest,
	})
	if err != nil {
		return "", err
	}
	return "evaluation-reservation." + strings.TrimPrefix(digest, "sha256-"), nil
}

func validateEvaluationDispatchPlanBinding(
	planRecord EvaluationPlanRecord,
	plan evaluationPlanFact,
	descriptor evaluationAttemptDescriptor,
	intent evaluationTransportDispatchIntent,
) error {
	if descriptor.PlanDigest != plan.PlanDigest {
		return conflict("evaluation dispatch descriptor belongs to another plan")
	}
	attempt := evaluationAttemptFact{
		PlanDigest: descriptor.PlanDigest, AttemptID: descriptor.AttemptID,
		DescriptorDigest: descriptor.DescriptorDigest, ShardID: descriptor.ShardID,
		CaseID: descriptor.CaseID, TargetID: descriptor.TargetID,
		Value: map[string]any{"descriptor": descriptor.Value},
	}
	if err := validateEvaluationAttemptPlanBinding(planRecord.FactBytes, attempt); err != nil {
		return err
	}
	target := evaluationPlanObjectByIdentity(plan.Value["capabilityQualificationTargets"], "targetId", descriptor.TargetID)
	provider := evaluationPlanObjectByIdentity(plan.Value["providerConfigurations"], "providerConfigurationId", intent.ProviderConfigurationID)
	adapter, _ := objectMember(provider, "adapter")
	if target == nil || provider == nil || stringMember(target, "providerConfigurationId") != intent.ProviderConfigurationID ||
		stringMember(target, "protocolFamily") != intent.ProtocolFamily || stringMember(adapter, "protocolFamily") != intent.ProtocolFamily ||
		stringMember(target, "modelLineageDigest") != intent.ModelLineageDigest ||
		stringMember(target, "inferenceConfigurationDigest") != intent.InferenceConfigDigest ||
		stringMember(provider, "endpointClass") != intent.EndpointClass || intent.CreatedAt.Before(plan.PlannedAt) || intent.CreatedAt.After(plan.ExpiresAt) {
		return conflict("evaluation dispatch target drifted from the frozen provider plan")
	}
	return nil
}

func scanEvaluationTransportDispatchIntent(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationTransportDispatchIntentRecord, error) {
	var record EvaluationTransportDispatchIntentRecord
	var descriptorBytes, intentBytes []byte
	if err := scanner.Scan(
		&record.AttemptID, &record.DescriptorDigest, &descriptorBytes, &record.TurnIndex,
		&record.BudgetReservationID, &record.IntentID, &record.InvocationID, &record.ProtocolFamily,
		&record.ProviderConfigurationID, &record.ModelLineageDigest, &record.InferenceConfigDigest,
		&record.DemandDigest, &record.RequestDigest, &record.EndpointID, &record.EndpointClass,
		&record.RequestBodyDigest, &record.RequestBytes, &record.IntentDigest, &intentBytes, &record.CreatedAt,
	); err != nil {
		return EvaluationTransportDispatchIntentRecord{}, err
	}
	descriptor, err := decodeEvaluationAttemptDescriptor(descriptorBytes)
	if err != nil {
		return EvaluationTransportDispatchIntentRecord{}, fmt.Errorf("decode persisted evaluation dispatch descriptor: %w", err)
	}
	intent, err := decodeEvaluationTransportDispatchIntent(intentBytes)
	if err != nil {
		return EvaluationTransportDispatchIntentRecord{}, fmt.Errorf("decode persisted evaluation dispatch intent: %w", err)
	}
	if descriptor.AttemptID != record.AttemptID || descriptor.DescriptorDigest != record.DescriptorDigest ||
		intent.IntentID != record.IntentID || intent.InvocationID != record.InvocationID ||
		intent.ProtocolFamily != record.ProtocolFamily || intent.ProviderConfigurationID != record.ProviderConfigurationID ||
		intent.ModelLineageDigest != record.ModelLineageDigest || intent.InferenceConfigDigest != record.InferenceConfigDigest ||
		intent.DemandDigest != record.DemandDigest ||
		intent.RequestDigest != record.RequestDigest || intent.EndpointID != record.EndpointID ||
		intent.EndpointClass != record.EndpointClass || intent.RequestBodyDigest != record.RequestBodyDigest ||
		intent.RequestBytes != record.RequestBytes || intent.IntentDigest != record.IntentDigest ||
		!intent.CreatedAt.Equal(record.CreatedAt) || !bytes.Equal(descriptor.Canonical, descriptorBytes) ||
		!bytes.Equal(intent.IntentBytes, intentBytes) {
		return EvaluationTransportDispatchIntentRecord{}, conflict("persisted evaluation dispatch intent metadata drifted")
	}
	record.NamespaceID, record.PlanDigest, record.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
	record.DescriptorBytes, record.IntentBytes = append([]byte(nil), descriptorBytes...), append([]byte(nil), intentBytes...)
	return record, nil
}

func loadEvaluationTransportDispatchIntent(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
	forShare bool,
) (EvaluationTransportDispatchIntentRecord, error) {
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	row := queryer.QueryRowContext(ctx, `SELECT attempt_id, descriptor_digest, descriptor_bytes, turn_index,
		budget_reservation_id, intent_id, invocation_id, protocol_family, provider_configuration_id,
		model_lineage_digest, inference_configuration_digest, demand_digest,
		request_digest, endpoint_id, endpoint_class, request_body_digest, request_bytes, intent_digest,
		intent_bytes, created_at
	FROM agent_evaluation_transport_dispatch_intents
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
		AND attempt_id = $4 AND turn_index = $5`+lock,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID, turnIndex)
	record, err := scanEvaluationTransportDispatchIntent(row, namespaceID, partition)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationTransportDispatchIntentRecord{}, ErrNotFound
	}
	return record, err
}

func (repository *Repository) StoreEvaluationTransportDispatchIntent(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	descriptorBytes []byte,
	turnIndex int64,
	budgetReservationID string,
	intentBytes []byte,
) (EvaluationAttemptTurnRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	descriptor, err := decodeEvaluationAttemptDescriptor(descriptorBytes)
	if err != nil || descriptor.PlanDigest != partition.PlanDigest || turnIndex < 0 || turnIndex > 9_007_199_254_740_991 ||
		!validEvaluationServiceIdentity(budgetReservationID) {
		return EvaluationAttemptTurnRecord{}, false, ErrInvalid
	}
	intent, err := decodeEvaluationTransportDispatchIntent(intentBytes)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, planRecord, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if intent.PlanDigest != partition.PlanDigest || intent.RepositoryCommit != partition.RepositoryCommit ||
		intent.AttemptID != descriptor.AttemptID || intent.DescriptorDigest != descriptor.DescriptorDigest ||
		intent.TurnIndex != turnIndex || intent.BudgetReservationID != budgetReservationID {
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation dispatch intent drifted from its route and descriptor")
	}
	if err := validateEvaluationDispatchPlanBinding(planRecord, plan, descriptor, intent); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	expectedReservationID, err := evaluationAttemptStableReservationID(
		partition.PlanDigest, descriptor.ShardID, descriptor.DescriptorDigest,
	)
	if err != nil || budgetReservationID != expectedReservationID {
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation dispatch budget reservation drifted from its descriptor")
	}
	var reservationExists, settlementExists bool
	var reservationDemandDigest string
	if err := tx.QueryRowContext(writeContext, `SELECT
		EXISTS (SELECT 1 FROM agent_evaluation_budget_reservations
			WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3),
		EXISTS (SELECT 1 FROM agent_evaluation_budget_settlements
			WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3),
		COALESCE((SELECT demand_digest FROM agent_evaluation_budget_reservations
			WHERE namespace_id = $1 AND plan_digest = $2 AND reservation_id = $3), '')`,
		authority.NamespaceID, partition.PlanDigest, budgetReservationID).Scan(&reservationExists, &settlementExists, &reservationDemandDigest); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if !reservationExists || settlementExists || reservationDemandDigest != intent.DemandDigest {
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation dispatch requires an open durable budget reservation")
	}
	existing, err := loadEvaluationTransportDispatchIntent(
		writeContext, tx, authority.NamespaceID, partition, descriptor.AttemptID, turnIndex, true,
	)
	if err == nil {
		if existing.DescriptorDigest != descriptor.DescriptorDigest || existing.BudgetReservationID != budgetReservationID ||
			!bytes.Equal(existing.DescriptorBytes, descriptor.Canonical) || !bytes.Equal(existing.IntentBytes, intent.IntentBytes) {
			return EvaluationAttemptTurnRecord{}, false, conflict("evaluation dispatch turn identity was reused")
		}
		turn, err := loadEvaluationAttemptTurn(writeContext, tx, authority.NamespaceID, partition, descriptor.AttemptID, turnIndex)
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		return turn, true, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	var previousCount, openCount int64
	if err := tx.QueryRowContext(writeContext, `SELECT COUNT(*), COUNT(*) FILTER (WHERE receipt.attempt_id IS NULL)
		FROM agent_evaluation_transport_dispatch_intents intent
		LEFT JOIN agent_evaluation_transport_receipts receipt
			ON receipt.namespace_id = intent.namespace_id AND receipt.plan_digest = intent.plan_digest
			AND receipt.attempt_id = intent.attempt_id AND receipt.turn_index = intent.turn_index
		WHERE intent.namespace_id = $1 AND intent.plan_digest = $2 AND intent.repository_commit = $3
			AND intent.attempt_id = $4`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		descriptor.AttemptID).Scan(&previousCount, &openCount); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if turnIndex != previousCount || openCount != 0 {
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation dispatch turns must be contiguous and all prior turns closed")
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_transport_dispatch_intents (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, descriptor_json,
		descriptor_bytes, turn_index, budget_reservation_id, intent_id, invocation_id, protocol_family,
		provider_configuration_id, model_lineage_digest, inference_configuration_digest, demand_digest,
		request_digest, endpoint_id, endpoint_class, request_body_digest,
		request_bytes, intent_digest, intent_json, intent_bytes, created_at
	) VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10, $11, $12, $13,
		$14, $15, $16, $17, $18, $19, $20, $21, $22, $23::jsonb, $24, $25) ON CONFLICT DO NOTHING`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, descriptor.AttemptID,
		descriptor.DescriptorDigest, string(descriptor.Canonical), descriptor.Canonical, turnIndex,
		budgetReservationID, intent.IntentID, intent.InvocationID, intent.ProtocolFamily,
		intent.ProviderConfigurationID, intent.ModelLineageDigest, intent.InferenceConfigDigest, intent.DemandDigest,
		intent.RequestDigest, intent.EndpointID, intent.EndpointClass,
		intent.RequestBodyDigest, intent.RequestBytes, intent.IntentDigest, string(intent.IntentBytes), intent.IntentBytes, intent.CreatedAt)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if inserted != 1 {
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation dispatch intent identity collided")
	}
	turn, err := loadEvaluationAttemptTurn(writeContext, tx, authority.NamespaceID, partition, descriptor.AttemptID, turnIndex)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	return turn, false, nil
}

func scanEvaluationTransportReceipt(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationTransportReceiptRecord, error) {
	var record EvaluationTransportReceiptRecord
	var providerRequestID, responseBodyDigest sql.NullString
	var source []byte
	if err := scanner.Scan(
		&record.AttemptID, &record.DescriptorDigest, &record.TurnIndex, &record.IntentDigest,
		&record.ReceiptID, &record.InvocationID, &record.ProviderConfigurationID, &providerRequestID,
		&record.DispatchState, &record.Outcome, &responseBodyDigest, &record.ReceiptDigest, &source,
		&record.StartedAt, &record.CompletedAt, &record.ClosedAt,
	); err != nil {
		return EvaluationTransportReceiptRecord{}, err
	}
	decoded, err := decodeEvaluationTransportReceipt(source)
	if err != nil {
		return EvaluationTransportReceiptRecord{}, fmt.Errorf("decode persisted evaluation transport receipt: %w", err)
	}
	record.ProviderRequestID, record.ResponseBodyDigest = providerRequestID.String, responseBodyDigest.String
	actual := decoded.EvaluationTransportReceiptRecord
	if record.IntentDigest != actual.IntentDigest || record.ReceiptID != actual.ReceiptID || record.InvocationID != actual.InvocationID ||
		record.ProviderConfigurationID != actual.ProviderConfigurationID || record.ProviderRequestID != actual.ProviderRequestID ||
		record.DispatchState != actual.DispatchState || record.Outcome != actual.Outcome ||
		record.ResponseBodyDigest != actual.ResponseBodyDigest || record.ReceiptDigest != actual.ReceiptDigest ||
		!record.StartedAt.Equal(actual.StartedAt) || !record.CompletedAt.Equal(actual.CompletedAt) || !bytes.Equal(source, actual.ReceiptBytes) {
		return EvaluationTransportReceiptRecord{}, conflict("persisted evaluation transport receipt metadata drifted")
	}
	record.NamespaceID, record.PlanDigest, record.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
	record.ReceiptBytes = append([]byte(nil), source...)
	return record, nil
}

func loadEvaluationTransportReceipt(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
) (EvaluationTransportReceiptRecord, error) {
	row := queryer.QueryRowContext(ctx, `SELECT attempt_id, descriptor_digest, turn_index, intent_digest,
		receipt_id, invocation_id, provider_configuration_id, provider_request_id, dispatch_state, outcome,
		response_body_digest, receipt_digest, receipt_bytes, started_at, completed_at, closed_at
	FROM agent_evaluation_transport_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
		AND attempt_id = $4 AND turn_index = $5`, namespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID, turnIndex)
	record, err := scanEvaluationTransportReceipt(row, namespaceID, partition)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationTransportReceiptRecord{}, ErrNotFound
	}
	return record, err
}

func scanEvaluationProviderResultSpoolReceipt(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationProviderResultSpoolReceiptRecord, error) {
	var record EvaluationProviderResultSpoolReceiptRecord
	var opaque sql.NullString
	var source []byte
	if err := scanner.Scan(
		&record.AttemptID, &record.DescriptorDigest, &record.TurnIndex, &record.InvocationID, &record.SpoolRef,
		&record.DispatchIntentDigest, &record.TransportReceiptDigest, &record.Algorithm,
		&record.EncryptionProfileDigest, &record.KeyRefDigest, &record.KeyID, &record.KeyVersion,
		&record.AADDigest, &record.EnvelopeDigest, &record.CiphertextDigest, &record.CiphertextSizeBytes,
		&record.ResponseBodyDigest, &record.NormalizedEventSetDigest, &record.ResponseDigest, &opaque,
		&record.RetentionClass, &record.RetentionPolicyDigest, &record.ReceiptDigest, &source,
		&record.CreatedAt, &record.ExpiresAt,
	); err != nil {
		return EvaluationProviderResultSpoolReceiptRecord{}, err
	}
	record.OpaqueContinuationDigest = opaque.String
	decoded, err := decodeEvaluationProviderResultSpoolReceipt(source)
	if err != nil {
		return EvaluationProviderResultSpoolReceiptRecord{}, fmt.Errorf("decode persisted evaluation result spool receipt: %w", err)
	}
	decoded.NamespaceID = namespaceID
	if decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit ||
		record.AttemptID != decoded.AttemptID || record.DescriptorDigest != decoded.DescriptorDigest ||
		record.TurnIndex != decoded.TurnIndex || record.InvocationID != decoded.InvocationID || record.SpoolRef != decoded.SpoolRef ||
		record.DispatchIntentDigest != decoded.DispatchIntentDigest || record.TransportReceiptDigest != decoded.TransportReceiptDigest ||
		record.Algorithm != decoded.Algorithm || record.EncryptionProfileDigest != decoded.EncryptionProfileDigest ||
		record.KeyRefDigest != decoded.KeyRefDigest || record.KeyID != decoded.KeyID || record.KeyVersion != decoded.KeyVersion ||
		record.AADDigest != decoded.AADDigest || record.EnvelopeDigest != decoded.EnvelopeDigest ||
		record.CiphertextDigest != decoded.CiphertextDigest || record.CiphertextSizeBytes != decoded.CiphertextSizeBytes ||
		record.ResponseBodyDigest != decoded.ResponseBodyDigest || record.NormalizedEventSetDigest != decoded.NormalizedEventSetDigest ||
		record.ResponseDigest != decoded.ResponseDigest || record.OpaqueContinuationDigest != decoded.OpaqueContinuationDigest ||
		record.RetentionClass != decoded.RetentionClass || record.RetentionPolicyDigest != decoded.RetentionPolicyDigest ||
		record.ReceiptDigest != decoded.ReceiptDigest || !record.CreatedAt.Equal(decoded.CreatedAt) ||
		!record.ExpiresAt.Equal(decoded.ExpiresAt) || !bytes.Equal(source, decoded.ReceiptBytes) {
		return EvaluationProviderResultSpoolReceiptRecord{}, conflict("persisted evaluation result spool receipt metadata drifted")
	}
	decoded.ReceiptBytes = append([]byte(nil), source...)
	return decoded, nil
}

func loadEvaluationProviderResultSpoolReceipt(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
) (EvaluationProviderResultSpoolReceiptRecord, error) {
	row := queryer.QueryRowContext(ctx, `SELECT attempt_id, descriptor_digest, turn_index, invocation_id, spool_ref,
		dispatch_intent_digest, transport_receipt_digest, algorithm, encryption_profile_digest, key_ref_digest,
		key_id, key_version, aad_digest, envelope_digest, ciphertext_digest, ciphertext_size_bytes,
		response_body_digest, normalized_event_set_digest, response_digest, opaque_continuation_digest,
		retention_class, retention_policy_digest, receipt_digest, receipt_bytes, created_at, expires_at
	FROM agent_evaluation_provider_result_spool_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
		AND attempt_id = $4 AND turn_index = $5`, namespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID, turnIndex)
	record, err := scanEvaluationProviderResultSpoolReceipt(row, namespaceID, partition)
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationProviderResultSpoolReceiptRecord{}, ErrNotFound
	}
	return record, err
}

func canonicalEvaluationAttemptTurn(record EvaluationAttemptTurnRecord) (map[string]any, error) {
	intent, err := decodeCanonicalEvaluationJSON(record.DispatchIntent.IntentBytes)
	if err != nil {
		return nil, err
	}
	value := map[string]any{
		"attemptId": record.AttemptID, "descriptorDigest": record.DescriptorDigest,
		"turnIndex": record.TurnIndex, "budgetReservationId": record.BudgetReservationID,
		"state": record.State, "dispatchIntent": intent, "createdAt": evaluationExportInstant(record.DispatchIntent.CreatedAt),
	}
	if record.TransportReceipt != nil {
		receipt, err := decodeCanonicalEvaluationJSON(record.TransportReceipt.ReceiptBytes)
		if err != nil {
			return nil, err
		}
		value["transportReceipt"] = receipt
		value["closedAt"] = evaluationExportInstant(*record.ClosedAt)
	}
	if record.ResultSpoolReceipt != nil {
		spool, err := decodeCanonicalEvaluationJSON(record.ResultSpoolReceipt.ReceiptBytes)
		if err != nil {
			return nil, err
		}
		value["resultSpoolReceipt"] = spool
	}
	return value, nil
}

func loadEvaluationAttemptTurn(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
) (EvaluationAttemptTurnRecord, error) {
	intent, err := loadEvaluationTransportDispatchIntent(ctx, queryer, namespaceID, partition, attemptID, turnIndex, false)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, err
	}
	turn := EvaluationAttemptTurnRecord{
		AttemptID: intent.AttemptID, DescriptorDigest: intent.DescriptorDigest, TurnIndex: intent.TurnIndex,
		BudgetReservationID: intent.BudgetReservationID, State: "dispatched", DispatchIntent: intent,
	}
	receipt, err := loadEvaluationTransportReceipt(ctx, queryer, namespaceID, partition, attemptID, turnIndex)
	if err == nil {
		turn.State, turn.TransportReceipt, turn.ClosedAt = "closed", &receipt, &receipt.ClosedAt
		spool, spoolErr := loadEvaluationProviderResultSpoolReceipt(ctx, queryer, namespaceID, partition, attemptID, turnIndex)
		if spoolErr == nil {
			turn.ResultSpoolReceipt = &spool
		} else if !errors.Is(spoolErr, ErrNotFound) {
			return EvaluationAttemptTurnRecord{}, spoolErr
		}
	} else if !errors.Is(err, ErrNotFound) {
		return EvaluationAttemptTurnRecord{}, err
	}
	value, err := canonicalEvaluationAttemptTurn(turn)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, err
	}
	turn.TurnDigest, err = canonicaljson.Digest(value)
	return turn, err
}

func (repository *Repository) ListEvaluationAttemptTurns(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
) ([]EvaluationAttemptTurnRecord, error) {
	if !validEvaluationServiceIdentity(attemptID) {
		return nil, ErrInvalid
	}
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	rows, err := tx.QueryContext(readContext, `SELECT turn_index FROM agent_evaluation_transport_dispatch_intents
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3 AND attempt_id = $4
		ORDER BY turn_index ASC`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID)
	if err != nil {
		return nil, err
	}
	indices := make([]int64, 0)
	for rows.Next() {
		var index int64
		if err := rows.Scan(&index); err != nil {
			_ = rows.Close()
			return nil, err
		}
		indices = append(indices, index)
	}
	if err := rows.Close(); err != nil {
		return nil, err
	}
	turns := make([]EvaluationAttemptTurnRecord, len(indices))
	for index, turnIndex := range indices {
		if turnIndex != int64(index) {
			return nil, conflict("evaluation attempt turn journal contains a gap")
		}
		turn, err := loadEvaluationAttemptTurn(readContext, tx, authority.NamespaceID, partition, attemptID, turnIndex)
		if err != nil {
			return nil, err
		}
		turns[index] = turn
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return turns, nil
}

func validateEvaluationTransportCloseBinding(
	intent EvaluationTransportDispatchIntentRecord,
	receipt evaluationTransportReceipt,
	closedAt time.Time,
) error {
	if receipt.IntentDigest != intent.IntentDigest || receipt.InvocationID != intent.InvocationID ||
		receipt.ProtocolFamily != intent.ProtocolFamily || receipt.ProviderConfigurationID != intent.ProviderConfigurationID ||
		receipt.RequestDigest != intent.RequestDigest || receipt.EndpointID != intent.EndpointID ||
		receipt.EndpointClass != intent.EndpointClass || receipt.RequestBodyDigest != intent.RequestBodyDigest ||
		receipt.RequestBytes != intent.RequestBytes || receipt.StartedAt.Before(intent.CreatedAt) ||
		closedAt.Before(receipt.CompletedAt) {
		return conflict("evaluation transport close drifted from its durable dispatch intent")
	}
	return nil
}

func evaluationProviderResultSpoolReceiptBytes(
	aad evaluationProviderResultSpoolAAD,
	envelope evaluationProviderResultSpoolEnvelope,
	responseDigest string,
	retentionPolicyDigest string,
	createdAt time.Time,
	expiresAt time.Time,
) ([]byte, EvaluationProviderResultSpoolReceiptRecord, error) {
	base := map[string]any{
		"format": evaluationResultSpoolReceiptFormat, "version": int64(1), "spoolRef": envelope.SpoolID,
		"planDigest": aad.PlanDigest, "repositoryCommit": aad.RepositoryCommit, "attemptId": aad.AttemptID,
		"descriptorDigest": aad.DescriptorDigest, "turnIndex": aad.TurnIndex, "invocationId": aad.InvocationID,
		"dispatchIntentDigest": aad.DispatchIntentDigest, "transportReceiptDigest": aad.TransportReceiptDigest,
		"algorithm": envelope.Algorithm, "encryptionProfileDigest": envelope.EncryptionProfileDigest,
		"keyRefDigest": envelope.KeyRefDigest, "keyId": envelope.KeyID, "keyVersion": envelope.KeyVersion,
		"aadDigest": envelope.AADDigest, "envelopeDigest": envelope.EnvelopeDigest,
		"ciphertextDigest": envelope.CiphertextDigest, "ciphertextSizeBytes": envelope.CiphertextSizeBytes,
		"responseBodyDigest": aad.ResponseBodyDigest, "normalizedEventSetDigest": aad.NormalizedEventSetDigest,
		"responseDigest": responseDigest, "retentionClass": "attempt-resume-only",
		"retentionPolicyDigest": retentionPolicyDigest, "createdAt": evaluationExportInstant(createdAt),
		"expiresAt": evaluationExportInstant(expiresAt),
	}
	if aad.OpaqueContinuationDigest != "" {
		base["opaqueContinuationDigest"] = aad.OpaqueContinuationDigest
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, EvaluationProviderResultSpoolReceiptRecord{}, err
	}
	base["receiptDigest"] = receiptDigest
	canonical, err := canonicaljson.Bytes(base)
	if err != nil {
		return nil, EvaluationProviderResultSpoolReceiptRecord{}, err
	}
	record, err := decodeEvaluationProviderResultSpoolReceipt(canonical)
	return canonical, record, err
}

func loadEvaluationProviderResultSpoolPayload(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
) ([]byte, []byte, error) {
	var aadBytes, envelopeBytes []byte
	err := queryer.QueryRowContext(ctx, `SELECT aad_bytes, envelope_bytes
		FROM agent_evaluation_provider_result_spool_payloads
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
			AND attempt_id = $4 AND turn_index = $5`, namespaceID, partition.PlanDigest,
		partition.RepositoryCommit, attemptID, turnIndex).Scan(&aadBytes, &envelopeBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	return aadBytes, envelopeBytes, err
}

func (repository *Repository) CloseEvaluationTransport(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
	descriptorDigest string,
	budgetReservationID string,
	expectedIntentDigest string,
	receiptBytes []byte,
	spool *EvaluationEncryptedResultSpool,
	nativeOptionalBootstrapIngressBytes []byte,
	closedAt time.Time,
) (EvaluationAttemptTurnRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if !validEvaluationServiceIdentity(attemptID) || turnIndex < 0 || !evaluationDigestPattern.MatchString(descriptorDigest) ||
		!validEvaluationServiceIdentity(budgetReservationID) || !evaluationDigestPattern.MatchString(expectedIntentDigest) || closedAt.IsZero() ||
		closedAt.Nanosecond()%1_000_000 != 0 {
		return EvaluationAttemptTurnRecord{}, false, ErrInvalid
	}
	receipt, err := decodeEvaluationTransportReceipt(receiptBytes)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, ErrInvalid
	}
	var nativeOptionalBootstrapIngress *evaluationNativeOptionalBootstrapCloseIngress
	if len(nativeOptionalBootstrapIngressBytes) != 0 {
		decoded, decodeErr := decodeEvaluationNativeOptionalBootstrapCloseIngress(nativeOptionalBootstrapIngressBytes)
		if decodeErr != nil {
			return EvaluationAttemptTurnRecord{}, false, decodeErr
		}
		nativeOptionalBootstrapIngress = &decoded
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	intent, err := loadEvaluationTransportDispatchIntent(writeContext, tx, authority.NamespaceID, partition, attemptID, turnIndex, true)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if intent.DescriptorDigest != descriptorDigest || intent.BudgetReservationID != budgetReservationID || intent.IntentDigest != expectedIntentDigest {
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport close fence drifted")
	}
	if err := validateEvaluationTransportCloseBinding(intent, receipt, closedAt); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if receipt.Outcome == "completed" && spool == nil || receipt.Outcome != "completed" && spool != nil {
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport close spool presence is invalid")
	}
	existing, err := loadEvaluationTransportReceipt(writeContext, tx, authority.NamespaceID, partition, attemptID, turnIndex)
	if err == nil {
		if !bytes.Equal(existing.ReceiptBytes, receipt.ReceiptBytes) || !existing.ClosedAt.Equal(closedAt) {
			return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport close identity was reused")
		}
		if spool != nil {
			aadBytes, envelopeBytes, payloadErr := loadEvaluationProviderResultSpoolPayload(
				writeContext, tx, authority.NamespaceID, partition, attemptID, turnIndex,
			)
			if payloadErr != nil || !bytes.Equal(aadBytes, spool.AAD) || !bytes.Equal(envelopeBytes, spool.Envelope) {
				return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport close spool replay drifted")
			}
			spoolRecord, loadErr := loadEvaluationProviderResultSpoolReceipt(writeContext, tx, authority.NamespaceID, partition, attemptID, turnIndex)
			if loadErr != nil || spoolRecord.ResponseDigest != spool.ResponseDigest ||
				spoolRecord.RetentionPolicyDigest != spool.RetentionPolicyDigest || !spoolRecord.ExpiresAt.Equal(spool.ExpiresAt) {
				return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport close spool receipt replay drifted")
			}
		}
		existingBootstrap, bootstrapErr := loadEvaluationNativeOptionalBootstrapSourceByTurn(
			writeContext, tx, authority.NamespaceID, partition, attemptID, turnIndex, true,
		)
		switch {
		case nativeOptionalBootstrapIngress == nil && bootstrapErr == nil:
			return EvaluationAttemptTurnRecord{}, false, conflict("native optional bootstrap replay omitted its sealed source")
		case nativeOptionalBootstrapIngress == nil && !errors.Is(bootstrapErr, ErrNotFound):
			return EvaluationAttemptTurnRecord{}, false, bootstrapErr
		case nativeOptionalBootstrapIngress != nil && bootstrapErr != nil:
			if errors.Is(bootstrapErr, ErrNotFound) {
				return EvaluationAttemptTurnRecord{}, false, conflict("native optional bootstrap replay has no sealed source")
			}
			return EvaluationAttemptTurnRecord{}, false, bootstrapErr
		case nativeOptionalBootstrapIngress != nil &&
			!bytes.Equal(existingBootstrap.IngressBytes, nativeOptionalBootstrapIngress.IngressBytes):
			return EvaluationAttemptTurnRecord{}, false, conflict("native optional bootstrap replay drifted")
		}
		if bootstrapErr == nil {
			if vaultErr := requireEvaluationNativeProviderStateVaultSeal(
				writeContext, tx, authority, partition, existingBootstrap, false,
			); vaultErr != nil {
				return EvaluationAttemptTurnRecord{}, false, vaultErr
			}
		}
		turn, err := loadEvaluationAttemptTurn(writeContext, tx, authority.NamespaceID, partition, attemptID, turnIndex)
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		return turn, true, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	var aad evaluationProviderResultSpoolAAD
	var envelope evaluationProviderResultSpoolEnvelope
	var spoolReceipt EvaluationProviderResultSpoolReceiptRecord
	if spool != nil {
		if !evaluationDigestPattern.MatchString(spool.ResponseDigest) || !evaluationDigestPattern.MatchString(spool.RetentionPolicyDigest) ||
			spool.ExpiresAt.IsZero() || spool.ExpiresAt.Nanosecond()%1_000_000 != 0 ||
			!spool.ExpiresAt.After(closedAt) || spool.ExpiresAt.After(closedAt.Add(maximumEvaluationSpoolRetention)) {
			return EvaluationAttemptTurnRecord{}, false, ErrInvalid
		}
		aad, err = decodeEvaluationProviderResultSpoolAAD(spool.AAD)
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, ErrInvalid
		}
		envelope, err = decodeEvaluationProviderResultSpoolEnvelope(spool.Envelope)
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, ErrInvalid
		}
		defer func() {
			clear(envelope.Nonce)
			clear(envelope.AuthenticationTag)
			clear(envelope.Ciphertext)
		}()
		namespaceDigest, digestErr := evaluationNamespaceDigest(authority.NamespaceID)
		spoolID, idErr := evaluationProviderResultSpoolID(aad)
		if digestErr != nil || idErr != nil || aad.NamespaceDigest != namespaceDigest || aad.PlanDigest != partition.PlanDigest ||
			aad.RepositoryCommit != partition.RepositoryCommit || aad.AttemptID != attemptID || aad.DescriptorDigest != descriptorDigest ||
			aad.TurnIndex != turnIndex || aad.InvocationID != intent.InvocationID || aad.DispatchIntentDigest != intent.IntentDigest ||
			aad.TransportReceiptDigest != receipt.ReceiptDigest || aad.ResponseBodyDigest != receipt.ResponseBodyDigest ||
			envelope.SpoolID != spoolID || envelope.AADDigest != aad.Digest {
			return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport result spool binding drifted")
		}
		spoolReceiptBytes, generatedReceipt, err := evaluationProviderResultSpoolReceiptBytes(
			aad, envelope, spool.ResponseDigest, spool.RetentionPolicyDigest, closedAt, spool.ExpiresAt,
		)
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		spoolReceipt = generatedReceipt
		spoolReceipt.NamespaceID, spoolReceipt.ReceiptBytes = authority.NamespaceID, spoolReceiptBytes
	}
	if nativeOptionalBootstrapIngress != nil && spool == nil {
		return EvaluationAttemptTurnRecord{}, false, conflict("native optional bootstrap requires a completed sealed response")
	}
	if receipt.ProviderRequestID != "" {
		identity := fmt.Sprintf("%s:%d", attemptID, turnIndex)
		result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_provider_requests (
			namespace_id, plan_digest, repository_commit, provider_configuration_id, provider_request_id,
			receipt_kind, receipt_identity, recorded_at
		) VALUES ($1, $2, $3, $4, $5, 'transport', $6, $7) ON CONFLICT DO NOTHING`, authority.NamespaceID,
			partition.PlanDigest, partition.RepositoryCommit, receipt.ProviderConfigurationID, receipt.ProviderRequestID,
			identity, receipt.CompletedAt)
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		inserted, err := result.RowsAffected()
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		if inserted == 0 {
			var kind, existingIdentity, existingCommit string
			if err := tx.QueryRowContext(writeContext, `SELECT receipt_kind, receipt_identity, repository_commit
				FROM agent_evaluation_provider_requests
				WHERE namespace_id = $1 AND plan_digest = $2 AND provider_configuration_id = $3 AND provider_request_id = $4`,
				authority.NamespaceID, partition.PlanDigest, receipt.ProviderConfigurationID, receipt.ProviderRequestID).Scan(
				&kind, &existingIdentity, &existingCommit,
			); err != nil || kind != "transport" || existingIdentity != identity || existingCommit != partition.RepositoryCommit {
				return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport provider request identity was reused")
			}
		}
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_transport_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, turn_index,
		intent_digest, receipt_id, invocation_id, provider_configuration_id, provider_request_id,
		dispatch_state, outcome, response_body_digest, receipt_digest, receipt_json, receipt_bytes,
		started_at, completed_at, closed_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14,
		$15, $16::jsonb, $17, $18, $19, $20) ON CONFLICT DO NOTHING`, authority.NamespaceID,
		partition.PlanDigest, partition.RepositoryCommit, attemptID, descriptorDigest, turnIndex,
		receipt.IntentDigest, receipt.ReceiptID, receipt.InvocationID, receipt.ProviderConfigurationID,
		nullableEvaluationAuthenticityString(receipt.ProviderRequestID), receipt.DispatchState, receipt.Outcome,
		nullableEvaluationAuthenticityString(receipt.ResponseBodyDigest), receipt.ReceiptDigest,
		string(receipt.ReceiptBytes), receipt.ReceiptBytes, receipt.StartedAt, receipt.CompletedAt, closedAt)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted != 1 {
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport receipt identity collided")
	}
	if spool != nil {
		result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_provider_result_spool_receipts (
			namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, turn_index, invocation_id,
			spool_ref, dispatch_intent_digest, transport_receipt_digest, algorithm, encryption_profile_digest,
			key_ref_digest, key_id, key_version, aad_digest, envelope_digest, ciphertext_digest, ciphertext_size_bytes,
			response_body_digest, normalized_event_set_digest, response_digest, opaque_continuation_digest,
			retention_class, retention_policy_digest, receipt_digest, receipt_json, receipt_bytes, created_at, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
			$16, $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27::jsonb, $28, $29, $30)
		ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
			attemptID, descriptorDigest, turnIndex, spoolReceipt.InvocationID, spoolReceipt.SpoolRef,
			spoolReceipt.DispatchIntentDigest, spoolReceipt.TransportReceiptDigest, spoolReceipt.Algorithm,
			spoolReceipt.EncryptionProfileDigest, spoolReceipt.KeyRefDigest, spoolReceipt.KeyID, spoolReceipt.KeyVersion,
			spoolReceipt.AADDigest, spoolReceipt.EnvelopeDigest, spoolReceipt.CiphertextDigest,
			spoolReceipt.CiphertextSizeBytes, spoolReceipt.ResponseBodyDigest, spoolReceipt.NormalizedEventSetDigest,
			spoolReceipt.ResponseDigest, nullableEvaluationAuthenticityString(spoolReceipt.OpaqueContinuationDigest),
			spoolReceipt.RetentionClass, spoolReceipt.RetentionPolicyDigest, spoolReceipt.ReceiptDigest,
			string(spoolReceipt.ReceiptBytes), spoolReceipt.ReceiptBytes, spoolReceipt.CreatedAt, spoolReceipt.ExpiresAt)
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		inserted, err := result.RowsAffected()
		if err != nil || inserted != 1 {
			if err != nil {
				return EvaluationAttemptTurnRecord{}, false, err
			}
			return EvaluationAttemptTurnRecord{}, false, conflict("evaluation result spool receipt identity collided")
		}
		result, err = tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_provider_result_spool_payloads (
			namespace_id, plan_digest, repository_commit, attempt_id, turn_index, spool_ref, key_id, key_version,
			nonce_bytes, authentication_tag_bytes, ciphertext_bytes, ciphertext_digest, ciphertext_size_bytes,
			aad_json, aad_bytes, envelope_json, envelope_bytes, envelope_digest, created_at, expires_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13,
			$14::jsonb, $15, $16::jsonb, $17, $18, $19, $20) ON CONFLICT DO NOTHING`, authority.NamespaceID,
			partition.PlanDigest, partition.RepositoryCommit, attemptID, turnIndex, envelope.SpoolID,
			envelope.KeyID, envelope.KeyVersion, envelope.Nonce, envelope.AuthenticationTag, envelope.Ciphertext,
			envelope.CiphertextDigest, envelope.CiphertextSizeBytes, string(aad.Canonical), aad.Canonical,
			string(envelope.Canonical), envelope.Canonical, envelope.EnvelopeDigest, closedAt, spool.ExpiresAt)
		if err != nil {
			return EvaluationAttemptTurnRecord{}, false, err
		}
		inserted, err = result.RowsAffected()
		if err != nil || inserted != 1 {
			if err != nil {
				return EvaluationAttemptTurnRecord{}, false, err
			}
			return EvaluationAttemptTurnRecord{}, false, conflict("evaluation result spool payload identity collided")
		}
		if nativeOptionalBootstrapIngress != nil {
			descriptor, decodeErr := decodeEvaluationAttemptDescriptor(intent.DescriptorBytes)
			if decodeErr != nil {
				return EvaluationAttemptTurnRecord{}, false, decodeErr
			}
			bootstrap, buildErr := evaluationNativeOptionalBootstrapSourceRecord(
				authority, partition, plan, descriptor, intent, receipt.EvaluationTransportReceiptRecord,
				spoolReceipt, aad, envelope, *nativeOptionalBootstrapIngress, closedAt,
			)
			if buildErr != nil {
				return EvaluationAttemptTurnRecord{}, false, buildErr
			}
			optionalRequest, decodeErr := decodeEvaluationOptionalFactAuthorityRequest(
				bootstrap.OptionalAuthorityRequestBytes,
			)
			if decodeErr != nil {
				return EvaluationAttemptTurnRecord{}, false, decodeErr
			}
			target := evaluationNativeOptionalBootstrapRecordTarget(bootstrap)
			if registrationErr := requireEvaluationRuntimeFactSourceRegistration(
				writeContext, tx, authority, plan, optionalRequest, target,
			); registrationErr != nil {
				return EvaluationAttemptTurnRecord{}, false, registrationErr
			}
			if vaultErr := requireEvaluationNativeProviderStateVaultSeal(
				writeContext, tx, authority, partition, bootstrap, true,
			); vaultErr != nil {
				return EvaluationAttemptTurnRecord{}, false, vaultErr
			}
			if _, insertErr := insertEvaluationNativeOptionalBootstrapSource(writeContext, tx, bootstrap); insertErr != nil {
				return EvaluationAttemptTurnRecord{}, false, insertErr
			}
		}
	}
	turn, err := loadEvaluationAttemptTurn(writeContext, tx, authority.NamespaceID, partition, attemptID, turnIndex)
	if err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	if receipt.Outcome == "completed" && turn.ResultSpoolReceipt == nil || receipt.Outcome != "completed" && turn.ResultSpoolReceipt != nil || closedAt.After(plan.ExpiresAt) {
		return EvaluationAttemptTurnRecord{}, false, conflict("evaluation transport close is incomplete or outside the frozen plan")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationAttemptTurnRecord{}, false, err
	}
	return turn, false, nil
}

func (repository *Repository) ReadEvaluationEncryptedResultSpool(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
	shardID string,
	ownerID string,
	leaseGeneration int64,
	expectedTurnDigest string,
) (EvaluationEncryptedResultSpoolRead, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationEncryptedResultSpoolRead{}, err
	}
	if !validEvaluationServiceIdentity(attemptID) || turnIndex < 0 || !validEvaluationServiceIdentity(shardID) ||
		!validEvaluationServiceIdentity(ownerID) || leaseGeneration < 1 || !evaluationDigestPattern.MatchString(expectedTurnDigest) {
		return EvaluationEncryptedResultSpoolRead{}, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(readContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationEncryptedResultSpoolRead{}, err
	}
	defer func() { _ = tx.Rollback() }()
	turn, err := loadEvaluationAttemptTurn(readContext, tx, authority.NamespaceID, partition, attemptID, turnIndex)
	if err != nil {
		return EvaluationEncryptedResultSpoolRead{}, err
	}
	if turn.State != "closed" || turn.ResultSpoolReceipt == nil || turn.TurnDigest != expectedTurnDigest {
		return EvaluationEncryptedResultSpoolRead{}, conflict("evaluation result spool read fence drifted")
	}
	descriptor, err := decodeEvaluationAttemptDescriptor(turn.DispatchIntent.DescriptorBytes)
	if err != nil || descriptor.ShardID != shardID {
		return EvaluationEncryptedResultSpoolRead{}, conflict("evaluation result spool shard binding drifted")
	}
	var leaseOwner string
	var generation int64
	var leaseExpiry time.Time
	if err := tx.QueryRowContext(readContext, `SELECT owner_id, generation, expires_at
		FROM agent_evaluation_shard_leases
		WHERE namespace_id = $1 AND plan_digest = $2 AND shard_id = $3`,
		authority.NamespaceID, partition.PlanDigest, shardID).Scan(&leaseOwner, &generation, &leaseExpiry); errors.Is(err, sql.ErrNoRows) {
		return EvaluationEncryptedResultSpoolRead{}, ErrNotFound
	} else if err != nil {
		return EvaluationEncryptedResultSpoolRead{}, err
	}
	accessedAt := time.Now().UTC().Truncate(time.Millisecond)
	if leaseOwner != ownerID || generation != leaseGeneration || !leaseExpiry.After(accessedAt) ||
		!turn.ResultSpoolReceipt.ExpiresAt.After(accessedAt) {
		return EvaluationEncryptedResultSpoolRead{}, conflict("evaluation result spool read lease is fenced or expired")
	}
	var dispositionExists bool
	if err := tx.QueryRowContext(readContext, `SELECT EXISTS (
		SELECT 1 FROM agent_evaluation_provider_result_spool_dispositions
		WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3 AND turn_index = $4
	)`, authority.NamespaceID, partition.PlanDigest, attemptID, turnIndex).Scan(&dispositionExists); err != nil {
		return EvaluationEncryptedResultSpoolRead{}, err
	}
	if dispositionExists {
		return EvaluationEncryptedResultSpoolRead{}, conflict("evaluation result spool is already disposed")
	}
	aadBytes, envelopeBytes, err := loadEvaluationProviderResultSpoolPayload(
		readContext, tx, authority.NamespaceID, partition, attemptID, turnIndex,
	)
	if err != nil {
		return EvaluationEncryptedResultSpoolRead{}, err
	}
	var accessBytes []byte
	err = tx.QueryRowContext(readContext, `SELECT receipt_bytes
		FROM agent_evaluation_provider_result_spool_access_receipts
		WHERE namespace_id = $1 AND plan_digest = $2 AND spool_ref = $3 AND owner_id = $4
			AND lease_generation = $5 AND expected_turn_digest = $6 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, turn.ResultSpoolReceipt.SpoolRef, ownerID,
		leaseGeneration, expectedTurnDigest).Scan(&accessBytes)
	if err != nil && !errors.Is(err, sql.ErrNoRows) {
		return EvaluationEncryptedResultSpoolRead{}, err
	}
	if errors.Is(err, sql.ErrNoRows) {
		accessBase := map[string]any{
			"format": evaluationResultSpoolAccessFormat, "version": int64(1),
			"spoolRef": turn.ResultSpoolReceipt.SpoolRef, "spoolReceiptDigest": turn.ResultSpoolReceipt.ReceiptDigest,
			"attemptId": attemptID, "turnIndex": turnIndex, "expectedTurnDigest": expectedTurnDigest,
			"shardId": shardID, "ownerId": ownerID, "leaseGeneration": leaseGeneration,
			"accessedAt": evaluationExportInstant(accessedAt),
		}
		accessDigest, err := canonicaljson.Digest(accessBase)
		if err != nil {
			return EvaluationEncryptedResultSpoolRead{}, err
		}
		accessBase["receiptDigest"] = accessDigest
		accessBytes, err = canonicaljson.Bytes(accessBase)
		if err != nil {
			return EvaluationEncryptedResultSpoolRead{}, err
		}
		if _, err := tx.ExecContext(readContext, `INSERT INTO agent_evaluation_provider_result_spool_access_receipts (
			namespace_id, plan_digest, repository_commit, spool_ref, attempt_id, turn_index,
			expected_turn_digest, shard_id, owner_id, lease_generation, receipt_digest,
			receipt_json, receipt_bytes, accessed_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13, $14)`,
			authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, turn.ResultSpoolReceipt.SpoolRef,
			attemptID, turnIndex, expectedTurnDigest, shardID, ownerID, leaseGeneration,
			accessDigest, string(accessBytes), accessBytes, accessedAt); err != nil {
			return EvaluationEncryptedResultSpoolRead{}, err
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationEncryptedResultSpoolRead{}, err
	}
	return EvaluationEncryptedResultSpoolRead{
		EvaluationEncryptedResultSpool: EvaluationEncryptedResultSpool{
			AAD: aadBytes, Envelope: envelopeBytes, ResponseDigest: turn.ResultSpoolReceipt.ResponseDigest,
			RetentionPolicyDigest: turn.ResultSpoolReceipt.RetentionPolicyDigest,
			ExpiresAt:             turn.ResultSpoolReceipt.ExpiresAt,
		},
		ResultSpoolReceipt: *turn.ResultSpoolReceipt, AccessReceipt: accessBytes,
	}, nil
}

func queryEvaluationTransportDispatchIntents(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationTransportDispatchIntentRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT attempt_id, descriptor_digest, descriptor_bytes, turn_index,
		budget_reservation_id, intent_id, invocation_id, protocol_family, provider_configuration_id,
		model_lineage_digest, inference_configuration_digest, demand_digest,
		request_digest, endpoint_id, endpoint_class, request_body_digest, request_bytes, intent_digest,
		intent_bytes, created_at
	FROM agent_evaluation_transport_dispatch_intents
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	ORDER BY intent_id COLLATE "C"`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationTransportDispatchIntentRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationTransportDispatchIntent(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func queryEvaluationTransportReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationTransportReceiptRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT attempt_id, descriptor_digest, turn_index, intent_digest,
		receipt_id, invocation_id, provider_configuration_id, provider_request_id, dispatch_state, outcome,
		response_body_digest, receipt_digest, receipt_bytes, started_at, completed_at, closed_at
	FROM agent_evaluation_transport_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	ORDER BY receipt_id COLLATE "C"`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationTransportReceiptRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationTransportReceipt(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func queryEvaluationProviderResultSpoolReceipts(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationProviderResultSpoolReceiptRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT attempt_id, descriptor_digest, turn_index, invocation_id, spool_ref,
		dispatch_intent_digest, transport_receipt_digest, algorithm, encryption_profile_digest, key_ref_digest,
		key_id, key_version, aad_digest, envelope_digest, ciphertext_digest, ciphertext_size_bytes,
		response_body_digest, normalized_event_set_digest, response_digest, opaque_continuation_digest,
		retention_class, retention_policy_digest, receipt_digest, receipt_bytes, created_at, expires_at
	FROM agent_evaluation_provider_result_spool_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	ORDER BY spool_ref COLLATE "C"`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationProviderResultSpoolReceiptRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationProviderResultSpoolReceipt(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func scanEvaluationProviderResultSpoolDisposition(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationProviderResultSpoolDispositionRecord, error) {
	var record EvaluationProviderResultSpoolDispositionRecord
	var retainedUntil sql.NullTime
	var source []byte
	if err := scanner.Scan(&record.AttemptID, &record.DescriptorDigest, &record.TurnIndex, &record.InvocationID,
		&record.SpoolRef, &record.SpoolReceiptDigest, &record.Disposition, &record.RetentionPolicyDigest,
		&retainedUntil, &record.DisposedAt, &record.ReceiptDigest, &source); err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, err
	}
	if retainedUntil.Valid {
		value := retainedUntil.Time
		record.RetainedUntil = &value
	}
	decoded, err := decodeEvaluationProviderResultSpoolDisposition(source)
	if err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, fmt.Errorf("decode persisted evaluation spool disposition: %w", err)
	}
	if record.AttemptID != decoded.AttemptID || record.DescriptorDigest != decoded.DescriptorDigest ||
		record.TurnIndex != decoded.TurnIndex || record.InvocationID != decoded.InvocationID || record.SpoolRef != decoded.SpoolRef ||
		record.SpoolReceiptDigest != decoded.SpoolReceiptDigest || record.Disposition != decoded.Disposition ||
		record.RetentionPolicyDigest != decoded.RetentionPolicyDigest || !sameEvaluationOptionalInstant(record.RetainedUntil, decoded.RetainedUntil) ||
		!record.DisposedAt.Equal(decoded.DisposedAt) || record.ReceiptDigest != decoded.ReceiptDigest || !bytes.Equal(source, decoded.ReceiptBytes) {
		return EvaluationProviderResultSpoolDispositionRecord{}, conflict("persisted evaluation spool disposition metadata drifted")
	}
	decoded.NamespaceID = namespaceID
	decoded.ReceiptBytes = append([]byte(nil), source...)
	return decoded, nil
}

func sameEvaluationOptionalInstant(left, right *time.Time) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return left.Equal(*right)
}

func queryEvaluationProviderResultSpoolDispositions(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]EvaluationProviderResultSpoolDispositionRecord, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT attempt_id, descriptor_digest, turn_index, invocation_id,
		spool_ref, spool_receipt_digest, disposition, retention_policy_digest, retained_until,
		disposed_at, receipt_digest, receipt_bytes
	FROM agent_evaluation_provider_result_spool_dispositions
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	ORDER BY spool_ref COLLATE "C"`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationProviderResultSpoolDispositionRecord, 0)
	for rows.Next() {
		record, err := scanEvaluationProviderResultSpoolDisposition(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return records, nil
}

func (repository *Repository) listEvaluationTurnJournalFacts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationTransportDispatchIntentRecord, []EvaluationTransportReceiptRecord,
	[]EvaluationProviderResultSpoolReceiptRecord, []EvaluationProviderResultSpoolDispositionRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	intents, err := queryEvaluationTransportDispatchIntents(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	transports, err := queryEvaluationTransportReceipts(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	spools, err := queryEvaluationProviderResultSpoolReceipts(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	dispositions, err := queryEvaluationProviderResultSpoolDispositions(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, nil, nil, nil, err
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return nil, nil, nil, nil, err
	}
	return intents, transports, spools, dispositions, nil
}

func (repository *Repository) StoreEvaluationProviderResultSpoolDisposition(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationProviderResultSpoolDispositionRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, err
	}
	receipt, err := decodeEvaluationProviderResultSpoolDisposition(receiptBytes)
	if err != nil || receipt.PlanDigest != partition.PlanDigest || receipt.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, _, _, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, err
	}
	spool, err := loadEvaluationProviderResultSpoolReceipt(writeContext, tx, authority.NamespaceID, partition, receipt.AttemptID, receipt.TurnIndex)
	if err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, err
	}
	if receipt.SpoolRef != spool.SpoolRef || receipt.SpoolReceiptDigest != spool.ReceiptDigest ||
		receipt.DescriptorDigest != spool.DescriptorDigest || receipt.InvocationID != spool.InvocationID ||
		receipt.RetentionPolicyDigest != spool.RetentionPolicyDigest || receipt.DisposedAt.Before(spool.CreatedAt) ||
		receipt.DisposedAt.After(spool.ExpiresAt) || receipt.RetainedUntil != nil && receipt.RetainedUntil.After(spool.ExpiresAt) {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, conflict("evaluation spool disposition drifted from its immutable receipt")
	}
	var existing []byte
	err = tx.QueryRowContext(writeContext, `SELECT receipt_bytes FROM agent_evaluation_provider_result_spool_dispositions
		WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3 AND turn_index = $4 FOR SHARE`,
		authority.NamespaceID, partition.PlanDigest, receipt.AttemptID, receipt.TurnIndex).Scan(&existing)
	if err == nil {
		if !bytes.Equal(existing, receipt.ReceiptBytes) {
			return EvaluationProviderResultSpoolDispositionRecord{}, false, conflict("evaluation spool disposition identity was reused")
		}
		receipt.NamespaceID = authority.NamespaceID
		if err := tx.Commit(); err != nil {
			return EvaluationProviderResultSpoolDispositionRecord{}, false, err
		}
		return receipt, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, err
	}
	var payloadExists bool
	if err := tx.QueryRowContext(writeContext, `SELECT EXISTS (SELECT 1 FROM agent_evaluation_provider_result_spool_payloads
		WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3 AND turn_index = $4)`,
		authority.NamespaceID, partition.PlanDigest, receipt.AttemptID, receipt.TurnIndex).Scan(&payloadExists); err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, err
	}
	if !payloadExists {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, conflict("evaluation spool disposition requires its encrypted payload")
	}
	if _, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_provider_result_spool_dispositions (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, turn_index, invocation_id,
		spool_ref, spool_receipt_digest, disposition, retention_policy_digest, retained_until, disposed_at,
		receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb, $16)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, receipt.AttemptID, receipt.DescriptorDigest,
		receipt.TurnIndex, receipt.InvocationID, receipt.SpoolRef, receipt.SpoolReceiptDigest, receipt.Disposition,
		receipt.RetentionPolicyDigest, receipt.RetainedUntil, receipt.DisposedAt, receipt.ReceiptDigest,
		string(receipt.ReceiptBytes), receipt.ReceiptBytes); err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, err
	}
	if receipt.Disposition == "consumed-and-destroyed" {
		result, err := tx.ExecContext(writeContext, `DELETE FROM agent_evaluation_provider_result_spool_payloads
			WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3 AND turn_index = $4`,
			authority.NamespaceID, partition.PlanDigest, receipt.AttemptID, receipt.TurnIndex)
		if err != nil {
			return EvaluationProviderResultSpoolDispositionRecord{}, false, err
		}
		if affected, err := result.RowsAffected(); err != nil || affected != 1 {
			if err != nil {
				return EvaluationProviderResultSpoolDispositionRecord{}, false, err
			}
			return EvaluationProviderResultSpoolDispositionRecord{}, false, conflict("evaluation spool payload destruction lost its fence")
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationProviderResultSpoolDispositionRecord{}, false, err
	}
	receipt.NamespaceID = authority.NamespaceID
	return receipt, false, nil
}
