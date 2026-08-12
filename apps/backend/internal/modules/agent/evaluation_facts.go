package agent

import (
	"bytes"
	"encoding/json"
	"fmt"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationPlanFact struct {
	PlanID              string
	PlanDigest          string
	RepositoryCommit    string
	PlannedJourneyCount int64
	PlannedAt           time.Time
	ExpiresAt           time.Time
	Value               map[string]any
	Canonical           []byte
}

type evaluationAttemptFact struct {
	PlanDigest                               string
	AttemptID                                string
	DescriptorDigest                         string
	SamplingIdentityDigest                   string
	IndependentRunID                         string
	DispatchIntentSetDigest                  string
	TransportReceiptSetDigest                string
	InvocationTurnReceiptSetDigest           string
	InvocationTurnSetReceiptDigest           string
	CapabilityExecutionReceiptSetDigest      string
	VerificationAttemptGrantReceiptSetDigest string
	ResponseDigest                           string
	ShardID                                  string
	CaseID                                   string
	TargetID                                 string
	Status                                   string
	Outcome                                  string
	AttemptDigest                            string
	StartedAt                                time.Time
	CompletedAt                              time.Time
	Usage                                    any
	Cost                                     any
	Value                                    map[string]any
	Canonical                                []byte
}

type evaluationCheckpointFact struct {
	PlanDigest       string
	ShardID          string
	Revision         int64
	LeaseOwnerID     string
	LeaseGeneration  int64
	State            string
	CheckpointDigest string
	UpdatedAt        time.Time
	Value            map[string]any
	Canonical        []byte
}

type evaluationArtifactFact struct {
	FactType                  string
	PlanDigest                string
	RepositoryCommit          string
	FactID                    string
	FactDigest                string
	CandidateID               string
	DescriptorDigest          string
	ResponseDigest            string
	ExecutionReceiptDigest    string
	GraderArtifactDigest      string
	ProjectionAuthorityDigest string
	MediaType                 string
	Width                     int64
	Height                    int64
	BytesDigest               string
	ByteLength                int64
	PublicArtifactScanDigest  string
	Outcome                   string
	RecordedAt                time.Time
	Value                     map[string]any
	Canonical                 []byte
}

func evaluationResolvedCapabilityDescriptor(
	evaluationCase map[string]any,
	target map[string]any,
) (map[string]any, error) {
	caseDescriptor, caseOK := objectMember(evaluationCase, "capabilityDescriptor")
	authority, hasAuthority := objectMember(target, "optionalCapabilitySupportAuthority")
	if !caseOK || stringMember(caseDescriptor, "descriptorDigest") != stringMember(evaluationCase, "capabilityDescriptorDigest") {
		return nil, conflict("evaluation case capability descriptor is missing")
	}
	if !hasAuthority {
		return caseDescriptor, nil
	}
	resolved, resolvedOK := objectMember(authority, "resolvedCapabilityDescriptor")
	if !resolvedOK || stringMember(authority, "qualificationCapabilityProfileId") != stringMember(evaluationCase, "capabilityProfileId") ||
		stringMember(authority, "capabilityId") != stringMember(caseDescriptor, "capabilityId") {
		return nil, conflict("evaluation optional capability authority drifted from its case")
	}
	return resolved, nil
}

func evaluationResolvedCapabilityDescriptorDigest(
	evaluationCase map[string]any,
	target map[string]any,
) (string, error) {
	descriptor, err := evaluationResolvedCapabilityDescriptor(evaluationCase, target)
	if err != nil {
		return "", err
	}
	digest := stringMember(descriptor, "descriptorDigest")
	if !evaluationDigestPattern.MatchString(digest) {
		return "", conflict("evaluation resolved capability descriptor digest is invalid")
	}
	return digest, nil
}

func decodeEvaluationFact(source []byte, expectedType string) (decodedFact, error) {
	if err := agentcontract.ValidateEvaluationFact(json.RawMessage(source)); err != nil {
		return decodedFact{}, fmt.Errorf("%w: %v", ErrInvalid, err)
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		return decodedFact{}, fmt.Errorf("%w: decode evaluation fact: %v", ErrInvalid, err)
	}
	factType, _ := envelope["factType"].(string)
	if factType != expectedType {
		return decodedFact{}, fmt.Errorf("%w: expected %s, got %s", ErrInvalid, expectedType, factType)
	}
	value, ok := envelope["value"].(map[string]any)
	if !ok {
		return decodedFact{}, fmt.Errorf("%w: evaluation fact value is not an object", ErrInvalid)
	}
	canonical, err := canonicaljson.Bytes(envelope)
	if err != nil {
		return decodedFact{}, fmt.Errorf("%w: canonicalize evaluation fact: %v", ErrInvalid, err)
	}
	return decodedFact{FactType: factType, Value: value, Canonical: canonical}, nil
}

func decodeEvaluationPlan(source []byte) (evaluationPlanFact, error) {
	fact, err := decodeEvaluationFact(source, "evaluation-plan")
	if err != nil {
		return evaluationPlanFact{}, err
	}
	journeys, ok := integerMember(fact.Value, "plannedJourneyCount")
	if !ok {
		return evaluationPlanFact{}, ErrInvalid
	}
	plannedAt, err := instantMember(fact.Value, "plannedAt")
	if err != nil {
		return evaluationPlanFact{}, err
	}
	expiresAt, err := instantMember(fact.Value, "expiresAt")
	if err != nil {
		return evaluationPlanFact{}, err
	}
	return evaluationPlanFact{
		PlanID: stringMember(fact.Value, "evaluationPlanId"), PlanDigest: stringMember(fact.Value, "planDigest"),
		RepositoryCommit: stringMember(fact.Value, "repositoryCommit"), PlannedJourneyCount: journeys,
		PlannedAt: plannedAt, ExpiresAt: expiresAt, Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}

func decodeEvaluationAttempt(source []byte) (evaluationAttemptFact, error) {
	fact, err := decodeEvaluationFact(source, "evaluation-attempt")
	if err != nil {
		return evaluationAttemptFact{}, err
	}
	descriptor, ok := objectMember(fact.Value, "descriptor")
	if !ok {
		return evaluationAttemptFact{}, ErrInvalid
	}
	startedAt, err := instantMember(fact.Value, "startedAt")
	if err != nil {
		return evaluationAttemptFact{}, err
	}
	completedAt, err := instantMember(fact.Value, "completedAt")
	if err != nil {
		return evaluationAttemptFact{}, err
	}
	return evaluationAttemptFact{
		PlanDigest: stringMember(descriptor, "planDigest"), AttemptID: stringMember(descriptor, "attemptId"),
		DescriptorDigest: stringMember(descriptor, "descriptorDigest"), SamplingIdentityDigest: stringMember(descriptor, "samplingIdentityDigest"),
		IndependentRunID: stringMember(fact.Value, "independentRunId"), ShardID: stringMember(descriptor, "shardId"),
		DispatchIntentSetDigest:                  stringMember(fact.Value, "dispatchIntentSetDigest"),
		TransportReceiptSetDigest:                stringMember(fact.Value, "transportReceiptSetDigest"),
		InvocationTurnReceiptSetDigest:           stringMember(fact.Value, "invocationTurnReceiptSetDigest"),
		InvocationTurnSetReceiptDigest:           stringMember(fact.Value, "invocationTurnSetReceiptDigest"),
		CapabilityExecutionReceiptSetDigest:      stringMember(fact.Value, "capabilityExecutionReceiptSetDigest"),
		VerificationAttemptGrantReceiptSetDigest: stringMember(fact.Value, "verificationAttemptGrantReceiptSetDigest"),
		ResponseDigest:                           stringMember(fact.Value, "responseDigest"),
		CaseID:                                   stringMember(descriptor, "caseId"), TargetID: stringMember(descriptor, "targetId"),
		Status: stringMember(fact.Value, "status"), Outcome: stringMember(fact.Value, "outcome"),
		AttemptDigest: stringMember(fact.Value, "attemptDigest"), StartedAt: startedAt, CompletedAt: completedAt,
		Usage: fact.Value["usage"], Cost: fact.Value["cost"],
		Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}

func validateEvaluationAttemptPlanBinding(planSource []byte, attempt evaluationAttemptFact) error {
	decoder := json.NewDecoder(bytes.NewReader(planSource))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		return fmt.Errorf("%w: decode evaluation plan binding: %v", ErrInvalid, err)
	}
	plan, ok := envelope["value"].(map[string]any)
	if !ok || stringMember(plan, "planDigest") != attempt.PlanDigest {
		return invalid("evaluation attempt plan binding is invalid")
	}
	descriptor, ok := objectMember(attempt.Value, "descriptor")
	if !ok {
		return invalid("evaluation attempt descriptor is missing")
	}
	var evaluationCase map[string]any
	for _, raw := range plan["concreteCases"].([]any) {
		candidate := raw.(map[string]any)
		if stringMember(candidate, "caseId") == attempt.CaseID {
			evaluationCase = candidate
			break
		}
	}
	var target map[string]any
	for _, raw := range plan["capabilityQualificationTargets"].([]any) {
		candidate := raw.(map[string]any)
		if stringMember(candidate, "targetId") == attempt.TargetID {
			target = candidate
			break
		}
	}
	resolvedCapabilityDescriptorDigest, resolveErr := evaluationResolvedCapabilityDescriptorDigest(evaluationCase, target)
	if evaluationCase == nil || target == nil || resolveErr != nil ||
		stringMember(evaluationCase, "capabilityProfileId") != stringMember(target, "capabilityProfileId") ||
		resolvedCapabilityDescriptorDigest != stringMember(descriptor, "capabilityDescriptorDigest") ||
		stringMember(evaluationCase, "riskClass") != stringMember(descriptor, "riskClass") ||
		stringMember(target, "targetDigest") != stringMember(descriptor, "targetDigest") {
		return conflict("evaluation attempt is outside the frozen case/target slice")
	}
	contextTier, hasContextTier := descriptor["contextTier"].(string)
	mediaTier, hasMediaTier := descriptor["mediaRepresentationTier"].(string)
	contextSentinel, _ := evaluationCase["contextSentinel"].(bool)
	mediaSentinel, _ := evaluationCase["mediaSentinel"].(bool)
	validVariant := false
	switch {
	case !contextSentinel && !mediaSentinel:
		validVariant = !hasContextTier && !hasMediaTier
	case contextSentinel && !mediaSentinel:
		validVariant = !hasMediaTier && hasContextTier &&
			(contextTier == "small" || contextTier == "representative" || contextTier == "near-limit")
	case !contextSentinel && mediaSentinel:
		validVariant = !hasContextTier && hasMediaTier &&
			(mediaTier == "source-faithful" || mediaTier == "representative-transform" || mediaTier == "near-limit-transform")
	case contextSentinel && mediaSentinel:
		validVariant = hasContextTier && hasMediaTier &&
			((contextTier == "representative" && (mediaTier == "source-faithful" || mediaTier == "representative-transform" || mediaTier == "near-limit-transform")) ||
				(mediaTier == "representative-transform" && (contextTier == "small" || contextTier == "near-limit")))
	}
	if !validVariant {
		return conflict("evaluation attempt tier variant is outside the frozen schedule")
	}
	repetition, ok := integerMember(descriptor, "repetitionIndex")
	if !ok {
		return invalid("evaluation attempt repetition index is invalid")
	}
	minimum := int64(-1)
	policy, _ := plan["repetitionPolicy"].(map[string]any)
	for _, raw := range policy["rules"].([]any) {
		rule := raw.(map[string]any)
		if stringMember(rule, "riskClass") == stringMember(descriptor, "riskClass") {
			minimum, _ = integerMember(rule, "minimumIndependentAttempts")
			break
		}
	}
	if minimum < 1 || repetition >= minimum {
		return conflict("evaluation attempt repetition index exceeds the frozen schedule")
	}
	return nil
}

func decodeEvaluationCheckpoint(source []byte) (evaluationCheckpointFact, error) {
	fact, err := decodeEvaluationFact(source, "evaluation-checkpoint")
	if err != nil {
		return evaluationCheckpointFact{}, err
	}
	revision, revisionOK := integerMember(fact.Value, "revision")
	generation, generationOK := integerMember(fact.Value, "leaseGeneration")
	if !revisionOK || !generationOK {
		return evaluationCheckpointFact{}, ErrInvalid
	}
	updatedAt, err := instantMember(fact.Value, "updatedAt")
	if err != nil {
		return evaluationCheckpointFact{}, err
	}
	return evaluationCheckpointFact{
		PlanDigest: stringMember(fact.Value, "planDigest"), ShardID: stringMember(fact.Value, "shardId"),
		Revision: revision, LeaseOwnerID: stringMember(fact.Value, "leaseOwnerId"), LeaseGeneration: generation,
		State: stringMember(fact.Value, "state"), CheckpointDigest: stringMember(fact.Value, "checkpointDigest"),
		UpdatedAt: updatedAt, Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}

func decodeEvaluationArtifact(source []byte, expectedType string) (evaluationArtifactFact, error) {
	fact, err := decodeEvaluationFact(source, expectedType)
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	identityField, digestField, timeField := "reportId", "reportDigest", "generatedAt"
	switch expectedType {
	case "evaluation-holdout-receipt":
		identityField, digestField, timeField = "receiptId", "receiptDigest", "executedAt"
	case "evaluation-review-candidate":
		identityField, digestField, timeField = "attemptId", "candidateDigest", "generatedAt"
	case "evaluation-manifest":
		identityField, digestField, timeField = "manifestId", "manifestDigest", "completedAt"
	case "evaluation-metric-report", "evaluation-grader-report", "evaluation-human-review-report":
	default:
		return evaluationArtifactFact{}, ErrInvalid
	}
	recordedAt, err := instantMember(fact.Value, timeField)
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	var width, height, byteLength int64
	if expectedType == "evaluation-review-candidate" {
		var widthOK, heightOK, byteLengthOK bool
		width, widthOK = integerMember(fact.Value, "width")
		height, heightOK = integerMember(fact.Value, "height")
		byteLength, byteLengthOK = integerMember(fact.Value, "byteLength")
		if !widthOK || !heightOK || !byteLengthOK {
			return evaluationArtifactFact{}, ErrInvalid
		}
	}
	return evaluationArtifactFact{
		FactType: expectedType, PlanDigest: stringMember(fact.Value, "planDigest"),
		RepositoryCommit: stringMember(fact.Value, "repositoryCommit"),
		FactID:           stringMember(fact.Value, identityField), FactDigest: stringMember(fact.Value, digestField),
		CandidateID:               stringMember(fact.Value, "candidateId"),
		DescriptorDigest:          stringMember(fact.Value, "descriptorDigest"),
		ResponseDigest:            stringMember(fact.Value, "responseDigest"),
		ExecutionReceiptDigest:    stringMember(fact.Value, "executionReceiptDigest"),
		GraderArtifactDigest:      stringMember(fact.Value, "graderArtifactDigest"),
		ProjectionAuthorityDigest: stringMember(fact.Value, "projectionAuthorityDigest"),
		MediaType:                 stringMember(fact.Value, "mediaType"), Width: width, Height: height,
		BytesDigest: stringMember(fact.Value, "bytesDigest"), ByteLength: byteLength,
		PublicArtifactScanDigest: stringMember(fact.Value, "publicArtifactScanDigest"),
		Outcome:                  stringMember(fact.Value, "outcome"), RecordedAt: recordedAt,
		Value: fact.Value, Canonical: fact.Canonical,
	}, nil
}
