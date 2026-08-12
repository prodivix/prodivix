package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"fmt"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	maximumEvaluationResultSubmissionReceiptBytes  = 262_144
	maximumEvaluationControlledRuntimeReceiptBytes = 2_097_152
	maximumEvaluationRuntimeReceiptCount           = 1_000_000
	maximumEvaluationRuntimeArtifactBytes          = 1_000_000_000_000
	maximumEvaluationRuntimePreviewBytes           = 67_108_864
	maximumEvaluationRuntimePreviewDimension       = 16_384
)

type EvaluationResultSubmissionReceiptRecord struct {
	NamespaceID      string
	PlanDigest       string
	RepositoryCommit string
	AttemptID        string
	InvocationID     string
	DescriptorDigest string
	CaseID           string
	CaseDigest       string
	MaterialDigest   string
	SubmissionDigest string
	ReceiptDigest    string
	ReceiptBytes     []byte
}

type EvaluationControlledRuntimeReceiptRecord struct {
	NamespaceID               string
	PlanDigest                string
	RepositoryCommit          string
	AttemptID                 string
	DescriptorDigest          string
	CaseID                    string
	CaseDigest                string
	MaterialDigest            string
	SubmissionReceiptDigest   string
	RuntimeAuthorityID        string
	VerificationClosureDigest string
	ReceiptDigest             string
	ReceiptBytes              []byte
}

type evaluationResultSubmissionReceipt struct {
	EvaluationResultSubmissionReceiptRecord
	CaseDefinitionDigest string
	ToolDefinitionDigest string
	Value                map[string]any
}

type evaluationControlledRuntimeReceipt struct {
	EvaluationControlledRuntimeReceiptRecord
	ArtifactResolution map[string]any
	ProposalValidation map[string]any
	IsolatedExecution  map[string]any
	G3Verification     map[string]any
	ControlledPreview  map[string]any
	Value              map[string]any
}

func evaluationExactDigestFields(value map[string]any, fields ...string) bool {
	for _, field := range fields {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return false
		}
	}
	return true
}

func evaluationExactIdentityFields(value map[string]any, fields ...string) bool {
	for _, field := range fields {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return false
		}
	}
	return true
}

func evaluationCanonicalObjectDigest(value map[string]any, digestField string) bool {
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != digestField {
			base[key] = entry
		}
	}
	digest, err := canonicaljson.Digest(base)
	return err == nil && value[digestField] == digest
}

func evaluationCanonicalDigestArray(value any, maximum int64) ([]string, error) {
	raw, ok := value.([]any)
	if !ok || int64(len(raw)) > maximum {
		return nil, invalid("evaluation controlled runtime digest array is invalid")
	}
	result := make([]string, len(raw))
	for index, entry := range raw {
		digest, err := evaluationAuthenticityDigest(entry, "controlled runtime authority digest")
		if err != nil || index > 0 && result[index-1] >= digest {
			return nil, invalid("evaluation controlled runtime digest array is not canonical")
		}
		result[index] = digest
	}
	return result, nil
}

func decodeEvaluationResultSubmissionReceipt(source []byte) (evaluationResultSubmissionReceipt, error) {
	if len(source) == 0 || len(source) > maximumEvaluationResultSubmissionReceiptBytes {
		return evaluationResultSubmissionReceipt{}, invalid("evaluation result submission receipt exceeds its byte limit")
	}
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationResultSubmissionReceipt{}, err
	}
	required := []string{
		"format", "version", "attemptId", "invocationId", "descriptorDigest", "caseId", "caseDigest",
		"materialDigest", "caseDefinitionDigest", "toolId", "nativeToolName", "toolVersion", "schemaDigest",
		"inputSchemaDigest", "toolDefinitionDigest", "providerToolCallId", "toolArgumentsDigest",
		"toolEventSequence", "toolEventDigest", "terminalEventSequence", "terminalEventDigest",
		"submissionDigest", "receiptDigest",
	}
	version, versionOK := integerMember(value, "version")
	toolSequence, toolSequenceOK := integerMember(value, "toolEventSequence")
	terminalSequence, terminalSequenceOK := integerMember(value, "terminalEventSequence")
	if !exactEvaluationKeys(value, required) ||
		value["format"] != "prodivix.agent-evaluation-result-submission-receipt" || version != 1 || !versionOK ||
		!evaluationExactIdentityFields(value, "attemptId", "invocationId", "caseId", "providerToolCallId") ||
		!evaluationExactDigestFields(value, "descriptorDigest", "caseDigest", "materialDigest", "caseDefinitionDigest",
			"schemaDigest", "inputSchemaDigest", "toolDefinitionDigest", "toolArgumentsDigest", "toolEventDigest",
			"terminalEventDigest", "submissionDigest", "receiptDigest") ||
		value["toolId"] != "evaluation.result.submit" || value["nativeToolName"] != "evaluation_result_submit" ||
		value["toolVersion"] != "v1" || !toolSequenceOK || toolSequence < 0 || !terminalSequenceOK ||
		terminalSequence <= toolSequence || !evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return evaluationResultSubmissionReceipt{}, invalid("evaluation result submission receipt shape or digest is invalid")
	}
	return evaluationResultSubmissionReceipt{
		EvaluationResultSubmissionReceiptRecord: EvaluationResultSubmissionReceiptRecord{
			AttemptID: stringMember(value, "attemptId"), InvocationID: stringMember(value, "invocationId"),
			DescriptorDigest: stringMember(value, "descriptorDigest"), CaseID: stringMember(value, "caseId"),
			CaseDigest: stringMember(value, "caseDigest"), MaterialDigest: stringMember(value, "materialDigest"),
			SubmissionDigest: stringMember(value, "submissionDigest"), ReceiptDigest: stringMember(value, "receiptDigest"),
			ReceiptBytes: canonical,
		},
		CaseDefinitionDigest: stringMember(value, "caseDefinitionDigest"),
		ToolDefinitionDigest: stringMember(value, "toolDefinitionDigest"), Value: value,
	}, nil
}

