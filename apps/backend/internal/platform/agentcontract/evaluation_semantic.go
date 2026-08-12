package agentcontract

import (
	"errors"
	"fmt"
	"regexp"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	maximumAgentEvaluationReviewRasterBytes     = 2_097_152
	maximumAgentEvaluationReviewRasterDimension = int64(4_096)
	maximumAgentEvaluationReviewRasterPixels    = int64(16_777_216)
)

var evaluationCommitPattern = regexp.MustCompile(`^[a-f0-9]{40}$`)

func validateAgentEvaluationSemantics(document map[string]any) error {
	if err := rejectUnsafeKeys(document, "/"); err != nil {
		return err
	}
	if err := requireExactObjectKeys(document, []string{"wireVersion", "factType", "value"}, nil); err != nil {
		return fmt.Errorf("Agent evaluation envelope: %w", err)
	}
	value, ok := document["value"].(map[string]any)
	if !ok {
		return errors.New("Agent evaluation fact value must be an object")
	}
	switch stringValue(document["factType"]) {
	case "evaluation-plan":
		return validateAgentEvaluationPlan(value)
	case "evaluation-attempt":
		return validateAgentEvaluationAttempt(value)
	case "evaluation-checkpoint":
		return validateAgentEvaluationCheckpoint(value)
	case "evaluation-metric-report":
		return validateAgentEvaluationMetricReport(value)
	case "evaluation-grader-report":
		return validateAgentEvaluationGraderReport(value)
	case "evaluation-human-review-report":
		return validateAgentEvaluationHumanReport(value)
	case "evaluation-holdout-receipt":
		return validateAgentEvaluationHoldoutReceipt(value)
	case "evaluation-review-candidate":
		return validateAgentEvaluationReviewCandidate(value)
	case "evaluation-review-raster-scan-receipt":
		return validateAgentEvaluationReviewRasterScanReceipt(value)
	case "evaluation-manifest":
		return validateAgentEvaluationManifest(value)
	default:
		return fmt.Errorf("unsupported Agent evaluation fact type %q", document["factType"])
	}
}

func validateAgentEvaluationReviewRasterScanReceipt(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"format", "version", "scanReceiptId", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "projectionAuthorityDigest", "mediaType", "width", "height", "byteLength",
		"policyDigest", "bytesDigest", "decodedPixelDigest", "metadataProfileDigest", "canarySetDigest",
		"fingerprintSetDigest", "findingDigests", "verdict", "scannedAt", "receiptDigest",
	}, nil); err != nil {
		return err
	}
	if stringValue(value["format"]) != "prodivix.agent-evaluation-review-raster-scan-receipt" ||
		value["version"] != float64(1) {
		return errors.New("evaluation review raster scan receipt format/version is invalid")
	}
	for _, field := range []string{"scanReceiptId", "attemptId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if !evaluationCommitPattern.MatchString(stringValue(value["repositoryCommit"])) {
		return errors.New("evaluation review raster scan receipt commit is invalid")
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "projectionAuthorityDigest", "policyDigest", "bytesDigest",
		"decodedPixelDigest", "metadataProfileDigest", "canarySetDigest", "fingerprintSetDigest",
	} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	width, widthOK := safeInteger(value["width"])
	height, heightOK := safeInteger(value["height"])
	byteLength, byteLengthOK := safeInteger(value["byteLength"])
	if !widthOK || !heightOK || !byteLengthOK || width < 1 || height < 1 ||
		width > maximumAgentEvaluationReviewRasterDimension ||
		height > maximumAgentEvaluationReviewRasterDimension ||
		width*height > maximumAgentEvaluationReviewRasterPixels ||
		byteLength < 1 || byteLength > maximumAgentEvaluationReviewRasterBytes ||
		!oneOf(stringValue(value["mediaType"]), "image/png", "image/webp") {
		return errors.New("evaluation review raster scan receipt media bounds are invalid")
	}
	findings, ok := value["findingDigests"].([]any)
	if !ok || len(findings) > 4_096 || requireCanonicalStrings(findings) != nil {
		return errors.New("evaluation review raster scan receipt findings are non-canonical")
	}
	for index, finding := range findings {
		if err := requireDigest(finding, fmt.Sprintf("/value/findingDigests/%d", index)); err != nil {
			return err
		}
	}
	verdict := stringValue(value["verdict"])
	if (verdict == "safe") != (len(findings) == 0) || !oneOf(verdict, "safe", "blocked") {
		return errors.New("evaluation review raster scan receipt verdict drifted from findings")
	}
	if err := requireInstant(value["scannedAt"], "/value/scannedAt"); err != nil {
		return err
	}
	return requireDigestMatch(value, "receiptDigest", "/value/receiptDigest")
}

