package agent

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationValidatedHumanReviewFixture(
	t *testing.T,
	plan evaluationPlanFact,
) ([]byte, []byte) {
	t.Helper()
	digest := func(label string) string { return evaluationFixtureDigest(t, "validated-human-review-"+label) }
	signature := strings.Repeat("A", 86)
	blindedSetDigest := digest("blinded-set")
	reviewLeaseDigest := digest("review-lease")
	rubricDigest := digest("rubric")
	criterionVerdicts := []any{map[string]any{"criterionId": "visual-quality", "verdict": "passed"}}
	randomizedPresentationID := "blind-review:" + strings.Repeat("A", 43)
	source := map[string]any{
		"sourceRunId": "123", "sourceRunAttempt": 1,
		"sourceArtifactName": "human-review.json", "sourceArtifactDigest": "sha256:" + strings.Repeat("a", 64),
	}
	rating := map[string]any{
		"format": "prodivix.g4-human-review-signed-rating", "version": 1,
		"ratingId": "rating.1", "randomizedPresentationId": randomizedPresentationID,
		"rubricDigest": rubricDigest, "blindedArtifactSetDigest": blindedSetDigest,
		"reviewerAuthorityId": "authority.reviewer.1", "reviewerPseudonym": "reviewer.one",
		"keyId": "key.reviewer.1", "criterionVerdicts": criterionVerdicts,
		"verdict": "passed", "ratedAt": "2026-08-02T03:30:00.000Z",
	}
	ratingDigest, err := canonicaljson.Digest(rating)
	if err != nil {
		t.Fatal(err)
	}
	rating["ratingDigest"], rating["signatureBase64Url"] = ratingDigest, signature
	independence := make([]any, 0, 2)
	for _, role := range []string{"reviewer", "adjudicator"} {
		attestation := map[string]any{
			"format": "prodivix.g4-human-review-independence-attestation", "version": 1,
			"attestationId": "independence." + role, "planDigest": plan.PlanDigest,
			"blindedArtifactSetDigest": blindedSetDigest, "authorityId": "authority." + role,
			"authorityPseudonym": "pseudonym." + role, "role": role, "keyId": "key." + role,
			"independencePolicyDigest":          digest("independence-policy"),
			"testedModelFamilyOwnerSetDigest":   digest("tested-owner-set"),
			"conflictModelFamilyOwnerSetDigest": digest("conflict-owner-set-" + role),
			"issuedAt":                          "2026-08-02T03:00:00.000Z", "expiresAt": "2026-08-03T03:00:00.000Z",
		}
		attestationDigest, err := canonicaljson.Digest(attestation)
		if err != nil {
			t.Fatal(err)
		}
		attestation["attestationDigest"], attestation["signatureBase64Url"] = attestationDigest, signature
		independence = append(independence, attestation)
	}
	signedRatingSetDigest, err := canonicaljson.Digest([]any{
		map[string]any{"ratingDigest": ratingDigest, "signatureBase64Url": signature},
	})
	if err != nil {
		t.Fatal(err)
	}
	independenceSet := make([]any, len(independence))
	for index, raw := range independence {
		attestation := raw.(map[string]any)
		independenceSet[index] = map[string]any{
			"attestationDigest": attestation["attestationDigest"], "signatureBase64Url": signature,
		}
	}
	independenceSetDigest, err := canonicaljson.Digest(independenceSet)
	if err != nil {
		t.Fatal(err)
	}
	emptyDecisionSetDigest, err := canonicaljson.Digest([]any{})
	if err != nil {
		t.Fatal(err)
	}
	candidateAdjudications := []any{map[string]any{
		"randomizedPresentationId": randomizedPresentationID,
		"candidateDigest":          digest("candidate"), "rubricDigest": rubricDigest,
		"ratingDigests": []any{ratingDigest}, "reviewerAuthorityIds": []any{"authority.reviewer.1"},
		"criterionVerdicts": criterionVerdicts, "verdict": "passed",
	}}
	candidateSetDigest, err := canonicaljson.Digest(candidateAdjudications)
	if err != nil {
		t.Fatal(err)
	}
	validation := map[string]any{
		"format": "prodivix.g4-human-review-validation-receipt", "version": 1,
		"receiptId": "human-review-validation.1", "submissionId": "human-review-submission.1",
		"submissionDigest": digest("submission"), "planDigest": plan.PlanDigest,
		"repositoryCommit": plan.RepositoryCommit, "blindBundleDigest": digest("blind-bundle"),
		"reviewLeaseDigest":                  reviewLeaseDigest,
		"blindedArtifactSetDigest":           blindedSetDigest,
		"randomizedPresentationPolicyDigest": digest("presentation-policy"), "sourceProvenance": source,
		"trustRegistryDigest": digest("trust-registry"), "authoritySetDigest": digest("authority-set"),
		"adjudicationPolicyDigest":         digest("adjudication-policy"),
		"ratingSignatureSetDigest":         signedRatingSetDigest,
		"independenceAttestationSetDigest": independenceSetDigest,
		"adjudicationDecisionSetDigest":    emptyDecisionSetDigest,
		"candidateAdjudications":           candidateAdjudications, "candidateAdjudicationSetDigest": candidateSetDigest,
		"adjudicationDigest": digest("adjudication"), "validatedAt": "2026-08-02T03:45:00.000Z",
	}
	validationDigest, err := canonicaljson.Digest(validation)
	if err != nil {
		t.Fatal(err)
	}
	validation["receiptDigest"] = validationDigest
	reviewPayload := map[string]any{
		"format": evaluationHumanReviewImportFormat, "version": 1,
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"blindBundleDigest": validation["blindBundleDigest"], "reviewLeaseDigest": reviewLeaseDigest,
		"blindedArtifactSetDigest":           blindedSetDigest,
		"randomizedPresentationPolicyDigest": validation["randomizedPresentationPolicyDigest"],
		"sourceProvenance":                   source, "signedRatings": []any{rating},
		"independenceAttestations": independence, "adjudicationDecisions": []any{},
		"validationReceipt": validation, "reviewedAt": "2026-08-02T03:40:00.000Z",
	}
	payloadDigest, err := canonicaljson.Digest(reviewPayload)
	if err != nil {
		t.Fatal(err)
	}
	authority := map[string]any{
		"authorityId": "authority.adjudicator", "keyId": "key.adjudicator",
		"workflowName": "g4-real-model-human-review", "workflowRunId": "123",
		"workflowRunAttempt": 1, "signedAt": "2026-08-02T03:45:00.000Z",
		"payloadDigest": payloadDigest, "signatureBase64Url": signature,
	}
	review := make(map[string]any, len(reviewPayload)+2)
	for key, value := range reviewPayload {
		review[key] = value
	}
	review["artifactAuthority"] = authority
	reviewArtifactDigest, err := canonicaljson.Digest(review)
	if err != nil {
		t.Fatal(err)
	}
	review["artifactDigest"] = reviewArtifactDigest
	normalizedRatingBase := map[string]any{
		"ratingId": "rating.1", "attemptId": "attempt.1", "reviewerPseudonym": "reviewer.one",
		"randomizedPresentationId": randomizedPresentationID, "rubricDigest": rubricDigest,
		"criterionVerdicts": criterionVerdicts, "verdict": "passed",
	}
	normalizedRatingDigest, err := canonicaljson.Digest(normalizedRatingBase)
	if err != nil {
		t.Fatal(err)
	}
	normalizedRatingBase["ratingDigest"] = normalizedRatingDigest
	report := map[string]any{
		"reportId": "human-review-report.1", "planDigest": plan.PlanDigest,
		"blindedArtifactSetDigest": blindedSetDigest, "ratings": []any{normalizedRatingBase},
		"adjudicationDigest": validation["adjudicationDigest"], "generatedAt": "2026-08-02T03:46:00.000Z",
	}
	reportDigest, err := canonicaljson.Digest(report)
	if err != nil {
		t.Fatal(err)
	}
	report["reportDigest"] = reportDigest
	reportFact, err := canonicaljson.Bytes(map[string]any{
		"wireVersion": 1, "factType": "evaluation-human-review-report", "value": report,
	})
	if err != nil {
		t.Fatal(err)
	}
	rubricBase := map[string]any{
		"format": "prodivix.g4-public-human-review-rubric", "version": 1,
		"rubricId": "rubric.public.visual", "title": "Public visual rubric",
		"criteria": []any{map[string]any{
			"criterionId": "visual-quality", "label": "Visual quality", "instruction": "Judge visible quality.", "required": true,
			"anchors": []any{
				map[string]any{"verdict": "failed", "label": "Failed", "description": "Visible quality failed."},
				map[string]any{"verdict": "passed", "label": "Passed", "description": "Visible quality passed."},
			},
		}},
		"metricMappings": []any{map[string]any{
			"metricId": "visual.human-quality", "criterionIds": []any{"visual-quality"}, "aggregation": "all-pass",
		}},
		"interRaterDisagreementMetricId": "visual.inter-rater-disagreement", "scale": "binary-pass-fail",
		"accessibilityInstructions": []any{"Judge only the supplied raster."},
	}
	rubricBase["rubricDigest"], err = canonicaljson.Digest(rubricBase)
	if err != nil {
		t.Fatal(err)
	}
	rubricDigest = rubricBase["rubricDigest"].(string)
	// Rewrite the already-created rating, receipt and report to the canonical rubric.
	rating["rubricDigest"] = rubricDigest
	delete(rating, "ratingDigest")
	delete(rating, "signatureBase64Url")
	ratingDigest, err = canonicaljson.Digest(rating)
	if err != nil {
		t.Fatal(err)
	}
	rating["ratingDigest"], rating["signatureBase64Url"] = ratingDigest, signature
	candidateAdjudications[0].(map[string]any)["rubricDigest"] = rubricDigest
	candidateAdjudications[0].(map[string]any)["ratingDigests"] = []any{ratingDigest}
	normalizedRatingBase["rubricDigest"] = rubricDigest
	delete(normalizedRatingBase, "ratingDigest")
	normalizedRatingDigest, err = canonicaljson.Digest(normalizedRatingBase)
	if err != nil {
		t.Fatal(err)
	}
	normalizedRatingBase["ratingDigest"] = normalizedRatingDigest
	// Rebuild all set/report digests affected by the canonical rubric replacement.
	validation["ratingSignatureSetDigest"], err = canonicaljson.Digest([]any{map[string]any{
		"ratingDigest": ratingDigest, "signatureBase64Url": signature,
	}})
	if err != nil {
		t.Fatal(err)
	}
	validation["candidateAdjudicationSetDigest"], err = canonicaljson.Digest(candidateAdjudications)
	if err != nil {
		t.Fatal(err)
	}
	delete(validation, "receiptDigest")
	validation["receiptDigest"], err = canonicaljson.Digest(validation)
	if err != nil {
		t.Fatal(err)
	}
	delete(reviewPayload, "artifactAuthority")
	delete(reviewPayload, "artifactDigest")
	payloadDigest, err = canonicaljson.Digest(reviewPayload)
	if err != nil {
		t.Fatal(err)
	}
	authority["payloadDigest"] = payloadDigest
	review = make(map[string]any, len(reviewPayload)+2)
	for key, value := range reviewPayload {
		review[key] = value
	}
	review["artifactAuthority"] = authority
	reviewArtifactDigest, err = canonicaljson.Digest(review)
	if err != nil {
		t.Fatal(err)
	}
	review["artifactDigest"] = reviewArtifactDigest
	delete(report, "reportDigest")
	report["ratings"] = []any{normalizedRatingBase}
	reportDigest, err = canonicaljson.Digest(report)
	if err != nil {
		t.Fatal(err)
	}
	report["reportDigest"] = reportDigest
	reportFact, err = canonicaljson.Bytes(map[string]any{
		"wireVersion": 1, "factType": "evaluation-human-review-report", "value": report,
	})
	if err != nil {
		t.Fatal(err)
	}
	independencePolicyDigest := digest("independence-policy")
	trustAuthorities := make([]any, 0, 3)
	for index, entry := range []struct {
		authorityID string
		pseudonym   string
		role        string
		keyID       string
	}{
		{"authority.adjudicator", "pseudonym.adjudicator", "adjudicator", "key.adjudicator"},
		{"authority.reviewer.1", "reviewer.one", "reviewer", "key.reviewer.1"},
		{"authority.reviewer.2", "reviewer.two", "reviewer", "key.reviewer.2"},
	} {
		trustAuthority := map[string]any{
			"authorityId": entry.authorityID, "pseudonym": entry.pseudonym, "role": entry.role, "keyId": entry.keyID,
			"publicKeyBase64Url": base64.RawURLEncoding.EncodeToString(bytes.Repeat([]byte{byte(index + 1)}, 32)),
			"validFrom":          "2026-01-01T00:00:00.000Z", "validUntil": "2030-01-01T00:00:00.000Z",
			"independencePolicyDigest": independencePolicyDigest,
		}
		trustAuthority["authorityDigest"], err = canonicaljson.Digest(trustAuthority)
		if err != nil {
			t.Fatal(err)
		}
		trustAuthorities = append(trustAuthorities, trustAuthority)
	}
	authorityDigests := make([]any, len(trustAuthorities))
	for index, raw := range trustAuthorities {
		authorityDigests[index] = raw.(map[string]any)["authorityDigest"]
	}
	trustRegistry := map[string]any{
		"format": "prodivix.g4-human-review-trust-registry", "version": 1,
		"registryId": "registry.public", "authorities": trustAuthorities,
	}
	trustRegistry["authoritySetDigest"], err = canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-human-review-authority-set", "version": int64(1), "authorityDigests": authorityDigests,
	})
	if err != nil {
		t.Fatal(err)
	}
	trustRegistry["registryDigest"], err = canonicaljson.Digest(trustRegistry)
	if err != nil {
		t.Fatal(err)
	}
	decisionPayloadFields := make([]any, len(evaluationHumanReviewDecisionPayloadFields))
	for index, field := range evaluationHumanReviewDecisionPayloadFields {
		decisionPayloadFields[index] = field
	}
	policy := map[string]any{
		"minimumIndependentRatings": 2, "reviewerAuthorityIds": []any{"authority.reviewer.1", "authority.reviewer.2"},
		"adjudicationAuthorityId": "authority.adjudicator", "adjudicatorKeyId": "key.adjudicator",
		"trigger": "reviewer-disagreement", "trustRegistryDigest": trustRegistry["registryDigest"],
		"independencePolicyDigest": independencePolicyDigest, "consensusRule": "unanimous",
		"disagreementRule": "escalate-to-independent-adjudicator", "reviewerRatingSignaturesRequired": true,
		"adjudicatorDecisionSignatureRequired": true, "signatureAlgorithm": "Ed25519",
		"decisionPayloadFields": decisionPayloadFields,
	}
	policy["policyDigest"], err = canonicaljson.Digest(policy)
	if err != nil {
		t.Fatal(err)
	}
	validation["trustRegistryDigest"] = trustRegistry["registryDigest"]
	validation["authoritySetDigest"] = trustRegistry["authoritySetDigest"]
	validation["adjudicationPolicyDigest"] = policy["policyDigest"]
	delete(validation, "receiptDigest")
	validation["receiptDigest"], err = canonicaljson.Digest(validation)
	if err != nil {
		t.Fatal(err)
	}
	// The receipt mutation changes the signed wrapper payload.
	payloadDigest, err = canonicaljson.Digest(reviewPayload)
	if err != nil {
		t.Fatal(err)
	}
	authority["payloadDigest"] = payloadDigest
	review = make(map[string]any, len(reviewPayload)+2)
	for key, value := range reviewPayload {
		review[key] = value
	}
	review["artifactAuthority"] = authority
	reviewArtifactDigest, err = canonicaljson.Digest(review)
	if err != nil {
		t.Fatal(err)
	}
	review["artifactDigest"] = reviewArtifactDigest
	outer := map[string]any{
		"format": evaluationValidatedHumanReviewFormat, "version": 1,
		"artifactId": "validated-human-review:" + strings.TrimPrefix(reviewArtifactDigest, "sha256-"),
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"reviewArtifact": review, "reviewArtifactDigest": reviewArtifactDigest,
		"reviewLeaseDigest":       reviewLeaseDigest,
		"humanReviewReportDigest": reportDigest, "publicRubrics": []any{rubricBase},
		"trustRegistry": trustRegistry, "adjudicationPolicy": policy,
		"validatedAt": validation["validatedAt"],
	}
	outerDigest, err := canonicaljson.Digest(outer)
	if err != nil {
		t.Fatal(err)
	}
	outer["artifactDigest"] = outerDigest
	artifactBytes, err := canonicaljson.Bytes(outer)
	if err != nil {
		t.Fatal(err)
	}
	return artifactBytes, reportFact
}

