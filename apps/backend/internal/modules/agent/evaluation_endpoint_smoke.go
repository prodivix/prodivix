package agent

import (
	"bytes"
	"crypto/sha256"
	"encoding/hex"
	"fmt"
	"math/big"
	"regexp"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	maximumEvaluationEndpointSmokeCommitBytes = 67_108_864
	maximumEvaluationEndpointSmokeTargets     = 5
)

const (
	evaluationEndpointSmokeDispatchIntentFormat    = "prodivix.agent-evaluation-endpoint-smoke-dispatch-intent"
	evaluationEndpointSmokeSpoolAADFormat          = "prodivix.agent-evaluation-endpoint-smoke-result-spool-aad"
	evaluationEndpointSmokeSpoolReceiptFormat      = "prodivix.agent-evaluation-endpoint-smoke-result-spool-receipt"
	evaluationEndpointSmokeDispositionFormat       = "prodivix.agent-evaluation-endpoint-smoke-result-spool-disposition-receipt"
	evaluationEndpointSmokeValidationFailureFormat = "prodivix.agent-evaluation-endpoint-smoke-validation-failure-receipt"
	evaluationEndpointSmokeReceiptFormat           = "prodivix.agent-evaluation-endpoint-smoke-receipt"
	evaluationEndpointSmokeReportFormat            = "prodivix.g4-model-evaluation-smoke-qualification"
	evaluationEndpointSmokeValidatorPolicyDigest   = "sha256-c5121d37a55eb840789c67809258f49175337ba632b2fe3c50bef38519b0f01b"
)

type EvaluationEndpointSmokeDispatchIntentRecord struct {
	NamespaceID             string
	PlanDigest              string
	RepositoryCommit        string
	IntentID                string
	SmokeTargetID           string
	SmokeTargetDigest       string
	InvocationID            string
	BudgetReservationID     string
	DemandDigest            string
	ProtocolFamily          string
	ProviderConfigurationID string
	RequestDigest           string
	EndpointID              string
	EndpointClass           string
	RequestBodyDigest       string
	RequestBytes            int64
	IntentDigest            string
	IntentBytes             []byte
	CreatedAt               time.Time
}

type EvaluationEndpointSmokeTransportReceiptRecord struct {
	NamespaceID        string
	PlanDigest         string
	RepositoryCommit   string
	SmokeTargetID      string
	SmokeTargetDigest  string
	InvocationID       string
	IntentDigest       string
	ReceiptID          string
	ReceiptDigest      string
	ReceiptBytes       []byte
	ProviderRequestID  string
	DispatchState      string
	Outcome            string
	ResponseBodyDigest string
	StartedAt          time.Time
	CompletedAt        time.Time
	ClosedAt           time.Time
	TurnDigest         string
}

type EvaluationEndpointSmokeResultSpoolReceiptRecord struct {
	NamespaceID            string
	PlanDigest             string
	RepositoryCommit       string
	SmokeTargetID          string
	SmokeTargetDigest      string
	InvocationID           string
	SpoolRef               string
	DispatchIntentDigest   string
	TransportReceiptDigest string
	EnvelopeDigest         string
	CiphertextDigest       string
	CiphertextSizeBytes    int64
	ReceiptDigest          string
	ReceiptBytes           []byte
	CreatedAt              time.Time
	ExpiresAt              time.Time
}

type EvaluationEndpointSmokeEncryptedResultSpoolRecord struct {
	Receipt       EvaluationEndpointSmokeResultSpoolReceiptRecord
	AADBytes      []byte
	EnvelopeBytes []byte
}

type EvaluationEndpointSmokeResultSpoolDispositionRecord struct {
	NamespaceID           string
	PlanDigest            string
	RepositoryCommit      string
	SmokeTargetID         string
	SmokeTargetDigest     string
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

type EvaluationEndpointSmokeValidationFailureRecord struct {
	NamespaceID            string
	PlanDigest             string
	RepositoryCommit       string
	ReceiptID              string
	SmokeTargetID          string
	SmokeTargetDigest      string
	InvocationID           string
	DispatchIntentDigest   string
	TransportReceiptDigest string
	SpoolReceiptDigest     string
	ValidatorPolicyDigest  string
	ValidationCategory     string
	FindingDigest          string
	ObservedAt             time.Time
	ReceiptDigest          string
	ReceiptBytes           []byte
}

type EvaluationEndpointSmokeTerminalReceiptRecord struct {
	NamespaceID                    string
	PlanDigest                     string
	RepositoryCommit               string
	ReceiptID                      string
	SmokeTargetID                  string
	SmokeTargetDigest              string
	InvocationID                   string
	BudgetReservationID            string
	SettlementDigest               string
	DispatchIntentDigest           string
	TransportReceiptDigest         string
	SpoolReceiptDigest             string
	SpoolDispositionReceiptDigest  string
	ValidationFailureReceiptDigest string
	Outcome                        string
	ReceiptDigest                  string
	ReceiptBytes                   []byte
	StartedAt                      time.Time
	CompletedAt                    time.Time
}

type EvaluationEndpointSmokeJournalTurnRecord struct {
	State              string
	Intent             EvaluationEndpointSmokeDispatchIntentRecord
	TransportReceipt   *EvaluationEndpointSmokeTransportReceiptRecord
	ResultSpoolReceipt *EvaluationEndpointSmokeResultSpoolReceiptRecord
	ClosedAt           *time.Time
	TurnDigest         string
}

type EvaluationEndpointSmokeEvidenceCommitRecord struct {
	NamespaceID         string
	PlanDigest          string
	RepositoryCommit    string
	ConfigurationDigest string
	BudgetReservationID string
	SettlementDigest    string
	ReportDigest        string
	CommitDigest        string
	CommitBytes         []byte
	CommittedAt         time.Time
}

type evaluationEndpointSmokeDispatchIntent struct {
	EvaluationEndpointSmokeDispatchIntentRecord
	Value map[string]any
}

type evaluationEndpointSmokeSpoolAAD struct {
	NamespaceDigest          string
	PlanDigest               string
	RepositoryCommit         string
	SmokeTargetID            string
	SmokeTargetDigest        string
	InvocationID             string
	DispatchIntentDigest     string
	TransportReceiptDigest   string
	ResponseBodyDigest       string
	NormalizedEventSetDigest string
	Digest                   string
	Value                    map[string]any
	Canonical                []byte
}

type evaluationEndpointSmokeSpoolReceipt struct {
	EvaluationEndpointSmokeResultSpoolReceiptRecord
	Algorithm                string
	EncryptionProfileDigest  string
	KeyRefDigest             string
	KeyID                    string
	KeyVersion               int64
	AADDigest                string
	ResponseBodyDigest       string
	NormalizedEventSetDigest string
	ResponseDigest           string
	RetentionPolicyDigest    string
	Value                    map[string]any
}

type evaluationEndpointSmokeDisposition struct {
	EvaluationEndpointSmokeResultSpoolDispositionRecord
	Value map[string]any
}

type evaluationEndpointSmokeValidationFailure struct {
	EvaluationEndpointSmokeValidationFailureRecord
	Value map[string]any
}

type evaluationEndpointSmokeTerminalReceipt struct {
	EvaluationEndpointSmokeTerminalReceiptRecord
	EndpointClass                       string
	ProtocolFamily                      string
	ProviderConfigurationID             string
	ModelID                             string
	ImmutableModelVersion               string
	ModelLineageDigest                  string
	InferenceConfigurationDigest        string
	AdapterDigest                       string
	PricingAuthorityDigest              string
	ResponseSpoolEncryptionPolicyDigest string
	SmokeProfileDigest                  string
	DemandDigest                        string
	RequestDigest                       string
	FailureCategory                     string
	ProviderRequestID                   string
	ResponseHeaderDigest                string
	ResponseDigest                      string
	ResolvedModelID                     string
	ResolvedModelVersion                string
	ResolvedModelIdentityDigest         string
	UsageSourceDigest                   string
	CostSourceDigest                    string
	UsageSourceReceiptDigest            string
	CostSourceReceiptDigest             string
	PricingSnapshotRef                  string
	Usage                               any
	Cost                                any
	Value                               map[string]any
}

type evaluationEndpointSmokeReport struct {
	PlanDigest                             string
	RepositoryCommit                       string
	DispatchIntentSetDigest                string
	TransportReceiptSetDigest              string
	ResultSpoolReceiptSetDigest            string
	ResultSpoolDispositionReceiptSetDigest string
	EndpointSmokeReceiptSetDigest          string
	QualifiedTargetCount                   int64
	BudgetReservationID                    string
	Outcome                                string
	FailureCode                            *string
	CompletedAt                            time.Time
	ReportDigest                           string
	Canonical                              []byte
	Value                                  map[string]any
}

type evaluationEndpointSmokeEvidenceCommit struct {
	ConfigurationDigest string
	PlanDigest          string
	RepositoryCommit    string
	ReservationID       string
	Demand              evaluationBudgetDemand
	DemandBytes         []byte
	DemandDigest        string
	ReservedAt          time.Time
	Settlement          evaluationBudgetSettlement
	SettlementBytes     []byte
	DispatchIntents     []evaluationEndpointSmokeDispatchIntent
	TransportReceipts   []evaluationTransportReceipt
	SpoolReceipts       []evaluationEndpointSmokeSpoolReceipt
	Dispositions        []evaluationEndpointSmokeDisposition
	ValidationFailures  []evaluationEndpointSmokeValidationFailure
	TerminalReceipts    []evaluationEndpointSmokeTerminalReceipt
	SourceReceipts      []evaluationSourceReceipt
	Report              evaluationEndpointSmokeReport
	CommitDigest        string
	Canonical           []byte
	Value               map[string]any
}

func decodeEvaluationEndpointSmokeDispatchIntent(source []byte) (evaluationEndpointSmokeDispatchIntent, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationAuthenticityFactBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "intentId", "planDigest", "repositoryCommit", "smokeTargetId", "smokeTargetDigest",
		"endpointClass", "protocolFamily", "providerConfigurationId", "modelId", "immutableModelVersion",
		"modelLineageDigest", "inferenceConfigurationDigest", "adapterDigest", "pricingAuthorityDigest",
		"responseSpoolEncryptionPolicyDigest", "smokeProfileDigest", "invocationId", "budgetReservationId",
		"demandDigest", "requestDigest", "endpointId", "requestBodyDigest", "requestBytes", "createdAt", "intentDigest",
	}) || value["format"] != evaluationEndpointSmokeDispatchIntentFormat {
		return evaluationEndpointSmokeDispatchIntent{}, invalid("evaluation endpoint smoke dispatch intent is invalid")
	}
	version, versionOK := integerMember(value, "version")
	requestBytes, bytesErr := evaluationCount(value["requestBytes"], "evaluation endpoint smoke request bytes")
	createdAt, timeErr := evaluationInstant(value["createdAt"], "evaluation endpoint smoke dispatch time")
	if !versionOK || version != 1 || bytesErr != nil || requestBytes < 1 || requestBytes > maximumEvaluationSpoolCiphertextBytes ||
		timeErr != nil || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!oneOfString(stringMember(value, "endpointClass"), "first-party-hosted", "aggregator", "self-hosted", "local") ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
		!evaluationCanonicalObjectDigest(value, "intentDigest") {
		return evaluationEndpointSmokeDispatchIntent{}, invalid("evaluation endpoint smoke dispatch intent authority is invalid")
	}
	for _, field := range []string{"intentId", "smokeTargetId", "providerConfigurationId", "modelId", "immutableModelVersion", "invocationId", "budgetReservationId", "endpointId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationEndpointSmokeDispatchIntent{}, err
		}
	}
	for _, field := range []string{"planDigest", "smokeTargetDigest", "modelLineageDigest", "inferenceConfigurationDigest", "adapterDigest", "pricingAuthorityDigest", "responseSpoolEncryptionPolicyDigest", "smokeProfileDigest", "demandDigest", "requestDigest", "requestBodyDigest", "intentDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationEndpointSmokeDispatchIntent{}, err
		}
	}
	return evaluationEndpointSmokeDispatchIntent{EvaluationEndpointSmokeDispatchIntentRecord: EvaluationEndpointSmokeDispatchIntentRecord{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		IntentID: stringMember(value, "intentId"), SmokeTargetID: stringMember(value, "smokeTargetId"),
		SmokeTargetDigest: stringMember(value, "smokeTargetDigest"), InvocationID: stringMember(value, "invocationId"),
		BudgetReservationID: stringMember(value, "budgetReservationId"), DemandDigest: stringMember(value, "demandDigest"),
		ProtocolFamily: stringMember(value, "protocolFamily"), ProviderConfigurationID: stringMember(value, "providerConfigurationId"),
		RequestDigest: stringMember(value, "requestDigest"), EndpointID: stringMember(value, "endpointId"),
		EndpointClass: stringMember(value, "endpointClass"), RequestBodyDigest: stringMember(value, "requestBodyDigest"),
		RequestBytes: requestBytes, IntentDigest: stringMember(value, "intentDigest"), IntentBytes: canonical, CreatedAt: createdAt,
	}, Value: value}, nil
}