func validateAgentEvaluationReviewCandidate(value map[string]any) error {
	required := []string{
		"format", "version", "candidateId", "attemptId", "planDigest", "repositoryCommit",
		"descriptorDigest", "responseDigest", "executionReceiptDigest", "graderArtifactDigest",
		"projectionAuthorityDigest", "mediaType", "width", "height", "bytesBase64", "bytesDigest",
		"byteLength", "publicArtifactScanDigest", "generatedAt", "candidateDigest",
	}
	if err := requireExactObjectKeys(value, required, nil); err != nil {
		return err
	}
	if stringValue(value["format"]) != "prodivix.agent-evaluation-review-candidate" ||
		value["version"] != float64(2) {
		return errors.New("evaluation review candidate format/version is invalid")
	}
	for _, field := range []string{"candidateId", "attemptId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if !evaluationCommitPattern.MatchString(stringValue(value["repositoryCommit"])) {
		return errors.New("evaluation review candidate commit is invalid")
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "responseDigest", "executionReceiptDigest", "graderArtifactDigest",
		"projectionAuthorityDigest", "bytesDigest", "publicArtifactScanDigest",
	} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	width, widthOK := safeInteger(value["width"])
	height, heightOK := safeInteger(value["height"])
	if !widthOK || !heightOK || width < 1 || height < 1 ||
		width > maximumAgentEvaluationReviewRasterDimension ||
		height > maximumAgentEvaluationReviewRasterDimension ||
		width*height > maximumAgentEvaluationReviewRasterPixels {
		return errors.New("evaluation review candidate dimensions are invalid")
	}
	inspection, err := InspectEvaluationReviewRaster(stringValue(value["bytesBase64"]), stringValue(value["mediaType"]))
	if err != nil || inspection.Width != width || inspection.Height != height {
		return errors.New("evaluation review candidate raster or dimensions are invalid")
	}
	byteLength, ok := safeInteger(value["byteLength"])
	if !ok || byteLength != inspection.ByteLength {
		return errors.New("/value/byteLength drifted from decoded raster bytes")
	}
	if inspection.BytesDigest != stringValue(value["bytesDigest"]) {
		return errors.New("/value/bytesDigest drifted from decoded raster bytes")
	}
	if err := requireInstant(value["generatedAt"], "/value/generatedAt"); err != nil {
		return err
	}
	return requireDigestMatch(value, "candidateDigest", "/value/candidateDigest")
}