func evaluationBoundedRuntimeCount(value map[string]any, field string, maximum int64) (int64, bool) {
	count, ok := integerMember(value, field)
	return count, ok && count >= 0 && count <= maximum
}

func decodeEvaluationControlledRuntimeReceipt(source []byte) (evaluationControlledRuntimeReceipt, error) {
	if len(source) == 0 || len(source) > maximumEvaluationControlledRuntimeReceiptBytes {
		return evaluationControlledRuntimeReceipt{}, invalid("evaluation controlled runtime receipt exceeds its byte limit")
	}
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationControlledRuntimeReceipt{}, err
	}
	required := []string{
		"format", "version", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest", "caseId",
		"caseDigest", "materialDigest", "submissionReceiptDigest", "runtimeAuthorityId",
		"runtimeImplementationDigest", "artifactResolutionPolicyDigest", "proposalValidationPolicyDigest",
		"isolationPolicyDigest", "g3VerificationPolicyDigest", "controlledRenderPolicyDigest", "loopPolicyDigest",
		"maximumTurnsPerAttempt", "maximumToolCallsPerAttempt", "maximumRepairRoundsPerAttempt",
		"maximumAggregateArtifactBytes", "grantDigest", "grantGeneration", "toolRegistryDigest",
		"actionRegistryDigest", "operationSealReceiptDigests", "ownerAuthorityReceiptDigests",
		"verificationAttemptGrantReceiptDigests", "baseSnapshotDigest", "finalSnapshotDigest",
		"cleanupReceiptDigest", "sourceReferencesRevoked", "sandboxDestroyed", "ownerAuthoritySetDigest",
		"artifactResolution", "proposalValidation", "isolatedExecution", "g3Verification", "receiptDigest",
	}
	version, versionOK := integerMember(value, "version")
	artifact, artifactOK := objectMember(value, "artifactResolution")
	proposal, proposalOK := objectMember(value, "proposalValidation")
	execution, executionOK := objectMember(value, "isolatedExecution")
	verification, verificationOK := objectMember(value, "g3Verification")
	preview, hasPreview := objectMember(value, "controlledPreview")
	if !exactEvaluationKeys(value, required, "controlledPreview", "producedCapabilityExecutionReceiptSetDigest",
		"toolExecutionReceiptSetDigest", "continuationReceiptSetDigest", "operationIntentSetDigest",
		"operationSealSetDigest", "verificationAttemptGrantReceiptSetDigest") ||
		value["format"] != "prodivix.agent-evaluation-controlled-runtime-receipt" || version != 1 || !versionOK ||
		!evaluationDigestPattern.MatchString(stringMember(value, "planDigest")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!evaluationExactIdentityFields(value, "attemptId", "caseId", "runtimeAuthorityId") ||
		!evaluationExactDigestFields(value, "descriptorDigest", "caseDigest", "materialDigest", "submissionReceiptDigest",
			"runtimeImplementationDigest", "artifactResolutionPolicyDigest", "proposalValidationPolicyDigest",
			"isolationPolicyDigest", "g3VerificationPolicyDigest", "controlledRenderPolicyDigest", "loopPolicyDigest",
			"grantDigest", "toolRegistryDigest", "actionRegistryDigest", "baseSnapshotDigest", "finalSnapshotDigest",
			"cleanupReceiptDigest", "ownerAuthoritySetDigest", "receiptDigest") ||
		!artifactOK || !proposalOK || !executionOK || !verificationOK ||
		!evaluationCanonicalObjectDigest(value, "receiptDigest") {
		return evaluationControlledRuntimeReceipt{}, invalid("evaluation controlled runtime receipt shape or digest is invalid")
	}
	maximumTurns, maximumTurnsOK := evaluationBoundedRuntimeCount(value, "maximumTurnsPerAttempt", maximumEvaluationRuntimeReceiptCount)
	maximumToolCalls, maximumToolCallsOK := evaluationBoundedRuntimeCount(value, "maximumToolCallsPerAttempt", maximumEvaluationRuntimeReceiptCount)
	maximumRepairRounds, maximumRepairRoundsOK := evaluationBoundedRuntimeCount(value, "maximumRepairRoundsPerAttempt", maximumEvaluationRuntimeReceiptCount)
	maximumAggregateBytes, maximumAggregateBytesOK := evaluationBoundedRuntimeCount(value, "maximumAggregateArtifactBytes", maximumEvaluationRuntimeArtifactBytes)
	grantGeneration, grantGenerationOK := evaluationBoundedRuntimeCount(value, "grantGeneration", 9_007_199_254_740_991)
	operationSealDigests, operationSealErr := evaluationCanonicalDigestArray(value["operationSealReceiptDigests"], maximumEvaluationRuntimeReceiptCount)
	ownerDigests, ownerErr := evaluationCanonicalDigestArray(value["ownerAuthorityReceiptDigests"], maximumEvaluationRuntimeReceiptCount)
	verificationGrantDigests, verificationGrantErr := evaluationCanonicalDigestArray(value["verificationAttemptGrantReceiptDigests"], 128)
	ownerSetDigest, ownerSetErr := canonicaljson.Digest(map[string]any{"ownerAuthorityReceiptDigests": ownerDigests})
	verificationGrantSetDigest := stringMember(value, "verificationAttemptGrantReceiptSetDigest")
	expectedVerificationGrantSetDigest := ""
	if len(verificationGrantDigests) > 0 {
		expectedVerificationGrantSetDigest, _ = canonicaljson.Digest(map[string]any{
			"verificationAttemptGrantReceiptDigests": verificationGrantDigests,
		})
	}
	ownerSet := make(map[string]struct{}, len(ownerDigests))
	for _, digest := range ownerDigests {
		ownerSet[digest] = struct{}{}
	}
	verificationGrantsOwned := true
	for _, digest := range verificationGrantDigests {
		if _, exists := ownerSet[digest]; !exists {
			verificationGrantsOwned = false
		}
	}
	for _, optionalDigest := range []string{
		"producedCapabilityExecutionReceiptSetDigest", "toolExecutionReceiptSetDigest",
		"continuationReceiptSetDigest", "operationIntentSetDigest", "operationSealSetDigest",
		"verificationAttemptGrantReceiptSetDigest",
	} {
		if _, exists := value[optionalDigest]; exists {
			if _, err := optionalEvaluationAuthenticityDigest(value, optionalDigest); err != nil {
				return evaluationControlledRuntimeReceipt{}, err
			}
		}
	}
	if !maximumTurnsOK || maximumTurns < 2 || !maximumToolCallsOK || maximumToolCalls < 1 || maximumToolCalls >= maximumTurns ||
		!maximumRepairRoundsOK || maximumRepairRounds < 1 || !maximumAggregateBytesOK || maximumAggregateBytes < 1 ||
		!grantGenerationOK || grantGeneration < 1 || operationSealErr != nil || ownerErr != nil || verificationGrantErr != nil ||
		len(ownerDigests) == 0 || ownerSetErr != nil || stringMember(value, "ownerAuthoritySetDigest") != ownerSetDigest ||
		!verificationGrantsOwned || (len(verificationGrantDigests) > 0) != (verificationGrantSetDigest != "") ||
		verificationGrantSetDigest != expectedVerificationGrantSetDigest || value["sourceReferencesRevoked"] != true ||
		value["sandboxDestroyed"] != true || len(operationSealDigests) > int(maximumToolCalls) {
		return evaluationControlledRuntimeReceipt{}, invalid("evaluation controlled runtime authority or limits are invalid")
	}
	artifactCount, artifactCountOK := evaluationBoundedRuntimeCount(artifact, "resolvedArtifactCount", maximumEvaluationRuntimeReceiptCount)
	artifactBytes, artifactBytesOK := evaluationBoundedRuntimeCount(artifact, "resolvedArtifactBytes", maximumEvaluationRuntimeArtifactBytes)
	_ = artifactCount
	_ = artifactBytes
	toolCount, toolCountOK := evaluationBoundedRuntimeCount(execution, "toolCallCount", maximumEvaluationRuntimeReceiptCount)
	transactionCount, transactionCountOK := evaluationBoundedRuntimeCount(execution, "transactionCount", maximumEvaluationRuntimeReceiptCount)
	_, hasToolSetDigest := execution["toolReceiptSetDigest"]
	_, hasTransactionSetDigest := execution["transactionReceiptSetDigest"]
	if !exactEvaluationKeys(artifact, []string{"resolvedArtifactCount", "resolvedArtifactBytes", "artifactResolutionReceiptSetDigest"}) ||
		!artifactCountOK || !artifactBytesOK || !evaluationExactDigestFields(artifact, "artifactResolutionReceiptSetDigest") ||
		!exactEvaluationKeys(proposal, []string{"verdict", "typedProposalValidationReceiptDigest"}) ||
		!oneOfString(stringMember(proposal, "verdict"), "passed", "failed") ||
		!evaluationExactDigestFields(proposal, "typedProposalValidationReceiptDigest") ||
		!exactEvaluationKeys(execution, []string{"isolationPolicyDigest", "toolCallCount",
			"repairRoundCount", "commandCount", "commandReceiptSetDigest", "transactionCount"},
			"toolReceiptSetDigest", "transactionReceiptSetDigest") ||
		!evaluationExactDigestFields(execution, "isolationPolicyDigest", "commandReceiptSetDigest") ||
		(hasToolSetDigest && !evaluationExactDigestFields(execution, "toolReceiptSetDigest")) ||
		(hasTransactionSetDigest && !evaluationExactDigestFields(execution, "transactionReceiptSetDigest")) ||
		(toolCount > 0) != hasToolSetDigest || (transactionCount > 0) != hasTransactionSetDigest ||
		!toolCountOK || !transactionCountOK ||
		stringMember(execution, "isolationPolicyDigest") != stringMember(value, "isolationPolicyDigest") ||
		!exactEvaluationKeys(verification, []string{"verificationPlanReceiptDigest", "verificationClosureDigest", "verdict"}) ||
		!evaluationExactDigestFields(verification, "verificationPlanReceiptDigest", "verificationClosureDigest") ||
		!oneOfString(stringMember(verification, "verdict"), "passed", "failed") ||
		(stringMember(verification, "verdict") == "passed" && stringMember(proposal, "verdict") != "passed") {
		return evaluationControlledRuntimeReceipt{}, invalid("evaluation controlled runtime nested receipt is invalid")
	}
	for _, field := range []string{"repairRoundCount", "commandCount"} {
		if _, ok := evaluationBoundedRuntimeCount(execution, field, maximumEvaluationRuntimeReceiptCount); !ok {
			return evaluationControlledRuntimeReceipt{}, invalid("evaluation controlled runtime count is invalid")
		}
	}
	if raw, exists := value["controlledPreview"]; exists {
		if !hasPreview || raw == nil || !exactEvaluationKeys(preview,
			[]string{"artifactRef", "artifactDigest", "mediaType", "width", "height", "byteLength", "renderPolicyDigest"}) ||
			!evaluationExactIdentityFields(preview, "artifactRef") ||
			!evaluationExactDigestFields(preview, "artifactDigest", "renderPolicyDigest") ||
			!oneOfString(stringMember(preview, "mediaType"), "image/png", "image/webp") ||
			stringMember(preview, "renderPolicyDigest") != stringMember(value, "controlledRenderPolicyDigest") {
			return evaluationControlledRuntimeReceipt{}, invalid("evaluation controlled preview is invalid")
		}
		width, widthOK := evaluationBoundedRuntimeCount(preview, "width", maximumEvaluationRuntimePreviewDimension)
		height, heightOK := evaluationBoundedRuntimeCount(preview, "height", maximumEvaluationRuntimePreviewDimension)
		byteLength, byteLengthOK := evaluationBoundedRuntimeCount(preview, "byteLength", maximumEvaluationRuntimePreviewBytes)
		if !widthOK || width < 1 || !heightOK || height < 1 || !byteLengthOK || byteLength < 1 {
			return evaluationControlledRuntimeReceipt{}, invalid("evaluation controlled preview bounds are invalid")
		}
	}
	return evaluationControlledRuntimeReceipt{
		EvaluationControlledRuntimeReceiptRecord: EvaluationControlledRuntimeReceiptRecord{
			PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
			AttemptID: stringMember(value, "attemptId"), DescriptorDigest: stringMember(value, "descriptorDigest"),
			CaseID: stringMember(value, "caseId"), CaseDigest: stringMember(value, "caseDigest"),
			MaterialDigest:            stringMember(value, "materialDigest"),
			SubmissionReceiptDigest:   stringMember(value, "submissionReceiptDigest"),
			RuntimeAuthorityID:        stringMember(value, "runtimeAuthorityId"),
			VerificationClosureDigest: stringMember(verification, "verificationClosureDigest"),
			ReceiptDigest:             stringMember(value, "receiptDigest"), ReceiptBytes: canonical,
		},
		ArtifactResolution: artifact, ProposalValidation: proposal, IsolatedExecution: execution,
		G3Verification: verification, ControlledPreview: preview, Value: value,
	}, nil
}

