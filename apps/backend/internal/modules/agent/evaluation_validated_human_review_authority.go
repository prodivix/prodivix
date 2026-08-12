package agent

import (
	"context"
	"crypto/ed25519"
	"database/sql"
	"encoding/base64"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationHumanReviewCanonicalEqual(left, right any) bool {
	leftDigest, leftErr := canonicaljson.Digest(left)
	rightDigest, rightErr := canonicaljson.Digest(right)
	return leftErr == nil && rightErr == nil && leftDigest == rightDigest
}

func evaluationHumanReviewAuthorityByID(registry map[string]any) map[string]map[string]any {
	result := make(map[string]map[string]any)
	authorities, _ := registry["authorities"].([]any)
	for _, raw := range authorities {
		authority, ok := raw.(map[string]any)
		if ok {
			result[stringMember(authority, "authorityId")] = authority
		}
	}
	return result
}

func evaluationHumanReviewAuthorityAt(
	authorities map[string]map[string]any,
	authorityID, keyID, role string,
	at time.Time,
) (map[string]any, error) {
	authority := authorities[authorityID]
	validFrom, fromErr := instantMember(authority, "validFrom")
	validUntil, untilErr := instantMember(authority, "validUntil")
	if authority == nil || authority["keyId"] != keyID || authority["role"] != role || fromErr != nil || untilErr != nil ||
		at.Before(validFrom) || at.After(validUntil) {
		return nil, ErrUnauthorized
	}
	return authority, nil
}

func evaluationHumanReviewVerifySignature(
	authority map[string]any,
	payload map[string]any,
	digestField, digest, signatureText string,
) error {
	publicKey, publicErr := base64.RawURLEncoding.DecodeString(stringMember(authority, "publicKeyBase64Url"))
	signature, signatureErr := base64.RawURLEncoding.DecodeString(signatureText)
	defer clear(publicKey)
	defer clear(signature)
	if publicErr != nil || signatureErr != nil || len(publicKey) != ed25519.PublicKeySize || len(signature) != ed25519.SignatureSize ||
		base64.RawURLEncoding.EncodeToString(publicKey) != stringMember(authority, "publicKeyBase64Url") ||
		base64.RawURLEncoding.EncodeToString(signature) != signatureText {
		return ErrUnauthorized
	}
	messageValue := make(map[string]any, len(payload)+1)
	for key, value := range payload {
		messageValue[key] = value
	}
	messageValue[digestField] = digest
	message, err := canonicaljson.Bytes(messageValue)
	if err != nil {
		return err
	}
	defer clear(message)
	if !ed25519.Verify(ed25519.PublicKey(publicKey), message, signature) {
		return ErrUnauthorized
	}
	return nil
}

func evaluationHumanReviewVerifyWrapperSignature(
	authority map[string]any,
	review map[string]any,
) error {
	payload := make(map[string]any, len(review)-2)
	for key, value := range review {
		if key != "artifactAuthority" && key != "artifactDigest" {
			payload[key] = value
		}
	}
	signature := review["artifactAuthority"].(map[string]any)["signatureBase64Url"]
	publicKey, publicErr := base64.RawURLEncoding.DecodeString(stringMember(authority, "publicKeyBase64Url"))
	signatureBytes, signatureErr := base64.RawURLEncoding.DecodeString(signature.(string))
	defer clear(publicKey)
	defer clear(signatureBytes)
	message, messageErr := canonicaljson.Bytes(payload)
	defer clear(message)
	if publicErr != nil || signatureErr != nil || messageErr != nil || len(publicKey) != ed25519.PublicKeySize ||
		len(signatureBytes) != ed25519.SignatureSize || !ed25519.Verify(ed25519.PublicKey(publicKey), message, signatureBytes) {
		return ErrUnauthorized
	}
	return nil
}

func evaluationHumanReviewPayload(value map[string]any, digestField string) map[string]any {
	payload := make(map[string]any, len(value)-2)
	for key, entry := range value {
		if key != digestField && key != "signatureBase64Url" {
			payload[key] = entry
		}
	}
	return payload
}

func evaluationHumanReviewRequiredCriterionIDs(rubric map[string]any) ([]string, error) {
	criteria, ok := rubric["criteria"].([]any)
	if !ok {
		return nil, conflict("evaluation human review rubric criteria are unavailable")
	}
	result := make([]string, 0, len(criteria))
	for _, raw := range criteria {
		criterion := raw.(map[string]any)
		if required, _ := criterion["required"].(bool); required {
			result = append(result, stringMember(criterion, "criterionId"))
		}
	}
	if len(result) == 0 {
		return nil, conflict("evaluation human review rubric has no required criterion")
	}
	return result, nil
}

func evaluationHumanReviewCriterionVerdictMap(value any, expected []string) (map[string]string, error) {
	raw, _, err := validateEvaluationHumanReviewCriterionVerdicts(value, "criterion verdict authority")
	if err != nil || len(raw) != len(expected) {
		return nil, conflict("evaluation human review criterion verdict coverage drifted")
	}
	result := make(map[string]string, len(raw))
	for index, entry := range raw {
		verdict := entry.(map[string]any)
		criterionID := stringMember(verdict, "criterionId")
		if criterionID != expected[index] {
			return nil, conflict("evaluation human review criterion verdict authority drifted")
		}
		result[criterionID] = stringMember(verdict, "verdict")
	}
	return result, nil
}

func evaluationHumanReviewTestedOwnerSetDigest(plan evaluationPlanFact) (string, error) {
	raw, ok := plan.Value["modelConfigurations"].([]any)
	if !ok {
		return "", conflict("evaluation human review tested owner set is unavailable")
	}
	owners := make([]string, len(raw))
	for index, entry := range raw {
		owners[index] = stringMember(entry.(map[string]any), "modelFamilyOwnerId")
	}
	sort.Strings(owners)
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-tested-model-family-owner-set", "version": int64(1), "ownerIds": owners,
	})
}