func validateAgentEvaluationPlan(value map[string]any) error {
	required := []string{
		"evaluationPlanId", "repositoryCommit", "policyDigest", "contextBuilderDigest",
		"semanticProviderSetDigest", "promptPolicyDigest", "outputSchemaDigest", "toolRegistryDigest",
		"actionRegistryDigest", "providerConfigurations", "modelConfigurations",
		"capabilityQualificationTargets", "endpointSmokeTargets", "publicCorpusDigest",
		"protectedHoldoutManifestDigest", "rotatingCorpusPolicyDigest", "concreteCases",
		"contextTiers", "mediaRepresentationTiers", "contextSentinelCaseIds", "mediaSentinelCaseIds",
		"repetitionPolicy", "graderPlan", "thresholds", "budget", "plannedJourneyCount",
		"plannedAttemptSetDigest", "plannedAt", "expiresAt", "planDigest",
	}
	if err := requireExactObjectKeys(value, required, nil); err != nil {
		return err
	}
	if err := requireIdentity(value["evaluationPlanId"], "/value/evaluationPlanId"); err != nil {
		return err
	}
	if !evaluationCommitPattern.MatchString(stringValue(value["repositoryCommit"])) {
		return errors.New("/value/repositoryCommit must be an exact lowercase commit SHA")
	}
	for _, field := range []string{
		"policyDigest", "contextBuilderDigest", "semanticProviderSetDigest", "promptPolicyDigest",
		"outputSchemaDigest", "toolRegistryDigest", "actionRegistryDigest", "publicCorpusDigest",
		"protectedHoldoutManifestDigest", "rotatingCorpusPolicyDigest", "plannedAttemptSetDigest",
	} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	planned, ok := safeInteger(value["plannedJourneyCount"])
	if !ok || planned != currentAgentEvaluationPlannedAttempts {
		return errors.New("/value/plannedJourneyCount must equal the current 14,040-attempt denominator")
	}
	plannedAt, plannedErr := parseInstant(value["plannedAt"])
	expiresAt, expiresErr := parseInstant(value["expiresAt"])
	if plannedErr != nil || expiresErr != nil || !expiresAt.After(plannedAt) {
		return errors.New("/value plannedAt/expiresAt window is invalid")
	}
	caseValues, ok := value["concreteCases"].([]any)
	if !ok || len(caseValues) != 128 {
		return errors.New("/value/concreteCases must contain exactly 128 cases")
	}
	bucketCounts := map[string]int{}
	bucketHoldouts := map[string]int{}
	families := map[string]struct{}{}
	caseIDs := make([]any, 0, len(caseValues))
	for index, raw := range caseValues {
		entry, ok := raw.(map[string]any)
		if !ok || requireExactObjectKeys(entry, []string{
			"caseId", "familyId", "primaryBucket", "riskClass", "access", "capabilityProfileId",
			"capabilityDescriptor", "capabilityDescriptorDigest",
			"executionRequirement", "fixtureRef", "caseDefinitionDigest", "expectedAuthorityDigest", "gradingPolicyDigest",
			"contextSentinel", "mediaSentinel", "subjectiveVisualQuality", "tags", "caseDigest",
		}, nil) != nil {
			return fmt.Errorf("/value/concreteCases/%d is invalid", index)
		}
		for _, field := range []string{"caseId", "familyId", "capabilityProfileId", "fixtureRef"} {
			if err := requireIdentity(entry[field], fmt.Sprintf("/value/concreteCases/%d/%s", index, field)); err != nil {
				return err
			}
		}
		for _, field := range []string{"caseDefinitionDigest", "expectedAuthorityDigest", "gradingPolicyDigest", "capabilityDescriptorDigest"} {
			if err := requireDigest(entry[field], fmt.Sprintf("/value/concreteCases/%d/%s", index, field)); err != nil {
				return err
			}
		}
		capability, capabilityOK := entry["capabilityDescriptor"].(map[string]any)
		capabilityDigest, capabilityDigestErr := canonicaljson.Digest(map[string]any{
			"capabilityId": capability["capabilityId"], "support": capability["supportExpectation"],
			"toolIds": capability["expectedToolIds"], "expectedReceiptKinds": capability["expectedReceiptKinds"],
		})
		if !capabilityOK || requireExactObjectKeys(capability, []string{
			"capabilityId", "supportExpectation", "expectedToolIds", "expectedReceiptKinds", "descriptorDigest",
		}, nil) != nil || requireIdentity(capability["capabilityId"], fmt.Sprintf("/value/concreteCases/%d/capabilityDescriptor/capabilityId", index)) != nil ||
			!oneOf(stringValue(capability["supportExpectation"]), "required", "expected-blocked") ||
			requireCanonicalStrings(capability["expectedToolIds"]) != nil ||
			requireCanonicalStrings(capability["expectedReceiptKinds"]) != nil ||
			capabilityDigestErr != nil || capabilityDigest != stringValue(capability["descriptorDigest"]) ||
			stringValue(capability["descriptorDigest"]) != stringValue(entry["capabilityDescriptorDigest"]) {
			return fmt.Errorf("/value/concreteCases/%d capability descriptor is invalid", index)
		}
		executionRequirement, requirementOK := entry["executionRequirement"].(map[string]any)
		if !requirementOK || requireExactObjectKeys(executionRequirement, []string{
			"minimumToolCalls", "minimumRepairRounds", "minimumTransactions", "verificationClosureRequired", "requirementDigest",
		}, nil) != nil {
			return fmt.Errorf("/value/concreteCases/%d execution requirement is invalid", index)
		}
		for _, field := range []string{"minimumToolCalls", "minimumRepairRounds", "minimumTransactions"} {
			if _, ok := safeInteger(executionRequirement[field]); !ok {
				return fmt.Errorf("/value/concreteCases/%d/executionRequirement/%s is invalid", index, field)
			}
		}
		if _, ok := executionRequirement["verificationClosureRequired"].(bool); !ok ||
			requireDigestMatch(executionRequirement, "requirementDigest", fmt.Sprintf("/value/concreteCases/%d/executionRequirement/requirementDigest", index)) != nil {
			return fmt.Errorf("/value/concreteCases/%d execution requirement drifted", index)
		}
		bucket := stringValue(entry["primaryBucket"])
		if !oneOf(bucket, "positive-cross-domain", "adversarial-security", "recovery-repair-reconciliation", "capability-differential") ||
			!oneOf(stringValue(entry["riskClass"]), "ordinary", "critical", "high-assurance") ||
			!oneOf(stringValue(entry["access"]), "public", "protected-holdout", "rotating-counterexample") {
			return fmt.Errorf("/value/concreteCases/%d classification is invalid", index)
		}
		if _, ok := entry["contextSentinel"].(bool); !ok {
			return fmt.Errorf("/value/concreteCases/%d/contextSentinel is invalid", index)
		}
		if _, ok := entry["mediaSentinel"].(bool); !ok {
			return fmt.Errorf("/value/concreteCases/%d/mediaSentinel is invalid", index)
		}
		if _, ok := entry["subjectiveVisualQuality"].(bool); !ok {
			return fmt.Errorf("/value/concreteCases/%d/subjectiveVisualQuality is invalid", index)
		}
		if err := requireCanonicalStrings(entry["tags"]); err != nil {
			return fmt.Errorf("/value/concreteCases/%d/tags: %w", index, err)
		}
		if err := requireDigestMatch(entry, "caseDigest", fmt.Sprintf("/value/concreteCases/%d/caseDigest", index)); err != nil {
			return err
		}
		bucketCounts[bucket]++
		if stringValue(entry["access"]) == "protected-holdout" {
			bucketHoldouts[bucket]++
		}
		families[stringValue(entry["familyId"])] = struct{}{}
		caseIDs = append(caseIDs, entry["caseId"])
	}
	if err := requireCanonicalStrings(caseIDs); err != nil {
		return fmt.Errorf("/value/concreteCases identities: %w", err)
	}
	expectedBuckets := map[string]int{
		"positive-cross-domain": 32, "adversarial-security": 48,
		"recovery-repair-reconciliation": 16, "capability-differential": 32,
	}
	if len(families) != 52 {
		return errors.New("/value/concreteCases must cover exactly 52 families")
	}
	for bucket, count := range expectedBuckets {
		if bucketCounts[bucket] != count || bucketHoldouts[bucket]*4 < count {
			return fmt.Errorf("/value/concreteCases bucket %s count or holdout floor drifted", bucket)
		}
	}
	for field, count := range map[string]int{"contextSentinelCaseIds": 24, "mediaSentinelCaseIds": 16} {
		values, ok := value[field].([]any)
		if !ok || len(values) != count || requireCanonicalStrings(values) != nil {
			return fmt.Errorf("/value/%s must contain %d canonical ids", field, count)
		}
	}
	if err := validateEvaluationNativeTargets(value["capabilityQualificationTargets"]); err != nil {
		return err
	}
	if err := validateEvaluationEndpointSmokes(value["endpointSmokeTargets"]); err != nil {
		return err
	}
	if err := validateAgentEvaluationPlanDeep(value, plannedAt, expiresAt); err != nil {
		return err
	}
	return requireDigestMatch(value, "planDigest", "/value/planDigest")
}