func decodeEvaluationEndpointSmokeSpoolAAD(source []byte) (evaluationEndpointSmokeSpoolAAD, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationServiceControlBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceDigest", "planDigest", "repositoryCommit", "smokeTargetId", "smokeTargetDigest",
		"invocationId", "dispatchIntentDigest", "transportReceiptDigest", "responseBodyDigest", "normalizedEventSetDigest",
	}) || value["format"] != evaluationEndpointSmokeSpoolAADFormat {
		return evaluationEndpointSmokeSpoolAAD{}, invalid("evaluation endpoint smoke result spool AAD is invalid")
	}
	version, ok := integerMember(value, "version")
	if !ok || version != 1 || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationEndpointSmokeSpoolAAD{}, invalid("evaluation endpoint smoke result spool AAD partition is invalid")
	}
	for _, field := range []string{"smokeTargetId", "invocationId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationEndpointSmokeSpoolAAD{}, err
		}
	}
	for _, field := range []string{"namespaceDigest", "planDigest", "smokeTargetDigest", "dispatchIntentDigest", "transportReceiptDigest", "responseBodyDigest", "normalizedEventSetDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationEndpointSmokeSpoolAAD{}, err
		}
	}
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		return evaluationEndpointSmokeSpoolAAD{}, err
	}
	return evaluationEndpointSmokeSpoolAAD{
		NamespaceDigest: stringMember(value, "namespaceDigest"), PlanDigest: stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), SmokeTargetID: stringMember(value, "smokeTargetId"),
		SmokeTargetDigest: stringMember(value, "smokeTargetDigest"), InvocationID: stringMember(value, "invocationId"),
		DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"), TransportReceiptDigest: stringMember(value, "transportReceiptDigest"),
		ResponseBodyDigest: stringMember(value, "responseBodyDigest"), NormalizedEventSetDigest: stringMember(value, "normalizedEventSetDigest"),
		Digest: digest, Value: value, Canonical: canonical,
	}, nil
}

func evaluationEndpointSmokeSpoolID(aad evaluationEndpointSmokeSpoolAAD) (string, error) {
	digest, err := canonicaljson.Digest(map[string]any{
		"planDigest": aad.PlanDigest, "repositoryCommit": aad.RepositoryCommit, "smokeTargetId": aad.SmokeTargetID,
		"smokeTargetDigest": aad.SmokeTargetDigest, "invocationId": aad.InvocationID,
		"dispatchIntentDigest": aad.DispatchIntentDigest, "transportReceiptDigest": aad.TransportReceiptDigest,
	})
	if err != nil {
		return "", err
	}
	return "endpoint-smoke-result-spool:" + digest[len("sha256-"):], nil
}

func decodeEvaluationEndpointSmokeSpoolReceipt(source []byte) (evaluationEndpointSmokeSpoolReceipt, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationAuthenticityFactBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "spoolRef", "planDigest", "repositoryCommit", "smokeTargetId", "smokeTargetDigest", "invocationId",
		"dispatchIntentDigest", "transportReceiptDigest", "algorithm", "encryptionProfileDigest", "keyRefDigest", "keyId",
		"keyVersion", "aadDigest", "envelopeDigest", "ciphertextDigest", "ciphertextSizeBytes", "responseBodyDigest",
		"normalizedEventSetDigest", "responseDigest", "retentionClass", "retentionPolicyDigest", "createdAt", "expiresAt", "receiptDigest",
	}) || value["format"] != evaluationEndpointSmokeSpoolReceiptFormat || stringMember(value, "algorithm") != "aes-256-gcm" ||
		stringMember(value, "retentionClass") != "endpoint-smoke-resume-only" {
		return evaluationEndpointSmokeSpoolReceipt{}, invalid("evaluation endpoint smoke result spool receipt is invalid")
	}
	version, versionOK := integerMember(value, "version")
	keyVersion, keyErr := evaluationCount(value["keyVersion"], "evaluation endpoint smoke spool key version")
	ciphertextSize, sizeErr := evaluationCount(value["ciphertextSizeBytes"], "evaluation endpoint smoke spool ciphertext size")
	createdAt, createdErr := evaluationInstant(value["createdAt"], "evaluation endpoint smoke spool creation")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "evaluation endpoint smoke spool expiry")
	if !versionOK || version != 1 || keyErr != nil || keyVersion < 1 || sizeErr != nil || ciphertextSize < 1 ||
		ciphertextSize > maximumEvaluationSpoolCiphertextBytes || createdErr != nil || expiresErr != nil || !expiresAt.After(createdAt) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) || !evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return evaluationEndpointSmokeSpoolReceipt{}, invalid("evaluation endpoint smoke result spool receipt authority is invalid")
	}
	for _, field := range []string{"spoolRef", "smokeTargetId", "invocationId", "keyId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationEndpointSmokeSpoolReceipt{}, err
		}
	}
	for _, field := range []string{"planDigest", "smokeTargetDigest", "dispatchIntentDigest", "transportReceiptDigest", "encryptionProfileDigest", "keyRefDigest", "aadDigest", "envelopeDigest", "ciphertextDigest", "responseBodyDigest", "normalizedEventSetDigest", "responseDigest", "retentionPolicyDigest", "receiptDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationEndpointSmokeSpoolReceipt{}, err
		}
	}
	return evaluationEndpointSmokeSpoolReceipt{EvaluationEndpointSmokeResultSpoolReceiptRecord: EvaluationEndpointSmokeResultSpoolReceiptRecord{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		SmokeTargetID: stringMember(value, "smokeTargetId"), SmokeTargetDigest: stringMember(value, "smokeTargetDigest"),
		InvocationID: stringMember(value, "invocationId"), SpoolRef: stringMember(value, "spoolRef"),
		DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"), TransportReceiptDigest: stringMember(value, "transportReceiptDigest"),
		EnvelopeDigest: stringMember(value, "envelopeDigest"), CiphertextDigest: stringMember(value, "ciphertextDigest"),
		CiphertextSizeBytes: ciphertextSize, ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: canonical,
		CreatedAt: createdAt, ExpiresAt: expiresAt,
	}, Algorithm: "aes-256-gcm", EncryptionProfileDigest: stringMember(value, "encryptionProfileDigest"),
		KeyRefDigest: stringMember(value, "keyRefDigest"), KeyID: stringMember(value, "keyId"), KeyVersion: keyVersion,
		AADDigest: stringMember(value, "aadDigest"), ResponseBodyDigest: stringMember(value, "responseBodyDigest"),
		NormalizedEventSetDigest: stringMember(value, "normalizedEventSetDigest"), ResponseDigest: stringMember(value, "responseDigest"),
		RetentionPolicyDigest: stringMember(value, "retentionPolicyDigest"), Value: value,
	}, nil
}

func decodeEvaluationEndpointSmokeDisposition(source []byte) (evaluationEndpointSmokeDisposition, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationAuthenticityFactBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "spoolRef", "spoolReceiptDigest", "planDigest", "repositoryCommit", "smokeTargetId",
		"smokeTargetDigest", "invocationId", "disposition", "retentionPolicyDigest", "disposedAt", "receiptDigest",
	}, "retainedUntil") || value["format"] != evaluationEndpointSmokeDispositionFormat {
		return evaluationEndpointSmokeDisposition{}, invalid("evaluation endpoint smoke spool disposition is invalid")
	}
	version, versionOK := integerMember(value, "version")
	disposedAt, disposedErr := evaluationInstant(value["disposedAt"], "evaluation endpoint smoke spool disposition")
	var retainedUntil *time.Time
	if raw, exists := value["retainedUntil"]; exists {
		parsed, err := evaluationInstant(raw, "evaluation endpoint smoke retained-until")
		if err != nil {
			return evaluationEndpointSmokeDisposition{}, err
		}
		retainedUntil = &parsed
	}
	disposition := stringMember(value, "disposition")
	if !versionOK || version != 1 || disposedErr != nil || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!oneOfString(disposition, "consumed-and-destroyed", "retained-encrypted") ||
		((disposition == "retained-encrypted") != (retainedUntil != nil)) || (retainedUntil != nil && !retainedUntil.After(disposedAt)) ||
		!evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return evaluationEndpointSmokeDisposition{}, invalid("evaluation endpoint smoke spool disposition authority is invalid")
	}
	for _, field := range []string{"spoolRef", "smokeTargetId", "invocationId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationEndpointSmokeDisposition{}, err
		}
	}
	for _, field := range []string{"spoolReceiptDigest", "planDigest", "smokeTargetDigest", "retentionPolicyDigest", "receiptDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationEndpointSmokeDisposition{}, err
		}
	}
	return evaluationEndpointSmokeDisposition{EvaluationEndpointSmokeResultSpoolDispositionRecord: EvaluationEndpointSmokeResultSpoolDispositionRecord{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		SmokeTargetID: stringMember(value, "smokeTargetId"), SmokeTargetDigest: stringMember(value, "smokeTargetDigest"),
		InvocationID: stringMember(value, "invocationId"), SpoolRef: stringMember(value, "spoolRef"),
		SpoolReceiptDigest: stringMember(value, "spoolReceiptDigest"), Disposition: disposition,
		RetentionPolicyDigest: stringMember(value, "retentionPolicyDigest"), RetainedUntil: retainedUntil,
		DisposedAt: disposedAt, ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: canonical,
	}, Value: value}, nil
}

