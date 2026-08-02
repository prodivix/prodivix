package agentcontract

import (
	"errors"
	"fmt"
	"math/big"
	"sort"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const maximumAgentEvaluationScheduleEntries = 1_000_000

type evaluationPlanCase struct {
	ID               string
	ProfileID        string
	RiskClass        string
	ContextSentinel  bool
	MediaSentinel    bool
	SubjectiveVisual bool
}

type evaluationPlanTarget struct {
	ID           string
	Digest       string
	ProfileID    string
	Protocol     string
	ProviderID   string
	ProviderHash string
	OperatorID   string
	ModelID      string
	ModelDigest  string
	OwnerID      string
}

type evaluationScheduleEntry struct {
	identity string
	value    map[string]any
}

func evaluationCanonicalDecimal(value any, path string) (*big.Rat, error) {
	text, ok := value.(string)
	if !ok || !agentControlDecimalPattern.MatchString(text) {
		return nil, fmt.Errorf("%s must be a canonical decimal", path)
	}
	parsed, ok := new(big.Rat).SetString(text)
	if !ok {
		return nil, fmt.Errorf("%s cannot be parsed", path)
	}
	return parsed, nil
}

func evaluationStringValues(value any, path string) ([]string, error) {
	values, ok := value.([]any)
	if !ok {
		return nil, fmt.Errorf("%s must be a string array", path)
	}
	result := make([]string, len(values))
	for index, raw := range values {
		entry, ok := raw.(string)
		if !ok {
			return nil, fmt.Errorf("%s/%d must be a string", path, index)
		}
		result[index] = entry
	}
	return result, nil
}

func sameEvaluationStrings(left, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}

func validateAgentEvaluationPlanDeep(value map[string]any) error {
	providers, providerHashes, err := evaluationPlanProviders(value["providerConfigurations"])
	if err != nil {
		return err
	}
	models, err := evaluationPlanModels(value["modelConfigurations"])
	if err != nil {
		return err
	}
	cases, err := evaluationPlanCases(value)
	if err != nil {
		return err
	}
	if err := validateEvaluationPlanTiers(value, cases); err != nil {
		return err
	}
	targets, err := evaluationPlanTargets(value["capabilityQualificationTargets"], providers, providerHashes, models)
	if err != nil {
		return err
	}
	if err := validateEvaluationPlanSmokes(value["endpointSmokeTargets"]); err != nil {
		return err
	}
	repetitions, err := validateEvaluationRepetitionPolicy(value["repetitionPolicy"], cases)
	if err != nil {
		return err
	}
	if err := validateEvaluationGraderPlan(value["graderPlan"]); err != nil {
		return err
	}
	if err := validateEvaluationThresholdPlan(value["thresholds"]); err != nil {
		return err
	}
	schedule, err := buildEvaluationSchedule(cases, targets, repetitions)
	if err != nil {
		return err
	}
	planned, ok := safeInteger(value["plannedJourneyCount"])
	if !ok || planned != int64(len(schedule)) || planned < 11_640 {
		return errors.New("/value/plannedJourneyCount does not match the frozen schedule")
	}
	scheduleValues := make([]any, len(schedule))
	for index, entry := range schedule {
		scheduleValues[index] = entry.value
	}
	scheduleDigest, err := canonicaljson.Digest(scheduleValues)
	if err != nil || stringValue(value["plannedAttemptSetDigest"]) != scheduleDigest {
		return errors.New("/value/plannedAttemptSetDigest does not match the frozen schedule")
	}
	if err := validateEvaluationPlanBudget(value["budget"], len(schedule), len(targets)); err != nil {
		return err
	}
	return nil
}

func evaluationPlanProviders(raw any) (map[string]map[string]any, map[string]string, error) {
	values, ok := raw.([]any)
	if !ok || len(values) < 3 {
		return nil, nil, errors.New("/value/providerConfigurations is invalid")
	}
	providers := make(map[string]map[string]any, len(values))
	hashes := make(map[string]string, len(values))
	previous := ""
	for index, rawValue := range values {
		provider, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(provider, []string{
			"providerConfigurationId", "providerOperatorId", "endpointClass", "endpointProfileDigest",
			"adapter", "dataPolicyDigest",
		}, []string{"providerRegion", "apiRevision"}) != nil {
			return nil, nil, fmt.Errorf("/value/providerConfigurations/%d is invalid", index)
		}
		id := stringValue(provider["providerConfigurationId"])
		if requireIdentity(id, fmt.Sprintf("/value/providerConfigurations/%d/providerConfigurationId", index)) != nil ||
			requireIdentity(provider["providerOperatorId"], fmt.Sprintf("/value/providerConfigurations/%d/providerOperatorId", index)) != nil ||
			(index > 0 && id <= previous) {
			return nil, nil, errors.New("/value/providerConfigurations is non-canonical")
		}
		if !oneOf(stringValue(provider["endpointClass"]), "first-party-hosted", "aggregator", "self-hosted", "local") {
			return nil, nil, fmt.Errorf("/value/providerConfigurations/%d/endpointClass is invalid", index)
		}
		for _, field := range []string{"endpointProfileDigest", "dataPolicyDigest"} {
			if err := requireDigest(provider[field], fmt.Sprintf("/value/providerConfigurations/%d/%s", index, field)); err != nil {
				return nil, nil, err
			}
		}
		for _, field := range []string{"providerRegion", "apiRevision"} {
			if provider[field] != nil && requireIdentity(provider[field], fmt.Sprintf("/value/providerConfigurations/%d/%s", index, field)) != nil {
				return nil, nil, fmt.Errorf("/value/providerConfigurations/%d/%s is invalid", index, field)
			}
		}
		adapter, ok := provider["adapter"].(map[string]any)
		if !ok || requireExactObjectKeys(adapter, []string{
			"adapterId", "adapterVersion", "adapterDigest", "protocolFamily", "transportSchemaDigest", "eventNormalizationDigest",
		}, nil) != nil {
			return nil, nil, fmt.Errorf("/value/providerConfigurations/%d/adapter is invalid", index)
		}
		if requireIdentity(adapter["adapterId"], fmt.Sprintf("/value/providerConfigurations/%d/adapter/adapterId", index)) != nil ||
			requireIdentity(adapter["adapterVersion"], fmt.Sprintf("/value/providerConfigurations/%d/adapter/adapterVersion", index)) != nil ||
			!oneOf(stringValue(adapter["protocolFamily"]), "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") {
			return nil, nil, fmt.Errorf("/value/providerConfigurations/%d/adapter identity is invalid", index)
		}
		for _, field := range []string{"transportSchemaDigest", "eventNormalizationDigest"} {
			if err := requireDigest(adapter[field], fmt.Sprintf("/value/providerConfigurations/%d/adapter/%s", index, field)); err != nil {
				return nil, nil, err
			}
		}
		if err := requireDigestMatch(adapter, "adapterDigest", fmt.Sprintf("/value/providerConfigurations/%d/adapter/adapterDigest", index)); err != nil {
			return nil, nil, err
		}
		providerHash, err := canonicaljson.Digest(provider)
		if err != nil {
			return nil, nil, err
		}
		providers[id], hashes[id] = provider, providerHash
		previous = id
	}
	return providers, hashes, nil
}

func evaluationPlanModels(raw any) (map[string]map[string]any, error) {
	values, ok := raw.([]any)
	if !ok || len(values) < 3 {
		return nil, errors.New("/value/modelConfigurations is invalid")
	}
	models := make(map[string]map[string]any, len(values))
	previous := ""
	for index, rawValue := range values {
		model, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(model, []string{
			"modelId", "modelFamilyId", "modelFamilyOwnerId", "lineageDigest",
		}, []string{
			"immutableVersion", "baseModelRef", "fineTuneRef", "tokenizerDigest", "chatTemplateDigest",
			"quantizationDigest", "runtimeBackendDigest",
		}) != nil {
			return nil, fmt.Errorf("/value/modelConfigurations/%d is invalid", index)
		}
		for _, field := range []string{"modelId", "modelFamilyId", "modelFamilyOwnerId"} {
			if err := requireIdentity(model[field], fmt.Sprintf("/value/modelConfigurations/%d/%s", index, field)); err != nil {
				return nil, err
			}
		}
		if model["immutableVersion"] != nil && requireIdentity(model["immutableVersion"], fmt.Sprintf("/value/modelConfigurations/%d/immutableVersion", index)) != nil {
			return nil, fmt.Errorf("/value/modelConfigurations/%d/immutableVersion is invalid", index)
		}
		for _, field := range []string{"tokenizerDigest", "chatTemplateDigest", "quantizationDigest", "runtimeBackendDigest"} {
			if model[field] != nil {
				if err := requireDigest(model[field], fmt.Sprintf("/value/modelConfigurations/%d/%s", index, field)); err != nil {
					return nil, err
				}
			}
		}
		if base, exists := model["baseModelRef"].(map[string]any); exists {
			if requireExactObjectKeys(base, []string{"modelId", "lineageDigest"}, nil) != nil ||
				requireIdentity(base["modelId"], fmt.Sprintf("/value/modelConfigurations/%d/baseModelRef/modelId", index)) != nil ||
				requireDigest(base["lineageDigest"], fmt.Sprintf("/value/modelConfigurations/%d/baseModelRef/lineageDigest", index)) != nil {
				return nil, fmt.Errorf("/value/modelConfigurations/%d/baseModelRef is invalid", index)
			}
		} else if model["baseModelRef"] != nil {
			return nil, fmt.Errorf("/value/modelConfigurations/%d/baseModelRef is invalid", index)
		}
		if fineTune, exists := model["fineTuneRef"].(map[string]any); exists {
			if requireExactObjectKeys(fineTune, []string{
				"fineTuneId", "jobId", "deploymentId", "baseModelLineageDigest", "trainingPolicyDigest", "disclosedDataLineageDigest",
			}, nil) != nil {
				return nil, fmt.Errorf("/value/modelConfigurations/%d/fineTuneRef is invalid", index)
			}
			for _, field := range []string{"fineTuneId", "jobId", "deploymentId"} {
				if err := requireIdentity(fineTune[field], fmt.Sprintf("/value/modelConfigurations/%d/fineTuneRef/%s", index, field)); err != nil {
					return nil, err
				}
			}
			for _, field := range []string{"baseModelLineageDigest", "trainingPolicyDigest", "disclosedDataLineageDigest"} {
				if err := requireDigest(fineTune[field], fmt.Sprintf("/value/modelConfigurations/%d/fineTuneRef/%s", index, field)); err != nil {
					return nil, err
				}
			}
		} else if model["fineTuneRef"] != nil {
			return nil, fmt.Errorf("/value/modelConfigurations/%d/fineTuneRef is invalid", index)
		}
		if err := requireDigestMatch(model, "lineageDigest", fmt.Sprintf("/value/modelConfigurations/%d/lineageDigest", index)); err != nil {
			return nil, err
		}
		digest := stringValue(model["lineageDigest"])
		if (index > 0 && digest <= previous) || models[digest] != nil {
			return nil, errors.New("/value/modelConfigurations is non-canonical")
		}
		models[digest] = model
		previous = digest
	}
	return models, nil
}

func evaluationPlanCases(value map[string]any) ([]evaluationPlanCase, error) {
	rawCases, _ := value["concreteCases"].([]any)
	cases := make([]evaluationPlanCase, 0, len(rawCases))
	contextIDs := make([]string, 0, 24)
	mediaIDs := make([]string, 0, 16)
	for _, raw := range rawCases {
		entry := raw.(map[string]any)
		contextSentinel := entry["contextSentinel"].(bool)
		mediaSentinel := entry["mediaSentinel"].(bool)
		evaluationCase := evaluationPlanCase{
			ID: stringValue(entry["caseId"]), ProfileID: stringValue(entry["capabilityProfileId"]),
			RiskClass: stringValue(entry["riskClass"]), ContextSentinel: contextSentinel,
			MediaSentinel: mediaSentinel, SubjectiveVisual: entry["subjectiveVisualQuality"].(bool),
		}
		cases = append(cases, evaluationCase)
		if contextSentinel {
			contextIDs = append(contextIDs, evaluationCase.ID)
		}
		if mediaSentinel {
			mediaIDs = append(mediaIDs, evaluationCase.ID)
		}
	}
	frozenContext, err := evaluationStringValues(value["contextSentinelCaseIds"], "/value/contextSentinelCaseIds")
	if err != nil || !sameEvaluationStrings(contextIDs, frozenContext) {
		return nil, errors.New("/value/contextSentinelCaseIds drifted from the corpus")
	}
	frozenMedia, err := evaluationStringValues(value["mediaSentinelCaseIds"], "/value/mediaSentinelCaseIds")
	if err != nil || !sameEvaluationStrings(mediaIDs, frozenMedia) {
		return nil, errors.New("/value/mediaSentinelCaseIds drifted from the corpus")
	}
	return cases, nil
}

func validateEvaluationPlanTiers(value map[string]any, cases []evaluationPlanCase) error {
	contextCases, mediaCases := map[string]struct{}{}, map[string]struct{}{}
	for _, evaluationCase := range cases {
		if evaluationCase.ContextSentinel {
			contextCases[evaluationCase.ID] = struct{}{}
		}
		if evaluationCase.MediaSentinel {
			mediaCases[evaluationCase.ID] = struct{}{}
		}
	}
	definitions := []struct {
		field        string
		caseIDs      map[string]struct{}
		tiers        []string
		digestFields []string
	}{
		{"contextTiers", contextCases, []string{"near-limit", "representative", "small"}, []string{"contextPackDigest", "transformReceiptDigest", "cacheReceiptDigest"}},
		{"mediaRepresentationTiers", mediaCases, []string{"near-limit-transform", "representative-transform", "source-faithful"}, []string{"representationManifestDigest", "transformReceiptDigest", "omissionReceiptDigest"}},
	}
	for _, definition := range definitions {
		values, ok := value[definition.field].([]any)
		if !ok || len(values) != len(definition.caseIDs)*len(definition.tiers) {
			return fmt.Errorf("/value/%s does not cover every sentinel tier", definition.field)
		}
		previous := ""
		seen := map[string]struct{}{}
		for index, raw := range values {
			entry, ok := raw.(map[string]any)
			required := append([]string{"caseId", "tier"}, definition.digestFields...)
			required = append(required, "tierDigest")
			if !ok || requireExactObjectKeys(entry, required, nil) != nil {
				return fmt.Errorf("/value/%s/%d is invalid", definition.field, index)
			}
			caseID, tier := stringValue(entry["caseId"]), stringValue(entry["tier"])
			if requireIdentity(caseID, fmt.Sprintf("/value/%s/%d/caseId", definition.field, index)) != nil {
				return fmt.Errorf("/value/%s/%d/caseId is invalid", definition.field, index)
			}
			if _, exists := definition.caseIDs[caseID]; !exists || !oneOf(tier, definition.tiers...) {
				return fmt.Errorf("/value/%s/%d sentinel tier binding is invalid", definition.field, index)
			}
			identity := caseID + "\x00" + tier
			if _, duplicate := seen[identity]; duplicate || (index > 0 && identity <= previous) {
				return fmt.Errorf("/value/%s is non-canonical", definition.field)
			}
			seen[identity] = struct{}{}
			for _, field := range definition.digestFields {
				if err := requireDigest(entry[field], fmt.Sprintf("/value/%s/%d/%s", definition.field, index, field)); err != nil {
					return err
				}
			}
			if err := requireDigestMatch(entry, "tierDigest", fmt.Sprintf("/value/%s/%d/tierDigest", definition.field, index)); err != nil {
				return err
			}
			previous = identity
		}
	}
	return nil
}

func evaluationPlanTargets(raw any, providers map[string]map[string]any, providerHashes map[string]string, models map[string]map[string]any) ([]evaluationPlanTarget, error) {
	values, ok := raw.([]any)
	if !ok || len(values) < 9 {
		return nil, errors.New("/value/capabilityQualificationTargets is invalid")
	}
	targets := make([]evaluationPlanTarget, 0, len(values))
	requiredProfiles := []string{"g4-core-text-tools", "g4-document-input", "g4-visual-input"}
	nativeProviders := map[string]string{}
	providerCountsByProtocol := map[string]int{}
	for _, provider := range providers {
		protocol := stringValue(provider["adapter"].(map[string]any)["protocolFamily"])
		if oneOf(protocol, "openai-responses", "anthropic-messages", "gemini-interactions") {
			providerCountsByProtocol[protocol]++
		}
	}
	for _, protocol := range []string{"openai-responses", "anthropic-messages", "gemini-interactions"} {
		if providerCountsByProtocol[protocol] != 1 {
			return nil, fmt.Errorf("native protocol %s requires one exact provider configuration", protocol)
		}
	}
	operators, owners := map[string]struct{}{}, map[string]struct{}{}
	profileCounts := map[string]int{}
	previous := ""
	for index, rawValue := range values {
		target, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(target, []string{
			"targetId", "providerConfigurationId", "providerIdentityDigest", "protocolFamily", "providerOperatorId",
			"modelId", "modelLineageDigest", "modelFamilyOwnerId", "capabilityProfileId", "capabilityProfileDigest",
			"inferenceConfigurationDigest", "qualificationSliceDigest", "targetDigest",
		}, nil) != nil {
			return nil, fmt.Errorf("/value/capabilityQualificationTargets/%d is invalid", index)
		}
		result := evaluationPlanTarget{
			ID: stringValue(target["targetId"]), Digest: stringValue(target["targetDigest"]),
			ProfileID: stringValue(target["capabilityProfileId"]), Protocol: stringValue(target["protocolFamily"]),
			ProviderID: stringValue(target["providerConfigurationId"]), ProviderHash: stringValue(target["providerIdentityDigest"]),
			OperatorID: stringValue(target["providerOperatorId"]), ModelID: stringValue(target["modelId"]),
			ModelDigest: stringValue(target["modelLineageDigest"]), OwnerID: stringValue(target["modelFamilyOwnerId"]),
		}
		for _, field := range []string{"targetId", "providerConfigurationId", "providerOperatorId", "modelId", "modelFamilyOwnerId", "capabilityProfileId"} {
			if err := requireIdentity(target[field], fmt.Sprintf("/value/capabilityQualificationTargets/%d/%s", index, field)); err != nil {
				return nil, err
			}
		}
		for _, field := range []string{"providerIdentityDigest", "modelLineageDigest", "capabilityProfileDigest", "inferenceConfigurationDigest", "qualificationSliceDigest"} {
			if err := requireDigest(target[field], fmt.Sprintf("/value/capabilityQualificationTargets/%d/%s", index, field)); err != nil {
				return nil, err
			}
		}
		if !oneOf(result.Protocol, "openai-responses", "anthropic-messages", "gemini-interactions", "openai-compatible") ||
			(index > 0 && result.ID <= previous) {
			return nil, errors.New("/value/capabilityQualificationTargets is non-canonical")
		}
		provider, providerExists := providers[result.ProviderID]
		model, modelExists := models[result.ModelDigest]
		if !providerExists || !modelExists || providerHashes[result.ProviderID] != result.ProviderHash ||
			stringValue(provider["providerOperatorId"]) != result.OperatorID ||
			stringValue(provider["adapter"].(map[string]any)["protocolFamily"]) != result.Protocol ||
			stringValue(model["modelId"]) != result.ModelID || stringValue(model["modelFamilyOwnerId"]) != result.OwnerID {
			return nil, fmt.Errorf("/value/capabilityQualificationTargets/%d drifted from provider/model identity", index)
		}
		if err := requireDigestMatch(target, "targetDigest", fmt.Sprintf("/value/capabilityQualificationTargets/%d/targetDigest", index)); err != nil {
			return nil, err
		}
		if oneOf(result.Protocol, "openai-responses", "anthropic-messages", "gemini-interactions") {
			if current, exists := nativeProviders[result.Protocol]; exists && current != result.ProviderID {
				return nil, fmt.Errorf("native protocol %s has multiple required configurations", result.Protocol)
			}
			nativeProviders[result.Protocol] = result.ProviderID
			operators[result.OperatorID] = struct{}{}
			owners[result.OwnerID] = struct{}{}
			profileCounts[result.Protocol+"\x00"+result.ProfileID]++
		}
		targets = append(targets, result)
		previous = result.ID
	}
	if len(nativeProviders) != 3 || len(operators) != 3 || len(owners) != 3 {
		return nil, errors.New("native protocol/operator/model-family diversity is insufficient")
	}
	for protocol := range nativeProviders {
		for _, profile := range requiredProfiles {
			if profileCounts[protocol+"\x00"+profile] != 1 {
				return nil, fmt.Errorf("native family %s profile %s requires one exact target", protocol, profile)
			}
		}
	}
	return targets, nil
}

func validateEvaluationPlanSmokes(raw any) error {
	values, ok := raw.([]any)
	if !ok || len(values) < 2 {
		return errors.New("/value/endpointSmokeTargets is invalid")
	}
	previous := ""
	hosted, local := false, false
	for index, rawValue := range values {
		entry, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(entry, []string{
			"smokeTargetId", "endpointClass", "protocolFamily", "providerConfigurationId", "adapterDigest", "smokeProfileDigest", "targetDigest",
		}, nil) != nil {
			return fmt.Errorf("/value/endpointSmokeTargets/%d is invalid", index)
		}
		id, endpointClass := stringValue(entry["smokeTargetId"]), stringValue(entry["endpointClass"])
		if requireIdentity(id, fmt.Sprintf("/value/endpointSmokeTargets/%d/smokeTargetId", index)) != nil ||
			requireIdentity(entry["providerConfigurationId"], fmt.Sprintf("/value/endpointSmokeTargets/%d/providerConfigurationId", index)) != nil ||
			stringValue(entry["protocolFamily"]) != "openai-compatible" ||
			!oneOf(endpointClass, "first-party-hosted", "aggregator", "self-hosted", "local") || (index > 0 && id <= previous) {
			return errors.New("/value/endpointSmokeTargets is non-canonical")
		}
		for _, field := range []string{"adapterDigest", "smokeProfileDigest"} {
			if err := requireDigest(entry[field], fmt.Sprintf("/value/endpointSmokeTargets/%d/%s", index, field)); err != nil {
				return err
			}
		}
		if err := requireDigestMatch(entry, "targetDigest", fmt.Sprintf("/value/endpointSmokeTargets/%d/targetDigest", index)); err != nil {
			return err
		}
		hosted = hosted || oneOf(endpointClass, "first-party-hosted", "aggregator")
		local = local || oneOf(endpointClass, "local", "self-hosted")
		previous = id
	}
	if !hosted || !local {
		return errors.New("generic OpenAI-compatible hosted and local smokes are both required")
	}
	return nil
}

func validateEvaluationRepetitionPolicy(raw any, cases []evaluationPlanCase) (map[string]int, error) {
	policy, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(policy, []string{
		"rules", "highAssuranceCaseIds", "samplingIndependencePolicyDigest", "cacheAndStateIsolationPolicyDigest",
	}, nil) != nil {
		return nil, errors.New("/value/repetitionPolicy is invalid")
	}
	for _, field := range []string{"samplingIndependencePolicyDigest", "cacheAndStateIsolationPolicyDigest"} {
		if err := requireDigest(policy[field], "/value/repetitionPolicy/"+field); err != nil {
			return nil, err
		}
	}
	rules, ok := policy["rules"].([]any)
	if !ok || len(rules) != 3 {
		return nil, errors.New("/value/repetitionPolicy/rules must cover all risk classes")
	}
	minimums := map[string]int64{"ordinary": 10, "critical": 30, "high-assurance": 100}
	counts := map[string]int{}
	previous := ""
	for index, rawRule := range rules {
		rule, ok := rawRule.(map[string]any)
		if !ok || requireExactObjectKeys(rule, []string{"riskClass", "minimumIndependentAttempts", "confidenceLevel"}, []string{"maximumFailureRateBound", "sequentialStoppingRuleDigest"}) != nil {
			return nil, fmt.Errorf("/value/repetitionPolicy/rules/%d is invalid", index)
		}
		risk := stringValue(rule["riskClass"])
		minimum, exists := minimums[risk]
		attempts, countOK := safeInteger(rule["minimumIndependentAttempts"])
		confidence, decimalErr := evaluationCanonicalDecimal(rule["confidenceLevel"], fmt.Sprintf("/value/repetitionPolicy/rules/%d/confidenceLevel", index))
		if !exists || !countOK || attempts < minimum || attempts > maximumAgentEvaluationScheduleEntries ||
			decimalErr != nil || confidence.Sign() <= 0 || confidence.Cmp(big.NewRat(1, 1)) >= 0 || (index > 0 && risk <= previous) {
			return nil, fmt.Errorf("/value/repetitionPolicy/rules/%d has invalid risk/count/confidence", index)
		}
		if rule["maximumFailureRateBound"] != nil {
			bound, err := evaluationCanonicalDecimal(rule["maximumFailureRateBound"], fmt.Sprintf("/value/repetitionPolicy/rules/%d/maximumFailureRateBound", index))
			if err != nil || bound.Sign() < 0 || bound.Cmp(big.NewRat(1, 1)) > 0 {
				return nil, fmt.Errorf("/value/repetitionPolicy/rules/%d maximum failure bound is invalid", index)
			}
		}
		if rule["sequentialStoppingRuleDigest"] != nil {
			if err := requireDigest(rule["sequentialStoppingRuleDigest"], fmt.Sprintf("/value/repetitionPolicy/rules/%d/sequentialStoppingRuleDigest", index)); err != nil {
				return nil, err
			}
		}
		counts[risk] = int(attempts)
		previous = risk
	}
	highCases := make([]string, 0)
	for _, evaluationCase := range cases {
		if evaluationCase.RiskClass == "high-assurance" {
			highCases = append(highCases, evaluationCase.ID)
		}
	}
	frozenHigh, err := evaluationStringValues(policy["highAssuranceCaseIds"], "/value/repetitionPolicy/highAssuranceCaseIds")
	if err != nil || len(highCases) < 12 || !sameEvaluationStrings(highCases, frozenHigh) {
		return nil, errors.New("/value/repetitionPolicy/highAssuranceCaseIds drifted from the corpus")
	}
	return counts, nil
}

func validateEvaluationGraderPlan(raw any) error {
	plan, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(plan, []string{
		"graders", "deterministicAuthorityGraderIds", "auxiliaryJudgeGraderIds", "blindHumanGraderIds",
		"minimumIndependentVisualRatings", "disagreementPolicyDigest", "randomizedPresentationPolicyDigest", "planDigest",
	}, nil) != nil {
		return errors.New("/value/graderPlan is invalid")
	}
	graders, ok := plan["graders"].([]any)
	if !ok || len(graders) == 0 {
		return errors.New("/value/graderPlan/graders is invalid")
	}
	graderKinds := map[string]string{}
	previous := ""
	for index, rawGrader := range graders {
		grader, ok := rawGrader.(map[string]any)
		if !ok || requireExactObjectKeys(grader, []string{"graderId", "kind", "authority", "configurationDigest", "testedModelFamilyOwnerIds"}, []string{"providerConfigurationId", "modelLineageDigest"}) != nil {
			return fmt.Errorf("/value/graderPlan/graders/%d is invalid", index)
		}
		id, kind, authority := stringValue(grader["graderId"]), stringValue(grader["kind"]), stringValue(grader["authority"])
		if requireIdentity(id, fmt.Sprintf("/value/graderPlan/graders/%d/graderId", index)) != nil || (index > 0 && id <= previous) ||
			!oneOf(kind, "strict-decoder", "deterministic-rule", "domain-dry-run", "g3-closure", "perceptual-metric", "model-judge", "blind-human-rubric") ||
			!oneOf(authority, "deterministic", "auxiliary", "human") || (kind == "model-judge") != (authority == "auxiliary") ||
			(kind == "blind-human-rubric") != (authority == "human") {
			return fmt.Errorf("/value/graderPlan/graders/%d classification is invalid", index)
		}
		if err := requireDigest(grader["configurationDigest"], fmt.Sprintf("/value/graderPlan/graders/%d/configurationDigest", index)); err != nil {
			return err
		}
		if grader["providerConfigurationId"] != nil && requireIdentity(grader["providerConfigurationId"], fmt.Sprintf("/value/graderPlan/graders/%d/providerConfigurationId", index)) != nil {
			return fmt.Errorf("/value/graderPlan/graders/%d provider identity is invalid", index)
		}
		if grader["modelLineageDigest"] != nil {
			if err := requireDigest(grader["modelLineageDigest"], fmt.Sprintf("/value/graderPlan/graders/%d/modelLineageDigest", index)); err != nil {
				return err
			}
		}
		if err := requireCanonicalStrings(grader["testedModelFamilyOwnerIds"]); err != nil {
			return fmt.Errorf("/value/graderPlan/graders/%d/testedModelFamilyOwnerIds: %w", index, err)
		}
		graderKinds[id] = authority
		previous = id
	}
	lists := []struct{ field, authority string }{{"deterministicAuthorityGraderIds", "deterministic"}, {"auxiliaryJudgeGraderIds", "auxiliary"}, {"blindHumanGraderIds", "human"}}
	for _, definition := range lists {
		ids, err := evaluationStringValues(plan[definition.field], "/value/graderPlan/"+definition.field)
		if err != nil || requireCanonicalStrings(plan[definition.field]) != nil || (definition.field == "deterministicAuthorityGraderIds" && len(ids) == 0) {
			return fmt.Errorf("/value/graderPlan/%s is invalid", definition.field)
		}
		for _, id := range ids {
			if graderKinds[id] != definition.authority {
				return fmt.Errorf("/value/graderPlan/%s references the wrong authority", definition.field)
			}
		}
	}
	minimum, ok := safeInteger(plan["minimumIndependentVisualRatings"])
	if !ok || minimum < 2 {
		return errors.New("/value/graderPlan/minimumIndependentVisualRatings is below two")
	}
	for _, field := range []string{"disagreementPolicyDigest", "randomizedPresentationPolicyDigest"} {
		if err := requireDigest(plan[field], "/value/graderPlan/"+field); err != nil {
			return err
		}
	}
	return requireDigestMatch(plan, "planDigest", "/value/graderPlan/planDigest")
}

func validateEvaluationThresholdPlan(raw any) error {
	thresholds, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(thresholds, []string{"metrics", "multipleComparisonPolicyDigest", "slicePolicyDigest", "thresholdsDigest"}, nil) != nil {
		return errors.New("/value/thresholds is invalid")
	}
	metrics, ok := thresholds["metrics"].([]any)
	if !ok || len(metrics) == 0 {
		return errors.New("/value/thresholds/metrics is invalid")
	}
	previous := ""
	for index, rawMetric := range metrics {
		metric, ok := rawMetric.(map[string]any)
		if !ok || requireExactObjectKeys(metric, []string{"metricId", "requiredAuthority", "maximumObservedFailureRate", "minimumSampleCount"}, []string{"maximumUpperConfidenceBound"}) != nil {
			return fmt.Errorf("/value/thresholds/metrics/%d is invalid", index)
		}
		id := stringValue(metric["metricId"])
		minimum, countOK := safeInteger(metric["minimumSampleCount"])
		observed, decimalErr := evaluationCanonicalDecimal(metric["maximumObservedFailureRate"], fmt.Sprintf("/value/thresholds/metrics/%d/maximumObservedFailureRate", index))
		if requireIdentity(id, fmt.Sprintf("/value/thresholds/metrics/%d/metricId", index)) != nil ||
			!oneOf(stringValue(metric["requiredAuthority"]), "deterministic", "human") || !countOK || minimum < 1 ||
			decimalErr != nil || observed.Sign() < 0 || observed.Cmp(big.NewRat(1, 1)) > 0 || (index > 0 && id <= previous) {
			return fmt.Errorf("/value/thresholds/metrics/%d value is invalid", index)
		}
		if metric["maximumUpperConfidenceBound"] != nil {
			bound, err := evaluationCanonicalDecimal(metric["maximumUpperConfidenceBound"], fmt.Sprintf("/value/thresholds/metrics/%d/maximumUpperConfidenceBound", index))
			if err != nil || bound.Sign() < 0 || bound.Cmp(big.NewRat(1, 1)) > 0 {
				return fmt.Errorf("/value/thresholds/metrics/%d confidence bound is invalid", index)
			}
		}
		previous = id
	}
	for _, field := range []string{"multipleComparisonPolicyDigest", "slicePolicyDigest"} {
		if err := requireDigest(thresholds[field], "/value/thresholds/"+field); err != nil {
			return err
		}
	}
	return requireDigestMatch(thresholds, "thresholdsDigest", "/value/thresholds/thresholdsDigest")
}

func buildEvaluationSchedule(cases []evaluationPlanCase, targets []evaluationPlanTarget, repetitions map[string]int) ([]evaluationScheduleEntry, error) {
	entries := make([]evaluationScheduleEntry, 0, 11_640)
	for _, evaluationCase := range cases {
		variants := evaluationScheduleVariants(evaluationCase)
		for _, target := range targets {
			if target.ProfileID != evaluationCase.ProfileID {
				continue
			}
			for _, variant := range variants {
				for repetition := 0; repetition < repetitions[evaluationCase.RiskClass]; repetition++ {
					if len(entries) >= maximumAgentEvaluationScheduleEntries {
						return nil, errors.New("evaluation schedule exceeds its bounded entry limit")
					}
					value := map[string]any{
						"caseId": evaluationCase.ID, "targetId": target.ID, "targetDigest": target.Digest,
						"riskClass": evaluationCase.RiskClass, "repetitionIndex": float64(repetition),
					}
					contextTier, _ := variant["contextTier"].(string)
					mediaTier, _ := variant["mediaRepresentationTier"].(string)
					if contextTier != "" {
						value["contextTier"] = contextTier
					}
					if mediaTier != "" {
						value["mediaRepresentationTier"] = mediaTier
					}
					identity := strings.Join([]string{evaluationCase.ID, target.ID, evaluationCase.RiskClass, contextTier, mediaTier, fmt.Sprintf("%06d", repetition)}, "\x00")
					entries = append(entries, evaluationScheduleEntry{identity: identity, value: value})
				}
			}
		}
	}
	sort.Slice(entries, func(left, right int) bool { return entries[left].identity < entries[right].identity })
	return entries, nil
}

func evaluationScheduleVariants(evaluationCase evaluationPlanCase) []map[string]any {
	base := map[string]any{}
	if evaluationCase.ContextSentinel {
		base["contextTier"] = "representative"
	}
	if evaluationCase.MediaSentinel {
		base["mediaRepresentationTier"] = "representative-transform"
	}
	variants := []map[string]any{base}
	if evaluationCase.ContextSentinel {
		for _, tier := range []string{"small", "near-limit"} {
			variant := cloneEvaluationStringMap(base)
			variant["contextTier"] = tier
			variants = append(variants, variant)
		}
	}
	if evaluationCase.MediaSentinel {
		for _, tier := range []string{"source-faithful", "near-limit-transform"} {
			variant := cloneEvaluationStringMap(base)
			variant["mediaRepresentationTier"] = tier
			variants = append(variants, variant)
		}
	}
	return variants
}

func cloneEvaluationStringMap(source map[string]any) map[string]any {
	result := make(map[string]any, len(source))
	for key, value := range source {
		result[key] = value
	}
	return result
}

func validateEvaluationPlanBudget(raw any, scheduleCount, targetCount int) error {
	evaluationBudget, ok := raw.(map[string]any)
	if !ok || requireExactObjectKeys(evaluationBudget, []string{"budget", "maxProviderJobs", "maxShards", "maxHumanRatings", "reservePolicyDigest", "budgetDigest"}, nil) != nil {
		return errors.New("/value/budget is invalid")
	}
	for _, field := range []string{"maxProviderJobs", "maxShards", "maxHumanRatings"} {
		if _, ok := safeInteger(evaluationBudget[field]); !ok {
			return fmt.Errorf("/value/budget/%s is invalid", field)
		}
	}
	providerJobs, _ := safeInteger(evaluationBudget["maxProviderJobs"])
	shards, _ := safeInteger(evaluationBudget["maxShards"])
	if providerJobs < int64(scheduleCount) || shards < int64(targetCount) || shards == 0 {
		return errors.New("/value/budget cannot reserve the frozen provider-job/shard schedule")
	}
	if err := requireDigest(evaluationBudget["reservePolicyDigest"], "/value/budget/reservePolicyDigest"); err != nil {
		return err
	}
	budget, ok := evaluationBudget["budget"].(map[string]any)
	if !ok || requireExactObjectKeys(budget, []string{
		"usageLimits", "costLimits", "maxModelInvocations", "maxToolCalls", "maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs",
	}, nil) != nil {
		return errors.New("/value/budget/budget is invalid")
	}
	for _, field := range []string{"maxModelInvocations", "maxToolCalls", "maxRepairRounds", "maxTransactions", "maxArtifactBytes", "maxElapsedMs"} {
		if _, ok := safeInteger(budget[field]); !ok {
			return fmt.Errorf("/value/budget/budget/%s is invalid", field)
		}
	}
	modelInvocations, _ := safeInteger(budget["maxModelInvocations"])
	if modelInvocations < int64(scheduleCount) {
		return errors.New("/value/budget/budget/maxModelInvocations is below the frozen schedule")
	}
	for _, definition := range []struct{ field, identity string }{{"usageLimits", "unit"}, {"costLimits", "currency"}} {
		limits, ok := budget[definition.field].([]any)
		if !ok {
			return fmt.Errorf("/value/budget/budget/%s is invalid", definition.field)
		}
		previous := ""
		for index, rawLimit := range limits {
			limit, ok := rawLimit.(map[string]any)
			if !ok || requireExactObjectKeys(limit, []string{definition.identity, "maximum"}, nil) != nil {
				return fmt.Errorf("/value/budget/budget/%s/%d is invalid", definition.field, index)
			}
			identity := stringValue(limit[definition.identity])
			if identity == "" || (definition.identity == "currency" && !regexpCurrency(identity)) || (index > 0 && identity <= previous) {
				return fmt.Errorf("/value/budget/budget/%s is non-canonical", definition.field)
			}
			if _, err := evaluationCanonicalDecimal(limit["maximum"], fmt.Sprintf("/value/budget/budget/%s/%d/maximum", definition.field, index)); err != nil {
				return err
			}
			previous = identity
		}
	}
	return requireDigestMatch(evaluationBudget, "budgetDigest", "/value/budget/budgetDigest")
}

func regexpCurrency(value string) bool {
	if len(value) != 3 {
		return false
	}
	for _, character := range value {
		if character < 'A' || character > 'Z' {
			return false
		}
	}
	return true
}