func validateEvaluationNativeTargets(raw any) error {
	values, ok := raw.([]any)
	if !ok || len(values) != 3*len(currentAgentEvaluationCapabilityProfiles) {
		return errors.New("/value/capabilityQualificationTargets requires the exact 3 x 9 native matrix")
	}
	families, operators, owners := map[string]struct{}{}, map[string]struct{}{}, map[string]struct{}{}
	profilesByFamily := map[string]map[string]struct{}{}
	previous := ""
	for index, rawTarget := range values {
		target, ok := rawTarget.(map[string]any)
		if !ok || requireExactObjectKeys(target, []string{
			"targetId", "providerConfigurationId", "providerIdentityDigest", "protocolFamily",
			"providerOperatorId", "modelId", "modelLineageDigest", "modelFamilyOwnerId",
			"capabilityProfileId", "capabilityProfileDigest", "inferenceConfigurationDigest",
			"qualificationSliceDigest", "targetDigest",
		}, []string{"optionalCapabilitySupportAuthority"}) != nil {
			return fmt.Errorf("/value/capabilityQualificationTargets/%d is invalid", index)
		}
		id := stringValue(target["targetId"])
		if requireIdentity(id, fmt.Sprintf("/value/capabilityQualificationTargets/%d/targetId", index)) != nil || (index > 0 && id <= previous) {
			return errors.New("/value/capabilityQualificationTargets is non-canonical")
		}
		family := stringValue(target["protocolFamily"])
		if oneOf(family, "openai-responses", "anthropic-messages", "gemini-interactions") {
			families[family] = struct{}{}
			operators[stringValue(target["providerOperatorId"])] = struct{}{}
			owners[stringValue(target["modelFamilyOwnerId"])] = struct{}{}
			if profilesByFamily[family] == nil {
				profilesByFamily[family] = map[string]struct{}{}
			}
			profilesByFamily[family][stringValue(target["capabilityProfileId"])] = struct{}{}
		}
		for _, field := range []string{"providerIdentityDigest", "modelLineageDigest", "capabilityProfileDigest", "inferenceConfigurationDigest", "qualificationSliceDigest"} {
			if err := requireDigest(target[field], fmt.Sprintf("/value/capabilityQualificationTargets/%d/%s", index, field)); err != nil {
				return err
			}
		}
		if err := requireDigestMatch(target, "targetDigest", fmt.Sprintf("/value/capabilityQualificationTargets/%d/targetDigest", index)); err != nil {
			return err
		}
		previous = id
	}
	if len(families) != 3 || len(operators) < 3 || len(owners) < 3 {
		return errors.New("native protocol/operator/model-family diversity is insufficient")
	}
	for family := range families {
		for _, profile := range currentAgentEvaluationCapabilityProfiles {
			if _, ok := profilesByFamily[family][profile]; !ok {
				return fmt.Errorf("native family %s misses profile %s", family, profile)
			}
		}
	}
	return nil
}