func decodeEvaluationEndpointSmokeValidationFailure(source []byte) (evaluationEndpointSmokeValidationFailure, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationAuthenticityFactBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "receiptId", "planDigest", "repositoryCommit", "smokeTargetId", "smokeTargetDigest",
		"invocationId", "dispatchIntentDigest", "transportReceiptDigest", "spoolReceiptDigest", "validatorPolicyDigest",
		"validationCategory", "findingDigest", "observedAt", "receiptDigest",
	}) || value["format"] != evaluationEndpointSmokeValidationFailureFormat {
		return evaluationEndpointSmokeValidationFailure{}, invalid("evaluation endpoint smoke validation-failure receipt is invalid")
	}
	version, versionOK := integerMember(value, "version")
	observedAt, observedErr := evaluationInstant(value["observedAt"], "evaluation endpoint smoke validation-failure observation")
	if !versionOK || version != 1 || observedErr != nil ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		stringMember(value, "validatorPolicyDigest") != evaluationEndpointSmokeValidatorPolicyDigest ||
		!oneOfString(stringMember(value, "validationCategory"), "expected-output-mismatch", "normalized-result-contract-invalid") ||
		!evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return evaluationEndpointSmokeValidationFailure{}, invalid("evaluation endpoint smoke validation-failure authority is invalid")
	}
	for _, field := range []string{"receiptId", "smokeTargetId", "invocationId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationEndpointSmokeValidationFailure{}, err
		}
	}
	for _, field := range []string{
		"planDigest", "smokeTargetDigest", "dispatchIntentDigest", "transportReceiptDigest", "spoolReceiptDigest",
		"validatorPolicyDigest", "findingDigest", "receiptDigest",
	} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationEndpointSmokeValidationFailure{}, err
		}
	}
	return evaluationEndpointSmokeValidationFailure{
		EvaluationEndpointSmokeValidationFailureRecord: EvaluationEndpointSmokeValidationFailureRecord{
			PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
			ReceiptID: stringMember(value, "receiptId"), SmokeTargetID: stringMember(value, "smokeTargetId"),
			SmokeTargetDigest: stringMember(value, "smokeTargetDigest"), InvocationID: stringMember(value, "invocationId"),
			DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"), TransportReceiptDigest: stringMember(value, "transportReceiptDigest"),
			SpoolReceiptDigest: stringMember(value, "spoolReceiptDigest"), ValidatorPolicyDigest: stringMember(value, "validatorPolicyDigest"),
			ValidationCategory: stringMember(value, "validationCategory"), FindingDigest: stringMember(value, "findingDigest"),
			ObservedAt: observedAt, ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: canonical,
		},
		Value: value,
	}, nil
}

func decodeEvaluationEndpointSmokeTerminalReceipt(source []byte) (evaluationEndpointSmokeTerminalReceipt, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationAuthenticityFactBytes)
	required := []string{"format", "version", "receiptId", "planDigest", "repositoryCommit", "smokeTargetId", "smokeTargetDigest",
		"endpointClass", "protocolFamily", "providerConfigurationId", "modelId", "immutableModelVersion", "modelLineageDigest",
		"inferenceConfigurationDigest", "adapterDigest", "pricingAuthorityDigest", "responseSpoolEncryptionPolicyDigest", "smokeProfileDigest",
		"invocationId", "budgetReservationId", "demandDigest", "settlementDigest", "dispatchIntentDigest", "transportReceiptDigest",
		"requestDigest", "outcome", "startedAt", "completedAt", "receiptDigest"}
	optional := []string{"failureCategory", "providerRequestId", "responseHeaderDigest", "responseDigest", "resolvedModelId", "resolvedModelVersion",
		"resolvedModelIdentityDigest", "spoolReceiptDigest", "spoolDispositionReceiptDigest", "usage", "cost", "usageSourceDigest",
		"costSourceDigest", "usageSourceReceiptDigest", "costSourceReceiptDigest", "pricingSnapshotRef", "validationFailureReceiptDigest"}
	if err != nil || !exactEvaluationKeys(value, required, optional...) || value["format"] != evaluationEndpointSmokeReceiptFormat {
		return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke terminal receipt is invalid")
	}
	version, versionOK := integerMember(value, "version")
	startedAt, startErr := evaluationInstant(value["startedAt"], "evaluation endpoint smoke receipt start")
	completedAt, completeErr := evaluationInstant(value["completedAt"], "evaluation endpoint smoke receipt completion")
	outcome := stringMember(value, "outcome")
	if !versionOK || version != 1 || startErr != nil || completeErr != nil || completedAt.Before(startedAt) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!oneOfString(stringMember(value, "endpointClass"), "first-party-hosted", "aggregator", "self-hosted", "local") ||
		!oneOfString(stringMember(value, "protocolFamily"), "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
		!oneOfString(outcome, "passed", "failed") || !evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke terminal receipt authority is invalid")
	}
	for _, field := range []string{"receiptId", "smokeTargetId", "providerConfigurationId", "modelId", "immutableModelVersion", "invocationId", "budgetReservationId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationEndpointSmokeTerminalReceipt{}, err
		}
	}
	for _, field := range []string{"planDigest", "smokeTargetDigest", "modelLineageDigest", "inferenceConfigurationDigest", "adapterDigest", "pricingAuthorityDigest", "responseSpoolEncryptionPolicyDigest", "smokeProfileDigest", "demandDigest", "settlementDigest", "dispatchIntentDigest", "transportReceiptDigest", "requestDigest", "receiptDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationEndpointSmokeTerminalReceipt{}, err
		}
	}
	for _, field := range []string{"responseHeaderDigest", "responseDigest", "resolvedModelIdentityDigest", "spoolReceiptDigest", "spoolDispositionReceiptDigest", "usageSourceDigest", "costSourceDigest", "usageSourceReceiptDigest", "costSourceReceiptDigest", "validationFailureReceiptDigest"} {
		if _, err := optionalEvaluationAuthenticityDigest(value, field); err != nil {
			return evaluationEndpointSmokeTerminalReceipt{}, err
		}
	}
	for _, field := range []string{"providerRequestId", "resolvedModelId", "resolvedModelVersion", "pricingSnapshotRef"} {
		if _, err := optionalEvaluationAuthenticityIdentity(value, field); err != nil {
			return evaluationEndpointSmokeTerminalReceipt{}, err
		}
	}
	presence := func(fields ...string) (bool, bool) {
		count := 0
		for _, field := range fields {
			if _, exists := value[field]; exists {
				count++
			}
		}
		return count == len(fields), count == 0
	}
	hasResponse, noResponse := presence("providerRequestId", "responseHeaderDigest", "responseDigest")
	hasModel, noModel := presence("resolvedModelId", "resolvedModelIdentityDigest")
	hasSpool, noSpool := presence("spoolReceiptDigest", "spoolDispositionReceiptDigest")
	hasUsage, noUsage := presence("usage", "usageSourceDigest", "usageSourceReceiptDigest")
	hasCost, noCost := presence("cost", "costSourceDigest", "costSourceReceiptDigest")
	if !(hasResponse || noResponse) || !(hasModel || noModel) || !(hasSpool || noSpool) ||
		!(hasUsage || noUsage) || !(hasCost || noCost) || hasCost && !hasUsage {
		return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke terminal receipt optional authority is incomplete")
	}
	usageSourceDigest, costSourceDigest := "", ""
	if hasUsage {
		usageSourceDigest, err = evaluationAuthenticityUsageSourceDigest(value["usage"], outcome == "passed")
		if err != nil || usageSourceDigest != stringMember(value, "usageSourceDigest") {
			return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke usage authority drifted")
		}
	}
	if hasCost {
		costSourceDigest, err = evaluationAuthenticityCostSourceDigest(value["cost"], outcome == "passed")
		if err != nil || costSourceDigest != stringMember(value, "costSourceDigest") {
			return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke cost authority drifted")
		}
	} else if _, exists := value["pricingSnapshotRef"]; exists {
		return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke pricing reference has no accounting authority")
	}
	resolvedModelID, resolvedModelVersion := stringMember(value, "resolvedModelId"), stringMember(value, "resolvedModelVersion")
	if hasModel {
		identity := map[string]any{
			"protocolFamily": value["protocolFamily"], "transportReceiptDigest": value["transportReceiptDigest"],
			"frozenModelId": value["modelId"], "frozenImmutableModelVersion": value["immutableModelVersion"],
			"resolvedModelId": value["resolvedModelId"],
		}
		if resolvedModelVersion != "" {
			identity["resolvedModelVersion"] = resolvedModelVersion
		}
		digest, digestErr := canonicaljson.Digest(identity)
		if digestErr != nil || digest != stringMember(value, "resolvedModelIdentityDigest") {
			return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke resolved model identity drifted")
		}
	}
	failureCategory := stringMember(value, "failureCategory")
	modelMatches := resolvedModelID == stringMember(value, "modelId") &&
		(stringMember(value, "protocolFamily") == "gemini-interactions" && resolvedModelVersion == stringMember(value, "immutableModelVersion") ||
			stringMember(value, "protocolFamily") != "gemini-interactions" && stringMember(value, "modelId") == stringMember(value, "immutableModelVersion") &&
				(resolvedModelVersion == "" || resolvedModelVersion == stringMember(value, "immutableModelVersion")))
	if outcome == "passed" {
		if _, exists := value["failureCategory"]; exists || stringMember(value, "validationFailureReceiptDigest") != "" ||
			!hasResponse || !hasModel || !hasSpool || !hasUsage || !hasCost || !modelMatches {
			return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke passed receipt is incomplete")
		}
	} else {
		if !oneOfString(failureCategory, "transport-not-dispatched", "transport-post-dispatch-unknown", "transport-failed", "provider-response-invalid", "model-identity-drift", "usage-unavailable", "cost-unavailable") ||
			(oneOfString(failureCategory, "transport-not-dispatched", "transport-post-dispatch-unknown") && (!noResponse || !noModel || !noSpool || !noUsage || !noCost)) ||
			(failureCategory == "provider-response-invalid" && (!hasResponse || !hasSpool || !noUsage || !noCost || stringMember(value, "validationFailureReceiptDigest") == "")) ||
			(failureCategory != "provider-response-invalid" && stringMember(value, "validationFailureReceiptDigest") != "") ||
			(failureCategory == "model-identity-drift" && (!hasModel || modelMatches)) ||
			(failureCategory == "usage-unavailable" && (!hasResponse || !hasModel || !hasSpool || !noUsage || !noCost)) ||
			(failureCategory == "cost-unavailable" && (!hasResponse || !hasModel || !hasSpool || !hasUsage || !noCost)) {
			return evaluationEndpointSmokeTerminalReceipt{}, invalid("evaluation endpoint smoke failed receipt classification is invalid")
		}
	}
	return evaluationEndpointSmokeTerminalReceipt{EvaluationEndpointSmokeTerminalReceiptRecord: EvaluationEndpointSmokeTerminalReceiptRecord{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		ReceiptID: stringMember(value, "receiptId"), SmokeTargetID: stringMember(value, "smokeTargetId"),
		SmokeTargetDigest: stringMember(value, "smokeTargetDigest"), InvocationID: stringMember(value, "invocationId"),
		BudgetReservationID: stringMember(value, "budgetReservationId"), SettlementDigest: stringMember(value, "settlementDigest"),
		DispatchIntentDigest: stringMember(value, "dispatchIntentDigest"), TransportReceiptDigest: stringMember(value, "transportReceiptDigest"),
		SpoolReceiptDigest: stringMember(value, "spoolReceiptDigest"), SpoolDispositionReceiptDigest: stringMember(value, "spoolDispositionReceiptDigest"),
		ValidationFailureReceiptDigest: stringMember(value, "validationFailureReceiptDigest"),
		Outcome:                        outcome, ReceiptDigest: stringMember(value, "receiptDigest"), ReceiptBytes: canonical, StartedAt: startedAt, CompletedAt: completedAt,
	}, EndpointClass: stringMember(value, "endpointClass"), ProtocolFamily: stringMember(value, "protocolFamily"),
		ProviderConfigurationID: stringMember(value, "providerConfigurationId"), ModelID: stringMember(value, "modelId"),
		ImmutableModelVersion: stringMember(value, "immutableModelVersion"), ModelLineageDigest: stringMember(value, "modelLineageDigest"),
		InferenceConfigurationDigest: stringMember(value, "inferenceConfigurationDigest"), AdapterDigest: stringMember(value, "adapterDigest"),
		PricingAuthorityDigest: stringMember(value, "pricingAuthorityDigest"), ResponseSpoolEncryptionPolicyDigest: stringMember(value, "responseSpoolEncryptionPolicyDigest"),
		SmokeProfileDigest: stringMember(value, "smokeProfileDigest"), DemandDigest: stringMember(value, "demandDigest"),
		RequestDigest: stringMember(value, "requestDigest"), FailureCategory: failureCategory,
		ProviderRequestID: stringMember(value, "providerRequestId"), ResponseHeaderDigest: stringMember(value, "responseHeaderDigest"),
		ResponseDigest: stringMember(value, "responseDigest"), ResolvedModelID: resolvedModelID, ResolvedModelVersion: resolvedModelVersion,
		ResolvedModelIdentityDigest: stringMember(value, "resolvedModelIdentityDigest"), UsageSourceDigest: usageSourceDigest,
		CostSourceDigest: costSourceDigest, UsageSourceReceiptDigest: stringMember(value, "usageSourceReceiptDigest"),
		CostSourceReceiptDigest: stringMember(value, "costSourceReceiptDigest"), PricingSnapshotRef: stringMember(value, "pricingSnapshotRef"),
		Usage: value["usage"], Cost: value["cost"], Value: value,
	}, nil
}

