package agent

import (
	"sort"
	"strings"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationValidatedHumanMetricObservationFormat = "prodivix.agent-evaluation-validated-human-metric-observation"

func createEvaluationValidatedHumanMetricObservation(input map[string]any) (map[string]any, error) {
	identity := map[string]any{
		"planDigest": input["planDigest"], "attemptId": input["attemptId"], "metricId": input["metricId"],
		"validatedHumanReviewArtifactDigest": input["validatedHumanReviewArtifactDigest"],
	}
	identityDigest, err := canonicaljson.Digest(identity)
	if err != nil {
		return nil, err
	}
	base := make(map[string]any, len(input)+4)
	base["format"], base["version"] = evaluationValidatedHumanMetricObservationFormat, int64(1)
	base["observationId"] = "human-metric-observation:" + strings.TrimPrefix(identityDigest, "sha256-")
	for key, value := range input {
		base[key] = value
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	base["observationDigest"] = digest
	return base, nil
}

func evaluationValidatedHumanMetricObservationSetDigest(observations []map[string]any) (string, error) {
	digests := make([]string, len(observations))
	previous := ""
	for index, observation := range observations {
		observationID := stringMember(observation, "observationId")
		if index > 0 && previous >= observationID {
			return "", conflict("evaluation validated human metric observations are non-canonical")
		}
		digests[index] = stringMember(observation, "observationDigest")
		previous = observationID
	}
	return canonicaljson.Digest(map[string]any{"validatedHumanMetricObservationDigests": digests})
}

func createEvaluationValidatedHumanMetricObservations(
	plan evaluationPlanFact,
	attempts []evaluationAttemptFact,
	artifact evaluationValidatedHumanReviewArtifact,
	report evaluationArtifactFact,
) ([]map[string]any, error) {
	graderPlan, ok := objectMember(plan.Value, "graderPlan")
	if !ok {
		return nil, conflict("evaluation human metric grader plan is unavailable")
	}
	blindIDs, blindOK := graderPlan["blindHumanGraderIds"].([]any)
	graders, gradersOK := graderPlan["graders"].([]any)
	if !blindOK || !gradersOK || len(blindIDs) != 1 {
		return nil, conflict("evaluation human metric authority requires one blind grader")
	}
	blindID, ok := blindIDs[0].(string)
	if !ok {
		return nil, conflict("evaluation human metric grader identity is invalid")
	}
	var grader map[string]any
	for _, raw := range graders {
		candidate, ok := raw.(map[string]any)
		if ok && stringMember(candidate, "graderId") == blindID && stringMember(candidate, "kind") == "blind-human-rubric" &&
			stringMember(candidate, "authority") == "human" {
			grader = candidate
		}
	}
	if grader == nil {
		return nil, conflict("evaluation human metric grader authority is invalid")
	}
	attemptByID := make(map[string]evaluationAttemptFact, len(attempts))
	for _, attempt := range attempts {
		if _, duplicate := attemptByID[attempt.AttemptID]; duplicate {
			return nil, conflict("evaluation human metric attempt identity is duplicated")
		}
		attemptByID[attempt.AttemptID] = attempt
	}
	caseByID := make(map[string]map[string]any)
	for _, raw := range plan.Value["concreteCases"].([]any) {
		evaluationCase := raw.(map[string]any)
		caseByID[stringMember(evaluationCase, "caseId")] = evaluationCase
	}
	rubricByDigest := make(map[string]map[string]any)
	for _, rubric := range artifact.Value["publicRubrics"].([]any) {
		value := rubric.(map[string]any)
		rubricByDigest[stringMember(value, "rubricDigest")] = value
	}
	humanMetricIDs := make(map[string]struct{})
	thresholds, _ := objectMember(plan.Value, "thresholds")
	for _, raw := range thresholds["metrics"].([]any) {
		threshold := raw.(map[string]any)
		if stringMember(threshold, "requiredAuthority") == "human" {
			humanMetricIDs[stringMember(threshold, "metricId")] = struct{}{}
		}
	}
	if len(humanMetricIDs) == 0 {
		return []map[string]any{}, nil
	}
	receipt := artifact.ReviewArtifact["validationReceipt"].(map[string]any)
	adjudications := receipt["candidateAdjudications"].([]any)
	adjudicationByPresentation := make(map[string]map[string]any, len(adjudications))
	for _, raw := range adjudications {
		adjudication := raw.(map[string]any)
		presentationID := stringMember(adjudication, "randomizedPresentationId")
		if _, duplicate := adjudicationByPresentation[presentationID]; duplicate {
			return nil, conflict("evaluation human metric candidate adjudication is duplicated")
		}
		adjudicationByPresentation[presentationID] = adjudication
	}
	signedByPresentation := make(map[string][]map[string]any)
	for _, raw := range artifact.ReviewArtifact["signedRatings"].([]any) {
		rating := raw.(map[string]any)
		presentationID := stringMember(rating, "randomizedPresentationId")
		signedByPresentation[presentationID] = append(signedByPresentation[presentationID], rating)
	}
	reportByPresentation := make(map[string][]map[string]any)
	for _, raw := range report.Value["ratings"].([]any) {
		rating := raw.(map[string]any)
		presentationID := stringMember(rating, "randomizedPresentationId")
		reportByPresentation[presentationID] = append(reportByPresentation[presentationID], rating)
	}
	if len(adjudicationByPresentation) != len(signedByPresentation) || len(adjudicationByPresentation) != len(reportByPresentation) {
		return nil, conflict("evaluation human metric candidate coverage is incomplete")
	}
	minimum, _ := integerMember(graderPlan, "minimumIndependentVisualRatings")
	observedAt := stringMember(report.Value, "generatedAt")
	observations := make([]map[string]any, 0, len(adjudications)*len(humanMetricIDs))
	for _, raw := range adjudications {
		adjudication := raw.(map[string]any)
		presentationID := stringMember(adjudication, "randomizedPresentationId")
		signedRatings := signedByPresentation[presentationID]
		reportRatings := reportByPresentation[presentationID]
		rubric := rubricByDigest[stringMember(adjudication, "rubricDigest")]
		attemptIDs, rubricDigests := make(map[string]struct{}), make(map[string]struct{})
		for _, rating := range reportRatings {
			attemptIDs[stringMember(rating, "attemptId")] = struct{}{}
			rubricDigests[stringMember(rating, "rubricDigest")] = struct{}{}
		}
		if rubric == nil || len(attemptIDs) != 1 || len(rubricDigests) != 1 ||
			len(signedRatings) != len(reportRatings) || int64(len(signedRatings)) < minimum {
			return nil, conflict("evaluation human metric candidate binding is invalid")
		}
		attemptID := stringMember(reportRatings[0], "attemptId")
		attempt := attemptByID[attemptID]
		evaluationCase := caseByID[attempt.CaseID]
		subjective, _ := evaluationCase["subjectiveVisualQuality"].(bool)
		if attempt.AttemptID == "" || attempt.Status != "completed" || !subjective || stringMember(evaluationCase, "access") != "public" {
			return nil, conflict("evaluation human metric attempt is not review eligible")
		}
		requiredCriterionIDs, err := evaluationHumanReviewRequiredCriterionIDs(rubric)
		if err != nil {
			return nil, err
		}
		finalVerdicts, err := evaluationHumanReviewCriterionVerdictMap(adjudication["criterionVerdicts"], requiredCriterionIDs)
		if err != nil {
			return nil, err
		}
		ratingDigests, reviewerAuthorityIDs := make([]string, len(signedRatings)), make([]string, len(signedRatings))
		for index, rating := range signedRatings {
			ratingDigests[index] = stringMember(rating, "ratingDigest")
			reviewerAuthorityIDs[index] = stringMember(rating, "reviewerAuthorityId")
			if _, err := evaluationHumanReviewCriterionVerdictMap(rating["criterionVerdicts"], requiredCriterionIDs); err != nil {
				return nil, err
			}
		}
		for _, rating := range reportRatings {
			if _, err := evaluationHumanReviewCriterionVerdictMap(rating["criterionVerdicts"], requiredCriterionIDs); err != nil {
				return nil, err
			}
		}
		sort.Strings(ratingDigests)
		sort.Strings(reviewerAuthorityIDs)
		if !evaluationHumanReviewCanonicalEqual(ratingDigests, adjudication["ratingDigests"]) ||
			!evaluationHumanReviewCanonicalEqual(reviewerAuthorityIDs, adjudication["reviewerAuthorityIds"]) {
			return nil, conflict("evaluation human metric rating authority drifted")
		}
		candidateDigest, err := canonicaljson.Digest(adjudication)
		if err != nil {
			return nil, err
		}
		common := map[string]any{
			"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
			"attemptId": attemptID, "descriptorDigest": attempt.DescriptorDigest,
			"randomizedPresentationId": presentationID, "rubricDigest": stringMember(rubric, "rubricDigest"),
			"graderId": stringMember(grader, "graderId"), "graderKind": "blind-human-rubric", "authority": "human",
			"ratingDigests": ratingDigests, "reviewerAuthorityIds": reviewerAuthorityIDs,
			"candidateAdjudicationDigest":        candidateDigest,
			"reviewLeaseDigest":                  artifact.ReviewLeaseDigest,
			"humanReviewReportDigest":            report.FactDigest,
			"validatedHumanReviewArtifactDigest": artifact.ArtifactDigest,
			"observedAt":                         observedAt,
		}
		if decisionDigest := stringMember(adjudication, "decisionDigest"); decisionDigest != "" {
			common["decisionDigest"] = decisionDigest
		}
		for _, rawMapping := range rubric["metricMappings"].([]any) {
			mapping := rawMapping.(map[string]any)
			metricID := stringMember(mapping, "metricId")
			if _, planned := humanMetricIDs[metricID]; !planned {
				return nil, conflict("evaluation human rubric maps an unplanned metric")
			}
			criterionIDs, _ := evaluationHumanReviewCanonicalStringSet(mapping["criterionIds"], false, "human metric criterion ids")
			verdict := "passed"
			for _, criterionID := range criterionIDs {
				if finalVerdicts[criterionID] != "passed" {
					verdict = "failed"
				}
			}
			input := make(map[string]any, len(common)+4)
			for key, value := range common {
				input[key] = value
			}
			input["metricId"], input["verdict"], input["basis"], input["criterionIds"] = metricID, verdict, "rubric-all-pass", criterionIDs
			observation, err := createEvaluationValidatedHumanMetricObservation(input)
			if err != nil {
				return nil, err
			}
			observations = append(observations, observation)
		}
		disagreementMetricID := stringMember(rubric, "interRaterDisagreementMetricId")
		if _, planned := humanMetricIDs[disagreementMetricID]; !planned {
			return nil, conflict("evaluation human rubric disagreement metric is unplanned")
		}
		hasDisagreement := false
		for _, criterionID := range requiredCriterionIDs {
			values := make(map[string]struct{})
			for _, rating := range signedRatings {
				verdicts, _ := evaluationHumanReviewCriterionVerdictMap(rating["criterionVerdicts"], requiredCriterionIDs)
				values[verdicts[criterionID]] = struct{}{}
			}
			hasDisagreement = hasDisagreement || len(values) > 1
		}
		disagreementVerdict := "passed"
		if hasDisagreement {
			disagreementVerdict = "failed"
		}
		input := make(map[string]any, len(common)+4)
		for key, value := range common {
			input[key] = value
		}
		input["metricId"], input["verdict"], input["basis"], input["criterionIds"] =
			disagreementMetricID, disagreementVerdict, "inter-rater-disagreement", requiredCriterionIDs
		observation, err := createEvaluationValidatedHumanMetricObservation(input)
		if err != nil {
			return nil, err
		}
		observations = append(observations, observation)
	}
	sort.Slice(observations, func(left, right int) bool {
		return stringMember(observations[left], "observationId") < stringMember(observations[right], "observationId")
	})
	keys := make(map[string]struct{}, len(observations))
	for _, observation := range observations {
		key := stringMember(observation, "attemptId") + "\x00" + stringMember(observation, "metricId")
		if _, duplicate := keys[key]; duplicate {
			return nil, conflict("evaluation human metric observation identity is duplicated")
		}
		keys[key] = struct{}{}
	}
	if len(observations) != len(adjudications)*len(humanMetricIDs) {
		return nil, conflict("evaluation human metric observation coverage is incomplete")
	}
	return observations, nil
}