func validateEvaluationEndpointSmokes(raw any) error {
	values, ok := raw.([]any)
	if !ok || len(values) != 5 {
		return errors.New("/value/endpointSmokeTargets requires the exact five-target denominator")
	}
	hosted, local := false, false
	protocolCounts := map[string]int{}
	previous := ""
	for index, rawValue := range values {
		entry, ok := rawValue.(map[string]any)
		if !ok {
			return fmt.Errorf("/value/endpointSmokeTargets/%d is not an object", index)
		}
		if err := requireExactObjectKeys(entry, []string{
			"smokeTargetId", "endpointClass", "protocolFamily", "providerConfigurationId",
			"modelId", "immutableModelVersion", "modelLineageDigest", "inferenceConfigurationDigest",
			"adapterDigest", "pricingAuthorityDigest", "responseSpoolEncryptionPolicyDigest",
			"smokeProfileDigest", "targetDigest",
		}, nil); err != nil {
			return fmt.Errorf("/value/endpointSmokeTargets/%d: %w", index, err)
		}
		protocol := stringValue(entry["protocolFamily"])
		if !oneOf(protocol, "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") {
			return fmt.Errorf("/value/endpointSmokeTargets/%d protocol is invalid", index)
		}
		protocolCounts[protocol]++
		for _, field := range []string{"smokeTargetId", "providerConfigurationId", "modelId"} {
			if err := requireIdentity(entry[field], fmt.Sprintf("/value/endpointSmokeTargets/%d/%s", index, field)); err != nil {
				return err
			}
		}
		if stringValue(entry["immutableModelVersion"]) == "" ||
			(index > 0 && stringValue(entry["smokeTargetId"]) <= previous) {
			return fmt.Errorf("/value/endpointSmokeTargets/%d model version or order is invalid", index)
		}
		if protocol == "openai-compatible" {
			hosted = hosted || oneOf(stringValue(entry["endpointClass"]), "first-party-hosted", "aggregator")
			local = local || oneOf(stringValue(entry["endpointClass"]), "local", "self-hosted")
		}
		for _, field := range []string{
			"modelLineageDigest", "inferenceConfigurationDigest", "adapterDigest",
			"pricingAuthorityDigest", "responseSpoolEncryptionPolicyDigest", "smokeProfileDigest",
		} {
			if err := requireDigest(entry[field], fmt.Sprintf("/value/endpointSmokeTargets/%d/%s", index, field)); err != nil {
				return err
			}
		}
		if err := requireDigestMatch(entry, "targetDigest", fmt.Sprintf("/value/endpointSmokeTargets/%d/targetDigest", index)); err != nil {
			return err
		}
		previous = stringValue(entry["smokeTargetId"])
	}
	if !hosted || !local || protocolCounts["openai-compatible"] != 2 ||
		protocolCounts["openai-responses"] != 1 || protocolCounts["anthropic-messages"] != 1 ||
		protocolCounts["gemini-interactions"] != 1 {
		return errors.New("endpoint smokes require three native targets plus hosted and local OpenAI-compatible targets")
	}
	return nil
}

