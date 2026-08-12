package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationEvidenceExportLeaseKind   = "evidence-archive"
	maximumEvaluationExportRecords      = int64(2_000_000)
	maximumEvaluationExportRecordBytes  = int64(16 * 1_024 * 1_024)
	maximumEvaluationExportPageRecords  = int64(256)
	maximumEvaluationExportPageBytes    = int64(32 * 1_024 * 1_024)
	maximumEvaluationExportArchiveBytes = int64(8 * 1_024 * 1_024 * 1_024)
	maximumEvaluationPlannedAttempts    = int64(14_040)
	maximumEvaluationObservationRecords = maximumEvaluationPlannedAttempts * maximumEvaluationProviderCapabilityObservationTurns
	maximumEvaluationObservationBytes   = maximumEvaluationObservationRecords * maximumEvaluationProviderCapabilityObservationBytes
	evaluationExportLeaseDuration       = 2 * time.Hour
)

var evaluationEvidenceExportFamilies = [...]string{
	"plan",
	"capabilityProbeAdmissions",
	"capabilityProbeReferenceReceipts",
	"runtimeFactSourceOwnerRegistrations",
	"capabilityProbeProviderResourceCleanups",
	"hostedRetrievalRuntimeResourceLifecycleJournals",
	"hostedRetrievalRuntimeResourceCleanups",
	"capabilityEffectProviderRuntimeJournals",
	"optionalCapabilityFactSources",
	"optionalCapabilityFactAuthorities",
	"endpointSmokeDispatchIntents",
	"endpointSmokeTransportReceipts",
	"endpointSmokeResultSpoolReceipts",
	"endpointSmokeResultSpoolDispositionReceipts",
	"endpointSmokeValidationFailureReceipts",
	"endpointSmokeReceipts",
	"preDispatchFailureReceipts",
	"transportDispatchIntents",
	"transportReceipts",
	"providerResultSpoolReceipts",
	"providerResultSpoolDispositionReceipts",
	"invocationTurnReceipts",
	"invocationTurnSetReceipts",
	"resultSubmissionReceipts",
	"attemptAuthorityOwnerReceipts",
	"verificationAttemptGrantReceipts",
	"controlledRuntimeReceipts",
	"capabilityExecutionReceipts",
	"capabilitySpecificReceipts",
	"providerCapabilityObservationReceipts",
	"validatedHumanReviewArtifacts",
	"validatedHumanMetricObservations",
	"reviewRasterScanReceipts",
	"reviewCandidateRefs",
	"blindReviewMappingRefs",
	"sourceReceipts",
	"executionReceipts",
	"attempts",
	"checkpoints",
	"budgetLedger",
	"metricReport",
	"graderReport",
	"humanReviewReport",
	"holdoutExecutionReceipt",
	"authorityAttestation",
	"manifest",
}

func validateEvaluationExportArchiveCapacity(recordCount int64, totalBytes int64) error {
	if recordCount < 1 || recordCount > maximumEvaluationExportRecords ||
		totalBytes < 1 || totalBytes > maximumEvaluationExportArchiveBytes {
		return conflict("evaluation export archive exceeds its capacity")
	}
	return nil
}

type EvaluationEvidenceExportSourceBinding struct {
	RunConfigArtifactBinding EvaluationProductionRunConfigArtifactBinding `json:"runConfigArtifactBinding"`
	SourceConfigDigest       string                                       `json:"sourceConfigDigest"`
	FrozenRunDigest          string                                       `json:"frozenRunDigest"`
}

type EvaluationEvidenceArchiveAuthorityRoots struct {
	CapabilityProbeAdmissionSetDigest                                    string `json:"capabilityProbeAdmissionSetDigest"`
	CapabilityProbeReferenceReceiptSetDigest                             string `json:"capabilityProbeReferenceReceiptSetDigest"`
	RuntimeFactSourceOwnerRegistrationSetDigest                          string `json:"runtimeFactSourceOwnerRegistrationSetDigest"`
	CapabilityProbeProviderResourceCleanupSetDigest                      string `json:"capabilityProbeProviderResourceCleanupSetDigest"`
	HostedRetrievalRuntimeResourceLifecycleJournalSetDigest              string `json:"hostedRetrievalRuntimeResourceLifecycleJournalSetDigest"`
	HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest string `json:"hostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest"`
	HostedRetrievalRuntimeResourceCleanupSetDigest                       string `json:"hostedRetrievalRuntimeResourceCleanupSetDigest"`
	CapabilityEffectProviderRuntimeJournalSetDigest                      string `json:"capabilityEffectProviderRuntimeJournalSetDigest"`
	OptionalCapabilityFactSourceSetDigest                                string `json:"optionalCapabilityFactSourceSetDigest"`
	OptionalCapabilityFactAuthoritySetDigest                             string `json:"optionalCapabilityFactAuthoritySetDigest"`
	EndpointSmokeSetDigest                                               string `json:"endpointSmokeSetDigest"`
	EndpointSmokeDispatchIntentSetDigest                                 string `json:"endpointSmokeDispatchIntentSetDigest"`
	EndpointSmokeTransportReceiptSetDigest                               string `json:"endpointSmokeTransportReceiptSetDigest"`
	EndpointSmokeResultSpoolReceiptSetDigest                             string `json:"endpointSmokeResultSpoolReceiptSetDigest"`
	EndpointSmokeResultSpoolDispositionReceiptSetDigest                  string `json:"endpointSmokeResultSpoolDispositionReceiptSetDigest"`
	EndpointSmokeValidationFailureReceiptSetDigest                       string `json:"endpointSmokeValidationFailureReceiptSetDigest"`
	PreDispatchFailureReceiptSetDigest                                   string `json:"preDispatchFailureReceiptSetDigest"`
	TransportDispatchIntentSetDigest                                     string `json:"transportDispatchIntentSetDigest"`
	TransportReceiptSetDigest                                            string `json:"transportReceiptSetDigest"`
	ProviderResultSpoolReceiptSetDigest                                  string `json:"providerResultSpoolReceiptSetDigest"`
	ProviderResultSpoolDispositionReceiptSetDigest                       string `json:"providerResultSpoolDispositionReceiptSetDigest"`
	InvocationTurnReceiptSetDigest                                       string `json:"invocationTurnReceiptSetDigest"`
	InvocationTurnSetReceiptSetDigest                                    string `json:"invocationTurnSetReceiptSetDigest"`
	ResultSubmissionReceiptSetDigest                                     string `json:"resultSubmissionReceiptSetDigest"`
	AttemptAuthorityOwnerReceiptSetDigest                                string `json:"attemptAuthorityOwnerReceiptSetDigest"`
	ControlledRuntimeReceiptSetDigest                                    string `json:"controlledRuntimeReceiptSetDigest"`
	CapabilityExecutionReceiptSetDigest                                  string `json:"capabilityExecutionReceiptSetDigest"`
	CapabilitySpecificReceiptSetDigest                                   string `json:"capabilitySpecificReceiptSetDigest"`
	ProviderCapabilityObservationReceiptSetDigest                        string `json:"providerCapabilityObservationReceiptSetDigest"`
	VerificationAttemptGrantReceiptSetDigest                             string `json:"verificationAttemptGrantReceiptSetDigest"`
	ValidatedHumanReviewArtifactSetDigest                                string `json:"validatedHumanReviewArtifactSetDigest"`
	ValidatedHumanMetricObservationSetDigest                             string `json:"validatedHumanMetricObservationSetDigest"`
	ReviewRasterScanReceiptSetDigest                                     string `json:"reviewRasterScanReceiptSetDigest"`
	ReviewCandidateRefSetDigest                                          string `json:"reviewCandidateRefSetDigest"`
	BlindReviewMappingSetDigest                                          string `json:"blindReviewMappingSetDigest"`
	SourceReceiptSetDigest                                               string `json:"sourceReceiptSetDigest"`
	ExecutionReceiptSetDigest                                            string `json:"executionReceiptSetDigest"`
	HoldoutExecutionReceiptDigest                                        string `json:"holdoutExecutionReceiptDigest"`
	SecretCanarySetDigest                                                string `json:"secretCanarySetDigest"`
	ProtectedHoldoutCanarySetDigest                                      string `json:"protectedHoldoutCanarySetDigest"`
	ReviewLeaseDigest                                                    string `json:"reviewLeaseDigest,omitempty"`
}

type EvaluationEvidenceArchiveCommitments struct {
	RunConfigArtifactBinding   EvaluationProductionRunConfigArtifactBinding `json:"runConfigArtifactBinding"`
	SourceConfigDigest         string                                       `json:"sourceConfigDigest"`
	FrozenRunDigest            string                                       `json:"frozenRunDigest"`
	PlanDigest                 string                                       `json:"planDigest"`
	RepositoryCommit           string                                       `json:"repositoryCommit"`
	EvidenceSetDigest          string                                       `json:"evidenceSetDigest"`
	AuthorityPayloadDigest     string                                       `json:"authorityPayloadDigest"`
	AuthorityAttestationDigest string                                       `json:"authorityAttestationDigest"`
	AuthorityRoots             EvaluationEvidenceArchiveAuthorityRoots      `json:"authorityRoots"`
	ReviewLeaseDigest          string                                       `json:"reviewLeaseDigest,omitempty"`
	EvaluationManifestDigest   string                                       `json:"evaluationManifestDigest"`
	CreatedAt                  string                                       `json:"createdAt"`
}

type EvaluationExportFamilySummary struct {
	Family                  string  `json:"family"`
	FamilyIndex             int64   `json:"familyIndex"`
	ExpectedRecordCount     int64   `json:"expectedRecordCount"`
	ExpectedRecordSetDigest string  `json:"expectedRecordSetDigest"`
	ExpectedSemanticDigest  string  `json:"expectedSemanticDigest"`
	ExpectedTotalBytes      int64   `json:"expectedTotalBytes"`
	FirstOrderKey           *string `json:"firstOrderKey"`
	LastOrderKey            *string `json:"lastOrderKey"`
}

type EvaluationExportLease struct {
	NamespaceID            string
	Partition              EvaluationPlanPartition
	LeaseKind              string
	LeaseID                string                               `json:"leaseId"`
	LeaseDigest            string                               `json:"leaseDigest"`
	CursorKeyBindingDigest string                               `json:"-"`
	Commitments            EvaluationEvidenceArchiveCommitments `json:"commitments"`
	Families               []EvaluationExportFamilySummary      `json:"families"`
	TotalRecordCount       int64                                `json:"totalRecordCount"`
	TotalRecordBytes       int64                                `json:"totalRecordBytes"`
	CreatedAt              time.Time                            `json:"-"`
	ExpiresAt              time.Time                            `json:"-"`
	CreatedAtText          string                               `json:"createdAt"`
	ExpiresAtText          string                               `json:"expiresAt"`
}

type EvaluationExportSourceRecord struct {
	OrderKey      string          `json:"orderKey"`
	RecordDigest  string          `json:"recordDigest"`
	ContentDigest string          `json:"contentDigest"`
	ByteLength    int64           `json:"byteLength"`
	Value         json.RawMessage `json:"value"`
}

type EvaluationExportRecordPage struct {
	Records            []EvaluationExportSourceRecord
	FirstRecordOrdinal int64
	HasMore            bool
}

type evaluationExportFamilySpec struct {
	Family               string
	Index                int64
	SourceTable          string
	SourcePlanColumn     string
	SourceDigestColumn   string
	SourceBytesColumn    string
	OrderExpression      string
	WhereExpression      string
	Singleton            bool
	SemanticEnvelopeKey  string
	SemanticSortByDigest bool
	Inline               bool
	ProjectFactValue     bool
}

func evaluationExportFamilyIndex(family string) (int64, bool) {
	for index, candidate := range evaluationEvidenceExportFamilies {
		if candidate == family {
			return int64(index), true
		}
	}
	return 0, false
}

func validateEvaluationProviderCapabilityObservationCapacity(recordCount, totalBytes int64) error {
	if recordCount < 0 || recordCount > maximumEvaluationObservationRecords ||
		totalBytes < 0 || totalBytes > maximumEvaluationObservationBytes {
		return conflict("evaluation provider capability observation archive exceeds its capacity")
	}
	return nil
}

func evaluationExportDigestText(hashValue hash.Hash) string {
	return "sha256-" + hex.EncodeToString(hashValue.Sum(nil))
}

func evaluationCanonicalStringArrayDigestPrefix(prefix string, values []string) (string, error) {
	hashValue := sha256.New()
	_, _ = hashValue.Write([]byte(prefix))
	for index, value := range values {
		if !evaluationDigestPattern.MatchString(value) {
			return "", conflict("evaluation export reference digest is invalid")
		}
		if index > 0 {
			_, _ = hashValue.Write([]byte{','})
		}
		encoded, _ := json.Marshal(value)
		_, _ = hashValue.Write(encoded)
	}
	_, _ = hashValue.Write([]byte{']'})
	if prefix != "[" {
		_, _ = hashValue.Write([]byte{'}'})
	}
	return evaluationExportDigestText(hashValue), nil
}

func evaluationExportCanonicalDigestArray(values []string) (string, error) {
	return evaluationCanonicalStringArrayDigestPrefix("[", values)
}

func evaluationExportOrderKey(parts ...string) (string, error) {
	canonical, err := canonicaljson.Bytes(parts)
	return string(canonical), err
}