func decodeEvaluationEndpointSmokeReport(source []byte) (evaluationEndpointSmokeReport, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationAuthenticityFactBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "planDigest", "repositoryCommit", "endpointSmokeDispatchIntentSetDigest",
		"endpointSmokeTransportReceiptSetDigest", "endpointSmokeResultSpoolReceiptSetDigest",
		"endpointSmokeResultSpoolDispositionReceiptSetDigest", "endpointSmokeReceiptSetDigest", "qualifiedTargetCount",
		"budgetReservationId", "outcome", "failureCode", "completedAt", "reportDigest",
	}) || value["format"] != evaluationEndpointSmokeReportFormat {
		return evaluationEndpointSmokeReport{}, invalid("evaluation endpoint smoke qualification report is invalid")
	}
	version, versionOK := integerMember(value, "version")
	qualified, countErr := evaluationCount(value["qualifiedTargetCount"], "evaluation endpoint smoke qualified target count")
	completedAt, timeErr := evaluationInstant(value["completedAt"], "evaluation endpoint smoke report completion")
	outcome := stringMember(value, "outcome")
	var failureCode *string
	if value["failureCode"] != nil {
		text, ok := value["failureCode"].(string)
		if !ok || !evaluationFailureCodePattern.MatchString(text) {
			return evaluationEndpointSmokeReport{}, invalid("evaluation endpoint smoke failure code is invalid")
		}
		failureCode = &text
	}
	if !versionOK || version != 2 || countErr != nil || qualified > maximumEvaluationEndpointSmokeTargets || timeErr != nil ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) || !oneOfString(outcome, "completed", "failed") ||
		((outcome == "completed") != (failureCode == nil)) || (outcome == "completed" && qualified != maximumEvaluationEndpointSmokeTargets) ||
		!evaluationCanonicalObjectDigest(value, "reportDigest") {
		return evaluationEndpointSmokeReport{}, invalid("evaluation endpoint smoke qualification report authority is invalid")
	}
	if _, err := evaluationAuthenticityIdentity(value["budgetReservationId"], "budget reservation id"); err != nil {
		return evaluationEndpointSmokeReport{}, err
	}
	for _, field := range []string{"planDigest", "endpointSmokeDispatchIntentSetDigest", "endpointSmokeTransportReceiptSetDigest", "endpointSmokeResultSpoolReceiptSetDigest", "endpointSmokeResultSpoolDispositionReceiptSetDigest", "endpointSmokeReceiptSetDigest", "reportDigest"} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationEndpointSmokeReport{}, err
		}
	}
	return evaluationEndpointSmokeReport{
		PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		DispatchIntentSetDigest:                stringMember(value, "endpointSmokeDispatchIntentSetDigest"),
		TransportReceiptSetDigest:              stringMember(value, "endpointSmokeTransportReceiptSetDigest"),
		ResultSpoolReceiptSetDigest:            stringMember(value, "endpointSmokeResultSpoolReceiptSetDigest"),
		ResultSpoolDispositionReceiptSetDigest: stringMember(value, "endpointSmokeResultSpoolDispositionReceiptSetDigest"),
		EndpointSmokeReceiptSetDigest:          stringMember(value, "endpointSmokeReceiptSetDigest"), QualifiedTargetCount: qualified,
		BudgetReservationID: stringMember(value, "budgetReservationId"), Outcome: outcome, FailureCode: failureCode,
		CompletedAt: completedAt, ReportDigest: stringMember(value, "reportDigest"), Canonical: canonical, Value: value,
	}, nil
}

var evaluationFailureCodePattern = regexp.MustCompile(`^[a-z0-9][a-z0-9-]{0,127}$`)

func canonicalEvaluationNestedObject(value any, maximum int) ([]byte, error) {
	object, ok := value.(map[string]any)
	if !ok {
		return nil, invalid("evaluation endpoint smoke nested object is invalid")
	}
	canonical, err := canonicaljson.Bytes(object)
	if err != nil || len(canonical) < 1 || len(canonical) > maximum {
		return nil, invalid("evaluation endpoint smoke nested object exceeds its byte limit")
	}
	return canonical, nil
}

func decodeEvaluationEndpointSmokeArray[T any](raw any, maximum int, decode func([]byte) (T, error)) ([]T, error) {
	values, ok := raw.([]any)
	if !ok || len(values) > maximum {
		return nil, invalid("evaluation endpoint smoke evidence array is invalid")
	}
	result := make([]T, 0, len(values))
	for _, rawValue := range values {
		canonical, err := canonicaljson.Bytes(rawValue)
		if err != nil || len(canonical) > maximumEvaluationAuthenticityFactBytes {
			return nil, invalid("evaluation endpoint smoke evidence member is invalid")
		}
		decoded, err := decode(canonical)
		if err != nil {
			return nil, err
		}
		result = append(result, decoded)
	}
	return result, nil
}

func decodeEvaluationEndpointSmokeCommit(source []byte) (evaluationEndpointSmokeEvidenceCommit, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationEndpointSmokeCommitBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"configurationDigest", "planDigest", "repositoryCommit", "reservation", "settlement", "dispatchIntents",
		"transportReceipts", "resultSpoolReceipts", "resultSpoolDispositionReceipts", "endpointSmokeReceipts",
		"validationFailureReceipts", "sourceReceipts", "report",
	}) {
		return evaluationEndpointSmokeEvidenceCommit{}, invalid("evaluation endpoint smoke evidence commit is invalid")
	}
	configurationDigest, err := evaluationAuthenticityDigest(value["configurationDigest"], "configuration digest")
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	planDigest, err := evaluationAuthenticityDigest(value["planDigest"], "plan digest")
	if err != nil || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationEndpointSmokeEvidenceCommit{}, invalid("evaluation endpoint smoke evidence partition is invalid")
	}
	reservation, ok := value["reservation"].(map[string]any)
	if !ok || !exactEvaluationKeys(reservation, []string{"reservationId", "demand", "demandDigest", "reservedAt", "status", "settlement"}) || stringMember(reservation, "status") != "settled" {
		return evaluationEndpointSmokeEvidenceCommit{}, invalid("evaluation endpoint smoke settled reservation is invalid")
	}
	reservationID, err := evaluationAuthenticityIdentity(reservation["reservationId"], "reservation id")
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	demandBytes, err := canonicalEvaluationNestedObject(reservation["demand"], maximumEvaluationBudgetFactBytes)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	demand, err := decodeEvaluationBudgetDemand(demandBytes, true)
	if err != nil || demand.Digest != stringMember(reservation, "demandDigest") {
		return evaluationEndpointSmokeEvidenceCommit{}, invalid("evaluation endpoint smoke reservation demand drifted")
	}
	reservedAt, err := evaluationInstant(reservation["reservedAt"], "evaluation endpoint smoke reservation time")
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	settlementBytes, err := canonicalEvaluationNestedObject(value["settlement"], maximumEvaluationBudgetFactBytes)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	reservationSettlementBytes, err := canonicalEvaluationNestedObject(reservation["settlement"], maximumEvaluationBudgetFactBytes)
	if err != nil || !bytes.Equal(settlementBytes, reservationSettlementBytes) {
		return evaluationEndpointSmokeEvidenceCommit{}, invalid("evaluation endpoint smoke reservation settlement drifted")
	}
	settlement, err := decodeEvaluationBudgetSettlement(settlementBytes, demand, reservedAt)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	dispatches, err := decodeEvaluationEndpointSmokeArray(value["dispatchIntents"], maximumEvaluationEndpointSmokeTargets, decodeEvaluationEndpointSmokeDispatchIntent)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	transports, err := decodeEvaluationEndpointSmokeArray(value["transportReceipts"], maximumEvaluationEndpointSmokeTargets, decodeEvaluationTransportReceipt)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	spools, err := decodeEvaluationEndpointSmokeArray(value["resultSpoolReceipts"], maximumEvaluationEndpointSmokeTargets, decodeEvaluationEndpointSmokeSpoolReceipt)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	dispositions, err := decodeEvaluationEndpointSmokeArray(value["resultSpoolDispositionReceipts"], maximumEvaluationEndpointSmokeTargets, decodeEvaluationEndpointSmokeDisposition)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	terminals, err := decodeEvaluationEndpointSmokeArray(value["endpointSmokeReceipts"], maximumEvaluationEndpointSmokeTargets, decodeEvaluationEndpointSmokeTerminalReceipt)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	validationFailures, err := decodeEvaluationEndpointSmokeArray(value["validationFailureReceipts"], maximumEvaluationEndpointSmokeTargets, decodeEvaluationEndpointSmokeValidationFailure)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	sources, err := decodeEvaluationEndpointSmokeArray(value["sourceReceipts"], 128, decodeEvaluationSourceReceipt)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	reportBytes, err := canonicalEvaluationNestedObject(value["report"], maximumEvaluationAuthenticityFactBytes)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	report, err := decodeEvaluationEndpointSmokeReport(reportBytes)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	commitDigest, err := canonicaljson.Digest(value)
	if err != nil {
		return evaluationEndpointSmokeEvidenceCommit{}, err
	}
	return evaluationEndpointSmokeEvidenceCommit{
		ConfigurationDigest: configurationDigest, PlanDigest: planDigest, RepositoryCommit: stringMember(value, "repositoryCommit"),
		ReservationID: reservationID, Demand: demand, DemandBytes: demandBytes, DemandDigest: demand.Digest, ReservedAt: reservedAt,
		Settlement: settlement, SettlementBytes: settlementBytes, DispatchIntents: dispatches, TransportReceipts: transports,
		SpoolReceipts: spools, Dispositions: dispositions, ValidationFailures: validationFailures,
		TerminalReceipts: terminals, SourceReceipts: sources,
		Report: report, CommitDigest: commitDigest, Canonical: canonical, Value: value,
	}, nil
}