func validateAgentEvaluationAttempt(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"descriptor", "independentRunId", "dispatchIntentSetDigest", "transportReceiptSetDigest",
		"invocationTurnReceiptSetDigest", "invocationTurnSetReceiptDigest", "capabilityExecutionReceiptSetDigest",
		"verificationAttemptGrantReceiptSetDigest", "status", "outcome", "metricObservations",
		"usage", "cost", "startedAt", "completedAt", "attemptDigest",
	}, []string{"responseDigest"}); err != nil {
		return err
	}
	descriptor, ok := value["descriptor"].(map[string]any)
	if !ok || requireExactObjectKeys(descriptor, []string{
		"attemptId", "planDigest", "shardId", "caseId", "targetId", "targetDigest",
		"capabilityDescriptorDigest", "riskClass", "repetitionIndex", "samplingIdentityDigest", "descriptorDigest",
	}, []string{"contextTier", "mediaRepresentationTier"}) != nil {
		return errors.New("/value/descriptor is invalid")
	}
	for _, field := range []string{"attemptId", "shardId", "caseId", "targetId"} {
		if err := requireIdentity(descriptor[field], "/value/descriptor/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"planDigest", "targetDigest", "capabilityDescriptorDigest", "samplingIdentityDigest"} {
		if err := requireDigest(descriptor[field], "/value/descriptor/"+field); err != nil {
			return err
		}
	}
	if stringValue(descriptor["attemptId"]) != "evaluation-attempt:"+strings.TrimPrefix(stringValue(descriptor["samplingIdentityDigest"]), "sha256-") {
		return errors.New("/value/descriptor/attemptId is not sampling-derived")
	}
	if err := requireDigestMatch(descriptor, "descriptorDigest", "/value/descriptor/descriptorDigest"); err != nil {
		return err
	}
	if err := requireIdentity(value["independentRunId"], "/value/independentRunId"); err != nil {
		return err
	}
	status, outcome := stringValue(value["status"]), stringValue(value["outcome"])
	if !oneOf(status, "completed", "provider-error", "timed-out", "rate-limited", "schema-failed", "blocked", "cancelled", "infrastructure-error") ||
		!oneOf(outcome, "passed", "failed", "inconclusive") || (status != "completed" && outcome != "inconclusive") {
		return errors.New("/value attempt status/outcome is invalid")
	}
	for _, field := range []string{"startedAt", "completedAt"} {
		if err := requireInstant(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"dispatchIntentSetDigest", "transportReceiptSetDigest", "invocationTurnReceiptSetDigest", "invocationTurnSetReceiptDigest", "capabilityExecutionReceiptSetDigest", "verificationAttemptGrantReceiptSetDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"responseDigest"} {
		if optionalValue, exists := value[field]; exists {
			if err := requireDigest(optionalValue, "/value/"+field); err != nil {
				return err
			}
		}
	}
	if err := validateAgentEvaluationAttemptDeep(value); err != nil {
		return err
	}
	return requireDigestMatch(value, "attemptDigest", "/value/attemptDigest")
}

func validateAgentEvaluationCheckpoint(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"planDigest", "shardId", "revision", "leaseOwnerId", "leaseGeneration", "state",
		"completedAttemptRefs", "missingAttemptRefs", "budgetLedger", "updatedAt", "checkpointDigest",
	}, nil); err != nil {
		return err
	}
	for _, field := range []string{"shardId", "leaseOwnerId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if requireDigest(value["planDigest"], "/value/planDigest") != nil || !oneOf(stringValue(value["state"]), "running", "completed", "incomplete") {
		return errors.New("evaluation checkpoint identity/state is invalid")
	}
	for _, field := range []string{"revision", "leaseGeneration"} {
		if _, ok := safeInteger(value[field]); !ok {
			return fmt.Errorf("/value/%s is invalid", field)
		}
	}
	if err := requireInstant(value["updatedAt"], "/value/updatedAt"); err != nil {
		return err
	}
	if err := validateAgentEvaluationCheckpointDeep(value); err != nil {
		return err
	}
	return requireDigestMatch(value, "checkpointDigest", "/value/checkpointDigest")
}