func evaluationExportFamilySpecs() []evaluationExportFamilySpec {
	index := func(family string) int64 {
		value, _ := evaluationExportFamilyIndex(family)
		return value
	}
	return []evaluationExportFamilySpec{
		{Family: "plan", Index: index("plan"), Singleton: true, Inline: true,
			SourceTable: "agent_evaluation_plans", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "plan_digest", SourceBytesColumn: "plan_bytes", ProjectFactValue: true},
		{Family: "capabilityProbeAdmissions", Index: index("capabilityProbeAdmissions"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "capabilityProbeReferenceReceipts", Index: index("capabilityProbeReferenceReceipts"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "runtimeFactSourceOwnerRegistrations", Index: index("runtimeFactSourceOwnerRegistrations"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "capabilityProbeProviderResourceCleanups", Index: index("capabilityProbeProviderResourceCleanups"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "hostedRetrievalRuntimeResourceLifecycleJournals", Index: index("hostedRetrievalRuntimeResourceLifecycleJournals"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "hostedRetrievalRuntimeResourceCleanups", Index: index("hostedRetrievalRuntimeResourceCleanups"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "capabilityEffectProviderRuntimeJournals", Index: index("capabilityEffectProviderRuntimeJournals"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "optionalCapabilityFactSources", Index: index("optionalCapabilityFactSources"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "optionalCapabilityFactAuthorities", Index: index("optionalCapabilityFactAuthorities"), Inline: true,
			SemanticEnvelopeKey: "recordDigests", SemanticSortByDigest: true},
		{Family: "endpointSmokeDispatchIntents", Index: index("endpointSmokeDispatchIntents"),
			SourceTable: "agent_evaluation_endpoint_smoke_dispatch_intents", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "intent_digest", SourceBytesColumn: "intent_bytes",
			OrderExpression:     `'[' || to_json(source.smoke_target_id)::text || ']'`,
			SemanticEnvelopeKey: "endpointSmokeDispatchIntentDigests"},
		{Family: "endpointSmokeTransportReceipts", Index: index("endpointSmokeTransportReceipts"),
			SourceTable: "agent_evaluation_endpoint_smoke_transport_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression:     `'[' || to_json(source.invocation_id)::text || ',' || to_json(source.receipt_id)::text || ']'`,
			SemanticEnvelopeKey: "endpointSmokeTransportReceiptDigests"},
		{Family: "endpointSmokeResultSpoolReceipts", Index: index("endpointSmokeResultSpoolReceipts"),
			SourceTable: "agent_evaluation_endpoint_smoke_result_spool_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression:     `'[' || to_json(source.smoke_target_id)::text || ']'`,
			SemanticEnvelopeKey: "endpointSmokeResultSpoolReceiptDigests"},
		{Family: "endpointSmokeResultSpoolDispositionReceipts", Index: index("endpointSmokeResultSpoolDispositionReceipts"),
			SourceTable: "agent_evaluation_endpoint_smoke_spool_disposition_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression:     `'[' || to_json(source.smoke_target_id)::text || ']'`,
			SemanticEnvelopeKey: "endpointSmokeResultSpoolDispositionReceiptDigests"},
		{Family: "endpointSmokeValidationFailureReceipts", Index: index("endpointSmokeValidationFailureReceipts"),
			SourceTable: "agent_evaluation_endpoint_smoke_validation_failure_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression:     `'[' || to_json(source.smoke_target_id)::text || ',' || to_json(source.receipt_id)::text || ']'`,
			SemanticEnvelopeKey: "endpointSmokeValidationFailureReceiptDigests"},
		{Family: "endpointSmokeReceipts", Index: index("endpointSmokeReceipts"),
			SourceTable: "agent_evaluation_endpoint_smoke_terminal_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression:     `'[' || to_json(source.smoke_target_id)::text || ']'`,
			SemanticEnvelopeKey: "endpointSmokeReceiptDigests"},
		{Family: "preDispatchFailureReceipts", Index: index("preDispatchFailureReceipts"),
			SourceTable: "agent_evaluation_pre_dispatch_failure_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ',' ||
				to_json(lpad(source.turn_index::text, 12, '0'))::text || ',' || to_json(source.failure_receipt_id)::text || ']'`},
		{Family: "transportDispatchIntents", Index: index("transportDispatchIntents"),
			SourceTable: "agent_evaluation_transport_dispatch_intents", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "intent_digest", SourceBytesColumn: "intent_bytes",
			OrderExpression: `'[' || to_json(source.intent_id)::text || ']'`},
		{Family: "transportReceipts", Index: index("transportReceipts"),
			SourceTable: "agent_evaluation_transport_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.receipt_id)::text || ']'`},
		{Family: "providerResultSpoolReceipts", Index: index("providerResultSpoolReceipts"),
			SourceTable: "agent_evaluation_provider_result_spool_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.spool_ref)::text || ']'`},
		{Family: "providerResultSpoolDispositionReceipts", Index: index("providerResultSpoolDispositionReceipts"),
			SourceTable: "agent_evaluation_provider_result_spool_dispositions", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.spool_ref)::text || ']'`},
		{Family: "invocationTurnReceipts", Index: index("invocationTurnReceipts"),
			SourceTable: "agent_evaluation_invocation_turn_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "evidence_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ',' ||
				to_json(lpad(source.turn_index::text, 12, '0'))::text || ']'`},
		{Family: "invocationTurnSetReceipts", Index: index("invocationTurnSetReceipts"),
			SourceTable: "agent_evaluation_invocation_turn_set_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ']'`},
		{Family: "resultSubmissionReceipts", Index: index("resultSubmissionReceipts"),
			SourceTable: "agent_evaluation_result_submission_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ']'`},
		{Family: "attemptAuthorityOwnerReceipts", Index: index("attemptAuthorityOwnerReceipts"),
			SourceTable: "agent_evaluation_attempt_authority_owner_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ',' ||
				to_json(source.service_kind)::text || ',' || to_json(source.operation)::text || ',' ||
				to_json(source.request_digest)::text || ']'`,
			WhereExpression: `EXISTS (
				SELECT 1 FROM agent_evaluation_attempt_authority_commit_links link
				WHERE link.namespace_id=source.namespace_id AND link.plan_digest=source.plan_digest
					AND link.repository_commit=source.repository_commit
					AND link.attempt_id=source.attempt_id
					AND link.receipt_digest=source.receipt_digest
			)`, SemanticEnvelopeKey: "receiptDigests"},
		{Family: "verificationAttemptGrantReceipts", Index: index("verificationAttemptGrantReceipts"),
			SourceTable: "agent_evaluation_verification_attempt_grant_receipts", SourcePlanColumn: "evaluation_plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ',' || to_json(source.cell_id)::text || ',' ||
				to_json(source.verification_attempt_grant_id)::text || ']'`,
			SemanticEnvelopeKey: "verificationAttemptGrantReceiptDigests"},
		{Family: "controlledRuntimeReceipts", Index: index("controlledRuntimeReceipts"),
			SourceTable: "agent_evaluation_controlled_runtime_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ']'`},
		{Family: "capabilityExecutionReceipts", Index: index("capabilityExecutionReceipts"),
			SourceTable: "agent_evaluation_capability_execution_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ',' ||
				to_json(lpad(source.turn_index::text, 12, '0'))::text || ',' ||
				to_json(source.capability_execution_receipt_id)::text || ']'`},
		{Family: "capabilitySpecificReceipts", Index: index("capabilitySpecificReceipts"),
			SourceTable: "agent_evaluation_capability_specific_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ',' ||
				to_json(lpad(source.turn_index::text, 12, '0'))::text || ',' ||
				to_json(source.receipt_kind)::text || ',' || to_json(source.receipt_id)::text || ']'`,
			SemanticEnvelopeKey: "receiptDigests"},
		{Family: "providerCapabilityObservationReceipts", Index: index("providerCapabilityObservationReceipts"),
			SourceTable: "agent_evaluation_provider_capability_observation_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ',' ||
				to_json(lpad(source.turn_index::text, 12, '0'))::text || ',' ||
				to_json(source.invocation_id)::text || ',' || to_json(source.observation_receipt_id)::text || ']'`,
			WhereExpression: `EXISTS (
				SELECT 1 FROM agent_evaluation_provider_capability_observation_commit_links link
				WHERE link.namespace_id=source.namespace_id AND link.plan_digest=source.plan_digest
					AND link.repository_commit=source.repository_commit
					AND link.receipt_digest=source.receipt_digest
			)`, SemanticEnvelopeKey: "receiptDigests"},
		{Family: "validatedHumanReviewArtifacts", Index: index("validatedHumanReviewArtifacts"),
			SourceTable: "agent_evaluation_validated_human_review_artifacts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "artifact_digest", SourceBytesColumn: "artifact_bytes",
			OrderExpression: `'[' || to_json(source.artifact_id)::text || ']'`},
		{Family: "validatedHumanMetricObservations", Index: index("validatedHumanMetricObservations"),
			SourceTable: "agent_evaluation_validated_human_metric_observations", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "observation_digest", SourceBytesColumn: "observation_bytes",
			OrderExpression:     `'[' || to_json(source.observation_id)::text || ']'`,
			SemanticEnvelopeKey: "validatedHumanMetricObservationDigests"},
		{Family: "reviewRasterScanReceipts", Index: index("reviewRasterScanReceipts"),
			SourceTable: "agent_evaluation_review_raster_scan_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ']'`},
		{Family: "reviewCandidateRefs", Index: index("reviewCandidateRefs"), Inline: true},
		{Family: "blindReviewMappingRefs", Index: index("blindReviewMappingRefs"), Inline: true},
		{Family: "sourceReceipts", Index: index("sourceReceipts"),
			SourceTable: "agent_evaluation_source_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.source_receipt_id)::text || ']'`},
		{Family: "executionReceipts", Index: index("executionReceipts"),
			SourceTable: "agent_evaluation_execution_receipts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "receipt_digest", SourceBytesColumn: "receipt_bytes",
			OrderExpression: `'[' || to_json(source.attempt_id)::text || ']'`},
		{Family: "attempts", Index: index("attempts"), Inline: true,
			SourceTable: "agent_evaluation_attempts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "attempt_digest", SourceBytesColumn: "attempt_bytes", ProjectFactValue: true},
		{Family: "checkpoints", Index: index("checkpoints"), Inline: true,
			SourceTable: "agent_evaluation_checkpoints", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "checkpoint_digest", SourceBytesColumn: "checkpoint_bytes", ProjectFactValue: true},
		{Family: "budgetLedger", Index: index("budgetLedger"), Singleton: true, Inline: true},
		{Family: "metricReport", Index: index("metricReport"), Singleton: true, Inline: true,
			SourceTable: "agent_evaluation_artifacts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "fact_digest", SourceBytesColumn: "fact_bytes", ProjectFactValue: true},
		{Family: "graderReport", Index: index("graderReport"), Singleton: true, Inline: true,
			SourceTable: "agent_evaluation_artifacts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "fact_digest", SourceBytesColumn: "fact_bytes", ProjectFactValue: true},
		{Family: "humanReviewReport", Index: index("humanReviewReport"), Singleton: true, Inline: true,
			SourceTable: "agent_evaluation_artifacts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "fact_digest", SourceBytesColumn: "fact_bytes", ProjectFactValue: true},
		{Family: "holdoutExecutionReceipt", Index: index("holdoutExecutionReceipt"), Singleton: true, Inline: true,
			SourceTable: "agent_evaluation_artifacts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "fact_digest", SourceBytesColumn: "fact_bytes", ProjectFactValue: true},
		{Family: "authorityAttestation", Index: index("authorityAttestation"), Singleton: true,
			SourceTable: "agent_evaluation_authority_attestations", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "attestation_digest", SourceBytesColumn: "attestation_bytes",
			OrderExpression: `'["authorityAttestation"]'`},
		{Family: "manifest", Index: index("manifest"), Singleton: true, Inline: true,
			SourceTable: "agent_evaluation_artifacts", SourcePlanColumn: "plan_digest",
			SourceDigestColumn: "fact_digest", SourceBytesColumn: "fact_bytes", ProjectFactValue: true},
	}
}

func materializeEvaluationRawExportFamily(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
	spec evaluationExportFamilySpec,
) error {
	if spec.SourceTable == "" || spec.Inline {
		return nil
	}
	where := ""
	if spec.WhereExpression != "" {
		where = " AND (" + spec.WhereExpression + ")"
	}
	commitPredicate := ""
	if !spec.ProjectFactValue {
		commitPredicate = " AND source.repository_commit = $5"
	}
	query := fmt.Sprintf(`WITH source_records AS (
		SELECT %s AS order_key, source.%s AS record_digest,
			octet_length(source.%s)::bigint AS byte_length
		FROM %s source
		WHERE source.namespace_id = $1 AND source.%s = $2%s%s
	), ordered AS (
		SELECT order_key, record_digest, byte_length,
			row_number() OVER (ORDER BY order_key COLLATE "C" ASC) - 1 AS record_ordinal
		FROM source_records
	)
	INSERT INTO agent_evaluation_export_lease_records (
		namespace_id, lease_id, family, record_ordinal, order_key,
		record_digest, byte_length, inline_value_bytes
	) SELECT $1, $3, $4, record_ordinal, order_key, record_digest, byte_length, NULL
	FROM ordered`, spec.OrderExpression, spec.SourceDigestColumn, spec.SourceBytesColumn,
		spec.SourceTable, spec.SourcePlanColumn, commitPredicate, where)
	_, err := tx.ExecContext(ctx, query, namespaceID, partition.PlanDigest, leaseID, spec.Family,
		partition.RepositoryCommit)
	return err
}

type evaluationExportReference struct {
	OrderKey     string
	RecordDigest string
	ByteLength   int64
	InlineBytes  []byte
}

func evaluationExportCanonicalValue(value any) ([]byte, error) {
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || len(canonical) < 1 || int64(len(canonical)) > maximumEvaluationExportRecordBytes {
		return nil, conflict("evaluation export record exceeds its canonical byte limit")
	}
	return canonical, nil
}

func evaluationExportFactValue(source []byte) (map[string]any, []byte, error) {
	value, err := decodeCanonicalEvaluationJSON(source)
	if err != nil {
		return nil, nil, err
	}
	envelope, ok := value.(map[string]any)
	if !ok {
		return nil, nil, conflict("evaluation export fact envelope is invalid")
	}
	factValue, ok := envelope["value"].(map[string]any)
	if !ok {
		return nil, nil, conflict("evaluation export fact value is invalid")
	}
	canonical, err := evaluationExportCanonicalValue(factValue)
	return factValue, canonical, err
}

func insertEvaluationExportReferences(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	leaseID string,
	family string,
	references []evaluationExportReference,
) error {
	sort.Slice(references, func(left, right int) bool {
		return bytes.Compare([]byte(references[left].OrderKey), []byte(references[right].OrderKey)) < 0
	})
	statement, err := tx.PrepareContext(ctx, `INSERT INTO agent_evaluation_export_lease_records (
		namespace_id, lease_id, family, record_ordinal, order_key,
		record_digest, byte_length, inline_value_bytes
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`)
	if err != nil {
		return err
	}
	defer statement.Close()
	for index, reference := range references {
		if reference.OrderKey == "" || !evaluationDigestPattern.MatchString(reference.RecordDigest) ||
			reference.ByteLength < 1 || reference.ByteLength > maximumEvaluationExportRecordBytes ||
			(index > 0 && references[index-1].OrderKey >= reference.OrderKey) ||
			(reference.InlineBytes != nil && int64(len(reference.InlineBytes)) != reference.ByteLength) {
			return conflict("evaluation export reference is invalid or non-canonical")
		}
		if _, err := statement.ExecContext(ctx, namespaceID, leaseID, family, int64(index), reference.OrderKey,
			reference.RecordDigest, reference.ByteLength, reference.InlineBytes); err != nil {
			return err
		}
	}
	return nil
}

func materializeEvaluationPlanExportReference(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	leaseID string,
	plan EvaluationPlanRecord,
) error {
	value, canonical, err := evaluationExportFactValue(plan.FactBytes)
	if err != nil || stringMember(value, "planDigest") != plan.FactDigest {
		return conflict("evaluation export plan fact drifted")
	}
	key, err := evaluationExportOrderKey("plan")
	if err != nil {
		return err
	}
	return insertEvaluationExportReferences(ctx, tx, namespaceID, leaseID, "plan", []evaluationExportReference{{
		OrderKey: key, RecordDigest: plan.FactDigest, ByteLength: int64(len(canonical)),
	}})
}

func materializeEvaluationAttemptExportReferences(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
) error {
	rows, err := tx.QueryContext(ctx, `SELECT attempt_id, attempt_digest, attempt_bytes
		FROM agent_evaluation_attempts
		WHERE namespace_id = $1 AND plan_digest = $2
		ORDER BY attempt_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest)
	if err != nil {
		return err
	}
	references := make([]evaluationExportReference, 0)
	for rows.Next() {
		var attemptID, digest string
		var source []byte
		if err := rows.Scan(&attemptID, &digest, &source); err != nil {
			_ = rows.Close()
			return err
		}
		value, canonical, err := evaluationExportFactValue(source)
		descriptor, descriptorOK := objectMember(value, "descriptor")
		if err != nil || !descriptorOK || stringMember(descriptor, "attemptId") != attemptID ||
			stringMember(value, "attemptDigest") != digest {
			_ = rows.Close()
			return conflict("evaluation export attempt fact drifted")
		}
		key, err := evaluationExportOrderKey(attemptID)
		if err != nil {
			_ = rows.Close()
			return err
		}
		references = append(references, evaluationExportReference{
			OrderKey: key, RecordDigest: digest, ByteLength: int64(len(canonical)),
		})
		if int64(len(references)) > maximumEvaluationExportRecords {
			_ = rows.Close()
			return conflict("evaluation export attempt count exceeds its limit")
		}
	}
	if err := rows.Close(); err != nil {
		return err
	}
	return insertEvaluationExportReferences(ctx, tx, namespaceID, leaseID, "attempts", references)
}

func materializeEvaluationCheckpointExportReferences(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
) error {
	rows, err := tx.QueryContext(ctx, `SELECT DISTINCT ON (shard_id)
		shard_id, checkpoint_digest, checkpoint_bytes
		FROM agent_evaluation_checkpoints
		WHERE namespace_id = $1 AND plan_digest = $2
		ORDER BY shard_id COLLATE "C" ASC, revision DESC`, namespaceID, partition.PlanDigest)
	if err != nil {
		return err
	}
	references := make([]evaluationExportReference, 0)
	for rows.Next() {
		var shardID, digest string
		var source []byte
		if err := rows.Scan(&shardID, &digest, &source); err != nil {
			_ = rows.Close()
			return err
		}
		value, canonical, err := evaluationExportFactValue(source)
		if err != nil || stringMember(value, "shardId") != shardID || stringMember(value, "checkpointDigest") != digest {
			_ = rows.Close()
			return conflict("evaluation export checkpoint fact drifted")
		}
		key, err := evaluationExportOrderKey(shardID)
		if err != nil {
			_ = rows.Close()
			return err
		}
		references = append(references, evaluationExportReference{OrderKey: key, RecordDigest: digest, ByteLength: int64(len(canonical))})
	}
	if err := rows.Close(); err != nil {
		return err
	}
	return insertEvaluationExportReferences(ctx, tx, namespaceID, leaseID, "checkpoints", references)
}

var evaluationArtifactExportFamilies = map[string]string{
	"evaluation-metric-report":       "metricReport",
	"evaluation-grader-report":       "graderReport",
	"evaluation-human-review-report": "humanReviewReport",
	"evaluation-holdout-receipt":     "holdoutExecutionReceipt",
	"evaluation-manifest":            "manifest",
}

func materializeEvaluationArtifactExportReferences(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
) error {
	rows, err := tx.QueryContext(ctx, `SELECT fact_type, fact_digest, fact_bytes
		FROM agent_evaluation_artifacts
		WHERE namespace_id = $1 AND plan_digest = $2
		ORDER BY fact_type COLLATE "C" ASC, fact_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest)
	if err != nil {
		return err
	}
	byFamily := make(map[string][]evaluationExportReference)
	for rows.Next() {
		var factType, digest string
		var source []byte
		if err := rows.Scan(&factType, &digest, &source); err != nil {
			_ = rows.Close()
			return err
		}
		family, ok := evaluationArtifactExportFamilies[factType]
		if !ok {
			_ = rows.Close()
			return conflict("evaluation export artifact type is unsupported")
		}
		value, canonical, err := evaluationExportFactValue(source)
		if err != nil {
			_ = rows.Close()
			return err
		}
		semanticField := "reportDigest"
		switch factType {
		case "evaluation-holdout-receipt":
			semanticField = "receiptDigest"
		case "evaluation-manifest":
			semanticField = "manifestDigest"
		}
		if stringMember(value, semanticField) != digest {
			_ = rows.Close()
			return conflict("evaluation export artifact digest drifted")
		}
		key, err := evaluationExportOrderKey(family)
		if err != nil {
			_ = rows.Close()
			return err
		}
		byFamily[family] = append(byFamily[family], evaluationExportReference{
			OrderKey: key, RecordDigest: digest, ByteLength: int64(len(canonical)),
		})
	}
	if err := rows.Close(); err != nil {
		return err
	}
	for _, family := range []string{"metricReport", "graderReport", "humanReviewReport", "holdoutExecutionReceipt", "manifest"} {
		if err := insertEvaluationExportReferences(ctx, tx, namespaceID, leaseID, family, byFamily[family]); err != nil {
			return err
		}
	}
	return nil
}

func materializeEvaluationReviewReferenceExportFamilies(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
) error {
	rows, err := tx.QueryContext(ctx, `SELECT candidate_id, attempt_id, descriptor_digest, response_digest,
		execution_receipt_digest, grader_artifact_digest, projection_authority_digest, media_type,
		width, height, bytes_digest, byte_length, public_artifact_scan_digest, candidate_digest, generated_at
		FROM agent_evaluation_review_candidates
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
		ORDER BY attempt_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return err
	}
	candidateReferences := make([]evaluationExportReference, 0)
	for rows.Next() {
		var reference EvaluationReviewCandidateRef
		reference.NamespaceID, reference.PlanDigest, reference.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		if err := rows.Scan(&reference.CandidateID, &reference.AttemptID, &reference.DescriptorDigest,
			&reference.ResponseDigest, &reference.ExecutionReceiptDigest, &reference.GraderArtifactDigest,
			&reference.ProjectionAuthorityDigest, &reference.MediaType, &reference.Width, &reference.Height,
			&reference.BytesDigest, &reference.ByteLength, &reference.PublicArtifactScanDigest,
			&reference.CandidateDigest, &reference.GeneratedAt); err != nil {
			_ = rows.Close()
			return err
		}
		canonical, err := evaluationExportCanonicalValue(canonicalEvaluationReviewCandidateRef(reference))
		if err != nil {
			_ = rows.Close()
			return err
		}
		key, err := evaluationExportOrderKey(reference.AttemptID)
		if err != nil {
			_ = rows.Close()
			return err
		}
		candidateReferences = append(candidateReferences, evaluationExportReference{
			OrderKey: key, RecordDigest: reference.CandidateDigest, ByteLength: int64(len(canonical)),
		})
	}
	if err := rows.Close(); err != nil {
		return err
	}
	if err := insertEvaluationExportReferences(ctx, tx, namespaceID, leaseID, "reviewCandidateRefs", candidateReferences); err != nil {
		return err
	}

	mappingRows, err := tx.QueryContext(ctx, `SELECT mapping_id, mapping_digest
		FROM agent_evaluation_blind_review_mappings
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
		ORDER BY mapping_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return err
	}
	mappingReferences := make([]evaluationExportReference, 0)
	for mappingRows.Next() {
		var mappingID, mappingDigest string
		if err := mappingRows.Scan(&mappingID, &mappingDigest); err != nil {
			_ = mappingRows.Close()
			return err
		}
		value := map[string]any{"mappingId": mappingID, "mappingDigest": mappingDigest}
		canonical, err := evaluationExportCanonicalValue(value)
		if err != nil {
			_ = mappingRows.Close()
			return err
		}
		recordDigest, err := canonicaljson.Digest(value)
		if err != nil {
			_ = mappingRows.Close()
			return err
		}
		key, err := evaluationExportOrderKey(mappingID)
		if err != nil {
			_ = mappingRows.Close()
			return err
		}
		mappingReferences = append(mappingReferences, evaluationExportReference{
			OrderKey: key, RecordDigest: recordDigest, ByteLength: int64(len(canonical)),
		})
	}
	if err := mappingRows.Close(); err != nil {
		return err
	}
	return insertEvaluationExportReferences(ctx, tx, namespaceID, leaseID, "blindReviewMappingRefs", mappingReferences)
}

func materializeEvaluationQualificationAuthorityExportFamilies(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	leaseID string,
	planRecord EvaluationPlanRecord,
) error {
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil || plan.PlanDigest != partition.PlanDigest || plan.RepositoryCommit != partition.RepositoryCommit {
		return conflict("evaluation qualification authority export plan drifted")
	}
	probeAdmissions, err := queryEvaluationCapabilityProbeAdmissionArchiveRecords(
		ctx, tx, authority, partition,
	)
	if err != nil {
		return err
	}
	probeReferences, err := queryEvaluationCapabilityProbeReferenceArchiveRecords(
		ctx, tx, authority, partition,
	)
	if err != nil {
		return err
	}
	if err := validateEvaluationCapabilityProbeArchiveProjection(probeAdmissions, probeReferences); err != nil {
		return err
	}
	registrationRecords, err := queryEvaluationRuntimeFactSourceRegistrationArchiveRecords(
		ctx, tx, authority, plan,
	)
	if err != nil {
		return err
	}
	cleanupRecords, err := queryEvaluationCapabilityProbeProviderResourceCleanupArchiveRecords(
		ctx, tx, authority, partition,
	)
	if err != nil {
		return err
	}
	if err := validateEvaluationCapabilityProbeProviderResourceCleanupArchivePlan(plan, cleanupRecords); err != nil {
		return err
	}
	hostedLifecycleJournalRecords, err := queryEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecords(
		ctx, tx, authority, partition,
	)
	if err != nil {
		return err
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchivePlan(plan, hostedLifecycleJournalRecords); err != nil {
		return err
	}
	hostedCleanupRecords, err := queryEvaluationHostedRetrievalRuntimeResourceCleanupArchiveRecords(
		ctx, tx, authority, partition,
	)
	if err != nil {
		return err
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchivePlan(plan, hostedCleanupRecords); err != nil {
		return err
	}
	journalRecords, err := queryEvaluationCapabilityEffectProviderRuntimeArchiveRecords(
		ctx, tx, authority, partition,
	)
	if err != nil {
		return err
	}
	sourceRecords, err := queryEvaluationOptionalFactSourceArchiveRecords(ctx, tx, authority, partition)
	if err != nil {
		return err
	}
	authorityRecords, err := queryEvaluationOptionalFactAuthorityArchiveRecords(ctx, tx, authority, partition)
	if err != nil {
		return err
	}
	plannedTurns, err := evaluationOptionalFactPlannedTurnDenominator(plan)
	if err != nil {
		return err
	}
	plannedRegistrations, err := evaluationRuntimeFactSourceRegistrationDenominator(plan)
	if err != nil {
		return err
	}
	if _, err := evaluationOptionalFactArchiveFamilyProjection(
		plannedTurns, plannedRegistrations, registrationRecords, sourceRecords, authorityRecords,
	); err != nil {
		return err
	}
	if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveSources(journalRecords, sourceRecords); err != nil {
		return err
	}

	probeAdmissionReferences := make([]evaluationExportReference, len(probeAdmissions))
	for index, record := range probeAdmissions {
		key, err := evaluationExportOrderKey(record.RequestDigest)
		if err != nil {
			return err
		}
		probeAdmissionReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.RecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	if err := insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "capabilityProbeAdmissions", probeAdmissionReferences,
	); err != nil {
		return err
	}
	probeReferenceReferences := make([]evaluationExportReference, len(probeReferences))
	for index, record := range probeReferences {
		key, err := evaluationExportOrderKey(record.AdmissionRequestDigest, fmt.Sprintf("%02d", record.Ordinal))
		if err != nil {
			return err
		}
		probeReferenceReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.RecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	if err := insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "capabilityProbeReferenceReceipts", probeReferenceReferences,
	); err != nil {
		return err
	}
	registrationReferences := make([]evaluationExportReference, len(registrationRecords))
	for index, record := range registrationRecords {
		key, err := evaluationExportOrderKey(record.RegistrationReceiptDigest)
		if err != nil {
			return err
		}
		registrationReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.RecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	if err := insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "runtimeFactSourceOwnerRegistrations", registrationReferences,
	); err != nil {
		return err
	}
	cleanupReferences := make([]evaluationExportReference, len(cleanupRecords))
	for index, record := range cleanupRecords {
		key, err := evaluationExportOrderKey(record.RepositoryCommit, record.ResourceRegistrationRequestDigest)
		if err != nil {
			return err
		}
		cleanupReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.RecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	if err := insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "capabilityProbeProviderResourceCleanups", cleanupReferences,
	); err != nil {
		return err
	}
	hostedLifecycleJournalReferences := make([]evaluationExportReference, len(hostedLifecycleJournalRecords))
	for index, record := range hostedLifecycleJournalRecords {
		key, err := evaluationExportOrderKey(
			record.Operation, record.RegistrationRequestDigest, record.ResourceRole, record.ResourceID,
		)
		if err != nil {
			return err
		}
		hostedLifecycleJournalReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.ArchiveRecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	if err := insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "hostedRetrievalRuntimeResourceLifecycleJournals", hostedLifecycleJournalReferences,
	); err != nil {
		return err
	}
	hostedCleanupReferences := make([]evaluationExportReference, len(hostedCleanupRecords))
	for index, record := range hostedCleanupRecords {
		key, err := evaluationExportOrderKey(
			record.RepositoryCommit, record.RuntimeResourceSetID,
			record.ProtocolFamily, record.CapabilityProfileID,
		)
		if err != nil {
			return err
		}
		hostedCleanupReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.RecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	if err := insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "hostedRetrievalRuntimeResourceCleanups", hostedCleanupReferences,
	); err != nil {
		return err
	}
	journalReferences := make([]evaluationExportReference, len(journalRecords))
	for index, record := range journalRecords {
		key, err := evaluationExportOrderKey(
			record.AttemptID, fmt.Sprintf("%012d", record.TurnIndex), record.OwnerRequestDigest,
		)
		if err != nil {
			return err
		}
		journalReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.RecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	if err := insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "capabilityEffectProviderRuntimeJournals", journalReferences,
	); err != nil {
		return err
	}
	sourceReferences := make([]evaluationExportReference, len(sourceRecords))
	for index, record := range sourceRecords {
		key, err := evaluationExportOrderKey(record.AttemptID, fmt.Sprintf("%012d", record.TurnIndex))
		if err != nil {
			return err
		}
		sourceReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.RecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	if err := insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "optionalCapabilityFactSources", sourceReferences,
	); err != nil {
		return err
	}
	ownerReferences := make([]evaluationExportReference, len(authorityRecords))
	for index, record := range authorityRecords {
		key, err := evaluationExportOrderKey(record.AttemptID, fmt.Sprintf("%012d", record.TurnIndex))
		if err != nil {
			return err
		}
		ownerReferences[index] = evaluationExportReference{
			OrderKey: key, RecordDigest: record.RecordDigest, ByteLength: int64(len(record.RecordBytes)),
			InlineBytes: record.RecordBytes,
		}
	}
	return insertEvaluationExportReferences(
		ctx, tx, authority.NamespaceID, leaseID, "optionalCapabilityFactAuthorities", ownerReferences,
	)
}

func materializeEvaluationBudgetExportReference(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
	planRecord EvaluationPlanRecord,
) error {
	var rawBytes int64
	if err := tx.QueryRowContext(ctx, `SELECT
		COALESCE((SELECT SUM(octet_length(demand_bytes)) FROM agent_evaluation_budget_reservations
			WHERE namespace_id = $1 AND plan_digest = $2), 0)
		+ COALESCE((SELECT SUM(octet_length(settlement_bytes)) FROM agent_evaluation_budget_settlements
			WHERE namespace_id = $1 AND plan_digest = $2), 0)`, namespaceID, partition.PlanDigest).Scan(&rawBytes); err != nil {
		return err
	}
	if rawBytes > maximumEvaluationExportRecordBytes-1_048_576 {
		return conflict("evaluation budget ledger exceeds the archive record limit")
	}
	value, canonical, ledgerDigest, err := canonicalEvaluationBudgetLedger(
		ctx, tx, namespaceID, partition, planRecord,
	)
	if err != nil {
		return err
	}
	_ = value
	key, err := evaluationExportOrderKey("budgetLedger")
	if err != nil {
		return err
	}
	return insertEvaluationExportReferences(ctx, tx, namespaceID, leaseID, "budgetLedger", []evaluationExportReference{{
		OrderKey: key, RecordDigest: ledgerDigest, ByteLength: int64(len(canonical)), InlineBytes: canonical,
	}})
}

func canonicalEvaluationBudgetLedger(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
) (map[string]any, []byte, string, error) {
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return nil, nil, "", err
	}
	budgetEnvelope, budgetEnvelopeOK := objectMember(plan.Value, "budget")
	budget, budgetOK := objectMember(budgetEnvelope, "budget")
	if !budgetEnvelopeOK || !budgetOK {
		return nil, nil, "", conflict("evaluation export plan budget is invalid")
	}
	snapshot, err := loadEvaluationBudgetSnapshot(ctx, queryer, namespaceID, partition, planRecord)
	if err != nil {
		return nil, nil, "", err
	}
	settlements := make(map[string]map[string]any, len(snapshot.Settlements))
	for _, record := range snapshot.Settlements {
		value, err := decodeCanonicalEvaluationJSON(record.SettlementBytes)
		if err != nil {
			return nil, nil, "", err
		}
		settlement, ok := value.(map[string]any)
		if !ok || stringMember(settlement, "settlementDigest") != record.SettlementDigest {
			return nil, nil, "", conflict("evaluation export budget settlement drifted")
		}
		settlements[record.ReservationID] = settlement
	}
	type canonicalReservation struct {
		identity string
		value    map[string]any
	}
	reservations := make([]canonicalReservation, 0, len(snapshot.Reservations))
	for _, record := range snapshot.Reservations {
		value, err := decodeCanonicalEvaluationJSON(record.DemandBytes)
		if err != nil {
			return nil, nil, "", err
		}
		demand, ok := value.(map[string]any)
		if !ok {
			return nil, nil, "", conflict("evaluation export budget demand drifted")
		}
		reservation := map[string]any{
			"reservationId": record.ReservationID,
			"demand":        demand,
			"demandDigest":  record.DemandDigest,
			"reservedAt":    evaluationExportInstant(record.ReservedAt),
			"status":        "reserved",
		}
		if settlement, exists := settlements[record.ReservationID]; exists {
			reservation["status"] = "settled"
			reservation["settlement"] = settlement
		}
		reservations = append(reservations, canonicalReservation{identity: record.ReservationID, value: reservation})
	}
	sort.Slice(reservations, func(left, right int) bool {
		return bytes.Compare([]byte(reservations[left].identity), []byte(reservations[right].identity)) < 0
	})
	reservationValues := make([]any, len(reservations))
	for index := range reservations {
		if index > 0 && reservations[index-1].identity >= reservations[index].identity {
			return nil, nil, "", conflict("evaluation export budget reservation identities are not canonical")
		}
		reservationValues[index] = reservations[index].value
	}
	base := map[string]any{"budget": budget, "revision": snapshot.Revision, "reservations": reservationValues}
	ledgerDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, nil, "", err
	}
	value := map[string]any{"budget": budget, "revision": snapshot.Revision, "reservations": reservationValues, "ledgerDigest": ledgerDigest}
	canonical, err := evaluationExportCanonicalValue(value)
	if err != nil {
		return nil, nil, "", err
	}
	return value, canonical, ledgerDigest, nil
}

func evaluationExportHashDigestSequence(rows *sql.Rows, prefix string) (string, int64, int64, *string, *string, error) {
	hashValue := sha256.New()
	_, _ = hashValue.Write([]byte(prefix))
	var count, totalBytes int64
	var first, last *string
	previousOrderKey := ""
	for rows.Next() {
		var orderKey, digest string
		var byteLength int64
		if err := rows.Scan(&orderKey, &digest, &byteLength); err != nil {
			return "", 0, 0, nil, nil, err
		}
		if orderKey == "" || !evaluationDigestPattern.MatchString(digest) || byteLength < 1 ||
			byteLength > maximumEvaluationExportRecordBytes || (count > 0 && previousOrderKey >= orderKey) {
			return "", 0, 0, nil, nil, conflict("evaluation export family references are invalid")
		}
		if count > 0 {
			_, _ = hashValue.Write([]byte{','})
		}
		encoded, _ := json.Marshal(digest)
		_, _ = hashValue.Write(encoded)
		if first == nil {
			copyValue := orderKey
			first = &copyValue
		}
		copyValue := orderKey
		last = &copyValue
		previousOrderKey = orderKey
		count++
		totalBytes += byteLength
		if count > maximumEvaluationExportRecords || totalBytes > maximumEvaluationExportArchiveBytes {
			return "", 0, 0, nil, nil, conflict("evaluation export family exceeds its capacity")
		}
	}
	if err := rows.Err(); err != nil {
		return "", 0, 0, nil, nil, err
	}
	_, _ = hashValue.Write([]byte{']'})
	if prefix != "[" {
		_, _ = hashValue.Write([]byte{'}'})
	}
	return evaluationExportDigestText(hashValue), count, totalBytes, first, last, nil
}

func evaluationExportBlindMappingSemanticDigest(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
) (string, error) {
	rows, err := tx.QueryContext(ctx, `SELECT mapping_id, mapping_digest
		FROM agent_evaluation_blind_review_mappings
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
		ORDER BY mapping_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return "", err
	}
	defer rows.Close()
	hashValue := sha256.New()
	_, _ = hashValue.Write([]byte{'['})
	count := 0
	previous := ""
	for rows.Next() {
		var mappingID, mappingDigest string
		if err := rows.Scan(&mappingID, &mappingDigest); err != nil {
			return "", err
		}
		if mappingID == "" || !evaluationDigestPattern.MatchString(mappingDigest) || (count > 0 && previous >= mappingID) {
			return "", conflict("evaluation blind mapping export references are invalid")
		}
		if count > 0 {
			_, _ = hashValue.Write([]byte{','})
		}
		canonical, err := canonicaljson.Bytes(map[string]any{"mappingId": mappingID, "mappingDigest": mappingDigest})
		if err != nil {
			return "", err
		}
		_, _ = hashValue.Write(canonical)
		previous = mappingID
		count++
	}
	if err := rows.Err(); err != nil {
		return "", err
	}
	_, _ = hashValue.Write([]byte{']'})
	return evaluationExportDigestText(hashValue), nil
}

func summarizeEvaluationExportFamily(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
	spec evaluationExportFamilySpec,
) (EvaluationExportFamilySummary, error) {
	rows, err := tx.QueryContext(ctx, `SELECT order_key, record_digest, byte_length
		FROM agent_evaluation_export_lease_records
		WHERE namespace_id = $1 AND lease_id = $2 AND family = $3
		ORDER BY record_ordinal ASC`, namespaceID, leaseID, spec.Family)
	if err != nil {
		return EvaluationExportFamilySummary{}, err
	}
	recordSetDigest, count, totalBytes, first, last, err := evaluationExportHashDigestSequence(rows, "[")
	_ = rows.Close()
	if err != nil {
		return EvaluationExportFamilySummary{}, err
	}
	if spec.Family == "providerCapabilityObservationReceipts" &&
		validateEvaluationProviderCapabilityObservationCapacity(count, totalBytes) != nil {
		return EvaluationExportFamilySummary{}, conflict("evaluation provider capability observation archive exceeds its capacity")
	}
	switch spec.Family {
	case "capabilityProbeAdmissions":
		if count != maximumEvaluationCapabilityProbeAdmissions ||
			totalBytes > maximumEvaluationCapabilityProbeAdmissionWrapperArchiveBytes {
			return EvaluationExportFamilySummary{}, conflict("evaluation capability probe admission export is incomplete or over capacity")
		}
	case "capabilityProbeReferenceReceipts":
		if count != maximumEvaluationCapabilityProbeReferences ||
			totalBytes > maximumEvaluationCapabilityProbeReferenceWrapperArchiveBytes {
			return EvaluationExportFamilySummary{}, conflict("evaluation capability probe reference export is incomplete or over capacity")
		}
	case "runtimeFactSourceOwnerRegistrations":
		if count < 0 || count > maximumEvaluationRuntimeFactSourceRegistrations ||
			totalBytes > maximumEvaluationRuntimeFactSourceRegistrationArchiveBytes {
			return EvaluationExportFamilySummary{}, conflict("evaluation runtime fact source registration export exceeds its capacity")
		}
	case "capabilityProbeProviderResourceCleanups":
		if count != 4 || totalBytes > maximumEvaluationCapabilityProbeProviderResourceCleanupArchiveFamily {
			return EvaluationExportFamilySummary{}, conflict("evaluation capability probe Provider resource cleanup export is incomplete or over capacity")
		}
	case "hostedRetrievalRuntimeResourceLifecycleJournals":
		if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveCapacity(count, totalBytes); err != nil {
			return EvaluationExportFamilySummary{}, err
		}
	case "hostedRetrievalRuntimeResourceCleanups":
		if err := validateEvaluationHostedRetrievalRuntimeResourceCleanupArchiveCapacity(count, totalBytes); err != nil {
			return EvaluationExportFamilySummary{}, err
		}
	case "capabilityEffectProviderRuntimeJournals":
		if err := validateEvaluationCapabilityEffectProviderRuntimeArchiveCapacity(count, totalBytes); err != nil {
			return EvaluationExportFamilySummary{}, err
		}
	case "optionalCapabilityFactSources":
		if count < 0 || count > maximumEvaluationOptionalFactAuthorityRecords ||
			totalBytes > maximumEvaluationOptionalFactSourceArchiveBytes {
			return EvaluationExportFamilySummary{}, conflict("evaluation optional fact source export exceeds its capacity")
		}
	case "optionalCapabilityFactAuthorities":
		if count < 0 || count > maximumEvaluationOptionalFactAuthorityRecords ||
			totalBytes > maximumEvaluationOptionalFactAuthorityArchiveBytes {
			return EvaluationExportFamilySummary{}, conflict("evaluation optional fact authority export exceeds its capacity")
		}
	}
	semanticDigest := recordSetDigest
	if spec.Singleton {
		if count != 1 {
			return EvaluationExportFamilySummary{}, conflict("evaluation export singleton family is incomplete: " + spec.Family)
		}
		if err := tx.QueryRowContext(ctx, `SELECT record_digest
			FROM agent_evaluation_export_lease_records
			WHERE namespace_id = $1 AND lease_id = $2 AND family = $3 AND record_ordinal = 0`,
			namespaceID, leaseID, spec.Family).Scan(&semanticDigest); err != nil {
			return EvaluationExportFamilySummary{}, err
		}
	} else if spec.SemanticEnvelopeKey != "" {
		order := "record_ordinal ASC"
		orderKeyColumn := "order_key"
		if spec.Family == "verificationAttemptGrantReceipts" {
			order = `record_digest COLLATE "C" ASC`
			orderKeyColumn = "record_digest"
		} else if spec.SemanticSortByDigest {
			order = `record_digest COLLATE "C" ASC`
			orderKeyColumn = "record_digest"
		}
		digestRows, err := tx.QueryContext(ctx, fmt.Sprintf(`SELECT %s, record_digest, byte_length
			FROM agent_evaluation_export_lease_records
			WHERE namespace_id = $1 AND lease_id = $2 AND family = $3
			ORDER BY %s`, orderKeyColumn, order), namespaceID, leaseID, spec.Family)
		if err != nil {
			return EvaluationExportFamilySummary{}, err
		}
		prefix := `{"` + spec.SemanticEnvelopeKey + `":[`
		semanticDigest, _, _, _, _, err = evaluationExportHashDigestSequence(digestRows, prefix)
		_ = digestRows.Close()
		if err != nil {
			return EvaluationExportFamilySummary{}, err
		}
	} else if spec.Family == "blindReviewMappingRefs" {
		semanticDigest, err = evaluationExportBlindMappingSemanticDigest(ctx, tx, namespaceID, partition)
		if err != nil {
			return EvaluationExportFamilySummary{}, err
		}
	}
	return EvaluationExportFamilySummary{
		Family: spec.Family, FamilyIndex: spec.Index,
		ExpectedRecordCount: count, ExpectedRecordSetDigest: recordSetDigest,
		ExpectedSemanticDigest: semanticDigest, ExpectedTotalBytes: totalBytes,
		FirstOrderKey: first, LastOrderKey: last,
	}, nil
}

func evaluationExportSummaryByFamily(summaries []EvaluationExportFamilySummary) map[string]EvaluationExportFamilySummary {
	result := make(map[string]EvaluationExportFamilySummary, len(summaries))
	for _, summary := range summaries {
		result[summary.Family] = summary
	}
	return result
}

func validateEvaluationEvidenceExportSourceBinding(binding EvaluationEvidenceExportSourceBinding) error {
	if validateEvaluationProductionRunConfigArtifactBinding(binding.RunConfigArtifactBinding) != nil ||
		binding.SourceConfigDigest != binding.RunConfigArtifactBinding.SourceConfigDigest ||
		binding.FrozenRunDigest != binding.RunConfigArtifactBinding.FrozenRunDigest {
		return ErrInvalid
	}
	return nil
}

func evaluationArchiveAuthorityRootDigests(roots EvaluationEvidenceArchiveAuthorityRoots) []string {
	return []string{
		roots.CapabilityProbeAdmissionSetDigest,
		roots.CapabilityProbeReferenceReceiptSetDigest,
		roots.RuntimeFactSourceOwnerRegistrationSetDigest,
		roots.CapabilityProbeProviderResourceCleanupSetDigest,
		roots.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
		roots.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
		roots.HostedRetrievalRuntimeResourceCleanupSetDigest,
		roots.CapabilityEffectProviderRuntimeJournalSetDigest,
		roots.OptionalCapabilityFactSourceSetDigest,
		roots.OptionalCapabilityFactAuthoritySetDigest,
		roots.EndpointSmokeSetDigest,
		roots.EndpointSmokeDispatchIntentSetDigest,
		roots.EndpointSmokeTransportReceiptSetDigest,
		roots.EndpointSmokeResultSpoolReceiptSetDigest,
		roots.EndpointSmokeResultSpoolDispositionReceiptSetDigest,
		roots.EndpointSmokeValidationFailureReceiptSetDigest,
		roots.PreDispatchFailureReceiptSetDigest,
		roots.TransportDispatchIntentSetDigest,
		roots.TransportReceiptSetDigest,
		roots.ProviderResultSpoolReceiptSetDigest,
		roots.ProviderResultSpoolDispositionReceiptSetDigest,
		roots.InvocationTurnReceiptSetDigest,
		roots.InvocationTurnSetReceiptSetDigest,
		roots.ResultSubmissionReceiptSetDigest,
		roots.AttemptAuthorityOwnerReceiptSetDigest,
		roots.ControlledRuntimeReceiptSetDigest,
		roots.CapabilityExecutionReceiptSetDigest,
		roots.CapabilitySpecificReceiptSetDigest,
		roots.ProviderCapabilityObservationReceiptSetDigest,
		roots.VerificationAttemptGrantReceiptSetDigest,
		roots.ValidatedHumanReviewArtifactSetDigest,
		roots.ValidatedHumanMetricObservationSetDigest,
		roots.ReviewRasterScanReceiptSetDigest,
		roots.ReviewCandidateRefSetDigest,
		roots.BlindReviewMappingSetDigest,
		roots.SourceReceiptSetDigest,
		roots.ExecutionReceiptSetDigest,
		roots.HoldoutExecutionReceiptDigest,
		roots.SecretCanarySetDigest,
		roots.ProtectedHoldoutCanarySetDigest,
	}
}

func validateEvaluationArchiveCommitmentsAgainstFamilies(
	commitments EvaluationEvidenceArchiveCommitments,
	families []EvaluationExportFamilySummary,
) error {
	byFamily := evaluationExportSummaryByFamily(families)
	bindings := []struct {
		family string
		digest string
	}{
		{"capabilityProbeAdmissions", commitments.AuthorityRoots.CapabilityProbeAdmissionSetDigest},
		{"capabilityProbeReferenceReceipts", commitments.AuthorityRoots.CapabilityProbeReferenceReceiptSetDigest},
		{"runtimeFactSourceOwnerRegistrations", commitments.AuthorityRoots.RuntimeFactSourceOwnerRegistrationSetDigest},
		{"capabilityProbeProviderResourceCleanups", commitments.AuthorityRoots.CapabilityProbeProviderResourceCleanupSetDigest},
		{"hostedRetrievalRuntimeResourceLifecycleJournals", commitments.AuthorityRoots.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest},
		{"hostedRetrievalRuntimeResourceCleanups", commitments.AuthorityRoots.HostedRetrievalRuntimeResourceCleanupSetDigest},
		{"capabilityEffectProviderRuntimeJournals", commitments.AuthorityRoots.CapabilityEffectProviderRuntimeJournalSetDigest},
		{"optionalCapabilityFactSources", commitments.AuthorityRoots.OptionalCapabilityFactSourceSetDigest},
		{"optionalCapabilityFactAuthorities", commitments.AuthorityRoots.OptionalCapabilityFactAuthoritySetDigest},
		{"endpointSmokeReceipts", commitments.AuthorityRoots.EndpointSmokeSetDigest},
		{"endpointSmokeDispatchIntents", commitments.AuthorityRoots.EndpointSmokeDispatchIntentSetDigest},
		{"endpointSmokeTransportReceipts", commitments.AuthorityRoots.EndpointSmokeTransportReceiptSetDigest},
		{"endpointSmokeResultSpoolReceipts", commitments.AuthorityRoots.EndpointSmokeResultSpoolReceiptSetDigest},
		{"endpointSmokeResultSpoolDispositionReceipts", commitments.AuthorityRoots.EndpointSmokeResultSpoolDispositionReceiptSetDigest},
		{"endpointSmokeValidationFailureReceipts", commitments.AuthorityRoots.EndpointSmokeValidationFailureReceiptSetDigest},
		{"preDispatchFailureReceipts", commitments.AuthorityRoots.PreDispatchFailureReceiptSetDigest},
		{"transportDispatchIntents", commitments.AuthorityRoots.TransportDispatchIntentSetDigest},
		{"transportReceipts", commitments.AuthorityRoots.TransportReceiptSetDigest},
		{"providerResultSpoolReceipts", commitments.AuthorityRoots.ProviderResultSpoolReceiptSetDigest},
		{"providerResultSpoolDispositionReceipts", commitments.AuthorityRoots.ProviderResultSpoolDispositionReceiptSetDigest},
		{"invocationTurnReceipts", commitments.AuthorityRoots.InvocationTurnReceiptSetDigest},
		{"invocationTurnSetReceipts", commitments.AuthorityRoots.InvocationTurnSetReceiptSetDigest},
		{"resultSubmissionReceipts", commitments.AuthorityRoots.ResultSubmissionReceiptSetDigest},
		{"attemptAuthorityOwnerReceipts", commitments.AuthorityRoots.AttemptAuthorityOwnerReceiptSetDigest},
		{"controlledRuntimeReceipts", commitments.AuthorityRoots.ControlledRuntimeReceiptSetDigest},
		{"capabilityExecutionReceipts", commitments.AuthorityRoots.CapabilityExecutionReceiptSetDigest},
		{"capabilitySpecificReceipts", commitments.AuthorityRoots.CapabilitySpecificReceiptSetDigest},
		{"providerCapabilityObservationReceipts", commitments.AuthorityRoots.ProviderCapabilityObservationReceiptSetDigest},
		{"verificationAttemptGrantReceipts", commitments.AuthorityRoots.VerificationAttemptGrantReceiptSetDigest},
		{"validatedHumanReviewArtifacts", commitments.AuthorityRoots.ValidatedHumanReviewArtifactSetDigest},
		{"validatedHumanMetricObservations", commitments.AuthorityRoots.ValidatedHumanMetricObservationSetDigest},
		{"reviewRasterScanReceipts", commitments.AuthorityRoots.ReviewRasterScanReceiptSetDigest},
		{"reviewCandidateRefs", commitments.AuthorityRoots.ReviewCandidateRefSetDigest},
		{"blindReviewMappingRefs", commitments.AuthorityRoots.BlindReviewMappingSetDigest},
		{"sourceReceipts", commitments.AuthorityRoots.SourceReceiptSetDigest},
		{"executionReceipts", commitments.AuthorityRoots.ExecutionReceiptSetDigest},
		{"holdoutExecutionReceipt", commitments.AuthorityRoots.HoldoutExecutionReceiptDigest},
	}
	for _, binding := range bindings {
		summary, ok := byFamily[binding.family]
		if !ok || summary.ExpectedSemanticDigest != binding.digest {
			return conflict("evaluation export authority root drifted for " + binding.family)
		}
	}
	reviewArtifacts := byFamily["validatedHumanReviewArtifacts"]
	if reviewArtifacts.ExpectedRecordCount < 0 || reviewArtifacts.ExpectedRecordCount > 1 {
		return conflict("evaluation export validated human review cardinality drifted")
	}
	reviewRequired := reviewArtifacts.ExpectedRecordCount == 1
	if reviewRequired != (commitments.ReviewLeaseDigest != "") ||
		reviewRequired != (commitments.AuthorityRoots.ReviewLeaseDigest != "") ||
		(reviewRequired && (commitments.ReviewLeaseDigest != commitments.AuthorityRoots.ReviewLeaseDigest ||
			!evaluationDigestPattern.MatchString(commitments.ReviewLeaseDigest))) {
		return conflict("evaluation export review lease commitment drifted")
	}
	return nil
}

func evaluationExportAuthorityRoots(
	root EvaluationEvidenceRootRecord,
	summaries []EvaluationExportFamilySummary,
) (EvaluationEvidenceArchiveAuthorityRoots, error) {
	byFamily := evaluationExportSummaryByFamily(summaries)
	require := func(family string, expected string) (string, error) {
		summary, ok := byFamily[family]
		if !ok || !evaluationDigestPattern.MatchString(summary.ExpectedSemanticDigest) ||
			(expected != "" && summary.ExpectedSemanticDigest != expected) {
			return "", conflict("evaluation export semantic root drifted for " + family)
		}
		return summary.ExpectedSemanticDigest, nil
	}
	endpointSmokeDispatch, err := require("endpointSmokeDispatchIntents", root.EndpointSmokeDispatchIntentSetDigest)
	if err != nil {
		return EvaluationEvidenceArchiveAuthorityRoots{}, err
	}
	endpointSmokeTransport, err := require("endpointSmokeTransportReceipts", root.EndpointSmokeTransportReceiptSetDigest)
	if err != nil {
		return EvaluationEvidenceArchiveAuthorityRoots{}, err
	}
	endpointSmokeSpool, err := require("endpointSmokeResultSpoolReceipts", root.EndpointSmokeResultSpoolReceiptSetDigest)
	if err != nil {
		return EvaluationEvidenceArchiveAuthorityRoots{}, err
	}
	endpointSmokeDisposition, err := require("endpointSmokeResultSpoolDispositionReceipts", root.EndpointSmokeResultSpoolDispositionReceiptSetDigest)
	if err != nil {
		return EvaluationEvidenceArchiveAuthorityRoots{}, err
	}
	endpointSmokeValidationFailure, err := require("endpointSmokeValidationFailureReceipts", root.EndpointSmokeValidationFailureReceiptSetDigest)
	if err != nil {
		return EvaluationEvidenceArchiveAuthorityRoots{}, err
	}
	bindings := []struct {
		family   string
		expected string
	}{
		{"capabilityProbeAdmissions", root.CapabilityProbeAdmissionSetDigest},
		{"capabilityProbeReferenceReceipts", root.CapabilityProbeReferenceReceiptSetDigest},
		{"runtimeFactSourceOwnerRegistrations", root.RuntimeFactSourceOwnerRegistrationSetDigest},
		{"capabilityProbeProviderResourceCleanups", root.CapabilityProbeProviderResourceCleanupSetDigest},
		{"hostedRetrievalRuntimeResourceLifecycleJournals", root.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest},
		{"hostedRetrievalRuntimeResourceCleanups", root.HostedRetrievalRuntimeResourceCleanupSetDigest},
		{"capabilityEffectProviderRuntimeJournals", root.CapabilityEffectProviderRuntimeJournalSetDigest},
		{"optionalCapabilityFactSources", root.OptionalCapabilityFactSourceSetDigest},
		{"optionalCapabilityFactAuthorities", root.OptionalCapabilityFactAuthoritySetDigest},
		{"endpointSmokeReceipts", root.EndpointSmokeSetDigest},
		{"preDispatchFailureReceipts", root.PreDispatchFailureReceiptSetDigest},
		{"transportDispatchIntents", root.TransportDispatchIntentSetDigest},
		{"transportReceipts", root.TransportReceiptSetDigest},
		{"providerResultSpoolReceipts", root.ProviderResultSpoolReceiptSetDigest},
		{"providerResultSpoolDispositionReceipts", root.ProviderResultSpoolDispositionReceiptSetDigest},
		{"invocationTurnReceipts", root.InvocationTurnReceiptSetDigest},
		{"invocationTurnSetReceipts", root.InvocationTurnSetReceiptSetDigest},
		{"resultSubmissionReceipts", root.ResultSubmissionReceiptSetDigest},
		{"attemptAuthorityOwnerReceipts", root.AttemptAuthorityOwnerReceiptSetDigest},
		{"controlledRuntimeReceipts", root.ControlledRuntimeReceiptSetDigest},
		{"capabilityExecutionReceipts", root.CapabilityExecutionReceiptSetDigest},
		{"capabilitySpecificReceipts", root.CapabilitySpecificReceiptSetDigest},
		{"providerCapabilityObservationReceipts", root.ProviderCapabilityObservationReceiptSetDigest},
		{"verificationAttemptGrantReceipts", root.VerificationAttemptGrantReceiptSetDigest},
		{"validatedHumanReviewArtifacts", root.ValidatedHumanReviewArtifactSetDigest},
		{"validatedHumanMetricObservations", root.ValidatedHumanMetricObservationSetDigest},
		{"reviewRasterScanReceipts", root.ReviewRasterScanReceiptSetDigest},
		{"reviewCandidateRefs", root.ReviewCandidateRefSetDigest},
		{"blindReviewMappingRefs", root.BlindReviewMappingSetDigest},
		{"sourceReceipts", root.SourceReceiptSetDigest},
		{"executionReceipts", root.ExecutionReceiptSetDigest},
		{"holdoutExecutionReceipt", root.HoldoutExecutionReceiptDigest},
	}
	for _, binding := range bindings {
		if _, err := require(binding.family, binding.expected); err != nil {
			return EvaluationEvidenceArchiveAuthorityRoots{}, err
		}
	}
	return EvaluationEvidenceArchiveAuthorityRoots{
		CapabilityProbeAdmissionSetDigest:                                    root.CapabilityProbeAdmissionSetDigest,
		CapabilityProbeReferenceReceiptSetDigest:                             root.CapabilityProbeReferenceReceiptSetDigest,
		RuntimeFactSourceOwnerRegistrationSetDigest:                          root.RuntimeFactSourceOwnerRegistrationSetDigest,
		CapabilityProbeProviderResourceCleanupSetDigest:                      root.CapabilityProbeProviderResourceCleanupSetDigest,
		HostedRetrievalRuntimeResourceLifecycleJournalSetDigest:              root.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest,
		HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest: root.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest,
		HostedRetrievalRuntimeResourceCleanupSetDigest:                       root.HostedRetrievalRuntimeResourceCleanupSetDigest,
		CapabilityEffectProviderRuntimeJournalSetDigest:                      root.CapabilityEffectProviderRuntimeJournalSetDigest,
		OptionalCapabilityFactSourceSetDigest:                                root.OptionalCapabilityFactSourceSetDigest,
		OptionalCapabilityFactAuthoritySetDigest:                             root.OptionalCapabilityFactAuthoritySetDigest,
		EndpointSmokeSetDigest:                                               root.EndpointSmokeSetDigest,
		EndpointSmokeDispatchIntentSetDigest:                                 endpointSmokeDispatch,
		EndpointSmokeTransportReceiptSetDigest:                               endpointSmokeTransport,
		EndpointSmokeResultSpoolReceiptSetDigest:                             endpointSmokeSpool,
		EndpointSmokeResultSpoolDispositionReceiptSetDigest:                  endpointSmokeDisposition,
		EndpointSmokeValidationFailureReceiptSetDigest:                       endpointSmokeValidationFailure,
		PreDispatchFailureReceiptSetDigest:                                   root.PreDispatchFailureReceiptSetDigest,
		TransportDispatchIntentSetDigest:                                     root.TransportDispatchIntentSetDigest,
		TransportReceiptSetDigest:                                            root.TransportReceiptSetDigest,
		ProviderResultSpoolReceiptSetDigest:                                  root.ProviderResultSpoolReceiptSetDigest,
		ProviderResultSpoolDispositionReceiptSetDigest:                       root.ProviderResultSpoolDispositionReceiptSetDigest,
		InvocationTurnReceiptSetDigest:                                       root.InvocationTurnReceiptSetDigest,
		InvocationTurnSetReceiptSetDigest:                                    root.InvocationTurnSetReceiptSetDigest,
		ResultSubmissionReceiptSetDigest:                                     root.ResultSubmissionReceiptSetDigest,
		AttemptAuthorityOwnerReceiptSetDigest:                                root.AttemptAuthorityOwnerReceiptSetDigest,
		ControlledRuntimeReceiptSetDigest:                                    root.ControlledRuntimeReceiptSetDigest,
		CapabilityExecutionReceiptSetDigest:                                  root.CapabilityExecutionReceiptSetDigest,
		CapabilitySpecificReceiptSetDigest:                                   root.CapabilitySpecificReceiptSetDigest,
		ProviderCapabilityObservationReceiptSetDigest:                        root.ProviderCapabilityObservationReceiptSetDigest,
		VerificationAttemptGrantReceiptSetDigest:                             root.VerificationAttemptGrantReceiptSetDigest,
		ValidatedHumanReviewArtifactSetDigest:                                root.ValidatedHumanReviewArtifactSetDigest,
		ValidatedHumanMetricObservationSetDigest:                             root.ValidatedHumanMetricObservationSetDigest,
		ReviewRasterScanReceiptSetDigest:                                     root.ReviewRasterScanReceiptSetDigest,
		ReviewCandidateRefSetDigest:                                          root.ReviewCandidateRefSetDigest,
		BlindReviewMappingSetDigest:                                          root.BlindReviewMappingSetDigest,
		SourceReceiptSetDigest:                                               root.SourceReceiptSetDigest,
		ExecutionReceiptSetDigest:                                            root.ExecutionReceiptSetDigest,
		HoldoutExecutionReceiptDigest:                                        root.HoldoutExecutionReceiptDigest,
		SecretCanarySetDigest:                                                root.SecretCanarySetDigest,
		ProtectedHoldoutCanarySetDigest:                                      root.ProtectedHoldoutCanarySetDigest,
		ReviewLeaseDigest:                                                    root.ReviewLeaseDigest,
	}, nil
}

func evaluationExportSemanticFinalizationMatches(
	attestation EvaluationAuthorityAttestationRecord,
	root EvaluationEvidenceRootRecord,
	manifest EvaluationArtifactRecord,
) bool {
	return root.PlanDigest == attestation.PlanDigest && root.RepositoryCommit == attestation.RepositoryCommit &&
		root.EvidenceSetDigest == attestation.EvidenceSetDigest &&
		root.CapabilityProbeAdmissionSetDigest == attestation.CapabilityProbeAdmissionSetDigest &&
		root.CapabilityProbeReferenceReceiptSetDigest == attestation.CapabilityProbeReferenceReceiptSetDigest &&
		root.RuntimeFactSourceOwnerRegistrationSetDigest == attestation.RuntimeFactSourceOwnerRegistrationSetDigest &&
		root.CapabilityProbeProviderResourceCleanupSetDigest == attestation.CapabilityProbeProviderResourceCleanupSetDigest &&
		root.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest == attestation.HostedRetrievalRuntimeResourceLifecycleJournalSetDigest &&
		root.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest == attestation.HostedRetrievalRuntimeResourceLifecycleBudgetClosureBindingSetDigest &&
		root.HostedRetrievalRuntimeResourceCleanupSetDigest == attestation.HostedRetrievalRuntimeResourceCleanupSetDigest &&
		root.CapabilityEffectProviderRuntimeJournalSetDigest == attestation.CapabilityEffectProviderRuntimeJournalSetDigest &&
		root.OptionalCapabilityFactSourceSetDigest == attestation.OptionalCapabilityFactSourceSetDigest &&
		root.OptionalCapabilityFactAuthoritySetDigest == attestation.OptionalCapabilityFactAuthoritySetDigest &&
		root.EndpointSmokeSetDigest == attestation.EndpointSmokeSetDigest &&
		root.EndpointSmokeDispatchIntentSetDigest == attestation.EndpointSmokeDispatchIntentSetDigest &&
		root.EndpointSmokeTransportReceiptSetDigest == attestation.EndpointSmokeTransportReceiptSetDigest &&
		root.EndpointSmokeResultSpoolReceiptSetDigest == attestation.EndpointSmokeResultSpoolReceiptSetDigest &&
		root.EndpointSmokeResultSpoolDispositionReceiptSetDigest == attestation.EndpointSmokeResultSpoolDispositionReceiptSetDigest &&
		root.EndpointSmokeValidationFailureReceiptSetDigest == attestation.EndpointSmokeValidationFailureReceiptSetDigest &&
		root.PreDispatchFailureReceiptSetDigest == attestation.PreDispatchFailureReceiptSetDigest &&
		root.TransportDispatchIntentSetDigest == attestation.TransportDispatchIntentSetDigest &&
		root.TransportReceiptSetDigest == attestation.TransportReceiptSetDigest &&
		root.ProviderResultSpoolReceiptSetDigest == attestation.ProviderResultSpoolReceiptSetDigest &&
		root.ProviderResultSpoolDispositionReceiptSetDigest == attestation.ProviderResultSpoolDispositionReceiptSetDigest &&
		root.InvocationTurnReceiptSetDigest == attestation.InvocationTurnReceiptSetDigest &&
		root.InvocationTurnSetReceiptSetDigest == attestation.InvocationTurnSetReceiptSetDigest &&
		root.ResultSubmissionReceiptSetDigest == attestation.ResultSubmissionReceiptSetDigest &&
		root.AttemptAuthorityOwnerReceiptSetDigest == attestation.AttemptAuthorityOwnerReceiptSetDigest &&
		root.ControlledRuntimeReceiptSetDigest == attestation.ControlledRuntimeReceiptSetDigest &&
		root.CapabilityExecutionReceiptSetDigest == attestation.CapabilityExecutionReceiptSetDigest &&
		root.CapabilitySpecificReceiptSetDigest == attestation.CapabilitySpecificReceiptSetDigest &&
		root.ProviderCapabilityObservationReceiptSetDigest == attestation.ProviderCapabilityObservationReceiptSetDigest &&
		root.VerificationAttemptGrantReceiptSetDigest == attestation.VerificationAttemptGrantReceiptSetDigest &&
		root.ValidatedHumanReviewArtifactSetDigest == attestation.ValidatedHumanReviewArtifactSetDigest &&
		root.ValidatedHumanMetricObservationSetDigest == attestation.ValidatedHumanMetricObservationSetDigest &&
		root.ReviewRasterScanReceiptSetDigest == attestation.ReviewRasterScanReceiptSetDigest &&
		root.ReviewCandidateRefSetDigest == attestation.ReviewCandidateRefSetDigest &&
		root.BlindReviewMappingSetDigest == attestation.BlindReviewMappingSetDigest &&
		root.SourceReceiptSetDigest == attestation.SourceReceiptSetDigest &&
		root.ExecutionReceiptSetDigest == attestation.ExecutionReceiptSetDigest &&
		root.HoldoutExecutionReceiptDigest == attestation.HoldoutExecutionReceiptDigest &&
		root.SecretCanarySetDigest == attestation.SecretCanarySetDigest &&
		root.ProtectedHoldoutCanarySetDigest == attestation.ProtectedHoldoutCanarySetDigest &&
		root.ReviewLeaseDigest == attestation.ReviewLeaseDigest &&
		root.AuthorityAttestationDigest == attestation.AttestationDigest &&
		root.EvaluationManifestDigest == manifest.FactDigest && manifest.FactType == "evaluation-manifest"
}

func evaluationExportLeaseBase(
	leaseID string,
	leaseKind string,
	cursorKeyBindingDigest string,
	commitmentsDigest string,
	families []EvaluationExportFamilySummary,
	totalRecordCount int64,
	totalRecordBytes int64,
	createdAt time.Time,
	expiresAt time.Time,
) map[string]any {
	return map[string]any{
		"format": "prodivix.agent-evaluation-export-lease", "version": int64(1),
		"leaseKind": leaseKind, "leaseId": leaseID,
		"cursorKeyBindingDigest": cursorKeyBindingDigest, "commitmentsDigest": commitmentsDigest,
		"families": families, "totalRecordCount": totalRecordCount, "totalRecordBytes": totalRecordBytes,
		"createdAt": evaluationExportInstant(createdAt), "expiresAt": evaluationExportInstant(expiresAt),
	}
}

func evaluationExportLeaseIdentity(
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseKind string,
	cursorKeyBindingDigest string,
	sourceBinding EvaluationEvidenceExportSourceBinding,
	authorityAttestationDigest string,
	evaluationManifestDigest string,
) (string, error) {
	namespaceDigest, err := canonicaljson.Digest(map[string]any{"namespace": namespaceID})
	if err != nil {
		return "", err
	}
	identityDigest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-export-lease-identity", "version": int64(1),
		"namespaceDigest": namespaceDigest, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "leaseKind": leaseKind,
		"cursorKeyBindingDigest":     cursorKeyBindingDigest,
		"runConfigArtifactBinding":   sourceBinding.RunConfigArtifactBinding,
		"sourceConfigDigest":         sourceBinding.SourceConfigDigest,
		"frozenRunDigest":            sourceBinding.FrozenRunDigest,
		"authorityAttestationDigest": authorityAttestationDigest,
		"evaluationManifestDigest":   evaluationManifestDigest,
	})
	if err != nil {
		return "", err
	}
	return "evaluation-export:" + strings.TrimPrefix(identityDigest, "sha256-"), nil
}

func decodeEvaluationExportCommitments(source []byte) (EvaluationEvidenceArchiveCommitments, error) {
	value, err := decodeCanonicalEvaluationJSON(source)
	if err != nil {
		return EvaluationEvidenceArchiveCommitments{}, err
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) {
		return EvaluationEvidenceArchiveCommitments{}, conflict("evaluation export commitments are not canonical")
	}
	var commitments EvaluationEvidenceArchiveCommitments
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&commitments); err != nil ||
		validateEvaluationEvidenceExportSourceBinding(EvaluationEvidenceExportSourceBinding{
			RunConfigArtifactBinding: commitments.RunConfigArtifactBinding, SourceConfigDigest: commitments.SourceConfigDigest,
			FrozenRunDigest: commitments.FrozenRunDigest,
		}) != nil || !evaluationDigestPattern.MatchString(commitments.PlanDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(commitments.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(commitments.EvidenceSetDigest) ||
		!evaluationDigestPattern.MatchString(commitments.AuthorityPayloadDigest) ||
		!evaluationDigestPattern.MatchString(commitments.AuthorityAttestationDigest) ||
		!evaluationDigestPattern.MatchString(commitments.EvaluationManifestDigest) ||
		commitments.RunConfigArtifactBinding.PlanDigest != commitments.PlanDigest ||
		commitments.RunConfigArtifactBinding.RepositoryCommit != commitments.RepositoryCommit {
		return EvaluationEvidenceArchiveCommitments{}, conflict("evaluation export commitments are invalid")
	}
	for _, digest := range evaluationArchiveAuthorityRootDigests(commitments.AuthorityRoots) {
		if !evaluationDigestPattern.MatchString(digest) {
			return EvaluationEvidenceArchiveCommitments{}, conflict("evaluation export authority roots are invalid")
		}
	}
	if commitments.AuthorityRoots.ReviewLeaseDigest != "" &&
		!evaluationDigestPattern.MatchString(commitments.AuthorityRoots.ReviewLeaseDigest) {
		return EvaluationEvidenceArchiveCommitments{}, conflict("evaluation export review lease root is invalid")
	}
	if commitments.ReviewLeaseDigest != "" && !evaluationDigestPattern.MatchString(commitments.ReviewLeaseDigest) {
		return EvaluationEvidenceArchiveCommitments{}, conflict("evaluation export review lease commitment is invalid")
	}
	createdAt, err := time.Parse(time.RFC3339Nano, commitments.CreatedAt)
	if err != nil || commitments.CreatedAt != evaluationExportInstant(createdAt) {
		return EvaluationEvidenceArchiveCommitments{}, conflict("evaluation export commitments timestamp is invalid")
	}
	return commitments, nil
}

func loadEvaluationExportLease(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
	leaseKind string,
	cursorKeyBindingDigest string,
) (EvaluationExportLease, error) {
	var record EvaluationExportLease
	var commitmentsDigest, semanticRootDigest string
	var commitmentsBytes []byte
	var familyCount int64
	row := queryer.QueryRowContext(ctx, `SELECT repository_commit, lease_kind, lease_id, lease_digest,
		cursor_key_binding_digest, evidence_set_digest, authority_payload_digest,
		authority_attestation_digest, evaluation_manifest_digest, semantic_root_digest,
		commitments_digest, commitments_bytes, family_count, total_record_count, total_record_bytes,
		created_at, expires_at
		FROM agent_evaluation_export_leases
		WHERE namespace_id = $1 AND plan_digest = $2 AND lease_id = $3 AND lease_kind = $4
			AND cursor_key_binding_digest = $5`, namespaceID, partition.PlanDigest, leaseID, leaseKind, cursorKeyBindingDigest)
	record.NamespaceID, record.Partition, record.LeaseKind = namespaceID, partition, leaseKind
	var evidenceSetDigest, authorityPayloadDigest, authorityAttestationDigest, evaluationManifestDigest string
	if err := row.Scan(&record.Partition.RepositoryCommit, &record.LeaseKind, &record.LeaseID, &record.LeaseDigest,
		&record.CursorKeyBindingDigest, &evidenceSetDigest, &authorityPayloadDigest,
		&authorityAttestationDigest, &evaluationManifestDigest, &semanticRootDigest,
		&commitmentsDigest, &commitmentsBytes, &familyCount, &record.TotalRecordCount,
		&record.TotalRecordBytes, &record.CreatedAt, &record.ExpiresAt); errors.Is(err, sql.ErrNoRows) {
		return EvaluationExportLease{}, ErrNotFound
	} else if err != nil {
		return EvaluationExportLease{}, err
	}
	if record.Partition.RepositoryCommit != partition.RepositoryCommit || record.LeaseKind != leaseKind ||
		record.CursorKeyBindingDigest != cursorKeyBindingDigest || !evaluationDigestPattern.MatchString(record.LeaseDigest) ||
		!evaluationDigestPattern.MatchString(semanticRootDigest) || familyCount != int64(len(evaluationEvidenceExportFamilies)) {
		return EvaluationExportLease{}, conflict("evaluation export lease metadata drifted")
	}
	commitments, err := decodeEvaluationExportCommitments(commitmentsBytes)
	if err != nil {
		return EvaluationExportLease{}, err
	}
	calculatedCommitmentsDigest, err := canonicaljson.Digest(commitments)
	if err != nil || calculatedCommitmentsDigest != commitmentsDigest || commitments.PlanDigest != partition.PlanDigest ||
		commitments.RepositoryCommit != partition.RepositoryCommit || commitments.EvidenceSetDigest != evidenceSetDigest ||
		commitments.AuthorityPayloadDigest != authorityPayloadDigest ||
		commitments.AuthorityAttestationDigest != authorityAttestationDigest ||
		commitments.EvaluationManifestDigest != evaluationManifestDigest ||
		commitments.CreatedAt != evaluationExportInstant(record.CreatedAt) {
		return EvaluationExportLease{}, conflict("evaluation export commitments drifted")
	}
	familyRows, err := queryer.QueryContext(ctx, `SELECT family, family_index, record_count,
		total_bytes, semantic_digest, record_set_digest, first_order_key, last_order_key
		FROM agent_evaluation_export_lease_families
		WHERE namespace_id = $1 AND lease_id = $2
		ORDER BY family_index ASC`, namespaceID, record.LeaseID)
	if err != nil {
		return EvaluationExportLease{}, err
	}
	families := make([]EvaluationExportFamilySummary, 0, familyCount)
	for familyRows.Next() {
		var summary EvaluationExportFamilySummary
		var first, last sql.NullString
		if err := familyRows.Scan(&summary.Family, &summary.FamilyIndex, &summary.ExpectedRecordCount,
			&summary.ExpectedTotalBytes, &summary.ExpectedSemanticDigest, &summary.ExpectedRecordSetDigest,
			&first, &last); err != nil {
			_ = familyRows.Close()
			return EvaluationExportLease{}, err
		}
		if first.Valid {
			summary.FirstOrderKey = &first.String
		}
		if last.Valid {
			summary.LastOrderKey = &last.String
		}
		families = append(families, summary)
	}
	if err := familyRows.Close(); err != nil {
		return EvaluationExportLease{}, err
	}
	if int64(len(families)) != familyCount {
		return EvaluationExportLease{}, conflict("evaluation export lease family catalog is incomplete")
	}
	for index, summary := range families {
		if summary.FamilyIndex != int64(index) || summary.Family != evaluationEvidenceExportFamilies[index] {
			return EvaluationExportLease{}, conflict("evaluation export lease family catalog drifted")
		}
	}
	if err := validateEvaluationArchiveCommitmentsAgainstFamilies(commitments, families); err != nil {
		return EvaluationExportLease{}, err
	}
	base := evaluationExportLeaseBase(record.LeaseID, record.LeaseKind, cursorKeyBindingDigest, commitmentsDigest,
		families, record.TotalRecordCount, record.TotalRecordBytes, record.CreatedAt, record.ExpiresAt)
	calculatedLeaseDigest, err := canonicaljson.Digest(base)
	if err != nil || calculatedLeaseDigest != record.LeaseDigest {
		return EvaluationExportLease{}, conflict("evaluation export lease digest drifted")
	}
	record.Commitments, record.Families = commitments, families
	record.CreatedAtText, record.ExpiresAtText = evaluationExportInstant(record.CreatedAt), evaluationExportInstant(record.ExpiresAt)
	return record, nil
}

func (repository *Repository) OpenEvaluationEvidenceExportLease(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	sourceBinding EvaluationEvidenceExportSourceBinding,
	createdAt time.Time,
	cursorKeyBindingDigest string,
) (EvaluationExportLease, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := validateEvaluationPartition(partition); err != nil ||
		validateEvaluationEvidenceExportSourceBinding(sourceBinding) != nil ||
		validateEvaluationProductionRunConfigArtifactPartition(sourceBinding.RunConfigArtifactBinding, partition) != nil ||
		!evaluationDigestPattern.MatchString(cursorKeyBindingDigest) || createdAt.IsZero() {
		return EvaluationExportLease{}, false, ErrInvalid
	}
	createdAt = createdAt.UTC().Truncate(time.Millisecond)
	expiresAt := createdAt.Add(evaluationExportLeaseDuration)
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(readContext, &sql.TxOptions{Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	plan, err := loadEvaluationPlanRecord(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := ensureEvaluationV46EligiblePartition(readContext, tx, authority.NamespaceID, partition); err != nil {
		return EvaluationExportLease{}, false, err
	}
	runConfigArtifact, _, err := loadEvaluationProductionRunConfigArtifact(
		readContext, tx, authority.NamespaceID, partition, sourceBinding.RunConfigArtifactBinding.BindingDigest,
	)
	if err != nil || !sameEvaluationProductionRunConfigArtifactBinding(
		runConfigArtifact.Binding, sourceBinding.RunConfigArtifactBinding,
	) {
		return EvaluationExportLease{}, false, conflict("evaluation export requires the exact sealed production run-config artifact")
	}
	holdoutClosure, err := loadEvaluationHoldoutClosure(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	if holdoutClosure == nil {
		return EvaluationExportLease{}, false, conflict("evaluation export requires a server-sealed holdout source binding")
	}
	if !sameEvaluationProductionRunConfigArtifactBinding(sourceBinding.RunConfigArtifactBinding, holdoutClosure.RunConfigArtifactBinding) ||
		sourceBinding.SourceConfigDigest != holdoutClosure.SourceConfigDigest ||
		sourceBinding.FrozenRunDigest != holdoutClosure.FrozenRunDigest {
		return EvaluationExportLease{}, false, conflict("evaluation export source binding drifted from the server-sealed holdout closure")
	}
	var existingLeaseID string
	existingErr := tx.QueryRowContext(readContext, `SELECT lease_id
		FROM agent_evaluation_export_leases
		WHERE namespace_id = $1 AND plan_digest = $2 AND lease_kind = $3
			AND cursor_key_binding_digest = $4`, authority.NamespaceID, partition.PlanDigest,
		evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest).Scan(&existingLeaseID)
	if existingErr == nil {
		existing, err := loadEvaluationExportLease(readContext, tx, authority.NamespaceID, partition,
			existingLeaseID, evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest)
		if err != nil {
			return EvaluationExportLease{}, false, err
		}
		if !sameEvaluationProductionRunConfigArtifactBinding(existing.Commitments.RunConfigArtifactBinding, sourceBinding.RunConfigArtifactBinding) ||
			existing.Commitments.SourceConfigDigest != sourceBinding.SourceConfigDigest ||
			existing.Commitments.FrozenRunDigest != sourceBinding.FrozenRunDigest {
			return EvaluationExportLease{}, false, conflict("evaluation export source binding conflicts with the existing lease")
		}
		if err := validateEvaluationArchiveFinalizationAuthority(
			readContext, tx, authority.NamespaceID, partition, sourceBinding,
			existing.Commitments.AuthorityRoots, existing.Families,
			existing.Commitments.EvaluationManifestDigest, existing.Commitments.ReviewLeaseDigest,
		); err != nil {
			return EvaluationExportLease{}, false, err
		}
		if err := tx.Commit(); err != nil {
			return EvaluationExportLease{}, false, err
		}
		return existing, true, nil
	}
	if !errors.Is(existingErr, sql.ErrNoRows) {
		return EvaluationExportLease{}, false, existingErr
	}
	attestation, err := queryEvaluationAuthorityAttestation(readContext, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	root, err := queryEvaluationEvidenceRoot(readContext, tx, authority.NamespaceID, partition, plan)
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	manifestRecords, err := queryEvaluationArtifacts(readContext, tx, authority.NamespaceID, partition,
		" AND fact_type = $4", "evaluation-manifest")
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	if attestation == nil || root == nil || len(manifestRecords) != 1 ||
		!evaluationExportSemanticFinalizationMatches(*attestation, *root, manifestRecords[0]) {
		return EvaluationExportLease{}, false, conflict("evaluation export requires one finalized semantic authority and manifest")
	}
	var attemptCount, unsettledBudgetCount, openTurnCount int64
	if err := tx.QueryRowContext(readContext, `SELECT COUNT(*) FROM agent_evaluation_attempts
		WHERE namespace_id = $1 AND plan_digest = $2`, authority.NamespaceID, partition.PlanDigest).Scan(&attemptCount); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if attemptCount != plan.PlannedJourneyCount {
		return EvaluationExportLease{}, false, conflict("evaluation export denominator is incomplete")
	}
	if err := tx.QueryRowContext(readContext, `SELECT COUNT(*)
		FROM agent_evaluation_budget_reservations reservation
		LEFT JOIN agent_evaluation_budget_settlements settlement
			ON settlement.namespace_id = reservation.namespace_id
			AND settlement.plan_digest = reservation.plan_digest
			AND settlement.reservation_id = reservation.reservation_id
		WHERE reservation.namespace_id = $1 AND reservation.plan_digest = $2
			AND settlement.reservation_id IS NULL`, authority.NamespaceID, partition.PlanDigest).Scan(&unsettledBudgetCount); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if unsettledBudgetCount != 0 {
		return EvaluationExportLease{}, false, conflict("evaluation export budget has unsettled reservations")
	}
	if err := tx.QueryRowContext(readContext, `SELECT COUNT(*)
		FROM agent_evaluation_transport_dispatch_intents intent
		LEFT JOIN agent_evaluation_transport_receipts receipt
			ON receipt.namespace_id = intent.namespace_id AND receipt.plan_digest = intent.plan_digest
			AND receipt.attempt_id = intent.attempt_id AND receipt.turn_index = intent.turn_index
		WHERE intent.namespace_id = $1 AND intent.plan_digest = $2 AND receipt.receipt_digest IS NULL`,
		authority.NamespaceID, partition.PlanDigest).Scan(&openTurnCount); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if openTurnCount != 0 {
		return EvaluationExportLease{}, false, conflict("evaluation export contains open transport intents")
	}
	decodedAttestation, err := decodeEvaluationAuthorityAttestation(attestation.AttestationBytes)
	if err != nil || decodedAttestation.AttestedPayloadDigest == "" {
		return EvaluationExportLease{}, false, conflict("evaluation export authority payload is invalid")
	}
	leaseID, err := evaluationExportLeaseIdentity(authority.NamespaceID, partition,
		evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest, sourceBinding,
		attestation.AttestationDigest, root.EvaluationManifestDigest)
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	for _, spec := range evaluationExportFamilySpecs() {
		if err := materializeEvaluationRawExportFamily(readContext, tx, authority.NamespaceID, partition, leaseID, spec); err != nil {
			return EvaluationExportLease{}, false, err
		}
	}
	if err := materializeEvaluationPlanExportReference(readContext, tx, authority.NamespaceID, leaseID, plan); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := materializeEvaluationQualificationAuthorityExportFamilies(
		readContext, tx, authority, partition, leaseID, plan,
	); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := materializeEvaluationAttemptExportReferences(readContext, tx, authority.NamespaceID, partition, leaseID); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := materializeEvaluationCheckpointExportReferences(readContext, tx, authority.NamespaceID, partition, leaseID); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := materializeEvaluationArtifactExportReferences(readContext, tx, authority.NamespaceID, partition, leaseID); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := materializeEvaluationReviewReferenceExportFamilies(readContext, tx, authority.NamespaceID, partition, leaseID); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := materializeEvaluationBudgetExportReference(readContext, tx, authority.NamespaceID, partition, leaseID, plan); err != nil {
		return EvaluationExportLease{}, false, err
	}
	specs := evaluationExportFamilySpecs()
	summaries := make([]EvaluationExportFamilySummary, len(specs))
	var totalRecordCount, totalRecordBytes int64
	for index, spec := range specs {
		summary, err := summarizeEvaluationExportFamily(readContext, tx, authority.NamespaceID, partition, leaseID, spec)
		if err != nil {
			return EvaluationExportLease{}, false, err
		}
		if summary.FamilyIndex != int64(index) {
			return EvaluationExportLease{}, false, conflict("evaluation export family index drifted")
		}
		summaries[index] = summary
		totalRecordCount += summary.ExpectedRecordCount
		totalRecordBytes += summary.ExpectedTotalBytes
	}
	if err := validateEvaluationExportArchiveCapacity(totalRecordCount, totalRecordBytes); err != nil {
		return EvaluationExportLease{}, false, err
	}
	authorityRoots, err := evaluationExportAuthorityRoots(*root, summaries)
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	commitments := EvaluationEvidenceArchiveCommitments{
		RunConfigArtifactBinding: sourceBinding.RunConfigArtifactBinding, SourceConfigDigest: sourceBinding.SourceConfigDigest,
		FrozenRunDigest: sourceBinding.FrozenRunDigest,
		PlanDigest:      partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		EvidenceSetDigest: root.EvidenceSetDigest, AuthorityPayloadDigest: decodedAttestation.AttestedPayloadDigest,
		AuthorityAttestationDigest: attestation.AttestationDigest, AuthorityRoots: authorityRoots,
		ReviewLeaseDigest:        root.ReviewLeaseDigest,
		EvaluationManifestDigest: root.EvaluationManifestDigest, CreatedAt: evaluationExportInstant(createdAt),
	}
	if err := validateEvaluationArchiveCommitmentsAgainstFamilies(commitments, summaries); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := validateEvaluationArchiveFinalizationAuthority(
		readContext, tx, authority.NamespaceID, partition, sourceBinding, authorityRoots, summaries,
		root.EvaluationManifestDigest, root.ReviewLeaseDigest,
	); err != nil {
		return EvaluationExportLease{}, false, err
	}
	commitmentsBytes, err := canonicaljson.Bytes(commitments)
	if err != nil || len(commitmentsBytes) > 1_048_576 {
		return EvaluationExportLease{}, false, conflict("evaluation export commitments exceed their limit")
	}
	commitmentsDigest, err := canonicaljson.Digest(commitments)
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	leaseBase := evaluationExportLeaseBase(leaseID, evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest,
		commitmentsDigest, summaries, totalRecordCount, totalRecordBytes, createdAt, expiresAt)
	leaseDigest, err := canonicaljson.Digest(leaseBase)
	if err != nil {
		return EvaluationExportLease{}, false, err
	}
	for _, summary := range summaries {
		if _, err := tx.ExecContext(readContext, `INSERT INTO agent_evaluation_export_lease_families (
			namespace_id, lease_id, family, family_index, record_count, total_bytes,
			semantic_digest, record_set_digest, first_order_key, last_order_key
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`, authority.NamespaceID, leaseID,
			summary.Family, summary.FamilyIndex, summary.ExpectedRecordCount, summary.ExpectedTotalBytes,
			summary.ExpectedSemanticDigest, summary.ExpectedRecordSetDigest,
			nullableEvaluationAuthenticityString(pointerEvaluationExportString(summary.FirstOrderKey)),
			nullableEvaluationAuthenticityString(pointerEvaluationExportString(summary.LastOrderKey))); err != nil {
			return EvaluationExportLease{}, false, err
		}
	}
	if _, err := tx.ExecContext(readContext, `INSERT INTO agent_evaluation_export_leases (
		namespace_id, plan_digest, repository_commit, lease_kind, lease_id, lease_digest,
		cursor_key_binding_digest, evidence_set_digest, authority_payload_digest,
		authority_attestation_digest, evaluation_manifest_digest, semantic_root_digest,
		commitments_digest, commitments_bytes, family_count, total_record_count,
		total_record_bytes, created_at, expires_at
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, evaluationEvidenceExportLeaseKind,
		leaseID, leaseDigest, cursorKeyBindingDigest, root.EvidenceSetDigest, decodedAttestation.AttestedPayloadDigest,
		attestation.AttestationDigest, root.EvaluationManifestDigest, root.RootDigest, commitmentsDigest,
		commitmentsBytes, int64(len(summaries)), totalRecordCount, totalRecordBytes, createdAt, expiresAt); err != nil {
		return EvaluationExportLease{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationExportLease{}, false, err
	}
	return EvaluationExportLease{
		NamespaceID: authority.NamespaceID, Partition: partition, LeaseKind: evaluationEvidenceExportLeaseKind,
		LeaseID: leaseID, LeaseDigest: leaseDigest, CursorKeyBindingDigest: cursorKeyBindingDigest,
		Commitments: commitments, Families: summaries, TotalRecordCount: totalRecordCount, TotalRecordBytes: totalRecordBytes,
		CreatedAt: createdAt, ExpiresAt: expiresAt, CreatedAtText: evaluationExportInstant(createdAt),
		ExpiresAtText: evaluationExportInstant(expiresAt),
	}, false, nil
}

func pointerEvaluationExportString(value *string) string {
	if value == nil {
		return ""
	}
	return *value
}

func (repository *Repository) GetEvaluationEvidenceExportLease(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	leaseID string,
	cursorKeyBindingDigest string,
) (EvaluationExportLease, error) {
	if err := repository.available(); err != nil {
		return EvaluationExportLease{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationExportLease{}, err
	}
	if err := validateEvaluationPartition(partition); err != nil || !validEvaluationServiceIdentity(leaseID) ||
		!evaluationDigestPattern.MatchString(cursorKeyBindingDigest) {
		return EvaluationExportLease{}, ErrInvalid
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	if err := ensureEvaluationV46EligiblePartition(readContext, repository.db, authority.NamespaceID, partition); err != nil {
		return EvaluationExportLease{}, err
	}
	return loadEvaluationExportLease(readContext, repository.db, authority.NamespaceID, partition, leaseID,
		evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest)
}

func evaluationExportFamilySpecFor(family string) (evaluationExportFamilySpec, bool) {
	for _, spec := range evaluationExportFamilySpecs() {
		if spec.Family == family {
			return spec, true
		}
	}
	return evaluationExportFamilySpec{}, false
}

func evaluationExportSemanticDigestForValue(family string, value map[string]any) (string, error) {
	if family == "blindReviewMappingRefs" {
		return canonicaljson.Digest(value)
	}
	fields := map[string]string{
		"plan": "planDigest",
		"hostedRetrievalRuntimeResourceLifecycleJournals": "archiveRecordDigest",
		"hostedRetrievalRuntimeResourceCleanups":          "recordDigest",
		"capabilityEffectProviderRuntimeJournals":         "recordDigest",
		"endpointSmokeDispatchIntents":                    "intentDigest",
		"endpointSmokeTransportReceipts":                  "receiptDigest",
		"endpointSmokeResultSpoolReceipts":                "receiptDigest",
		"endpointSmokeResultSpoolDispositionReceipts":     "receiptDigest",
		"endpointSmokeValidationFailureReceipts":          "receiptDigest",
		"endpointSmokeReceipts":                           "receiptDigest",
		"preDispatchFailureReceipts":                      "receiptDigest",
		"transportDispatchIntents":                        "intentDigest",
		"transportReceipts":                               "receiptDigest",
		"providerResultSpoolReceipts":                     "receiptDigest",
		"providerResultSpoolDispositionReceipts":          "receiptDigest",
		"invocationTurnReceipts":                          "evidenceDigest",
		"invocationTurnSetReceipts":                       "receiptDigest",
		"resultSubmissionReceipts":                        "receiptDigest",
		"attemptAuthorityOwnerReceipts":                   "receiptDigest",
		"verificationAttemptGrantReceipts":                "receiptDigest",
		"controlledRuntimeReceipts":                       "receiptDigest",
		"capabilityExecutionReceipts":                     "receiptDigest",
		"capabilitySpecificReceipts":                      "receiptDigest",
		"providerCapabilityObservationReceipts":           "receiptDigest",
		"validatedHumanReviewArtifacts":                   "artifactDigest",
		"validatedHumanMetricObservations":                "observationDigest",
		"reviewRasterScanReceipts":                        "receiptDigest",
		"reviewCandidateRefs":                             "candidateDigest",
		"sourceReceipts":                                  "receiptDigest",
		"executionReceipts":                               "receiptDigest",
		"attempts":                                        "attemptDigest",
		"checkpoints":                                     "checkpointDigest",
		"budgetLedger":                                    "ledgerDigest",
		"metricReport":                                    "reportDigest",
		"graderReport":                                    "reportDigest",
		"humanReviewReport":                               "reportDigest",
		"holdoutExecutionReceipt":                         "receiptDigest",
		"authorityAttestation":                            "attestationDigest",
		"manifest":                                        "manifestDigest",
	}
	field, ok := fields[family]
	if !ok {
		return "", ErrInvalid
	}
	digest := stringMember(value, field)
	if !evaluationDigestPattern.MatchString(digest) {
		return "", conflict("evaluation export record semantic digest is invalid")
	}
	return digest, nil
}

type evaluationExportReferencePageRow struct {
	Ordinal      int64
	OrderKey     string
	RecordDigest string
	ByteLength   int64
	InlineBytes  []byte
}

func loadEvaluationExportReferencePage(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	leaseID string,
	family string,
	firstOrdinal int64,
	maximumRecords int64,
	maximumValueBytes int64,
) ([]evaluationExportReferencePageRow, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT record_ordinal, order_key, record_digest,
		byte_length, inline_value_bytes
		FROM agent_evaluation_export_lease_records
		WHERE namespace_id = $1 AND lease_id = $2 AND family = $3 AND record_ordinal >= $4
		ORDER BY record_ordinal ASC
		LIMIT $5`, namespaceID, leaseID, family, firstOrdinal, maximumRecords)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	references := make([]evaluationExportReferencePageRow, 0, maximumRecords)
	var totalBytes int64
	for rows.Next() {
		var reference evaluationExportReferencePageRow
		if err := rows.Scan(&reference.Ordinal, &reference.OrderKey, &reference.RecordDigest,
			&reference.ByteLength, &reference.InlineBytes); err != nil {
			return nil, err
		}
		if reference.Ordinal != firstOrdinal+int64(len(references)) || reference.OrderKey == "" ||
			!evaluationDigestPattern.MatchString(reference.RecordDigest) || reference.ByteLength < 1 ||
			reference.ByteLength > maximumEvaluationExportRecordBytes ||
			(len(references) > 0 && references[len(references)-1].OrderKey >= reference.OrderKey) {
			return nil, conflict("evaluation export page references are non-contiguous")
		}
		if totalBytes+reference.ByteLength > maximumValueBytes {
			break
		}
		totalBytes += reference.ByteLength
		references = append(references, reference)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(references) == 0 {
		return nil, conflict("evaluation export page cannot fit its first bounded record")
	}
	return references, nil
}

func loadEvaluationExportSourceBytes(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	leaseID string,
	spec evaluationExportFamilySpec,
	firstOrdinal int64,
	lastOrdinal int64,
) (map[int64][]byte, error) {
	if spec.SourceTable == "" {
		return map[int64][]byte{}, nil
	}
	commitPredicate := ""
	if !spec.ProjectFactValue {
		commitPredicate = " AND source.repository_commit = $7"
	}
	query := fmt.Sprintf(`SELECT reference.record_ordinal, source.%s
		FROM agent_evaluation_export_lease_records reference
		JOIN %s source ON source.namespace_id = reference.namespace_id
			AND source.%s = reference.record_digest
			AND source.%s = $3%s
		WHERE reference.namespace_id = $1 AND reference.lease_id = $2 AND reference.family = $4
			AND reference.record_ordinal BETWEEN $5 AND $6
		ORDER BY reference.record_ordinal ASC`, spec.SourceBytesColumn, spec.SourceTable,
		spec.SourceDigestColumn, spec.SourcePlanColumn, commitPredicate)
	arguments := []any{namespaceID, leaseID, partition.PlanDigest, spec.Family, firstOrdinal, lastOrdinal}
	if !spec.ProjectFactValue {
		arguments = append(arguments, partition.RepositoryCommit)
	}
	rows, err := queryer.QueryContext(ctx, query, arguments...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	values := make(map[int64][]byte, lastOrdinal-firstOrdinal+1)
	for rows.Next() {
		var ordinal int64
		var source []byte
		if err := rows.Scan(&ordinal, &source); err != nil {
			return nil, err
		}
		if _, duplicate := values[ordinal]; duplicate {
			return nil, conflict("evaluation export source join is duplicate")
		}
		values[ordinal] = append([]byte(nil), source...)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return values, nil
}

func loadEvaluationReviewCandidateRefValue(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	digest string,
) (map[string]any, error) {
	var reference EvaluationReviewCandidateRef
	reference.NamespaceID, reference.PlanDigest, reference.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
	err := queryer.QueryRowContext(ctx, `SELECT candidate_id, attempt_id, descriptor_digest, response_digest,
		execution_receipt_digest, grader_artifact_digest, projection_authority_digest, media_type,
		width, height, bytes_digest, byte_length, public_artifact_scan_digest, candidate_digest, generated_at
		FROM agent_evaluation_review_candidates
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
			AND candidate_digest = $4`, namespaceID, partition.PlanDigest, partition.RepositoryCommit, digest).
		Scan(&reference.CandidateID, &reference.AttemptID, &reference.DescriptorDigest, &reference.ResponseDigest,
			&reference.ExecutionReceiptDigest, &reference.GraderArtifactDigest, &reference.ProjectionAuthorityDigest,
			&reference.MediaType, &reference.Width, &reference.Height, &reference.BytesDigest, &reference.ByteLength,
			&reference.PublicArtifactScanDigest, &reference.CandidateDigest, &reference.GeneratedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, conflict("evaluation export review candidate source is missing")
	}
	if err != nil {
		return nil, err
	}
	return canonicalEvaluationReviewCandidateRef(reference), nil
}

func loadEvaluationBlindReviewMappingRefValue(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	orderKey string,
) (map[string]any, error) {
	var identity []string
	if err := json.Unmarshal([]byte(orderKey), &identity); err != nil || len(identity) != 1 || identity[0] == "" {
		return nil, conflict("evaluation export blind mapping order key is invalid")
	}
	var mappingDigest string
	if err := queryer.QueryRowContext(ctx, `SELECT mapping_digest
		FROM agent_evaluation_blind_review_mappings
		WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
			AND mapping_id = $4`, namespaceID, partition.PlanDigest, partition.RepositoryCommit, identity[0]).Scan(&mappingDigest); errors.Is(err, sql.ErrNoRows) {
		return nil, conflict("evaluation export blind mapping source is missing")
	} else if err != nil {
		return nil, err
	}
	return map[string]any{"mappingId": identity[0], "mappingDigest": mappingDigest}, nil
}

func (repository *Repository) ReadEvaluationEvidenceExportPage(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	leaseID string,
	cursorKeyBindingDigest string,
	family string,
	firstOrdinal int64,
	maximumRecords int64,
	maximumValueBytes int64,
	readAt time.Time,
) (EvaluationExportRecordPage, error) {
	if err := repository.available(); err != nil {
		return EvaluationExportRecordPage{}, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationExportRecordPage{}, err
	}
	spec, specOK := evaluationExportFamilySpecFor(family)
	if err := validateEvaluationPartition(partition); err != nil || !specOK || firstOrdinal < 0 ||
		maximumRecords < 1 || maximumRecords > maximumEvaluationExportPageRecords ||
		maximumValueBytes < maximumEvaluationExportRecordBytes || maximumValueBytes > maximumEvaluationExportPageBytes ||
		!evaluationDigestPattern.MatchString(cursorKeyBindingDigest) || readAt.IsZero() {
		return EvaluationExportRecordPage{}, ErrInvalid
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	if err := ensureEvaluationV46EligiblePartition(readContext, repository.db, authority.NamespaceID, partition); err != nil {
		return EvaluationExportRecordPage{}, err
	}
	lease, err := loadEvaluationExportLease(readContext, repository.db, authority.NamespaceID, partition, leaseID,
		evaluationEvidenceExportLeaseKind, cursorKeyBindingDigest)
	if err != nil {
		return EvaluationExportRecordPage{}, err
	}
	if !readAt.UTC().Before(lease.ExpiresAt) {
		return EvaluationExportRecordPage{}, conflict("evaluation export lease expired")
	}
	summary := lease.Families[spec.Index]
	if summary.Family != family || firstOrdinal > summary.ExpectedRecordCount {
		return EvaluationExportRecordPage{}, conflict("evaluation export page is outside its family")
	}
	if firstOrdinal == summary.ExpectedRecordCount {
		return EvaluationExportRecordPage{FirstRecordOrdinal: firstOrdinal}, nil
	}
	references, err := loadEvaluationExportReferencePage(readContext, repository.db, authority.NamespaceID,
		leaseID, family, firstOrdinal, maximumRecords, maximumValueBytes)
	if err != nil {
		return EvaluationExportRecordPage{}, err
	}
	sources, err := loadEvaluationExportSourceBytes(readContext, repository.db, authority.NamespaceID, partition,
		leaseID, spec, references[0].Ordinal, references[len(references)-1].Ordinal)
	if err != nil {
		return EvaluationExportRecordPage{}, err
	}
	result := make([]EvaluationExportSourceRecord, len(references))
	for index, reference := range references {
		var value map[string]any
		if reference.InlineBytes != nil {
			value, _, err = decodeEvaluationCanonicalObjectWithLimit(reference.InlineBytes, int(maximumEvaluationExportRecordBytes))
		} else if family == "reviewCandidateRefs" {
			value, err = loadEvaluationReviewCandidateRefValue(readContext, repository.db, authority.NamespaceID, partition, reference.RecordDigest)
		} else if family == "blindReviewMappingRefs" {
			value, err = loadEvaluationBlindReviewMappingRefValue(readContext, repository.db, authority.NamespaceID, partition, reference.OrderKey)
		} else {
			source, exists := sources[reference.Ordinal]
			if !exists {
				return EvaluationExportRecordPage{}, conflict("evaluation export source fact is missing")
			}
			if spec.ProjectFactValue {
				value, _, err = evaluationExportFactValue(source)
			} else {
				value, _, err = decodeEvaluationCanonicalObjectWithLimit(source, int(maximumEvaluationExportRecordBytes))
			}
		}
		if err != nil {
			return EvaluationExportRecordPage{}, err
		}
		canonical, err := evaluationExportCanonicalValue(value)
		if err != nil || int64(len(canonical)) != reference.ByteLength {
			return EvaluationExportRecordPage{}, conflict("evaluation export source byte length drifted")
		}
		semanticDigest, err := evaluationExportSemanticDigestForValue(family, value)
		if err != nil || semanticDigest != reference.RecordDigest {
			return EvaluationExportRecordPage{}, conflict("evaluation export source semantic digest drifted")
		}
		contentHash := sha256.Sum256(canonical)
		result[index] = EvaluationExportSourceRecord{
			OrderKey: reference.OrderKey, RecordDigest: reference.RecordDigest,
			ContentDigest: fmt.Sprintf("sha256-%x", contentHash), ByteLength: reference.ByteLength,
			Value: json.RawMessage(append([]byte(nil), canonical...)),
		}
		if family == "hostedRetrievalRuntimeResourceLifecycleJournals" {
			physical, marshalErr := json.Marshal(result[index])
			if marshalErr != nil || validateEvaluationHostedRetrievalRuntimeResourceLifecycleJournalPhysicalRecordCapacity(
				int64(len(physical)+1),
			) != nil {
				return EvaluationExportRecordPage{}, conflict("evaluation hosted lifecycle journal physical record exceeds capacity")
			}
		}
	}
	return EvaluationExportRecordPage{
		Records: result, FirstRecordOrdinal: firstOrdinal,
		HasMore: firstOrdinal+int64(len(result)) < summary.ExpectedRecordCount,
	}, nil
}