func evaluationInvocationID(invocation evaluationInvocationReceipt) string {
	receipt, _ := objectMember(invocation.Value, "invocationReceipt")
	return stringMember(receipt, "invocationId")
}

func validateEvaluationRuntimeEvidenceBinding(
	plan evaluationPlanFact,
	attempt evaluationAttemptFact,
	invocation evaluationInvocationReceipt,
	execution evaluationExecutionReceipt,
	submission evaluationResultSubmissionReceipt,
	runtime evaluationControlledRuntimeReceipt,
) error {
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", attempt.CaseID)
	if evaluationCase == nil || submission.AttemptID != attempt.AttemptID || runtime.AttemptID != attempt.AttemptID ||
		submission.DescriptorDigest != attempt.DescriptorDigest || runtime.DescriptorDigest != attempt.DescriptorDigest ||
		submission.CaseID != attempt.CaseID || runtime.CaseID != attempt.CaseID ||
		submission.CaseDigest != stringMember(evaluationCase, "caseDigest") || runtime.CaseDigest != submission.CaseDigest ||
		submission.CaseDefinitionDigest != stringMember(evaluationCase, "caseDefinitionDigest") ||
		runtime.MaterialDigest != submission.MaterialDigest || runtime.SubmissionReceiptDigest != submission.ReceiptDigest ||
		runtime.PlanDigest != plan.PlanDigest || runtime.RepositoryCommit != plan.RepositoryCommit ||
		submission.InvocationID != evaluationInvocationID(invocation) {
		return conflict("evaluation result submission or controlled runtime receipt drifted from its attempt")
	}
	toolCalls, _ := integerMember(runtime.IsolatedExecution, "toolCallCount")
	repairRounds, _ := integerMember(runtime.IsolatedExecution, "repairRoundCount")
	transactions, _ := integerMember(runtime.IsolatedExecution, "transactionCount")
	resolvedArtifactBytes, _ := integerMember(runtime.ArtifactResolution, "resolvedArtifactBytes")
	if toolCalls != execution.ToolCalls || repairRounds != execution.RepairRounds || transactions != execution.Transactions ||
		resolvedArtifactBytes != execution.ArtifactBytes ||
		execution.ToolReceiptSetDigest != stringMember(runtime.IsolatedExecution, "toolReceiptSetDigest") ||
		execution.TransactionReceiptSetDigest != stringMember(runtime.IsolatedExecution, "transactionReceiptSetDigest") ||
		execution.VerificationClosureDigest != runtime.VerificationClosureDigest {
		return conflict("evaluation controlled runtime receipt drifted from execution evidence")
	}
	if attempt.Outcome == "passed" && (stringMember(runtime.ProposalValidation, "verdict") != "passed" ||
		stringMember(runtime.G3Verification, "verdict") != "passed") {
		return conflict("evaluation passed attempt lacks passed proposal and G3 authority")
	}
	subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool)
	if attempt.Outcome == "passed" && subjective && runtime.ControlledPreview == nil {
		return conflict("evaluation subjective passed attempt lacks a controlled preview")
	}
	return nil
}