func validateAgentEvaluationMetricReport(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"reportId", "planDigest", "attemptSetDigest", "validatedHumanMetricObservationSetDigest",
		"slices", "generatedAt", "reportDigest",
	}, nil); err != nil {
		return err
	}
	if requireIdentity(value["reportId"], "/value/reportId") != nil || requireDigest(value["planDigest"], "/value/planDigest") != nil ||
		requireDigest(value["attemptSetDigest"], "/value/attemptSetDigest") != nil ||
		requireDigest(value["validatedHumanMetricObservationSetDigest"], "/value/validatedHumanMetricObservationSetDigest") != nil ||
		requireInstant(value["generatedAt"], "/value/generatedAt") != nil {
		return errors.New("evaluation metric report identity is invalid")
	}
	slices, ok := value["slices"].([]any)
	if !ok || len(slices) == 0 || len(slices) > 100_000 {
		return errors.New("/value/slices is invalid")
	}
	for index, raw := range slices {
		slice, ok := raw.(map[string]any)
		if !ok || requireDigestMatch(slice, "sliceDigest", fmt.Sprintf("/value/slices/%d/sliceDigest", index)) != nil {
			return fmt.Errorf("/value/slices/%d is invalid", index)
		}
	}
	if err := validateAgentEvaluationMetricReportDeep(value); err != nil {
		return err
	}
	return requireDigestMatch(value, "reportDigest", "/value/reportDigest")
}