func evaluationHumanReviewEmptyConflictOwnerSetDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-conflict-model-family-owner-set", "version": int64(1), "ownerIds": []string{},
	})
}

func validateEvaluationHumanReviewCryptographicAuthority(
	plan evaluationPlanFact,
	frozen EvaluationHumanReviewFrozenAuthority,
	artifact evaluationValidatedHumanReviewArtifact,
	report evaluationArtifactFact,
) error {
	if !evaluationHumanReviewCanonicalEqual(artifact.Value["publicRubrics"], frozen.PublicRubrics) ||
		!evaluationHumanReviewCanonicalEqual(artifact.Value["trustRegistry"], frozen.TrustRegistry) ||
		!evaluationHumanReviewCanonicalEqual(artifact.Value["adjudicationPolicy"], frozen.AdjudicationPolicy) {
		return conflict("evaluation validated human review escaped frozen trust")
	}
	review := artifact.ReviewArtifact
	receipt := review["validationReceipt"].(map[string]any)
	if review["planDigest"] != plan.PlanDigest || review["repositoryCommit"] != plan.RepositoryCommit ||
		review["randomizedPresentationPolicyDigest"] != plan.Value["graderPlan"].(map[string]any)["randomizedPresentationPolicyDigest"] ||
		receipt["receiptId"] != "human-review-validation:"+strings.TrimPrefix(stringMember(receipt, "submissionDigest"), "sha256-") {
		return conflict("evaluation human review receipt partition drifted")
	}
	validatedAt, validatedErr := instantMember(receipt, "validatedAt")
	if validatedErr != nil || validatedAt.After(plan.ExpiresAt) {
		return conflict("evaluation human review validation escaped the plan window")
	}
	authorities := evaluationHumanReviewAuthorityByID(frozen.TrustRegistry)
	policy := frozen.AdjudicationPolicy
	rubricByDigest := make(map[string]map[string]any, len(frozen.PublicRubrics))
	for _, rubric := range frozen.PublicRubrics {
		rubricByDigest[stringMember(rubric, "rubricDigest")] = rubric
	}
	wrapper := review["artifactAuthority"].(map[string]any)
	wrapperTime, wrapperTimeErr := instantMember(wrapper, "signedAt")
	wrapperAuthority, wrapperErr := evaluationHumanReviewAuthorityAt(
		authorities, stringMember(wrapper, "authorityId"), stringMember(wrapper, "keyId"), "adjudicator", wrapperTime,
	)
	if wrapperTimeErr != nil || wrapperErr != nil || !wrapperTime.Equal(validatedAt) ||
		wrapper["authorityId"] != policy["adjudicationAuthorityId"] ||
		evaluationHumanReviewVerifyWrapperSignature(wrapperAuthority, review) != nil {
		return ErrUnauthorized
	}
	policyReviewerIDs, err := evaluationHumanReviewCanonicalStringSet(policy["reviewerAuthorityIds"], false, "policy reviewer authorities")
	if err != nil {
		return err
	}
	allowedReviewers := make(map[string]struct{}, len(policyReviewerIDs))
	for _, authorityID := range policyReviewerIDs {
		allowedReviewers[authorityID] = struct{}{}
	}
	ratingsByPresentation := make(map[string][]map[string]any)
	participants := make(map[string]struct{})
	ratingIDs := make(map[string]struct{})
	for _, raw := range review["signedRatings"].([]any) {
		rating := raw.(map[string]any)
		ratedAt, timeErr := instantMember(rating, "ratedAt")
		authority, authorityErr := evaluationHumanReviewAuthorityAt(
			authorities, stringMember(rating, "reviewerAuthorityId"), stringMember(rating, "keyId"), "reviewer", ratedAt,
		)
		rubric := rubricByDigest[stringMember(rating, "rubricDigest")]
		required, requiredErr := evaluationHumanReviewRequiredCriterionIDs(rubric)
		if timeErr != nil || authorityErr != nil || requiredErr != nil || ratedAt.After(validatedAt) ||
			rating["reviewerPseudonym"] != authority["pseudonym"] || rating["blindedArtifactSetDigest"] != review["blindedArtifactSetDigest"] {
			return ErrUnauthorized
		}
		if _, allowed := allowedReviewers[stringMember(rating, "reviewerAuthorityId")]; !allowed {
			return ErrUnauthorized
		}
		if _, duplicate := ratingIDs[stringMember(rating, "ratingId")]; duplicate {
			return conflict("evaluation human review rating identity is duplicated")
		}
		if _, err := evaluationHumanReviewCriterionVerdictMap(rating["criterionVerdicts"], required); err != nil {
			return err
		}
		if err := evaluationHumanReviewVerifySignature(
			authority, evaluationHumanReviewPayload(rating, "ratingDigest"), "ratingDigest",
			stringMember(rating, "ratingDigest"), stringMember(rating, "signatureBase64Url"),
		); err != nil {
			return err
		}
		ratingIDs[stringMember(rating, "ratingId")] = struct{}{}
		participants[stringMember(rating, "reviewerAuthorityId")] = struct{}{}
		presentationID := stringMember(rating, "randomizedPresentationId")
		ratingsByPresentation[presentationID] = append(ratingsByPresentation[presentationID], rating)
	}
	decisionsByPresentation := make(map[string]map[string]any)
	for _, raw := range review["adjudicationDecisions"].([]any) {
		decision := raw.(map[string]any)
		presentationID := stringMember(decision, "randomizedPresentationId")
		if _, duplicate := decisionsByPresentation[presentationID]; duplicate {
			return conflict("evaluation human review decision is duplicated")
		}
		decisionsByPresentation[presentationID] = decision
	}
	candidates := receipt["candidateAdjudications"].([]any)
	seenCandidates := make(map[string]struct{}, len(candidates))
	decisionCount := 0
	minimum, _ := integerMember(policy, "minimumIndependentRatings")
	for _, raw := range candidates {
		candidate := raw.(map[string]any)
		presentationID := stringMember(candidate, "randomizedPresentationId")
		if _, duplicate := seenCandidates[presentationID]; duplicate {
			return conflict("evaluation human review candidate adjudication is duplicated")
		}
		seenCandidates[presentationID] = struct{}{}
		ratings := ratingsByPresentation[presentationID]
		rubric := rubricByDigest[stringMember(candidate, "rubricDigest")]
		required, requiredErr := evaluationHumanReviewRequiredCriterionIDs(rubric)
		if requiredErr != nil || int64(len(ratings)) < minimum {
			return conflict("evaluation human review candidate rating coverage is incomplete")
		}
		ratingDigests := make([]string, len(ratings))
		reviewerIDs := make([]string, len(ratings))
		criterionValues := make(map[string]map[string]struct{}, len(required))
		latestRating := time.Time{}
		for index, rating := range ratings {
			if rating["rubricDigest"] != candidate["rubricDigest"] {
				return conflict("evaluation human review candidate rubric drifted")
			}
			ratingDigests[index] = stringMember(rating, "ratingDigest")
			reviewerIDs[index] = stringMember(rating, "reviewerAuthorityId")
			ratedAt, _ := instantMember(rating, "ratedAt")
			if ratedAt.After(latestRating) {
				latestRating = ratedAt
			}
			verdicts, err := evaluationHumanReviewCriterionVerdictMap(rating["criterionVerdicts"], required)
			if err != nil {
				return err
			}
			for criterionID, verdict := range verdicts {
				if criterionValues[criterionID] == nil {
					criterionValues[criterionID] = make(map[string]struct{})
				}
				criterionValues[criterionID][verdict] = struct{}{}
			}
		}
		sort.Strings(ratingDigests)
		sort.Strings(reviewerIDs)
		if len(reviewerIDs) != len(uniqueEvaluationStrings(reviewerIDs)) ||
			!evaluationHumanReviewCanonicalEqual(candidate["ratingDigests"], ratingDigests) ||
			!evaluationHumanReviewCanonicalEqual(candidate["reviewerAuthorityIds"], reviewerIDs) {
			return conflict("evaluation human review candidate rating authority drifted")
		}
		if _, err := evaluationHumanReviewCriterionVerdictMap(candidate["criterionVerdicts"], required); err != nil {
			return err
		}
		hasDisagreement := false
		for _, criterionID := range required {
			hasDisagreement = hasDisagreement || len(criterionValues[criterionID]) > 1
		}
		decision := decisionsByPresentation[presentationID]
		if !hasDisagreement {
			if decision != nil || candidate["decisionDigest"] != nil ||
				!evaluationHumanReviewCanonicalEqual(candidate["criterionVerdicts"], ratings[0]["criterionVerdicts"]) {
				return conflict("evaluation human review unanimous candidate was adjudicated")
			}
		} else {
			if decision == nil || candidate["decisionDigest"] != decision["decisionDigest"] ||
				candidate["verdict"] != decision["decision"] || candidate["candidateDigest"] != decision["candidateDigest"] ||
				candidate["rubricDigest"] != decision["rubricDigest"] ||
				!evaluationHumanReviewCanonicalEqual(candidate["criterionVerdicts"], decision["criterionVerdicts"]) ||
				decision["blindedArtifactSetDigest"] != review["blindedArtifactSetDigest"] || decision["planDigest"] != plan.PlanDigest ||
				decision["policyDigest"] != policy["policyDigest"] || decision["adjudicationAuthorityId"] != policy["adjudicationAuthorityId"] ||
				!evaluationHumanReviewCanonicalEqual(decision["ratingDigests"], ratingDigests) ||
				!evaluationHumanReviewCanonicalEqual(decision["reviewerAuthorityIds"], reviewerIDs) {
				return conflict("evaluation human review adjudication drifted")
			}
			decidedAt, decidedErr := instantMember(decision, "decidedAt")
			decisionAuthority, authorityErr := evaluationHumanReviewAuthorityAt(
				authorities, stringMember(decision, "adjudicationAuthorityId"), stringMember(decision, "keyId"), "adjudicator", decidedAt,
			)
			if decidedErr != nil || authorityErr != nil || decidedAt.Before(latestRating) || decidedAt.After(validatedAt) ||
				decision["adjudicatorPseudonym"] != decisionAuthority["pseudonym"] {
				return ErrUnauthorized
			}
			if err := evaluationHumanReviewVerifySignature(
				decisionAuthority, evaluationHumanReviewPayload(decision, "decisionDigest"), "decisionDigest",
				stringMember(decision, "decisionDigest"), stringMember(decision, "signatureBase64Url"),
			); err != nil {
				return err
			}
			participants[stringMember(decision, "adjudicationAuthorityId")] = struct{}{}
			decisionCount++
		}
	}
	if len(seenCandidates) != len(ratingsByPresentation) || decisionCount != len(decisionsByPresentation) {
		return conflict("evaluation human review authority coverage is incomplete")
	}
	wantAdjudicationDigest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-human-review-adjudication-set", "version": int64(1),
		"policyDigest": policy["policyDigest"], "candidates": candidates,
	})
	if err != nil || receipt["adjudicationDigest"] != wantAdjudicationDigest {
		return conflict("evaluation human review adjudication set drifted")
	}
	attestationsByAuthority := make(map[string]map[string]any)
	for _, raw := range review["independenceAttestations"].([]any) {
		attestation := raw.(map[string]any)
		authorityID := stringMember(attestation, "authorityId")
		if _, duplicate := attestationsByAuthority[authorityID]; duplicate {
			return conflict("evaluation human review independence authority is duplicated")
		}
		attestationsByAuthority[authorityID] = attestation
	}
	testedOwnerDigest, err := evaluationHumanReviewTestedOwnerSetDigest(plan)
	if err != nil {
		return err
	}
	emptyConflictDigest, err := evaluationHumanReviewEmptyConflictOwnerSetDigest()
	if err != nil {
		return err
	}
	for authorityID := range participants {
		attestation := attestationsByAuthority[authorityID]
		issuedAt, issuedErr := instantMember(attestation, "issuedAt")
		expiresAt, expiresErr := instantMember(attestation, "expiresAt")
		attestationAuthority, authorityErr := evaluationHumanReviewAuthorityAt(
			authorities, authorityID, stringMember(attestation, "keyId"), stringMember(attestation, "role"), issuedAt,
		)
		if attestation == nil || issuedErr != nil || expiresErr != nil || authorityErr != nil || issuedAt.Before(plan.PlannedAt) ||
			!expiresAt.After(validatedAt) || attestation["planDigest"] != plan.PlanDigest ||
			attestation["blindedArtifactSetDigest"] != review["blindedArtifactSetDigest"] ||
			attestation["authorityPseudonym"] != attestationAuthority["pseudonym"] ||
			attestation["independencePolicyDigest"] != policy["independencePolicyDigest"] ||
			attestation["testedModelFamilyOwnerSetDigest"] != testedOwnerDigest ||
			attestation["conflictModelFamilyOwnerSetDigest"] != emptyConflictDigest {
			return ErrUnauthorized
		}
		if err := evaluationHumanReviewVerifySignature(
			attestationAuthority, evaluationHumanReviewPayload(attestation, "attestationDigest"), "attestationDigest",
			stringMember(attestation, "attestationDigest"), stringMember(attestation, "signatureBase64Url"),
		); err != nil {
			return err
		}
	}
	if len(attestationsByAuthority) != len(participants) {
		return conflict("evaluation human review independence coverage drifted")
	}
	return validateEvaluationValidatedHumanReviewReport(&artifact, report)
}