func validateEvaluationRuntimeEvidenceBindingFromTurn(
	plan evaluationPlanFact,
	attempt evaluationAttemptFact,
	turn evaluationInvocationTurnReceipt,
	execution evaluationExecutionReceipt,
	submission evaluationResultSubmissionReceipt,
	runtime evaluationControlledRuntimeReceipt,
) error {
	if !turn.Terminal || turn.Status != "completed" || turn.Invocation == nil ||
		turn.ResultSubmissionReceiptDigest != submission.ReceiptDigest ||
		turn.ControlledRuntimeReceiptDigest != runtime.ReceiptDigest ||
		submission.InvocationID != turn.Invocation.InvocationID {
		return conflict("evaluation runtime evidence drifted from its terminal invocation turn")
	}
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", attempt.CaseID)
	if evaluationCase == nil || submission.AttemptID != attempt.AttemptID || runtime.AttemptID != attempt.AttemptID ||
		submission.DescriptorDigest != attempt.DescriptorDigest || runtime.DescriptorDigest != attempt.DescriptorDigest ||
		submission.CaseID != attempt.CaseID || runtime.CaseID != attempt.CaseID ||
		submission.CaseDigest != stringMember(evaluationCase, "caseDigest") || runtime.CaseDigest != submission.CaseDigest ||
		submission.CaseDefinitionDigest != stringMember(evaluationCase, "caseDefinitionDigest") ||
		runtime.MaterialDigest != submission.MaterialDigest || runtime.SubmissionReceiptDigest != submission.ReceiptDigest ||
		runtime.PlanDigest != plan.PlanDigest || runtime.RepositoryCommit != plan.RepositoryCommit {
		return conflict("evaluation result submission or controlled runtime receipt drifted from its attempt")
	}
	toolCalls, _ := integerMember(runtime.IsolatedExecution, "toolCallCount")
	repairRounds, _ := integerMember(runtime.IsolatedExecution, "repairRoundCount")
	transactions, _ := integerMember(runtime.IsolatedExecution, "transactionCount")
	resolvedArtifactBytes, _ := integerMember(runtime.ArtifactResolution, "resolvedArtifactBytes")
	if toolCalls != execution.ToolCalls || repairRounds != execution.RepairRounds || transactions != execution.Transactions ||
		resolvedArtifactBytes != execution.ArtifactBytes ||
		execution.ToolReceiptSetDigest != stringMember(runtime.IsolatedExecution, "toolReceiptSetDigest") ||
		execution.TransactionReceiptSetDigest != stringMember(runtime.IsolatedExecution, "transactionReceiptSetDigest") ||
		execution.VerificationClosureDigest != runtime.VerificationClosureDigest {
		return conflict("evaluation controlled runtime receipt drifted from execution evidence")
	}
	if attempt.Outcome == "passed" && (stringMember(runtime.ProposalValidation, "verdict") != "passed" ||
		stringMember(runtime.G3Verification, "verdict") != "passed") {
		return conflict("evaluation passed attempt lacks passed proposal and G3 authority")
	}
	subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool)
	if attempt.Outcome == "passed" && subjective && runtime.ControlledPreview == nil {
		return conflict("evaluation subjective passed attempt lacks a controlled preview")
	}
	return nil
}