func evaluationEndpointSmokeSetDigest(envelope string, identities []string, digests []string) (string, error) {
	if len(identities) != len(digests) {
		return "", invalid("evaluation endpoint smoke digest set is invalid")
	}
	indices := make([]int, len(identities))
	for index := range indices {
		indices[index] = index
	}
	sort.Slice(indices, func(left, right int) bool { return identities[indices[left]] < identities[indices[right]] })
	ordered := make([]any, len(indices))
	previous := ""
	for index, sourceIndex := range indices {
		if identities[sourceIndex] == "" || (index > 0 && identities[sourceIndex] == previous) || !evaluationDigestPattern.MatchString(digests[sourceIndex]) {
			return "", invalid("evaluation endpoint smoke digest set contains duplicate or invalid identity")
		}
		previous = identities[sourceIndex]
		ordered[index] = digests[sourceIndex]
	}
	return canonicaljson.Digest(map[string]any{envelope: ordered})
}

func evaluationEndpointSmokeTurnDigest(intent evaluationEndpointSmokeDispatchIntent, transport *evaluationTransportReceipt, spool *evaluationEndpointSmokeSpoolReceipt, closedAt *time.Time) (string, error) {
	base := map[string]any{
		"state": "intent-recorded", "planDigest": intent.PlanDigest, "repositoryCommit": intent.RepositoryCommit,
		"smokeTargetId": intent.SmokeTargetID, "smokeTargetDigest": intent.SmokeTargetDigest,
		"invocationId": intent.InvocationID, "intentDigest": intent.IntentDigest,
	}
	if transport != nil && closedAt != nil {
		base["state"] = "closed"
		base["transportReceiptDigest"] = transport.ReceiptDigest
		if spool != nil {
			base["resultSpoolReceiptDigest"] = spool.ReceiptDigest
		}
		base["closedAt"] = closedAt.UTC().Format("2006-01-02T15:04:05.000Z")
	}
	return canonicaljson.Digest(base)
}

func evaluationEndpointSmokeCiphertextDigest(ciphertext []byte) string {
	digest := sha256.Sum256(ciphertext)
	return "sha256-" + hex.EncodeToString(digest[:])
}

func validateEvaluationEndpointSmokeTarget(plan evaluationPlanFact, intent evaluationEndpointSmokeDispatchIntent) (map[string]any, error) {
	if intent.PlanDigest != plan.PlanDigest || intent.RepositoryCommit != plan.RepositoryCommit || intent.CreatedAt.Before(plan.PlannedAt) || !intent.CreatedAt.Before(plan.ExpiresAt) {
		return nil, conflict("evaluation endpoint smoke dispatch intent belongs to a different plan window")
	}
	target := evaluationPlanObjectByIdentity(plan.Value["endpointSmokeTargets"], "smokeTargetId", intent.SmokeTargetID)
	if target == nil || stringMember(target, "targetDigest") != intent.SmokeTargetDigest ||
		stringMember(target, "endpointClass") != intent.EndpointClass || stringMember(target, "protocolFamily") != intent.ProtocolFamily ||
		stringMember(target, "providerConfigurationId") != intent.ProviderConfigurationID || stringMember(target, "modelId") != stringMember(intent.Value, "modelId") ||
		stringMember(target, "immutableModelVersion") != stringMember(intent.Value, "immutableModelVersion") ||
		stringMember(target, "modelLineageDigest") != stringMember(intent.Value, "modelLineageDigest") ||
		stringMember(target, "inferenceConfigurationDigest") != stringMember(intent.Value, "inferenceConfigurationDigest") ||
		stringMember(target, "adapterDigest") != stringMember(intent.Value, "adapterDigest") ||
		stringMember(target, "pricingAuthorityDigest") != stringMember(intent.Value, "pricingAuthorityDigest") ||
		stringMember(target, "responseSpoolEncryptionPolicyDigest") != stringMember(intent.Value, "responseSpoolEncryptionPolicyDigest") ||
		stringMember(target, "smokeProfileDigest") != stringMember(intent.Value, "smokeProfileDigest") {
		return nil, conflict("evaluation endpoint smoke dispatch intent drifted from its frozen target")
	}
	return target, nil
}

func validateEvaluationEndpointSmokeTransport(intent evaluationEndpointSmokeDispatchIntent, transport evaluationTransportReceipt) error {
	if transport.ProtocolFamily != intent.ProtocolFamily || transport.ProviderConfigurationID != intent.ProviderConfigurationID ||
		transport.InvocationID != intent.InvocationID || transport.IntentDigest != intent.IntentDigest || transport.RequestDigest != intent.RequestDigest ||
		transport.EndpointID != intent.EndpointID || transport.EndpointClass != intent.EndpointClass || transport.RequestBodyDigest != intent.RequestBodyDigest ||
		transport.RequestBytes != intent.RequestBytes || transport.StartedAt.Before(intent.CreatedAt) {
		return conflict("evaluation endpoint smoke transport receipt drifted from its dispatch intent")
	}
	return nil
}

func validateEvaluationEndpointSmokeSpool(intent evaluationEndpointSmokeDispatchIntent, transport evaluationTransportReceipt, aad evaluationEndpointSmokeSpoolAAD, envelope evaluationProviderResultSpoolEnvelope, spool evaluationEndpointSmokeSpoolReceipt) error {
	wantSpoolID, err := evaluationEndpointSmokeSpoolID(aad)
	if err != nil {
		return err
	}
	if transport.Outcome != "completed" || transport.ResponseBodyDigest == "" || aad.PlanDigest != intent.PlanDigest ||
		aad.RepositoryCommit != intent.RepositoryCommit || aad.SmokeTargetID != intent.SmokeTargetID || aad.SmokeTargetDigest != intent.SmokeTargetDigest ||
		aad.InvocationID != intent.InvocationID || aad.DispatchIntentDigest != intent.IntentDigest || aad.TransportReceiptDigest != transport.ReceiptDigest ||
		aad.ResponseBodyDigest != transport.ResponseBodyDigest || envelope.SpoolID != wantSpoolID || envelope.AADDigest != aad.Digest ||
		spool.SpoolRef != envelope.SpoolID || spool.PlanDigest != intent.PlanDigest || spool.RepositoryCommit != intent.RepositoryCommit ||
		spool.SmokeTargetID != intent.SmokeTargetID || spool.SmokeTargetDigest != intent.SmokeTargetDigest || spool.InvocationID != intent.InvocationID ||
		spool.DispatchIntentDigest != intent.IntentDigest || spool.TransportReceiptDigest != transport.ReceiptDigest ||
		spool.Algorithm != envelope.Algorithm || spool.EncryptionProfileDigest != envelope.EncryptionProfileDigest || spool.KeyRefDigest != envelope.KeyRefDigest ||
		spool.KeyID != envelope.KeyID || spool.KeyVersion != envelope.KeyVersion || spool.AADDigest != envelope.AADDigest ||
		spool.EnvelopeDigest != envelope.EnvelopeDigest || spool.CiphertextDigest != envelope.CiphertextDigest ||
		spool.CiphertextSizeBytes != envelope.CiphertextSizeBytes || spool.ResponseBodyDigest != aad.ResponseBodyDigest ||
		spool.NormalizedEventSetDigest != aad.NormalizedEventSetDigest {
		return conflict("evaluation endpoint smoke encrypted result spool authority drifted")
	}
	return nil
}

func evaluationEndpointSmokeTransportMatchesTerminal(transport evaluationTransportReceipt, terminal evaluationEndpointSmokeTerminalReceipt) bool {
	if terminal.Outcome == "passed" {
		return transport.DispatchState == "dispatched" && transport.Outcome == "completed"
	}
	switch terminal.FailureCategory {
	case "transport-not-dispatched":
		return transport.DispatchState == "not-dispatched" && transport.Outcome == "failed"
	case "transport-post-dispatch-unknown":
		return transport.DispatchState == "dispatched" && transport.Outcome == "post-dispatch-unknown"
	case "transport-failed":
		return transport.DispatchState == "dispatched" && transport.Outcome == "failed"
	case "provider-response-invalid", "model-identity-drift", "usage-unavailable", "cost-unavailable":
		return transport.DispatchState == "dispatched" && transport.Outcome == "completed"
	default:
		return false
	}
}