func uniqueEvaluationStrings(values []string) []string {
	result := make([]string, 0, len(values))
	for _, value := range values {
		if len(result) == 0 || result[len(result)-1] != value {
			result = append(result, value)
		}
	}
	return result
}

func evaluationHumanReviewBlindCandidateDigest(
	mapping EvaluationBlindReviewMappingRecord,
	candidate EvaluationReviewCandidateRecord,
) (string, error) {
	decoded, err := decodeEvaluationArtifact(candidate.CandidateBytes, evaluationReviewCandidateFactType)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(map[string]any{
		"randomizedPresentationId": mapping.RandomizedPresentationID,
		"rubricDigest":             mapping.RubricDigest,
		"mediaType":                candidate.MediaType,
		"width":                    candidate.Width,
		"height":                   candidate.Height,
		"bytesBase64":              decoded.Value["bytesBase64"],
		"bytesDigest":              candidate.BytesDigest,
		"byteLength":               candidate.ByteLength,
	})
}

func validateEvaluationHumanReviewDurableBindings(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
	evidence evaluationReviewLeaseEvidence,
	artifact evaluationValidatedHumanReviewArtifact,
	report evaluationArtifactFact,
) error {
	mappingByPresentation := make(map[string]EvaluationBlindReviewMappingRecord, len(evidence.Mappings))
	for _, mapping := range evidence.Mappings {
		if _, duplicate := mappingByPresentation[mapping.RandomizedPresentationID]; duplicate {
			return conflict("evaluation human review mapping presentation is duplicated")
		}
		mappingByPresentation[mapping.RandomizedPresentationID] = mapping
	}
	candidateAdjudications := artifact.ReviewArtifact["validationReceipt"].(map[string]any)["candidateAdjudications"].([]any)
	if len(candidateAdjudications) != len(mappingByPresentation) {
		return conflict("evaluation human review candidate mapping coverage is incomplete")
	}
	blindedSet := make([]map[string]any, 0, len(evidence.Mappings))
	for _, raw := range candidateAdjudications {
		adjudication := raw.(map[string]any)
		mapping, exists := mappingByPresentation[stringMember(adjudication, "randomizedPresentationId")]
		if !exists || adjudication["rubricDigest"] != mapping.RubricDigest {
			return conflict("evaluation human review candidate mapping drifted")
		}
		candidate, err := loadEvaluationReviewCandidate(ctx, tx, namespaceID, partition, mapping.AttemptID)
		if err != nil {
			return err
		}
		blindDigest, err := evaluationHumanReviewBlindCandidateDigest(mapping, candidate)
		if err != nil || blindDigest != stringMember(adjudication, "candidateDigest") {
			return conflict("evaluation human review blinded candidate digest drifted")
		}
		blindedSet = append(blindedSet, map[string]any{
			"randomizedPresentationId": mapping.RandomizedPresentationID,
			"rubricDigest":             mapping.RubricDigest, "artifactDigest": mapping.BytesDigest,
		})
	}
	sort.Slice(blindedSet, func(left, right int) bool {
		return stringMember(blindedSet[left], "randomizedPresentationId") < stringMember(blindedSet[right], "randomizedPresentationId")
	})
	blindedSetDigest, err := canonicaljson.Digest(blindedSet)
	if err != nil || blindedSetDigest != artifact.BlindedArtifactSetDigest {
		return conflict("evaluation human review blinded artifact set drifted")
	}
	ratings, _ := report.Value["ratings"].([]any)
	signedRatings, _ := artifact.ReviewArtifact["signedRatings"].([]any)
	signedByID := make(map[string]map[string]any, len(signedRatings))
	for _, raw := range signedRatings {
		signed := raw.(map[string]any)
		signedByID[stringMember(signed, "ratingId")] = signed
	}
	caseTargetReviewers := make(map[string]map[string]struct{})
	for _, raw := range ratings {
		rating := raw.(map[string]any)
		signed := signedByID[stringMember(rating, "ratingId")]
		mapping, exists := mappingByPresentation[stringMember(rating, "randomizedPresentationId")]
		if signed == nil || !exists || rating["attemptId"] != mapping.AttemptID || rating["rubricDigest"] != mapping.RubricDigest ||
			!evaluationHumanReviewCanonicalEqual(rating["criterionVerdicts"], signed["criterionVerdicts"]) {
			return conflict("evaluation human review normalized rating mapping drifted")
		}
		attempt := evaluationAttemptFact{}
		for _, candidateAttempt := range evidence.Attempts {
			if candidateAttempt.FactID == mapping.AttemptID {
				attempt, err = decodeEvaluationAttempt(candidateAttempt.FactBytes)
				break
			}
		}
		if err != nil || attempt.AttemptID == "" {
			return conflict("evaluation human review rating attempt is unavailable")
		}
		key := attempt.CaseID + "\x00" + attempt.TargetID
		if caseTargetReviewers[key] == nil {
			caseTargetReviewers[key] = make(map[string]struct{})
		}
		reviewer := stringMember(rating, "reviewerPseudonym")
		if _, duplicate := caseTargetReviewers[key][reviewer]; duplicate {
			return conflict("evaluation human review reviewer assignment is duplicated")
		}
		caseTargetReviewers[key][reviewer] = struct{}{}
	}
	minimum, _ := integerMember(plan.Value["graderPlan"].(map[string]any), "minimumIndependentVisualRatings")
	for _, attemptRecord := range evidence.Attempts {
		attempt, err := decodeEvaluationAttempt(attemptRecord.FactBytes)
		if err != nil || int64(len(caseTargetReviewers[attempt.CaseID+"\x00"+attempt.TargetID])) < minimum {
			return conflict("evaluation human review independent reviewer coverage is incomplete")
		}
	}
	return nil
}
