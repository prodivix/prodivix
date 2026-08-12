package agent

import (
	"math"
	"math/big"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationFinalizationMetricSlice struct {
	Identity                map[string]any
	Threshold               map[string]any
	ConfidenceLevel         string
	MaximumFailureRateBound string
	Passed                  int64
	Failed                  int64
	Inconclusive            int64
}

func evaluationFinalizationArtifact(factType string, value map[string]any) (evaluationArtifactFact, error) {
	source, err := canonicaljson.Bytes(map[string]any{
		"wireVersion": int64(1), "factType": factType, "value": value,
	})
	if err != nil || len(source) > maximumEvaluationFinalizationBytes {
		return evaluationArtifactFact{}, conflict("evaluation finalization artifact exceeds its bounded envelope")
	}
	return decodeEvaluationArtifact(source, factType)
}

func evaluationFinalizationDecimalFromRate(value float64) string {
	if math.IsNaN(value) || math.IsInf(value, 0) || value < 0 {
		return "1"
	}
	if value > 1 {
		value = 1
	}
	text := strconv.FormatFloat(value, 'f', 8, 64)
	text = strings.TrimRight(text, "0")
	text = strings.TrimRight(text, ".")
	if text == "" || text == "-0" {
		return "0"
	}
	return text
}

func evaluationFinalizationInverseStandardNormal(probability float64) (float64, error) {
	if !(probability > 0 && probability < 1) {
		return 0, invalid("evaluation confidence level is outside zero and one")
	}
	a := [...]float64{-39.69683028665376, 220.9460984245205, -275.9285104469687, 138.357751867269, -30.66479806614716, 2.506628277459239}
	b := [...]float64{-54.47609879822406, 161.5858368580409, -155.6989798598866, 66.80131188771972, -13.28068155288572}
	c := [...]float64{-0.007784894002430293, -0.3223964580411365, -2.400758277161838, -2.549732539343734, 4.374664141464968, 2.938163982698783}
	d := [...]float64{0.007784695709041462, 0.3224671290700398, 2.445134137142996, 3.754408661907416}
	const lower = 0.02425
	const upper = 1 - lower
	if probability < lower {
		q := math.Sqrt(-2 * math.Log(probability))
		return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q + c[5]) /
			((((d[0]*q+d[1])*q+d[2])*q+d[3])*q + 1), nil
	}
	if probability > upper {
		q := math.Sqrt(-2 * math.Log(1-probability))
		return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q + c[5]) /
			((((d[0]*q+d[1])*q+d[2])*q+d[3])*q + 1), nil
	}
	q := probability - 0.5
	r := q * q
	return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r + a[5]) * q /
		(((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r + 1), nil
}

func evaluationFinalizationFailureUpperBound(failures, denominator int64, confidenceLevel string) (string, error) {
	if denominator == 0 || failures > denominator {
		return "1", nil
	}
	confidence, err := strconv.ParseFloat(confidenceLevel, 64)
	if err != nil || !(confidence > 0 && confidence < 1) {
		return "", invalid("evaluation confidence level is invalid")
	}
	if failures == 0 {
		return evaluationFinalizationDecimalFromRate(1 - math.Pow(1-confidence, 1/float64(denominator))), nil
	}
	proportion := float64(failures) / float64(denominator)
	z, err := evaluationFinalizationInverseStandardNormal(confidence)
	if err != nil {
		return "", err
	}
	z2 := z * z
	adjustment := 1 + z2/float64(denominator)
	center := proportion + z2/(2*float64(denominator))
	spread := z * math.Sqrt(proportion*(1-proportion)/float64(denominator)+z2/(4*float64(denominator)*float64(denominator)))
	return evaluationFinalizationDecimalFromRate((center + spread) / adjustment), nil
}

func evaluationFinalizationCompareDecimals(left, right string) (int, error) {
	leftValue, leftOK := new(big.Rat).SetString(left)
	rightValue, rightOK := new(big.Rat).SetString(right)
	if !leftOK || !rightOK || leftValue.Sign() < 0 || rightValue.Sign() < 0 {
		return 0, invalid("evaluation metric threshold decimal is invalid")
	}
	return leftValue.Cmp(rightValue), nil
}

func evaluationFinalizationGraderForAuthority(plan evaluationPlanFact, authority string) (map[string]any, error) {
	graderPlan, ok := objectMember(plan.Value, "graderPlan")
	if !ok {
		return nil, conflict("evaluation finalization grader plan is missing")
	}
	idsField := "deterministicAuthorityGraderIds"
	if authority == "human" {
		idsField = "blindHumanGraderIds"
	}
	rawIDs, idsOK := graderPlan[idsField].([]any)
	rawGraders, gradersOK := graderPlan["graders"].([]any)
	if !idsOK || !gradersOK {
		return nil, conflict("evaluation finalization grader authority is invalid")
	}
	ids := make(map[string]struct{}, len(rawIDs))
	for _, raw := range rawIDs {
		id, ok := raw.(string)
		if !ok {
			return nil, conflict("evaluation finalization grader identity is invalid")
		}
		ids[id] = struct{}{}
	}
	for _, raw := range rawGraders {
		grader, ok := raw.(map[string]any)
		if !ok {
			return nil, conflict("evaluation finalization grader is invalid")
		}
		if _, exists := ids[stringMember(grader, "graderId")]; exists {
			return grader, nil
		}
	}
	return nil, conflict("evaluation finalization has no required authority grader")
}

func evaluationFinalizationMetricObservation(attempt evaluationAttemptFact, metricID, authority string) map[string]any {
	raw, _ := attempt.Value["metricObservations"].([]any)
	for _, entry := range raw {
		observation, ok := entry.(map[string]any)
		if ok && stringMember(observation, "metricId") == metricID &&
			stringMember(observation, "authority") == authority {
			return observation
		}
	}
	return nil
}

func evaluationFinalizationHumanObservationByKey(snapshot evaluationFinalizationSnapshot) (map[string]map[string]any, error) {
	result := make(map[string]map[string]any, len(snapshot.HumanObservations))
	for _, observation := range snapshot.HumanObservations {
		key := stringMember(observation, "attemptId") + "\x00" + stringMember(observation, "metricId")
		if _, duplicate := result[key]; duplicate {
			return nil, conflict("evaluation finalization human metric authority is duplicated")
		}
		result[key] = observation
	}
	for _, attempt := range snapshot.Decoded {
		observations, _ := attempt.Value["metricObservations"].([]any)
		for _, raw := range observations {
			observation, ok := raw.(map[string]any)
			if ok && stringMember(observation, "authority") == "human" {
				return nil, conflict("evaluation finalization attempt-local human observation is not authoritative")
			}
		}
	}
	return result, nil
}

func buildEvaluationMetricReport(snapshot evaluationFinalizationSnapshot, generatedAt time.Time) (evaluationArtifactFact, error) {
	humanObservations, err := evaluationFinalizationHumanObservationByKey(snapshot)
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	cases := make(map[string]map[string]any)
	for _, raw := range snapshot.Plan.Value["concreteCases"].([]any) {
		value := raw.(map[string]any)
		cases[stringMember(value, "caseId")] = value
	}
	targets := make(map[string]map[string]any)
	for _, raw := range snapshot.Plan.Value["capabilityQualificationTargets"].([]any) {
		value := raw.(map[string]any)
		targets[stringMember(value, "targetId")] = value
	}
	repetitionPolicy, _ := objectMember(snapshot.Plan.Value, "repetitionPolicy")
	rulesByRisk := make(map[string]map[string]any)
	for _, raw := range repetitionPolicy["rules"].([]any) {
		value := raw.(map[string]any)
		rulesByRisk[stringMember(value, "riskClass")] = value
	}
	thresholds, _ := objectMember(snapshot.Plan.Value, "thresholds")
	rawThresholds := thresholds["metrics"].([]any)
	slices := make(map[string]*evaluationFinalizationMetricSlice)
	attemptByID := make(map[string]evaluationAttemptFact, len(snapshot.Decoded))
	for _, attempt := range snapshot.Decoded {
		attemptByID[attempt.AttemptID] = attempt
	}
	for _, planned := range snapshot.Planned {
		descriptor := planned.Descriptor
		attempt, attemptExists := attemptByID[planned.AttemptID]
		evaluationCase := cases[planned.CaseID]
		target := targets[stringMember(descriptor, "targetId")]
		if evaluationCase == nil || target == nil {
			return evaluationArtifactFact{}, conflict("evaluation finalization metric descriptor drifted")
		}
		for _, rawThreshold := range rawThresholds {
			threshold, ok := rawThreshold.(map[string]any)
			if !ok {
				return evaluationArtifactFact{}, conflict("evaluation finalization metric threshold is invalid")
			}
			authority := stringMember(threshold, "requiredAuthority")
			subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool)
			if authority == "human" && !subjective {
				continue
			}
			fallback, err := evaluationFinalizationGraderForAuthority(snapshot.Plan, authority)
			if err != nil {
				return evaluationArtifactFact{}, err
			}
			var observation map[string]any
			if authority == "human" {
				observation = humanObservations[planned.AttemptID+"\x00"+stringMember(threshold, "metricId")]
				if observation == nil {
					continue
				}
			} else if attemptExists {
				observation = evaluationFinalizationMetricObservation(attempt, stringMember(threshold, "metricId"), authority)
			}
			graderKind := stringMember(fallback, "kind")
			if observation != nil {
				graderKind = stringMember(observation, "graderKind")
			}
			identity := map[string]any{
				"metricId":                stringMember(threshold, "metricId"),
				"protocolFamily":          stringMember(target, "protocolFamily"),
				"providerConfigurationId": stringMember(target, "providerConfigurationId"),
				"modelFamilyOwnerId":      stringMember(target, "modelFamilyOwnerId"),
				"capabilityProfileId":     stringMember(target, "capabilityProfileId"),
				"primaryBucket":           stringMember(evaluationCase, "primaryBucket"),
				"familyId":                stringMember(evaluationCase, "familyId"),
				"riskClass":               stringMember(evaluationCase, "riskClass"),
				"graderKind":              graderKind,
			}
			if value := stringMember(descriptor, "contextTier"); value != "" {
				identity["contextTier"] = value
			}
			if value := stringMember(descriptor, "mediaRepresentationTier"); value != "" {
				identity["mediaRepresentationTier"] = value
			}
			key, err := canonicaljson.Digest(identity)
			if err != nil {
				return evaluationArtifactFact{}, err
			}
			slice := slices[key]
			if slice == nil {
				rule := rulesByRisk[stringMember(evaluationCase, "riskClass")]
				if rule == nil {
					return evaluationArtifactFact{}, conflict("evaluation finalization repetition rule is missing")
				}
				slice = &evaluationFinalizationMetricSlice{
					Identity: identity, Threshold: threshold,
					ConfidenceLevel:         stringMember(rule, "confidenceLevel"),
					MaximumFailureRateBound: stringMember(rule, "maximumFailureRateBound"),
				}
				slices[key] = slice
			}
			verdict := "inconclusive"
			if attemptExists && attempt.Status == "completed" && observation != nil {
				verdict = stringMember(observation, "verdict")
			}
			switch verdict {
			case "passed":
				slice.Passed++
			case "failed":
				slice.Failed++
			default:
				slice.Inconclusive++
			}
		}
	}
	values := make([]map[string]any, 0, len(slices))
	for key, slice := range slices {
		denominator := slice.Passed + slice.Failed + slice.Inconclusive
		failures := slice.Failed + slice.Inconclusive
		observed := evaluationFinalizationDecimalFromRate(float64(failures) / float64(denominator))
		upper, err := evaluationFinalizationFailureUpperBound(failures, denominator, slice.ConfidenceLevel)
		if err != nil {
			return evaluationArtifactFact{}, err
		}
		minimum, minimumOK := integerMember(slice.Threshold, "minimumSampleCount")
		observedLimit, err := evaluationFinalizationCompareDecimals(observed, stringMember(slice.Threshold, "maximumObservedFailureRate"))
		if err != nil || !minimumOK {
			return evaluationArtifactFact{}, conflict("evaluation finalization metric threshold drifted")
		}
		satisfied := denominator >= minimum && observedLimit <= 0
		if maximum := stringMember(slice.Threshold, "maximumUpperConfidenceBound"); maximum != "" {
			comparison, err := evaluationFinalizationCompareDecimals(upper, maximum)
			if err != nil {
				return evaluationArtifactFact{}, err
			}
			satisfied = satisfied && comparison <= 0
		}
		if slice.MaximumFailureRateBound != "" {
			comparison, err := evaluationFinalizationCompareDecimals(upper, slice.MaximumFailureRateBound)
			if err != nil {
				return evaluationArtifactFact{}, err
			}
			satisfied = satisfied && comparison <= 0
		}
		base := make(map[string]any, len(slice.Identity)+9)
		base["sliceId"] = "metric-slice:" + strings.TrimPrefix(key, "sha256-")
		for field, entry := range slice.Identity {
			base[field] = entry
		}
		base["passed"], base["failed"], base["inconclusive"] = slice.Passed, slice.Failed, slice.Inconclusive
		base["denominator"], base["observedFailureRate"] = denominator, observed
		base["upperConfidenceBound"], base["thresholdSatisfied"] = upper, satisfied
		digest, err := canonicaljson.Digest(base)
		if err != nil {
			return evaluationArtifactFact{}, err
		}
		base["sliceDigest"] = digest
		values = append(values, base)
	}
	sort.Slice(values, func(left, right int) bool {
		return stringMember(values[left], "sliceId") < stringMember(values[right], "sliceId")
	})
	plannedDigests := make([]string, len(snapshot.Planned))
	for index, descriptor := range snapshot.Planned {
		plannedDigests[index] = descriptor.DescriptorDigest
	}
	attemptDigests := make([]string, len(snapshot.Decoded))
	for index, attempt := range snapshot.Decoded {
		attemptDigests[index] = attempt.AttemptDigest
	}
	sort.Strings(plannedDigests)
	sort.Strings(attemptDigests)
	attemptSetDigest, err := canonicaljson.Digest(map[string]any{
		"plannedDescriptorDigests": plannedDigests, "attemptDigests": attemptDigests,
	})
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	humanObservationSetDigest, err := evaluationValidatedHumanMetricObservationSetDigest(snapshot.HumanObservations)
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	reportID := "evaluation-metric-report:" + strings.TrimPrefix(snapshot.Plan.PlanDigest, "sha256-")
	base := map[string]any{
		"reportId": reportID, "planDigest": snapshot.Plan.PlanDigest,
		"attemptSetDigest":                         attemptSetDigest,
		"validatedHumanMetricObservationSetDigest": humanObservationSetDigest, "slices": values,
		"generatedAt": evaluationExportInstant(generatedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	base["reportDigest"] = digest
	return evaluationFinalizationArtifact("evaluation-metric-report", base)
}

func buildEvaluationGraderReport(snapshot evaluationFinalizationSnapshot, generatedAt time.Time) (evaluationArtifactFact, error) {
	humanObservations, err := evaluationFinalizationHumanObservationByKey(snapshot)
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	humanByAttempt := make(map[string][]map[string]any)
	for _, observation := range humanObservations {
		attemptID := stringMember(observation, "attemptId")
		humanByAttempt[attemptID] = append(humanByAttempt[attemptID], observation)
	}
	graderPlan, _ := objectMember(snapshot.Plan.Value, "graderPlan")
	graders := make(map[string]map[string]any)
	for _, raw := range graderPlan["graders"].([]any) {
		grader := raw.(map[string]any)
		graders[stringMember(grader, "graderId")] = grader
	}
	targets := make(map[string]map[string]any)
	for _, raw := range snapshot.Plan.Value["capabilityQualificationTargets"].([]any) {
		target := raw.(map[string]any)
		targets[stringMember(target, "targetId")] = target
	}
	var deterministicCount, auxiliaryCount, humanCount, disagreementCount int64
	selfJudge := make([]string, 0)
	for _, attempt := range snapshot.Decoded {
		observations, _ := attempt.Value["metricObservations"].([]any)
		deterministic, auxiliary := make([]map[string]any, 0), make([]map[string]any, 0)
		for _, raw := range observations {
			observation := raw.(map[string]any)
			switch stringMember(observation, "authority") {
			case "deterministic":
				deterministic = append(deterministic, observation)
			case "auxiliary":
				auxiliary = append(auxiliary, observation)
			}
		}
		human := humanByAttempt[attempt.AttemptID]
		deterministicCount += int64(len(deterministic))
		auxiliaryCount += int64(len(auxiliary))
		humanCount += int64(len(human))
		authorityVerdicts := make(map[string]struct{})
		for _, group := range [][]map[string]any{deterministic, human} {
			for _, observation := range group {
				authorityVerdicts[stringMember(observation, "verdict")] = struct{}{}
			}
		}
		disagreed := false
		for _, observation := range auxiliary {
			verdict := stringMember(observation, "verdict")
			_, agreed := authorityVerdicts[verdict]
			if verdict != "inconclusive" && len(authorityVerdicts) > 0 && !agreed {
				disagreed = true
			}
		}
		if disagreed {
			disagreementCount++
		}
		hasAuthorityPass := false
		for _, group := range [][]map[string]any{deterministic, human} {
			for _, observation := range group {
				hasAuthorityPass = hasAuthorityPass || stringMember(observation, "verdict") == "passed"
			}
		}
		selfOnly := false
		target := targets[attempt.TargetID]
		for _, observation := range auxiliary {
			grader := graders[stringMember(observation, "graderId")]
			if grader == nil || target == nil || stringMember(observation, "verdict") != "passed" ||
				stringMember(grader, "kind") != "model-judge" {
				continue
			}
			owners, _ := grader["testedModelFamilyOwnerIds"].([]any)
			for _, raw := range owners {
				if raw == target["modelFamilyOwnerId"] {
					selfOnly = true
				}
			}
		}
		if !hasAuthorityPass && selfOnly {
			selfJudge = append(selfJudge, attempt.AttemptID)
		}
	}
	sort.Strings(selfJudge)
	humanObservationSetDigest, err := evaluationValidatedHumanMetricObservationSetDigest(snapshot.HumanObservations)
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	base := map[string]any{
		"reportId":   "evaluation-grader-report:" + strings.TrimPrefix(snapshot.Plan.PlanDigest, "sha256-"),
		"planDigest": snapshot.Plan.PlanDigest, "graderPlanDigest": stringMember(graderPlan, "planDigest"),
		"validatedHumanMetricObservationSetDigest": humanObservationSetDigest,
		"deterministicVerdictCount":                deterministicCount, "auxiliaryVerdictCount": auxiliaryCount,
		"humanVerdictCount": humanCount, "disagreementCount": disagreementCount,
		"selfJudgeOnlyAttemptIds": selfJudge, "generatedAt": evaluationExportInstant(generatedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationArtifactFact{}, err
	}
	base["reportDigest"] = digest
	return evaluationFinalizationArtifact("evaluation-grader-report", base)
}

func evaluationFinalizationAggregateUsageAndCost(snapshot evaluationFinalizationSnapshot) (map[string]any, []any, evaluationBudgetDemand, error) {
	rawUsage, rawCost := make([]any, 0), make([]any, 0)
	earliest, latest := time.Time{}, time.Time{}
	for _, attempt := range snapshot.Decoded {
		usage, ok := attempt.Usage.(map[string]any)
		amounts, amountsOK := usage["amounts"].([]any)
		costs, costsOK := attempt.Cost.([]any)
		if !ok || !amountsOK || !costsOK {
			return nil, nil, evaluationBudgetDemand{}, conflict("evaluation finalization attempt usage is invalid")
		}
		rawUsage = append(rawUsage, amounts...)
		rawCost = append(rawCost, costs...)
		if earliest.IsZero() || attempt.StartedAt.Before(earliest) {
			earliest = attempt.StartedAt
		}
		if latest.IsZero() || attempt.CompletedAt.After(latest) {
			latest = attempt.CompletedAt
		}
	}
	usage, err := evaluationEndpointSmokeMergeUsageAmounts(rawUsage)
	if err != nil {
		return nil, nil, evaluationBudgetDemand{}, err
	}
	cost, err := evaluationEndpointSmokeMergeCosts(rawCost)
	if err != nil {
		return nil, nil, evaluationBudgetDemand{}, err
	}
	elapsed := int64(0)
	if !earliest.IsZero() && latest.After(earliest) {
		elapsed = latest.Sub(earliest).Milliseconds()
	}
	demandValue := map[string]any{
		"usage": usage, "cost": cost, "modelInvocations": int64(len(snapshot.Decoded)),
		"toolCalls": int64(0), "repairRounds": int64(0), "transactions": int64(0),
		"artifactBytes": int64(0), "elapsedMs": elapsed,
	}
	demand, err := parseEvaluationBudgetDemand(demandValue, false)
	if err != nil {
		return nil, nil, evaluationBudgetDemand{}, err
	}
	return usage, cost, demand, nil
}

func evaluationFinalizationHumanReviewCoversPlan(snapshot evaluationFinalizationSnapshot, report map[string]any) bool {
	subjectiveCases := make(map[string]struct{})
	for _, raw := range snapshot.Plan.Value["concreteCases"].([]any) {
		evaluationCase := raw.(map[string]any)
		subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool)
		if subjective {
			subjectiveCases[stringMember(evaluationCase, "caseId")] = struct{}{}
		}
	}
	if len(subjectiveCases) == 0 {
		return true
	}
	graderPlan, _ := objectMember(snapshot.Plan.Value, "graderPlan")
	humanIDs := make(map[string]struct{})
	for _, raw := range graderPlan["blindHumanGraderIds"].([]any) {
		humanIDs[raw.(string)] = struct{}{}
	}
	rubrics := make(map[string]struct{})
	for _, raw := range graderPlan["graders"].([]any) {
		grader := raw.(map[string]any)
		if _, ok := humanIDs[stringMember(grader, "graderId")]; ok {
			rubrics[stringMember(grader, "configurationDigest")] = struct{}{}
		}
	}
	budget, _ := objectMember(snapshot.Plan.Value, "budget")
	maximumRatings, maximumOK := integerMember(budget, "maxHumanRatings")
	ratings, ratingsOK := report["ratings"].([]any)
	if !maximumOK || !ratingsOK || int64(len(ratings)) > maximumRatings {
		return false
	}
	planned := make(map[string]evaluationAttemptFact, len(snapshot.Decoded))
	for _, attempt := range snapshot.Decoded {
		planned[attempt.AttemptID] = attempt
	}
	reviewersBySlice := make(map[string]map[string]struct{})
	assignments := make(map[string]struct{})
	for _, raw := range ratings {
		rating, ok := raw.(map[string]any)
		attempt := planned[stringMember(rating, "attemptId")]
		_, subjective := subjectiveCases[attempt.CaseID]
		_, rubric := rubrics[stringMember(rating, "rubricDigest")]
		if !ok || attempt.AttemptID == "" || attempt.Status != "completed" || !subjective || !rubric {
			return false
		}
		key := attempt.CaseID + "\x00" + attempt.TargetID
		reviewer := stringMember(rating, "reviewerPseudonym")
		assignment := key + "\x00" + reviewer
		if _, duplicate := assignments[assignment]; duplicate {
			return false
		}
		assignments[assignment] = struct{}{}
		if reviewersBySlice[key] == nil {
			reviewersBySlice[key] = make(map[string]struct{})
		}
		reviewersBySlice[key][reviewer] = struct{}{}
	}
	minimum, minimumOK := integerMember(graderPlan, "minimumIndependentVisualRatings")
	if !minimumOK {
		return false
	}
	for _, descriptor := range snapshot.Decoded {
		if _, subjective := subjectiveCases[descriptor.CaseID]; subjective && descriptor.Status == "completed" {
			key := descriptor.CaseID + "\x00" + descriptor.TargetID
			if int64(len(reviewersBySlice[key])) < minimum {
				return false
			}
		}
	}
	return true
}

func evaluationFinalizationHoldoutCoversPlan(snapshot evaluationFinalizationSnapshot) bool {
	_, receipt, err := evaluationHoldoutReceiptValue(snapshot.Holdout.ReceiptFactBytes)
	if err != nil || stringMember(receipt.Value, "protectedHoldoutManifestDigest") !=
		stringMember(snapshot.Plan.Value, "protectedHoldoutManifestDigest") {
		return false
	}
	expected := make([]string, 0)
	for _, raw := range snapshot.Plan.Value["concreteCases"].([]any) {
		evaluationCase := raw.(map[string]any)
		if stringMember(evaluationCase, "access") == "protected-holdout" {
			expected = append(expected, stringMember(evaluationCase, "caseId"))
		}
	}
	sort.Strings(expected)
	executedRaw, executedOK := receipt.Value["executedCaseIds"].([]any)
	leakedRaw, leakedOK := receipt.Value["leakedCaseIds"].([]any)
	if !executedOK || !leakedOK || len(leakedRaw) != 0 || len(executedRaw) != len(expected) {
		return false
	}
	for index, raw := range executedRaw {
		if raw != expected[index] {
			return false
		}
	}
	return true
}

func buildEvaluationManifest(
	snapshot evaluationFinalizationSnapshot,
	metric, grader evaluationArtifactFact,
	completedAt time.Time,
) (evaluationArtifactFact, []string, error) {
	human, err := decodeEvaluationArtifact(snapshot.Human.HumanReviewReportFactBytes, "evaluation-human-review-report")
	if err != nil {
		return evaluationArtifactFact{}, nil, err
	}
	missing := make([]string, 0)
	if !evaluationFinalizationHumanReviewCoversPlan(snapshot, human.Value) {
		missing = append(missing, "human-review-coverage")
	}
	if !evaluationFinalizationHoldoutCoversPlan(snapshot) {
		missing = append(missing, "holdout-case-coverage")
	}
	usage, cost, demand, err := evaluationFinalizationAggregateUsageAndCost(snapshot)
	if err != nil {
		return evaluationArtifactFact{}, nil, err
	}
	ceiling, err := decodeEvaluationBudget(snapshot.PlanRecord.FactBytes)
	if err != nil {
		return evaluationArtifactFact{}, nil, err
	}
	if !evaluationDemandWithin(demand, ceiling) {
		missing = append(missing, "manifest-budget")
	}
	if len(missing) != 0 {
		return evaluationArtifactFact{}, evaluationCanonicalMissingFacts(missing...), nil
	}
	sort.Slice(snapshot.Decoded, func(left, right int) bool {
		return snapshot.Decoded[left].AttemptID < snapshot.Decoded[right].AttemptID
	})
	attemptRefs := make([]any, len(snapshot.Decoded))
	countByRisk := map[string]any{"ordinary": int64(0), "critical": int64(0), "high-assurance": int64(0)}
	for index, attempt := range snapshot.Decoded {
		attemptRefs[index] = map[string]any{
			"attemptId": attempt.AttemptID, "descriptorDigest": attempt.DescriptorDigest,
			"attemptDigest": attempt.AttemptDigest,
		}
		countByRisk[stringMember(attempt.Value["descriptor"].(map[string]any), "riskClass")] =
			countByRisk[stringMember(attempt.Value["descriptor"].(map[string]any), "riskClass")].(int64) + 1
	}
	targetDigests := make([]string, 0)
	for _, raw := range snapshot.Plan.Value["capabilityQualificationTargets"].([]any) {
		targetDigests = append(targetDigests, stringMember(raw.(map[string]any), "targetDigest"))
	}
	sort.Strings(targetDigests)
	metricSatisfied := len(metric.Value["slices"].([]any)) > 0
	for _, raw := range metric.Value["slices"].([]any) {
		satisfied, _ := raw.(map[string]any)["thresholdSatisfied"].(bool)
		metricSatisfied = metricSatisfied && satisfied
	}
	selfJudge, _ := grader.Value["selfJudgeOnlyAttemptIds"].([]any)
	outcome := "satisfied"
	if !metricSatisfied || len(selfJudge) > 0 {
		outcome = "unsatisfied"
	}
	if !completedAt.Before(snapshot.Plan.ExpiresAt) {
		outcome = "expired"
	}
	manifestExpiresAt := snapshot.Plan.ExpiresAt
	if !manifestExpiresAt.After(completedAt) {
		manifestExpiresAt = completedAt.Add(time.Millisecond)
	}
	_, holdout, err := evaluationHoldoutReceiptValue(snapshot.Holdout.ReceiptFactBytes)
	if err != nil {
		return evaluationArtifactFact{}, nil, err
	}
	base := map[string]any{
		"manifestId": "evaluation-manifest:" + strings.TrimPrefix(snapshot.Plan.PlanDigest, "sha256-"),
		"planDigest": snapshot.Plan.PlanDigest, "attemptRefs": attemptRefs,
		"attemptCountByRisk": countByRisk, "missingOrInfrastructureAttemptRefs": []any{},
		"usage": usage, "cost": cost,
		"metricReportRef": metric.FactID, "metricReportDigest": metric.FactDigest,
		"graderReportRef": grader.FactID, "graderReportDigest": grader.FactDigest,
		"humanReviewReportRef": human.FactID, "humanReviewReportDigest": human.FactDigest,
		"holdoutExecutionReceiptRef":    holdout.FactID,
		"holdoutExecutionReceiptDigest": holdout.FactDigest,
		"qualificationTargetDigests":    targetDigests, "outcome": outcome,
		"completedAt": evaluationExportInstant(completedAt), "expiresAt": evaluationExportInstant(manifestExpiresAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationArtifactFact{}, nil, err
	}
	base["manifestDigest"] = digest
	artifact, err := evaluationFinalizationArtifact("evaluation-manifest", base)
	return artifact, nil, err
}

func buildEvaluationFinalizationArtifacts(
	snapshot evaluationFinalizationSnapshot,
	completedAt time.Time,
) (evaluationArtifactFact, evaluationArtifactFact, evaluationArtifactFact, []byte, []string, error) {
	metric, err := buildEvaluationMetricReport(snapshot, completedAt)
	if err != nil {
		return evaluationArtifactFact{}, evaluationArtifactFact{}, evaluationArtifactFact{}, nil, nil, err
	}
	grader, err := buildEvaluationGraderReport(snapshot, completedAt)
	if err != nil {
		return evaluationArtifactFact{}, evaluationArtifactFact{}, evaluationArtifactFact{}, nil, nil, err
	}
	manifest, missing, err := buildEvaluationManifest(snapshot, metric, grader, completedAt)
	if err != nil || len(missing) != 0 {
		return evaluationArtifactFact{}, evaluationArtifactFact{}, evaluationArtifactFact{}, nil, missing, err
	}
	base := map[string]any{
		"format": evaluationFinalizationFormat, "version": int64(1),
		"planDigest": snapshot.Plan.PlanDigest, "repositoryCommit": snapshot.Plan.RepositoryCommit,
		"outcome": manifest.Outcome, "missingFacts": []any{}, "manifest": manifest.Value,
		"completedAt": evaluationExportInstant(completedAt),
	}
	report, _, err := evaluationFinalizationCanonicalReport(base, "reportDigest")
	return metric, grader, manifest, report, nil, err
}