func validateEvaluationEndpointSmokeTerminalBinding(
	plan evaluationPlanFact,
	intent evaluationEndpointSmokeDispatchIntent,
	transport evaluationTransportReceipt,
	spool *evaluationEndpointSmokeSpoolReceipt,
	disposition *evaluationEndpointSmokeDisposition,
	validationFailure *evaluationEndpointSmokeValidationFailure,
	terminal evaluationEndpointSmokeTerminalReceipt,
	settlement evaluationBudgetSettlement,
) error {
	target, err := validateEvaluationEndpointSmokeTarget(plan, intent)
	if err != nil {
		return err
	}
	if terminal.PlanDigest != plan.PlanDigest || terminal.RepositoryCommit != plan.RepositoryCommit ||
		terminal.SmokeTargetID != intent.SmokeTargetID || terminal.SmokeTargetDigest != intent.SmokeTargetDigest ||
		terminal.EndpointClass != intent.EndpointClass || terminal.ProtocolFamily != intent.ProtocolFamily ||
		terminal.ProviderConfigurationID != intent.ProviderConfigurationID || terminal.ModelID != stringMember(target, "modelId") ||
		terminal.ImmutableModelVersion != stringMember(target, "immutableModelVersion") || terminal.ModelLineageDigest != stringMember(target, "modelLineageDigest") ||
		terminal.InferenceConfigurationDigest != stringMember(target, "inferenceConfigurationDigest") || terminal.AdapterDigest != stringMember(target, "adapterDigest") ||
		terminal.PricingAuthorityDigest != stringMember(target, "pricingAuthorityDigest") ||
		terminal.ResponseSpoolEncryptionPolicyDigest != stringMember(target, "responseSpoolEncryptionPolicyDigest") ||
		terminal.SmokeProfileDigest != stringMember(target, "smokeProfileDigest") || terminal.InvocationID != intent.InvocationID ||
		terminal.BudgetReservationID != intent.BudgetReservationID || terminal.DemandDigest != intent.DemandDigest ||
		terminal.SettlementDigest != settlement.Digest || terminal.DispatchIntentDigest != intent.IntentDigest ||
		terminal.TransportReceiptDigest != transport.ReceiptDigest || terminal.RequestDigest != intent.RequestDigest ||
		!terminal.StartedAt.Equal(transport.StartedAt) || terminal.CompletedAt.Before(transport.CompletedAt) ||
		!evaluationEndpointSmokeTransportMatchesTerminal(transport, terminal) {
		return conflict("evaluation endpoint smoke terminal receipt drifted from its target journal")
	}
	hasResponse := terminal.ProviderRequestID != ""
	if hasResponse != (transport.ProviderRequestID != "") ||
		(hasResponse && (terminal.ProviderRequestID != transport.ProviderRequestID || terminal.ResponseHeaderDigest != transport.ResponseHeaderDigest)) ||
		(terminal.ResolvedModelID != "") != (stringMember(transport.Value, "resolvedModelId") != "") ||
		(terminal.ResolvedModelID != "" && (terminal.ResolvedModelID != stringMember(transport.Value, "resolvedModelId") ||
			terminal.ResolvedModelVersion != stringMember(transport.Value, "resolvedModelVersion"))) {
		return conflict("evaluation endpoint smoke response authority drifted from transport")
	}
	modelMatches := terminal.ResolvedModelID == terminal.ModelID &&
		(terminal.ProtocolFamily == "gemini-interactions" && terminal.ResolvedModelVersion == terminal.ImmutableModelVersion ||
			terminal.ProtocolFamily != "gemini-interactions" && terminal.ModelID == terminal.ImmutableModelVersion &&
				(terminal.ResolvedModelVersion == "" || terminal.ResolvedModelVersion == terminal.ImmutableModelVersion))
	if terminal.Outcome == "failed" && terminal.FailureCategory == "model-identity-drift" && modelMatches ||
		terminal.Outcome == "failed" && oneOfString(terminal.FailureCategory, "provider-response-invalid", "usage-unavailable", "cost-unavailable") &&
			terminal.ResolvedModelID != "" && !modelMatches {
		return conflict("evaluation endpoint smoke terminal model authority is inconsistent with its failure category")
	}
	hasValidationFailure := terminal.ValidationFailureReceiptDigest != ""
	if hasValidationFailure != (validationFailure != nil) {
		return conflict("evaluation endpoint smoke validation-failure authority is incomplete")
	}
	if validationFailure != nil && (terminal.Outcome != "failed" || terminal.FailureCategory != "provider-response-invalid" ||
		validationFailure.ReceiptDigest != terminal.ValidationFailureReceiptDigest ||
		validationFailure.PlanDigest != plan.PlanDigest || validationFailure.RepositoryCommit != plan.RepositoryCommit ||
		validationFailure.SmokeTargetID != intent.SmokeTargetID || validationFailure.SmokeTargetDigest != intent.SmokeTargetDigest ||
		validationFailure.InvocationID != intent.InvocationID || validationFailure.DispatchIntentDigest != intent.IntentDigest ||
		validationFailure.TransportReceiptDigest != transport.ReceiptDigest || validationFailure.SpoolReceiptDigest != terminal.SpoolReceiptDigest ||
		validationFailure.ObservedAt.Before(transport.CompletedAt) || validationFailure.ObservedAt.After(terminal.CompletedAt)) {
		return conflict("evaluation endpoint smoke validation-failure authority drifted")
	}
	if terminal.SpoolReceiptDigest == "" {
		if spool != nil || disposition != nil || transport.Outcome == "completed" {
			return conflict("evaluation endpoint smoke terminal receipt omitted required spool authority")
		}
		return nil
	}
	if spool == nil || disposition == nil || terminal.ResponseDigest == "" || terminal.SpoolReceiptDigest != spool.ReceiptDigest ||
		terminal.SpoolDispositionReceiptDigest != disposition.ReceiptDigest || spool.PlanDigest != plan.PlanDigest ||
		spool.RepositoryCommit != plan.RepositoryCommit || spool.SmokeTargetID != intent.SmokeTargetID ||
		spool.SmokeTargetDigest != intent.SmokeTargetDigest || spool.InvocationID != intent.InvocationID ||
		spool.DispatchIntentDigest != intent.IntentDigest || spool.TransportReceiptDigest != transport.ReceiptDigest ||
		spool.ResponseBodyDigest != transport.ResponseBodyDigest || spool.ResponseDigest != terminal.ResponseDigest ||
		disposition.SpoolRef != spool.SpoolRef || disposition.SpoolReceiptDigest != spool.ReceiptDigest ||
		disposition.PlanDigest != plan.PlanDigest || disposition.RepositoryCommit != plan.RepositoryCommit ||
		disposition.SmokeTargetID != intent.SmokeTargetID || disposition.SmokeTargetDigest != intent.SmokeTargetDigest ||
		disposition.InvocationID != intent.InvocationID || disposition.RetentionPolicyDigest != spool.RetentionPolicyDigest ||
		spool.CreatedAt.Before(transport.CompletedAt) || spool.CreatedAt.After(terminal.CompletedAt) ||
		disposition.DisposedAt.Before(spool.CreatedAt) {
		return conflict("evaluation endpoint smoke terminal spool authority drifted")
	}
	return nil
}

func evaluationEndpointSmokePricingSourceReceiptID(planDigest string, target map[string]any, snapshotDigest string) (string, error) {
	digest, err := canonicaljson.Digest(map[string]any{
		"planDigest":              planDigest,
		"providerConfigurationId": stringMember(target, "providerConfigurationId"),
		"modelLineageDigest":      stringMember(target, "modelLineageDigest"),
		"pricingAuthorityDigest":  stringMember(target, "pricingAuthorityDigest"),
		"pricingSnapshotDigest":   snapshotDigest,
	})
	if err != nil {
		return "", err
	}
	return "evaluation-source.pricing." + digest[len("sha256-"):], nil
}

func validateEvaluationEndpointSmokeSources(plan evaluationPlanFact, commit evaluationEndpointSmokeEvidenceCommit) error {
	byDigest := make(map[string]evaluationSourceReceipt, len(commit.SourceReceipts))
	pricingBySnapshot := make(map[string]evaluationSourceReceipt)
	identities := make(map[string]struct{}, len(commit.SourceReceipts))
	contents := make(map[string]struct{}, len(commit.SourceReceipts))
	for _, source := range commit.SourceReceipts {
		if source.PlanDigest != commit.PlanDigest || source.RepositoryCommit != commit.RepositoryCommit ||
			source.ModelLineageDigest == "" || source.ExecutionFailureAuthorityReceiptDigest != "" {
			return conflict("evaluation endpoint smoke source receipt partition drifted")
		}
		if _, exists := identities[source.SourceReceiptID]; exists {
			return conflict("evaluation endpoint smoke source receipt identity is duplicated")
		}
		if _, exists := byDigest[source.ReceiptDigest]; exists {
			return conflict("evaluation endpoint smoke source receipt digest is duplicated")
		}
		if _, exists := contents[source.SourceContentDigest]; exists {
			return conflict("evaluation endpoint smoke source content digest is duplicated")
		}
		identities[source.SourceReceiptID] = struct{}{}
		byDigest[source.ReceiptDigest] = source
		contents[source.SourceContentDigest] = struct{}{}
		if source.SourceKind == "pricing-snapshot" {
			pricingBySnapshot[stringMember(source.PricingSnapshot, "snapshotDigest")] = source
		}
	}
	used := make(map[string]struct{})
	for _, receipt := range commit.TerminalReceipts {
		if receipt.Usage == nil {
			continue
		}
		usageSource, usageOK := byDigest[receipt.UsageSourceReceiptDigest]
		usage, usageOKObject := receipt.Usage.(map[string]any)
		if !usageOK || !usageOKObject ||
			usageSource.SourceKind != "provider-reported-usage" || usageSource.ProviderConfigurationID != receipt.ProviderConfigurationID ||
			usageSource.ModelLineageDigest != receipt.ModelLineageDigest ||
			usageSource.ProviderRequestID != receipt.ProviderRequestID || usageSource.InputUsageDigest != stringMember(usage, "vectorDigest") ||
			receipt.UsageSourceReceiptDigest == "" {
			return conflict("evaluation endpoint smoke accounting source chain drifted")
		}
		amounts, _ := usage["amounts"].([]any)
		for _, raw := range amounts {
			amount, _ := raw.(map[string]any)
			if stringMember(amount, "sourceDigest") != usageSource.SourceContentDigest {
				return conflict("evaluation endpoint smoke usage source content drifted")
			}
		}
		used[usageSource.ReceiptDigest] = struct{}{}
		if receipt.Cost == nil {
			continue
		}
		costSource, costOK := byDigest[receipt.CostSourceReceiptDigest]
		costValueDigest, costErr := evaluationCanonicalCostValueDigest(receipt.Cost)
		if !costOK || costErr != nil || costSource.SourceKind != "cost-calculation" ||
			costSource.ProviderConfigurationID != receipt.ProviderConfigurationID ||
			costSource.ModelLineageDigest != receipt.ModelLineageDigest ||
			costSource.ProviderRequestID != receipt.ProviderRequestID ||
			costSource.InputUsageDigest != stringMember(usage, "vectorDigest") ||
			costSource.OutputCostDigest != costValueDigest || costSource.PricingSnapshot == nil ||
			stringMember(costSource.PricingSnapshot, "pricingSnapshotId") != receipt.PricingSnapshotRef ||
			receipt.CostSourceReceiptDigest == "" {
			return conflict("evaluation endpoint smoke cost source chain drifted")
		}
		costs, _ := receipt.Cost.([]any)
		for _, raw := range costs {
			cost, _ := raw.(map[string]any)
			if stringMember(cost, "sourceDigest") != costSource.SourceContentDigest {
				return conflict("evaluation endpoint smoke cost source content drifted")
			}
		}
		pricingSource, ok := pricingBySnapshot[stringMember(costSource.PricingSnapshot, "snapshotDigest")]
		pricingCanonical, pricingErr := canonicaljson.Bytes(costSource.PricingSnapshot)
		pricingSourceCanonical, pricingSourceErr := canonicaljson.Bytes(pricingSource.PricingSnapshot)
		target := evaluationPlanObjectByIdentity(plan.Value["endpointSmokeTargets"], "smokeTargetId", receipt.SmokeTargetID)
		expectedPricingSourceID, pricingIDErr := evaluationEndpointSmokePricingSourceReceiptID(
			plan.PlanDigest, target, stringMember(costSource.PricingSnapshot, "snapshotDigest"),
		)
		if !ok || pricingErr != nil || pricingSourceErr != nil || !bytes.Equal(pricingCanonical, pricingSourceCanonical) ||
			target == nil || pricingIDErr != nil || pricingSource.SourceReceiptID != expectedPricingSourceID ||
			pricingSource.ProviderConfigurationID != receipt.ProviderConfigurationID ||
			pricingSource.ModelLineageDigest != receipt.ModelLineageDigest ||
			pricingSource.SourceContentDigest != stringMember(costSource.PricingSnapshot, "snapshotDigest") {
			return conflict("evaluation endpoint smoke pricing source chain drifted")
		}
		used[costSource.ReceiptDigest] = struct{}{}
		used[pricingSource.ReceiptDigest] = struct{}{}
	}
	if len(used) != len(commit.SourceReceipts) {
		return conflict("evaluation endpoint smoke source receipt set contains unreferenced facts")
	}
	return nil
}