func (repository *Repository) storeEvaluationResultSubmissionReceiptTx(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receipt evaluationResultSubmissionReceipt,
) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_result_submission_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, invocation_id, descriptor_digest,
		case_id, case_digest, material_digest, submission_digest, receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, receipt.AttemptID, receipt.InvocationID,
		receipt.DescriptorDigest, receipt.CaseID, receipt.CaseDigest, receipt.MaterialDigest,
		receipt.SubmissionDigest, receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes)
	return err
}

func (repository *Repository) storeEvaluationControlledRuntimeReceiptTx(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receipt evaluationControlledRuntimeReceipt,
) error {
	_, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_controlled_runtime_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, case_id,
		case_digest, material_digest, submission_receipt_digest, runtime_authority_id,
		verification_closure_digest, receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, receipt.AttemptID,
		receipt.DescriptorDigest, receipt.CaseID, receipt.CaseDigest, receipt.MaterialDigest,
		receipt.SubmissionReceiptDigest, receipt.RuntimeAuthorityID, receipt.VerificationClosureDigest,
		receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes)
	return err
}

func runtimeEvidenceRecordsFromDecoded(
	namespaceID string,
	partition EvaluationPlanPartition,
	submission evaluationResultSubmissionReceipt,
	runtime evaluationControlledRuntimeReceipt,
) (EvaluationResultSubmissionReceiptRecord, EvaluationControlledRuntimeReceiptRecord) {
	submissionRecord := submission.EvaluationResultSubmissionReceiptRecord
	submissionRecord.NamespaceID, submissionRecord.PlanDigest, submissionRecord.RepositoryCommit =
		namespaceID, partition.PlanDigest, partition.RepositoryCommit
	runtimeRecord := runtime.EvaluationControlledRuntimeReceiptRecord
	runtimeRecord.NamespaceID = namespaceID
	return submissionRecord, runtimeRecord
}