func TestDecodeEvaluationValidatedHumanReviewArtifactMatchesNormalizedReport(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	artifactBytes, reportFactBytes := evaluationValidatedHumanReviewFixture(t, plan)
	artifact, err := decodeEvaluationValidatedHumanReviewArtifact(artifactBytes)
	if err != nil {
		t.Fatal(err)
	}
	report, err := decodeEvaluationArtifact(reportFactBytes, "evaluation-human-review-report")
	if err != nil {
		t.Fatal(err)
	}
	if err := validateEvaluationValidatedHumanReviewReport(&artifact, report); err != nil {
		t.Fatal(err)
	}
	if artifact.HumanReviewReportID != "human-review-report.1" ||
		artifact.ReviewLeaseDigest == "" ||
		artifact.HumanReviewReportDigest != report.FactDigest ||
		!bytes.Equal(artifact.HumanReviewReportFactBytes, reportFactBytes) {
		t.Fatalf("validated human review binding = %#v", artifact.EvaluationValidatedHumanReviewArtifactRecord)
	}
}

func TestDecodeEvaluationValidatedHumanReviewArtifactRejectsRawIdentityPreimage(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	artifactBytes, _ := evaluationValidatedHumanReviewFixture(t, plan)
	var artifact map[string]any
	if err := json.Unmarshal(artifactBytes, &artifact); err != nil {
		t.Fatal(err)
	}
	review := artifact["reviewArtifact"].(map[string]any)
	review["modelId"] = "forbidden-model-preimage"
	mutated, err := canonicaljson.Bytes(artifact)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationValidatedHumanReviewArtifact(mutated); !errors.Is(err, ErrInvalid) {
		t.Fatalf("raw identity preimage error = %v, want ErrInvalid", err)
	}
}