func evaluationEndpointSmokeReservationID(plan evaluationPlanFact, configurationDigest, demandDigest string) (string, error) {
	targets, ok := plan.Value["endpointSmokeTargets"].([]any)
	if !ok || len(targets) != maximumEvaluationEndpointSmokeTargets {
		return "", conflict("evaluation endpoint smoke reservation has no frozen target denominator")
	}
	targetDigests := make([]any, len(targets))
	for index, raw := range targets {
		target, ok := raw.(map[string]any)
		if !ok || !evaluationDigestPattern.MatchString(stringMember(target, "targetDigest")) {
			return "", conflict("evaluation endpoint smoke reservation target authority is invalid")
		}
		targetDigests[index] = stringMember(target, "targetDigest")
	}
	digest, err := canonicaljson.Digest(map[string]any{
		"configurationDigest":        configurationDigest,
		"planDigest":                 plan.PlanDigest,
		"endpointSmokeTargetDigests": targetDigests,
		"demandDigest":               demandDigest,
	})
	if err != nil {
		return "", err
	}
	return "endpoint-smoke-reservation." + digest[len("sha256-"):], nil
}

var evaluationEndpointSmokeUsageUnits = map[string]struct{}{
	"text-token-input": {}, "text-token-output": {}, "reasoning-token": {},
	"cache-read-token": {}, "cache-write-token": {}, "image": {}, "image-pixel": {},
	"media-source-byte": {}, "media-processed-byte": {}, "document-page": {},
	"document-rendered-pixel": {}, "ocr-character": {}, "audio-second": {}, "audio-sample": {},
	"video-second": {}, "video-input-frame": {}, "video-frame": {},
	"transform-compute-millisecond": {}, "transform-memory-byte-second": {},
	"provider-upload-byte": {}, "hosted-search-query": {}, "hosted-tool-call": {},
	"sandbox-compute-second": {}, "provider-storage-byte-second": {},
	"generated-artifact": {}, "generated-artifact-byte": {},
}

var evaluationEndpointSmokeConfidenceOrder = map[string]int{
	"reported": 0, "measured": 1, "estimated": 2, "unknown": 3,
}

func evaluationEndpointSmokeWorseConfidence(left, right string) (string, error) {
	leftOrder, leftOK := evaluationEndpointSmokeConfidenceOrder[left]
	rightOrder, rightOK := evaluationEndpointSmokeConfidenceOrder[right]
	if !leftOK || !rightOK {
		return "", invalid("evaluation endpoint smoke accounting confidence is invalid")
	}
	if leftOrder >= rightOrder {
		return left, nil
	}
	return right, nil
}

func evaluationEndpointSmokeDecimalParts(value string) (*big.Int, int, error) {
	if !evaluationDecimalPattern.MatchString(value) {
		return nil, 0, invalid("evaluation endpoint smoke accounting decimal is invalid")
	}
	parts := strings.SplitN(value, ".", 2)
	fraction := ""
	if len(parts) == 2 {
		fraction = parts[1]
	}
	coefficient, ok := new(big.Int).SetString(parts[0]+fraction, 10)
	if !ok {
		return nil, 0, invalid("evaluation endpoint smoke accounting decimal cannot be parsed")
	}
	return coefficient, len(fraction), nil
}

func evaluationEndpointSmokeAddDecimals(left, right string) (string, error) {
	leftCoefficient, leftScale, err := evaluationEndpointSmokeDecimalParts(left)
	if err != nil {
		return "", err
	}
	rightCoefficient, rightScale, err := evaluationEndpointSmokeDecimalParts(right)
	if err != nil {
		return "", err
	}
	scale := leftScale
	if rightScale > scale {
		scale = rightScale
	}
	power := func(exponent int) *big.Int {
		return new(big.Int).Exp(big.NewInt(10), big.NewInt(int64(exponent)), nil)
	}
	leftCoefficient.Mul(leftCoefficient, power(scale-leftScale))
	rightCoefficient.Mul(rightCoefficient, power(scale-rightScale))
	coefficient := new(big.Int).Add(leftCoefficient, rightCoefficient)
	if coefficient.Sign() == 0 {
		return "0", nil
	}
	raw := coefficient.String()
	if scale == 0 {
		return raw, nil
	}
	if len(raw) <= scale {
		raw = strings.Repeat("0", scale-len(raw)+1) + raw
	}
	whole, fraction := raw[:len(raw)-scale], raw[len(raw)-scale:]
	fraction = strings.TrimRight(fraction, "0")
	if fraction == "" {
		return whole, nil
	}
	return whole + "." + fraction, nil
}

func evaluationEndpointSmokeUsageSourceDigest(left, right string) (string, error) {
	if left == right {
		return left, nil
	}
	values := make([]string, 0, 2)
	if left != "" {
		values = append(values, left)
	}
	if right != "" {
		values = append(values, right)
	}
	sort.Strings(values)
	return canonicaljson.Digest(values)
}

func evaluationEndpointSmokeCostSourceDigest(left, right string) (string, error) {
	values := make([]string, 0, 2)
	if left != "" {
		values = append(values, left)
	}
	if right != "" {
		values = append(values, right)
	}
	sort.Strings(values)
	if len(values) == 0 {
		return "", nil
	}
	if len(values) == 1 || values[0] == values[len(values)-1] {
		return values[0], nil
	}
	return canonicaljson.Digest(values)
}

func evaluationEndpointSmokeMergeUsageAmounts(rawAmounts []any) (map[string]any, error) {
	byUnit := make(map[string]map[string]any)
	for _, raw := range rawAmounts {
		amount, ok := raw.(map[string]any)
		if !ok {
			return nil, invalid("evaluation endpoint smoke actual usage amount is invalid")
		}
		unit, unitOK := amount["unit"].(string)
		confidence, confidenceOK := amount["confidence"].(string)
		if _, allowed := evaluationEndpointSmokeUsageUnits[unit]; !unitOK || !confidenceOK || !allowed {
			return nil, invalid("evaluation endpoint smoke actual usage identity is invalid")
		}
		current := byUnit[unit]
		if current == nil {
			copy := map[string]any{"unit": unit, "confidence": confidence}
			for _, field := range []string{"logicalAmount", "billableAmount", "cachedAmount", "sourceDigest"} {
				if value, exists := amount[field]; exists {
					copy[field] = value
				}
			}
			byUnit[unit] = copy
			continue
		}
		merged := map[string]any{"unit": unit}
		for _, field := range []string{"logicalAmount", "billableAmount", "cachedAmount"} {
			left, leftOK := current[field].(string)
			right, rightOK := amount[field].(string)
			switch {
			case leftOK && rightOK:
				value, err := evaluationEndpointSmokeAddDecimals(left, right)
				if err != nil {
					return nil, err
				}
				merged[field] = value
			case leftOK:
				merged[field] = left
			case rightOK:
				merged[field] = right
			}
		}
		mergedConfidence, err := evaluationEndpointSmokeWorseConfidence(stringMember(current, "confidence"), confidence)
		if err != nil {
			return nil, err
		}
		merged["confidence"] = mergedConfidence
		sourceDigest, err := evaluationEndpointSmokeUsageSourceDigest(stringMember(current, "sourceDigest"), stringMember(amount, "sourceDigest"))
		if err != nil {
			return nil, err
		}
		if sourceDigest != "" {
			merged["sourceDigest"] = sourceDigest
		}
		byUnit[unit] = merged
	}
	units := make([]string, 0, len(byUnit))
	for unit := range byUnit {
		units = append(units, unit)
	}
	sort.Strings(units)
	amounts := make([]any, len(units))
	for index, unit := range units {
		amounts[index] = byUnit[unit]
	}
	digest, err := canonicaljson.Digest(amounts)
	if err != nil {
		return nil, err
	}
	return map[string]any{"amounts": amounts, "vectorDigest": digest}, nil
}

func evaluationEndpointSmokeMergeCosts(rawCosts []any) ([]any, error) {
	byCurrency := make(map[string]map[string]any)
	for _, raw := range rawCosts {
		cost, ok := raw.(map[string]any)
		if !ok {
			return nil, invalid("evaluation endpoint smoke actual cost is invalid")
		}
		currency, currencyOK := cost["currency"].(string)
		confidence, confidenceOK := cost["confidence"].(string)
		if !currencyOK || !evaluationCurrencyPattern.MatchString(currency) || !confidenceOK {
			return nil, invalid("evaluation endpoint smoke actual cost identity is invalid")
		}
		current := byCurrency[currency]
		if current == nil {
			copy := map[string]any{"currency": currency, "confidence": confidence}
			for _, field := range []string{"amount", "sourceDigest"} {
				if value, exists := cost[field]; exists {
					copy[field] = value
				}
			}
			byCurrency[currency] = copy
			continue
		}
		merged := map[string]any{"currency": currency}
		leftAmount, leftKnown := current["amount"].(string)
		rightAmount, rightKnown := cost["amount"].(string)
		if leftKnown && rightKnown {
			amount, err := evaluationEndpointSmokeAddDecimals(leftAmount, rightAmount)
			if err != nil {
				return nil, err
			}
			merged["amount"] = amount
			mergedConfidence, err := evaluationEndpointSmokeWorseConfidence(stringMember(current, "confidence"), confidence)
			if err != nil {
				return nil, err
			}
			merged["confidence"] = mergedConfidence
		} else {
			merged["confidence"] = "unknown"
		}
		sourceDigest, err := evaluationEndpointSmokeCostSourceDigest(stringMember(current, "sourceDigest"), stringMember(cost, "sourceDigest"))
		if err != nil {
			return nil, err
		}
		if sourceDigest != "" {
			merged["sourceDigest"] = sourceDigest
		}
		byCurrency[currency] = merged
	}
	currencies := make([]string, 0, len(byCurrency))
	for currency := range byCurrency {
		currencies = append(currencies, currency)
	}
	sort.Strings(currencies)
	costs := make([]any, len(currencies))
	for index, currency := range currencies {
		costs[index] = byCurrency[currency]
	}
	return costs, nil
}

func evaluationEndpointSmokeActualDemand(commit evaluationEndpointSmokeEvidenceCommit) (evaluationBudgetDemand, error) {
	byInvocation := make(map[string]evaluationEndpointSmokeTerminalReceipt, len(commit.TerminalReceipts))
	rawUsage, rawCosts := make([]any, 0), make([]any, 0)
	for _, receipt := range commit.TerminalReceipts {
		byInvocation[receipt.InvocationID] = receipt
		if receipt.Usage != nil {
			usage, ok := receipt.Usage.(map[string]any)
			amounts, amountsOK := usage["amounts"].([]any)
			if !ok || !amountsOK {
				return evaluationBudgetDemand{}, invalid("evaluation endpoint smoke committed usage is invalid")
			}
			rawUsage = append(rawUsage, amounts...)
		}
		if receipt.Cost != nil {
			costs, ok := receipt.Cost.([]any)
			if !ok {
				return evaluationBudgetDemand{}, invalid("evaluation endpoint smoke committed cost is invalid")
			}
			rawCosts = append(rawCosts, costs...)
		}
	}
	modelInvocations, elapsedMS := int64(0), int64(0)
	hasUnknownUsage, hasUnknownCost := false, false
	for _, transport := range commit.TransportReceipts {
		elapsed := transport.CompletedAt.Sub(transport.StartedAt).Milliseconds()
		if elapsed < 0 || elapsedMS > 9_007_199_254_740_991-elapsed {
			return evaluationBudgetDemand{}, conflict("evaluation endpoint smoke actual elapsed time exceeds the safe integer range")
		}
		elapsedMS += elapsed
		if transport.DispatchState != "dispatched" {
			continue
		}
		modelInvocations++
		receipt, exists := byInvocation[transport.InvocationID]
		if !exists || receipt.Usage == nil {
			hasUnknownUsage = true
		}
		if !exists || receipt.Cost == nil {
			hasUnknownCost = true
		}
	}
	if hasUnknownUsage {
		rawUsage = append(rawUsage,
			map[string]any{"unit": "text-token-input", "confidence": "unknown"},
			map[string]any{"unit": "text-token-output", "confidence": "unknown"},
		)
	}
	if hasUnknownCost {
		rawCosts = append(rawCosts, map[string]any{"currency": "USD", "confidence": "unknown"})
	}
	usage, err := evaluationEndpointSmokeMergeUsageAmounts(rawUsage)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	costs, err := evaluationEndpointSmokeMergeCosts(rawCosts)
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	canonical, err := canonicaljson.Bytes(map[string]any{
		"usage": usage, "cost": costs, "modelInvocations": modelInvocations,
		"toolCalls": int64(0), "repairRounds": int64(0), "transactions": int64(0),
		"artifactBytes": int64(0), "elapsedMs": elapsedMS,
	})
	if err != nil {
		return evaluationBudgetDemand{}, err
	}
	return decodeEvaluationBudgetDemand(canonical, false)
}