func validateEvaluationResultSubmissionPlanBinding(plan evaluationPlanFact, receipt evaluationResultSubmissionReceipt) error {
	evaluationCase := evaluationPlanObjectByIdentity(plan.Value["concreteCases"], "caseId", receipt.CaseID)
	if evaluationCase == nil || stringMember(evaluationCase, "caseDigest") != receipt.CaseDigest ||
		stringMember(evaluationCase, "caseDefinitionDigest") != receipt.CaseDefinitionDigest {
		return conflict("evaluation result submission receipt is outside the frozen case")
	}
	return nil
}

func (repository *Repository) StoreEvaluationResultSubmissionReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationResultSubmissionReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationResultSubmissionReceipt(receiptBytes)
	if err != nil {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	if err := validateEvaluationResultSubmissionPlanBinding(plan, receipt); err != nil {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	if attempt, err := loadEvaluationAttemptForAuthenticity(writeContext, tx, authority.NamespaceID, partition, receipt.AttemptID); err == nil {
		if attempt.Status != "completed" || attempt.DescriptorDigest != receipt.DescriptorDigest || attempt.CaseID != receipt.CaseID {
			return EvaluationResultSubmissionReceiptRecord{}, false, conflict("evaluation result submission receipt drifted from its durable attempt")
		}
	} else if !errors.Is(err, ErrNotFound) {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_result_submission_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, invocation_id, descriptor_digest,
		case_id, case_digest, material_digest, submission_digest, receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb, $13)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.AttemptID, receipt.InvocationID, receipt.DescriptorDigest, receipt.CaseID, receipt.CaseDigest,
		receipt.MaterialDigest, receipt.SubmissionDigest, receipt.ReceiptDigest,
		string(receipt.ReceiptBytes), receipt.ReceiptBytes)
	if err != nil {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT receipt_bytes
			FROM agent_evaluation_result_submission_receipts
			WHERE namespace_id = $1 AND plan_digest = $2
			  AND (attempt_id = $3 OR descriptor_digest = $4 OR invocation_id = $5 OR receipt_digest = $6)
			FOR SHARE`, authority.NamespaceID, partition.PlanDigest, receipt.AttemptID,
			receipt.DescriptorDigest, receipt.InvocationID, receipt.ReceiptDigest)
		if err != nil {
			return EvaluationResultSubmissionReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing, receipt.ReceiptBytes) {
			return EvaluationResultSubmissionReceiptRecord{}, false, conflict("evaluation result submission identity was reused")
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationResultSubmissionReceiptRecord{}, false, err
	}
	record := receipt.EvaluationResultSubmissionReceiptRecord
	record.NamespaceID, record.PlanDigest, record.RepositoryCommit = authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit
	return record, replayed, nil
}

func (repository *Repository) StoreEvaluationControlledRuntimeReceipt(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptBytes []byte,
) (EvaluationControlledRuntimeReceiptRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationControlledRuntimeReceiptRecord{}, false, err
	}
	receipt, err := decodeEvaluationControlledRuntimeReceipt(receiptBytes)
	if err != nil {
		return EvaluationControlledRuntimeReceiptRecord{}, false, err
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationControlledRuntimeReceiptRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationControlledRuntimeReceiptRecord{}, false, err
	}
	if receipt.PlanDigest != plan.PlanDigest || receipt.RepositoryCommit != plan.RepositoryCommit {
		return EvaluationControlledRuntimeReceiptRecord{}, false, conflict("evaluation controlled runtime receipt belongs to another plan")
	}
	var submissionBytes []byte
	if err := tx.QueryRowContext(writeContext, `SELECT receipt_bytes
		FROM agent_evaluation_result_submission_receipts
		WHERE namespace_id = $1 AND plan_digest = $2 AND attempt_id = $3
		  AND receipt_digest = $4 FOR SHARE`, authority.NamespaceID, partition.PlanDigest,
		receipt.AttemptID, receipt.SubmissionReceiptDigest).Scan(&submissionBytes); errors.Is(err, sql.ErrNoRows) {
		return EvaluationControlledRuntimeReceiptRecord{}, false, ErrNotFound
	} else if err != nil {
		return EvaluationControlledRuntimeReceiptRecord{}, false, err
	}
	submission, err := decodeEvaluationResultSubmissionReceipt(submissionBytes)
	if err != nil || submission.AttemptID != receipt.AttemptID || submission.DescriptorDigest != receipt.DescriptorDigest ||
		submission.CaseID != receipt.CaseID || submission.CaseDigest != receipt.CaseDigest ||
		submission.MaterialDigest != receipt.MaterialDigest {
		return EvaluationControlledRuntimeReceiptRecord{}, false, conflict("evaluation controlled runtime submission binding drifted")
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_controlled_runtime_receipts (
		namespace_id, plan_digest, repository_commit, attempt_id, descriptor_digest, case_id,
		case_digest, material_digest, submission_receipt_digest, runtime_authority_id,
		verification_closure_digest, receipt_digest, receipt_json, receipt_bytes
	) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		receipt.AttemptID, receipt.DescriptorDigest, receipt.CaseID, receipt.CaseDigest, receipt.MaterialDigest,
		receipt.SubmissionReceiptDigest, receipt.RuntimeAuthorityID, receipt.VerificationClosureDigest,
		receipt.ReceiptDigest, string(receipt.ReceiptBytes), receipt.ReceiptBytes)
	if err != nil {
		return EvaluationControlledRuntimeReceiptRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationControlledRuntimeReceiptRecord{}, false, err
	}
	replayed := inserted == 0
	if replayed {
		existing, err := immutableEvaluationCollisionBytes(writeContext, tx, `SELECT receipt_bytes
			FROM agent_evaluation_controlled_runtime_receipts
			WHERE namespace_id = $1 AND plan_digest = $2
			  AND (attempt_id = $3 OR descriptor_digest = $4 OR receipt_digest = $5)
			FOR SHARE`, authority.NamespaceID, partition.PlanDigest, receipt.AttemptID,
			receipt.DescriptorDigest, receipt.ReceiptDigest)
		if err != nil {
			return EvaluationControlledRuntimeReceiptRecord{}, false, err
		}
		if !bytes.Equal(existing, receipt.ReceiptBytes) {
			return EvaluationControlledRuntimeReceiptRecord{}, false, conflict("evaluation controlled runtime identity was reused")
		}
	}
	if err := tx.Commit(); err != nil {
		return EvaluationControlledRuntimeReceiptRecord{}, false, err
	}
	record := receipt.EvaluationControlledRuntimeReceiptRecord
	record.NamespaceID = authority.NamespaceID
	return record, replayed, nil
}

func queryEvaluationRuntimeEvidence(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan EvaluationPlanRecord,
	attempts []EvaluationAttemptRecord,
	turns []EvaluationInvocationTurnReceiptRecord,
	executions []EvaluationExecutionReceiptRecord,
	requireComplete bool,
) ([]EvaluationResultSubmissionReceiptRecord, []EvaluationControlledRuntimeReceiptRecord, error) {
	planFact, err := decodeEvaluationPlan(plan.FactBytes)
	if err != nil {
		return nil, nil, err
	}
	attemptByID := make(map[string]evaluationAttemptFact, len(attempts))
	for _, record := range attempts {
		attempt, err := decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return nil, nil, err
		}
		attemptByID[attempt.AttemptID] = attempt
	}
	terminalTurnByAttempt := make(map[string]evaluationInvocationTurnReceipt, len(attempts))
	for _, record := range turns {
		turn, err := decodeEvaluationInvocationTurnReceipt(record.ReceiptBytes)
		if err != nil {
			return nil, nil, err
		}
		if turn.Terminal {
			if _, duplicate := terminalTurnByAttempt[turn.AttemptID]; duplicate {
				return nil, nil, conflict("evaluation runtime evidence has duplicate terminal invocation turns")
			}
			terminalTurnByAttempt[turn.AttemptID] = turn
		}
	}
	executionByAttempt := make(map[string]evaluationExecutionReceipt, len(executions))
	for _, record := range executions {
		execution, err := decodeEvaluationExecutionReceipt(record.ReceiptBytes)
		if err != nil {
			return nil, nil, err
		}
		executionByAttempt[execution.AttemptID] = execution
	}
	submissionRows, err := queryer.QueryContext(ctx, `SELECT attempt_id, invocation_id, descriptor_digest,
		case_id, case_digest, material_digest, submission_digest, receipt_digest, receipt_bytes
	FROM agent_evaluation_result_submission_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	ORDER BY attempt_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, nil, err
	}
	submissions := make([]EvaluationResultSubmissionReceiptRecord, 0)
	submissionValues := make(map[string]evaluationResultSubmissionReceipt)
	for submissionRows.Next() {
		var record EvaluationResultSubmissionReceiptRecord
		var source []byte
		if err := submissionRows.Scan(&record.AttemptID, &record.InvocationID, &record.DescriptorDigest,
			&record.CaseID, &record.CaseDigest, &record.MaterialDigest, &record.SubmissionDigest,
			&record.ReceiptDigest, &source); err != nil {
			_ = submissionRows.Close()
			return nil, nil, err
		}
		decoded, err := decodeEvaluationResultSubmissionReceipt(source)
		if err != nil {
			_ = submissionRows.Close()
			return nil, nil, fmt.Errorf("decode persisted result submission receipt: %w", err)
		}
		if !bytes.Equal(source, decoded.ReceiptBytes) || record.AttemptID != decoded.AttemptID ||
			record.InvocationID != decoded.InvocationID || record.DescriptorDigest != decoded.DescriptorDigest ||
			record.CaseID != decoded.CaseID || record.CaseDigest != decoded.CaseDigest ||
			record.MaterialDigest != decoded.MaterialDigest || record.SubmissionDigest != decoded.SubmissionDigest ||
			record.ReceiptDigest != decoded.ReceiptDigest {
			_ = submissionRows.Close()
			return nil, nil, conflict("persisted result submission metadata drifted from canonical bytes")
		}
		if _, duplicate := submissionValues[record.AttemptID]; duplicate {
			_ = submissionRows.Close()
			return nil, nil, conflict("evaluation result submission receipt identity is duplicated")
		}
		record.NamespaceID, record.PlanDigest, record.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		record.ReceiptBytes = append([]byte(nil), source...)
		submissionValues[record.AttemptID] = decoded
		submissions = append(submissions, record)
	}
	if err := submissionRows.Close(); err != nil {
		return nil, nil, err
	}
	runtimeRows, err := queryer.QueryContext(ctx, `SELECT attempt_id, descriptor_digest, case_id,
		case_digest, material_digest, submission_receipt_digest, runtime_authority_id,
		verification_closure_digest, receipt_digest, receipt_bytes
	FROM agent_evaluation_controlled_runtime_receipts
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3
	ORDER BY attempt_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, nil, err
	}
	defer runtimeRows.Close()
	runtimes := make([]EvaluationControlledRuntimeReceiptRecord, 0)
	runtimeValues := make(map[string]evaluationControlledRuntimeReceipt)
	for runtimeRows.Next() {
		var record EvaluationControlledRuntimeReceiptRecord
		var source []byte
		if err := runtimeRows.Scan(&record.AttemptID, &record.DescriptorDigest, &record.CaseID,
			&record.CaseDigest, &record.MaterialDigest, &record.SubmissionReceiptDigest,
			&record.RuntimeAuthorityID, &record.VerificationClosureDigest, &record.ReceiptDigest, &source); err != nil {
			return nil, nil, err
		}
		decoded, err := decodeEvaluationControlledRuntimeReceipt(source)
		if err != nil {
			return nil, nil, fmt.Errorf("decode persisted controlled runtime receipt: %w", err)
		}
		if !bytes.Equal(source, decoded.ReceiptBytes) || record.AttemptID != decoded.AttemptID ||
			record.DescriptorDigest != decoded.DescriptorDigest || record.CaseID != decoded.CaseID ||
			record.CaseDigest != decoded.CaseDigest || record.MaterialDigest != decoded.MaterialDigest ||
			record.SubmissionReceiptDigest != decoded.SubmissionReceiptDigest ||
			record.RuntimeAuthorityID != decoded.RuntimeAuthorityID ||
			record.VerificationClosureDigest != decoded.VerificationClosureDigest || record.ReceiptDigest != decoded.ReceiptDigest {
			return nil, nil, conflict("persisted controlled runtime metadata drifted from canonical bytes")
		}
		if _, duplicate := runtimeValues[record.AttemptID]; duplicate {
			return nil, nil, conflict("evaluation controlled runtime receipt identity is duplicated")
		}
		record.NamespaceID, record.PlanDigest, record.RepositoryCommit = namespaceID, partition.PlanDigest, partition.RepositoryCommit
		record.ReceiptBytes = append([]byte(nil), source...)
		runtimeValues[record.AttemptID] = decoded
		runtimes = append(runtimes, record)
	}
	if err := runtimeRows.Err(); err != nil {
		return nil, nil, err
	}
	if len(submissions) != len(runtimes) {
		return nil, nil, conflict("evaluation result submission and controlled runtime receipt sets differ")
	}
	for attemptID, submission := range submissionValues {
		attempt, attemptExists := attemptByID[attemptID]
		turn, turnExists := terminalTurnByAttempt[attemptID]
		execution, executionExists := executionByAttempt[attemptID]
		runtime, runtimeExists := runtimeValues[attemptID]
		if !attemptExists || !turnExists || !executionExists || !runtimeExists || attempt.Status != "completed" {
			return nil, nil, conflict("evaluation runtime evidence contains an orphan or noncompleted attempt")
		}
		if err := validateEvaluationRuntimeEvidenceBindingFromTurn(planFact, attempt, turn, execution, submission, runtime); err != nil {
			return nil, nil, err
		}
	}
	if requireComplete {
		for attemptID, attempt := range attemptByID {
			_, hasSubmission := submissionValues[attemptID]
			_, hasRuntime := runtimeValues[attemptID]
			if (attempt.Status == "completed") != hasSubmission || hasSubmission != hasRuntime {
				return nil, nil, conflict("evaluation runtime evidence does not exactly cover completed attempts")
			}
		}
	}
	sort.Slice(submissions, func(left, right int) bool { return submissions[left].AttemptID < submissions[right].AttemptID })
	sort.Slice(runtimes, func(left, right int) bool { return runtimes[left].AttemptID < runtimes[right].AttemptID })
	return submissions, runtimes, nil
}

func (repository *Repository) ListEvaluationRuntimeEvidence(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationResultSubmissionReceiptRecord, []EvaluationControlledRuntimeReceiptRecord, error) {
	readContext, cancel, tx, plan, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	attempts, err := queryEvaluationAttempts(readContext, tx, authority.NamespaceID, partition, plan, "")
	if err != nil {
		return nil, nil, err
	}
	turns, err := queryEvaluationInvocationTurnReceipts(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, nil, err
	}
	executions, err := queryEvaluationExecutionReceipts(readContext, tx, authority.NamespaceID, partition, plan, attempts, "")
	if err != nil {
		return nil, nil, err
	}
	submissions, runtimes, err := queryEvaluationRuntimeEvidence(readContext, tx, authority.NamespaceID,
		partition, plan, attempts, turns, executions, true)
	if err != nil {
		return nil, nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, nil, err
	}
	return submissions, runtimes, nil
}