func TestDecodeEvaluationValidatedHumanReviewArtifactRejectsReviewLeaseDrift(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	artifactBytes, _ := evaluationValidatedHumanReviewFixture(t, plan)
	var artifact map[string]any
	if err := json.Unmarshal(artifactBytes, &artifact); err != nil {
		t.Fatal(err)
	}
	artifact["reviewLeaseDigest"] = evaluationFixtureDigest(t, "drifted-review-lease")
	delete(artifact, "artifactDigest")
	artifact["artifactDigest"], err = canonicaljson.Digest(artifact)
	if err != nil {
		t.Fatal(err)
	}
	mutated, err := canonicaljson.Bytes(artifact)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationValidatedHumanReviewArtifact(mutated); !errors.Is(err, ErrInvalid) {
		t.Fatalf("review lease drift error = %v, want ErrInvalid", err)
	}
}

func TestEvaluationValidatedHumanReviewLeasePresenceIsExact(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	artifactBytes, reportFactBytes := evaluationValidatedHumanReviewFixture(t, plan)
	artifact, err := decodeEvaluationValidatedHumanReviewArtifact(artifactBytes)
	if err != nil {
		t.Fatal(err)
	}
	report, err := decodeEvaluationArtifact(reportFactBytes, "evaluation-human-review-report")
	if err != nil || validateEvaluationValidatedHumanReviewReport(&artifact, report) != nil {
		t.Fatalf("decode report = %v", err)
	}
	record := artifact.EvaluationValidatedHumanReviewArtifactRecord
	record.ValidatedHumanMetricObservationBytes = []byte("[]")
	record.ValidatedHumanMetricObservationSetDigest, err = canonicaljson.Digest(map[string]any{
		"validatedHumanMetricObservationDigests": []string{},
	})
	if err != nil {
		t.Fatal(err)
	}
	reportRecord := EvaluationArtifactRecord{EvaluationFactRecord: EvaluationFactRecord{
		PlanDigest: report.PlanDigest, FactType: report.FactType, FactID: report.FactID,
		FactDigest: report.FactDigest, FactBytes: append([]byte(nil), report.Canonical...),
	}}
	leaseDigest, err := evaluationValidatedHumanReviewLeaseDigest([]EvaluationArtifactRecord{reportRecord}, &record)
	if err != nil || leaseDigest != record.ReviewLeaseDigest {
		t.Fatalf("review lease binding = %q err=%v", leaseDigest, err)
	}

	record.ReviewLeaseDigest = ""
	if _, err := evaluationValidatedHumanReviewLeaseDigest([]EvaluationArtifactRecord{reportRecord}, &record); !errors.Is(err, ErrConflict) {
		t.Fatalf("missing review lease error = %v, want ErrConflict", err)
	}
	if leaseDigest, err := evaluationValidatedHumanReviewLeaseDigest(nil, nil); err != nil || leaseDigest != "" {
		t.Fatalf("no-human-review lease binding = %q err=%v", leaseDigest, err)
	}
}