func validateEvaluationEndpointSmokeCommit(plan evaluationPlanFact, commit evaluationEndpointSmokeEvidenceCommit) error {
	expectedReservationID, err := evaluationEndpointSmokeReservationID(plan, commit.ConfigurationDigest, commit.DemandDigest)
	if err != nil || commit.ReservationID != expectedReservationID {
		return conflict("evaluation endpoint smoke reservation identity drifted")
	}
	if commit.PlanDigest != plan.PlanDigest || commit.RepositoryCommit != plan.RepositoryCommit ||
		commit.ReservedAt.Before(plan.PlannedAt) || !commit.ReservedAt.Before(plan.ExpiresAt) ||
		commit.Settlement.SettledAt.After(plan.ExpiresAt) || commit.Report.PlanDigest != plan.PlanDigest ||
		commit.Report.RepositoryCommit != plan.RepositoryCommit || commit.Report.BudgetReservationID != commit.ReservationID ||
		commit.Report.CompletedAt != commit.Settlement.SettledAt || len(commit.DispatchIntents) != maximumEvaluationEndpointSmokeTargets ||
		len(commit.TransportReceipts) != maximumEvaluationEndpointSmokeTargets || len(commit.TerminalReceipts) != maximumEvaluationEndpointSmokeTargets ||
		len(commit.SpoolReceipts) != len(commit.Dispositions) {
		return conflict("evaluation endpoint smoke evidence commit denominator is invalid")
	}
	targets, targetsOK := plan.Value["endpointSmokeTargets"].([]any)
	if !targetsOK || len(targets) != maximumEvaluationEndpointSmokeTargets {
		return conflict("evaluation endpoint smoke frozen target denominator is invalid")
	}
	intentByTarget := make(map[string]evaluationEndpointSmokeDispatchIntent, maximumEvaluationEndpointSmokeTargets)
	transportByInvocation := make(map[string]evaluationTransportReceipt, maximumEvaluationEndpointSmokeTargets)
	spoolByTarget := make(map[string]evaluationEndpointSmokeSpoolReceipt, len(commit.SpoolReceipts))
	dispositionByTarget := make(map[string]evaluationEndpointSmokeDisposition, len(commit.Dispositions))
	validationFailureByTarget := make(map[string]evaluationEndpointSmokeValidationFailure, len(commit.ValidationFailures))
	terminalByTarget := make(map[string]evaluationEndpointSmokeTerminalReceipt, maximumEvaluationEndpointSmokeTargets)
	for _, intent := range commit.DispatchIntents {
		if _, exists := intentByTarget[intent.SmokeTargetID]; exists || intent.BudgetReservationID != commit.ReservationID || intent.DemandDigest != commit.DemandDigest {
			return conflict("evaluation endpoint smoke dispatch-intent denominator drifted")
		}
		if _, err := validateEvaluationEndpointSmokeTarget(plan, intent); err != nil {
			return err
		}
		intentByTarget[intent.SmokeTargetID] = intent
	}
	for _, transport := range commit.TransportReceipts {
		if _, exists := transportByInvocation[transport.InvocationID]; exists {
			return conflict("evaluation endpoint smoke transport identity is duplicated")
		}
		transportByInvocation[transport.InvocationID] = transport
	}
	for _, spool := range commit.SpoolReceipts {
		if _, exists := spoolByTarget[spool.SmokeTargetID]; exists {
			return conflict("evaluation endpoint smoke spool target is duplicated")
		}
		spoolByTarget[spool.SmokeTargetID] = spool
	}
	for _, disposition := range commit.Dispositions {
		if _, exists := dispositionByTarget[disposition.SmokeTargetID]; exists {
			return conflict("evaluation endpoint smoke spool disposition target is duplicated")
		}
		dispositionByTarget[disposition.SmokeTargetID] = disposition
	}
	for _, validationFailure := range commit.ValidationFailures {
		if _, exists := validationFailureByTarget[validationFailure.SmokeTargetID]; exists {
			return conflict("evaluation endpoint smoke validation-failure target is duplicated")
		}
		validationFailureByTarget[validationFailure.SmokeTargetID] = validationFailure
	}
	qualified := int64(0)
	providerResponseInvalid := 0
	latest := commit.ReservedAt
	for _, terminal := range commit.TerminalReceipts {
		if _, exists := terminalByTarget[terminal.SmokeTargetID]; exists {
			return conflict("evaluation endpoint smoke terminal target is duplicated")
		}
		intent, intentOK := intentByTarget[terminal.SmokeTargetID]
		transport, transportOK := transportByInvocation[terminal.InvocationID]
		if !intentOK || !transportOK || validateEvaluationEndpointSmokeTransport(intent, transport) != nil {
			return conflict("evaluation endpoint smoke terminal target journal is incomplete")
		}
		var spool *evaluationEndpointSmokeSpoolReceipt
		if value, exists := spoolByTarget[terminal.SmokeTargetID]; exists {
			copy := value
			spool = &copy
			if value.CreatedAt.After(latest) {
				latest = value.CreatedAt
			}
		}
		var disposition *evaluationEndpointSmokeDisposition
		if value, exists := dispositionByTarget[terminal.SmokeTargetID]; exists {
			copy := value
			disposition = &copy
		}
		var validationFailure *evaluationEndpointSmokeValidationFailure
		if value, exists := validationFailureByTarget[terminal.SmokeTargetID]; exists {
			copy := value
			validationFailure = &copy
		}
		if err := validateEvaluationEndpointSmokeTerminalBinding(plan, intent, transport, spool, disposition, validationFailure, terminal, commit.Settlement); err != nil {
			return err
		}
		if transport.CompletedAt.After(latest) {
			latest = transport.CompletedAt
		}
		if terminal.Outcome == "passed" {
			qualified++
		} else if terminal.FailureCategory == "provider-response-invalid" {
			providerResponseInvalid++
		}
		terminalByTarget[terminal.SmokeTargetID] = terminal
	}
	if len(intentByTarget) != maximumEvaluationEndpointSmokeTargets || len(transportByInvocation) != maximumEvaluationEndpointSmokeTargets ||
		len(terminalByTarget) != maximumEvaluationEndpointSmokeTargets || len(spoolByTarget) != len(dispositionByTarget) ||
		len(validationFailureByTarget) != providerResponseInvalid ||
		commit.Report.QualifiedTargetCount != qualified || commit.Report.CompletedAt != latest ||
		(qualified == maximumEvaluationEndpointSmokeTargets && (commit.Report.Outcome != "completed" || commit.Report.FailureCode != nil)) ||
		(qualified != maximumEvaluationEndpointSmokeTargets && (commit.Report.Outcome != "failed" || commit.Report.FailureCode == nil || *commit.Report.FailureCode != "endpoint-smoke-qualification-failed")) {
		return conflict("evaluation endpoint smoke evidence commit coverage drifted")
	}
	intentIDs, intentDigests := make([]string, 0, len(commit.DispatchIntents)), make([]string, 0, len(commit.DispatchIntents))
	for _, value := range commit.DispatchIntents {
		intentIDs, intentDigests = append(intentIDs, value.SmokeTargetID), append(intentDigests, value.IntentDigest)
	}
	transportIDs, transportDigests := make([]string, 0, len(commit.TransportReceipts)), make([]string, 0, len(commit.TransportReceipts))
	for _, value := range commit.TransportReceipts {
		transportIDs = append(transportIDs, value.InvocationID+"\x00"+value.ReceiptID)
		transportDigests = append(transportDigests, value.ReceiptDigest)
	}
	spoolIDs, spoolDigests := make([]string, 0, len(commit.SpoolReceipts)), make([]string, 0, len(commit.SpoolReceipts))
	for _, value := range commit.SpoolReceipts {
		spoolIDs, spoolDigests = append(spoolIDs, value.SmokeTargetID), append(spoolDigests, value.ReceiptDigest)
	}
	dispositionIDs, dispositionDigests := make([]string, 0, len(commit.Dispositions)), make([]string, 0, len(commit.Dispositions))
	for _, value := range commit.Dispositions {
		dispositionIDs, dispositionDigests = append(dispositionIDs, value.SmokeTargetID), append(dispositionDigests, value.ReceiptDigest)
	}
	terminalIDs, terminalDigests := make([]string, 0, len(commit.TerminalReceipts)), make([]string, 0, len(commit.TerminalReceipts))
	for _, value := range commit.TerminalReceipts {
		terminalIDs, terminalDigests = append(terminalIDs, value.SmokeTargetID), append(terminalDigests, value.ReceiptDigest)
	}
	checks := []struct {
		envelope, actual    string
		identities, digests []string
	}{
		{"endpointSmokeDispatchIntentDigests", commit.Report.DispatchIntentSetDigest, intentIDs, intentDigests},
		{"endpointSmokeTransportReceiptDigests", commit.Report.TransportReceiptSetDigest, transportIDs, transportDigests},
		{"endpointSmokeResultSpoolReceiptDigests", commit.Report.ResultSpoolReceiptSetDigest, spoolIDs, spoolDigests},
		{"endpointSmokeResultSpoolDispositionReceiptDigests", commit.Report.ResultSpoolDispositionReceiptSetDigest, dispositionIDs, dispositionDigests},
		{"endpointSmokeReceiptDigests", commit.Report.EndpointSmokeReceiptSetDigest, terminalIDs, terminalDigests},
	}
	for _, check := range checks {
		digest, err := evaluationEndpointSmokeSetDigest(check.envelope, check.identities, check.digests)
		if err != nil || digest != check.actual {
			return conflict("evaluation endpoint smoke qualification set digest drifted")
		}
	}
	actual, err := evaluationEndpointSmokeActualDemand(commit)
	if err != nil || !bytes.Equal(actual.Canonical, commit.Settlement.Actual.Canonical) {
		return conflict("evaluation endpoint smoke settlement actual drifted from committed transport facts")
	}
	if err := validateEvaluationEndpointSmokeSources(plan, commit); err != nil {
		return err
	}
	return nil
}

func evaluationEndpointSmokeRecord(namespaceID string, record EvaluationEndpointSmokeDispatchIntentRecord) EvaluationEndpointSmokeDispatchIntentRecord {
	record.NamespaceID = namespaceID
	return record
}

func endpointSmokeCommitError(format string, args ...any) error {
	return conflict(fmt.Sprintf(format, args...))
}