func validateAgentEvaluationGraderReport(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"reportId", "planDigest", "graderPlanDigest", "validatedHumanMetricObservationSetDigest",
		"deterministicVerdictCount", "auxiliaryVerdictCount",
		"humanVerdictCount", "disagreementCount", "selfJudgeOnlyAttemptIds", "generatedAt", "reportDigest",
	}, nil); err != nil {
		return err
	}
	if err := requireDigest(value["validatedHumanMetricObservationSetDigest"], "/value/validatedHumanMetricObservationSetDigest"); err != nil {
		return err
	}
	if requireCanonicalStrings(value["selfJudgeOnlyAttemptIds"]) != nil {
		return errors.New("/value/selfJudgeOnlyAttemptIds is non-canonical")
	}
	for _, field := range []string{"deterministicVerdictCount", "auxiliaryVerdictCount", "humanVerdictCount", "disagreementCount"} {
		if _, ok := safeInteger(value[field]); !ok {
			return fmt.Errorf("/value/%s is invalid", field)
		}
	}
	if err := validateAgentEvaluationGraderReportDeep(value); err != nil {
		return err
	}
	return requireDigestMatch(value, "reportDigest", "/value/reportDigest")
}

func validateAgentEvaluationHumanReport(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"reportId", "planDigest", "blindedArtifactSetDigest", "ratings", "adjudicationDigest", "generatedAt", "reportDigest",
	}, nil); err != nil {
		return err
	}
	ratings, ok := value["ratings"].([]any)
	if !ok || len(ratings) > 100_000 {
		return errors.New("/value/ratings is invalid")
	}
	for index, raw := range ratings {
		rating, ok := raw.(map[string]any)
		if !ok || requireDigestMatch(rating, "ratingDigest", fmt.Sprintf("/value/ratings/%d/ratingDigest", index)) != nil {
			return fmt.Errorf("/value/ratings/%d is invalid", index)
		}
	}
	if err := validateAgentEvaluationHumanReportDeep(value); err != nil {
		return err
	}
	return requireDigestMatch(value, "reportDigest", "/value/reportDigest")
}

func validateAgentEvaluationHoldoutReceipt(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"receiptId", "planDigest", "protectedHoldoutManifestDigest", "accessPolicyDigest",
		"encryptedCorpusDigest", "executedCaseIds", "publicArtifactScanDigest", "leakedCaseIds",
		"executorPrincipalId", "executedAt", "receiptDigest",
	}, nil); err != nil {
		return err
	}
	for _, field := range []string{"executedCaseIds", "leakedCaseIds"} {
		if err := requireCanonicalStrings(value[field]); err != nil {
			return fmt.Errorf("/value/%s is non-canonical", field)
		}
	}
	if requireIdentity(value["receiptId"], "/value/receiptId") != nil || requireIdentity(value["executorPrincipalId"], "/value/executorPrincipalId") != nil || requireInstant(value["executedAt"], "/value/executedAt") != nil {
		return errors.New("holdout receipt identity is invalid")
	}
	if err := validateAgentEvaluationHoldoutReceiptDeep(value); err != nil {
		return err
	}
	return requireDigestMatch(value, "receiptDigest", "/value/receiptDigest")
}

func validateAgentEvaluationManifest(value map[string]any) error {
	if err := requireExactObjectKeys(value, []string{
		"manifestId", "planDigest", "attemptRefs", "attemptCountByRisk", "missingOrInfrastructureAttemptRefs",
		"usage", "cost", "metricReportRef", "metricReportDigest", "graderReportRef", "graderReportDigest",
		"holdoutExecutionReceiptRef", "holdoutExecutionReceiptDigest", "qualificationTargetDigests",
		"outcome", "completedAt", "expiresAt", "manifestDigest",
	}, []string{"humanReviewReportRef", "humanReviewReportDigest"}); err != nil {
		return err
	}
	if (value["humanReviewReportRef"] == nil) != (value["humanReviewReportDigest"] == nil) {
		return errors.New("human review ref and digest must appear together")
	}
	if !oneOf(stringValue(value["outcome"]), "satisfied", "unsatisfied", "incomplete", "expired") {
		return errors.New("/value/outcome is invalid")
	}
	if requireCanonicalStrings(value["qualificationTargetDigests"]) != nil {
		return errors.New("/value/qualificationTargetDigests is non-canonical")
	}
	if err := validateAgentEvaluationManifestDeep(value); err != nil {
		return err
	}
	return requireDigestMatch(value, "manifestDigest", "/value/manifestDigest")
}
