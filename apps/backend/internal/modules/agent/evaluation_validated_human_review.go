package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationValidatedHumanReviewFormat       = "prodivix.agent-evaluation-validated-human-review-artifact"
	evaluationHumanReviewImportFormat          = "prodivix.g4-model-evaluation-human-review-import"
	maximumEvaluationHumanReviewArtifactBytes  = 16_777_216
	maximumEvaluationValidatedHumanReviewBytes = 16_842_752
)

var evaluationHumanReviewIdentityPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$`)
var evaluationHumanReviewGitHubDigestPattern = regexp.MustCompile(`^sha256:[a-f0-9]{64}$`)

var evaluationHumanReviewDecisionPayloadFields = []string{
	"adjudicationAuthorityId", "adjudicatorPseudonym", "blindedArtifactSetDigest", "candidateDigest",
	"criterionVerdicts", "decidedAt", "decision", "decisionId", "format", "keyId", "planDigest",
	"policyDigest", "randomizedPresentationId", "ratingDigests", "reviewerAuthorityIds", "rubricDigest", "version",
}

type EvaluationValidatedHumanReviewArtifactRecord struct {
	NamespaceID                              string
	PlanDigest                               string
	RepositoryCommit                         string
	ArtifactID                               string
	ReviewArtifactDigest                     string
	ReviewLeaseDigest                        string
	HumanReviewReportID                      string
	HumanReviewReportDigest                  string
	BlindedArtifactSetDigest                 string
	AdjudicationDigest                       string
	ValidatedAt                              time.Time
	ArtifactDigest                           string
	ArtifactBytes                            []byte
	HumanReviewReportFactBytes               []byte
	ValidatedHumanMetricObservations         []map[string]any
	ValidatedHumanMetricObservationBytes     []byte
	ValidatedHumanMetricObservationSetDigest string
}

type evaluationValidatedHumanReviewArtifact struct {
	EvaluationValidatedHumanReviewArtifactRecord
	Value          map[string]any
	ReviewArtifact map[string]any
}

func decodeEvaluationCanonicalObjectWithLimit(source []byte, maximum int) (map[string]any, []byte, error) {
	if err := canonicaljson.ValidateRawEnvelope(source, maximum); err != nil {
		return nil, nil, invalid("evaluation canonical JSON is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil || value == nil {
		return nil, nil, invalid("evaluation canonical JSON is malformed")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return nil, nil, invalid("evaluation canonical JSON has trailing data")
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) {
		return nil, nil, invalid("evaluation canonical JSON is not canonical")
	}
	return value, canonical, nil
}

func evaluationHumanReviewIdentity(value any, name string) (string, error) {
	text, ok := value.(string)
	if !ok || !evaluationHumanReviewIdentityPattern.MatchString(text) || evaluationAuthenticityCredentialPattern.MatchString(text) {
		return "", invalid("evaluation human review " + name + " is invalid")
	}
	return text, nil
}

func evaluationHumanReviewDigest(value any, name string) (string, error) {
	return evaluationAuthenticityDigest(value, "human review "+name)
}

func evaluationHumanReviewSignature(value any, name string) error {
	text, ok := value.(string)
	if !ok || !evaluationCanonicalBase64URL(text, 64) {
		return invalid("evaluation human review " + name + " is invalid")
	}
	return nil
}

func evaluationHumanReviewPositiveInteger(value any, name string) (int64, error) {
	count, err := evaluationCount(value, "evaluation human review "+name)
	if err != nil || count < 1 {
		return 0, invalid("evaluation human review " + name + " is invalid")
	}
	return count, nil
}

func evaluationHumanReviewDigestMatch(value map[string]any, digestField string, excluded ...string) error {
	digest, err := evaluationHumanReviewDigest(value[digestField], digestField)
	if err != nil {
		return err
	}
	exclusions := map[string]struct{}{digestField: {}}
	for _, field := range excluded {
		exclusions[field] = struct{}{}
	}
	base := make(map[string]any, len(value)-len(exclusions))
	for key, entry := range value {
		if _, excluded := exclusions[key]; !excluded {
			base[key] = entry
		}
	}
	computed, err := canonicaljson.Digest(base)
	if err != nil || computed != digest {
		return invalid("evaluation human review " + digestField + " drifted")
	}
	return nil
}

func evaluationHumanReviewCanonicalStringSet(value any, digestValues bool, name string) ([]string, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) < 1 || len(raw) > 16_384 {
		return nil, invalid("evaluation human review " + name + " is invalid")
	}
	result := make([]string, len(raw))
	seen := make(map[string]struct{}, len(raw))
	for index, entry := range raw {
		var text string
		var err error
		if digestValues {
			text, err = evaluationHumanReviewDigest(entry, name)
		} else {
			text, err = evaluationHumanReviewIdentity(entry, name)
		}
		if err != nil || (index > 0 && result[index-1] >= text) {
			return nil, invalid("evaluation human review " + name + " is non-canonical")
		}
		if _, duplicate := seen[text]; duplicate {
			return nil, invalid("evaluation human review " + name + " is duplicated")
		}
		seen[text], result[index] = struct{}{}, text
	}
	return result, nil
}

func validateEvaluationHumanReviewCriterionVerdicts(value any, name string) ([]any, string, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) < 1 || len(raw) > 32 {
		return nil, "", invalid("evaluation human review " + name + " is invalid")
	}
	previous := ""
	allPassed := true
	for index, entry := range raw {
		verdict, ok := entry.(map[string]any)
		if !ok || !exactEvaluationKeys(verdict, []string{"criterionId", "verdict"}) ||
			!oneOfString(stringMember(verdict, "verdict"), "failed", "passed") {
			return nil, "", invalid("evaluation human review " + name + " is invalid")
		}
		criterionID, err := evaluationHumanReviewIdentity(verdict["criterionId"], "criterion id")
		if err != nil || (index > 0 && previous >= criterionID) {
			return nil, "", invalid("evaluation human review " + name + " is non-canonical")
		}
		allPassed = allPassed && stringMember(verdict, "verdict") == "passed"
		previous = criterionID
	}
	verdict := "failed"
	if allPassed {
		verdict = "passed"
	}
	return raw, verdict, nil
}

func validateEvaluationHumanReviewSourceProvenance(value any) (map[string]any, error) {
	source, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(source, []string{
		"sourceRunId", "sourceRunAttempt", "sourceArtifactName", "sourceArtifactDigest",
	}) {
		return nil, invalid("evaluation human review source provenance is invalid")
	}
	runID, runOK := source["sourceRunId"].(string)
	if !runOK || !regexp.MustCompile(`^[1-9][0-9]*$`).MatchString(runID) {
		return nil, invalid("evaluation human review source run is invalid")
	}
	if _, err := evaluationHumanReviewPositiveInteger(source["sourceRunAttempt"], "source run attempt"); err != nil {
		return nil, err
	}
	if _, err := evaluationHumanReviewIdentity(source["sourceArtifactName"], "source artifact name"); err != nil {
		return nil, err
	}
	githubDigest, ok := source["sourceArtifactDigest"].(string)
	if !ok || !evaluationHumanReviewGitHubDigestPattern.MatchString(githubDigest) {
		return nil, invalid("evaluation human review source artifact digest is invalid")
	}
	return source, nil
}

func evaluationHumanReviewBoundedText(value any, maximum int) bool {
	text, ok := value.(string)
	if !ok || len(text) < 1 || len(text) > maximum || strings.TrimSpace(text) != text {
		return false
	}
	for _, character := range text {
		if character == '\x7f' || (unicode.IsControl(character) && character != '\t' && character != '\n' && character != '\r') {
			return false
		}
	}
	return true
}

func validateEvaluationHumanReviewPublicRubric(value any) (map[string]any, error) {
	rubric, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(rubric, []string{
		"format", "version", "rubricId", "title", "criteria", "metricMappings",
		"interRaterDisagreementMetricId", "scale", "accessibilityInstructions", "rubricDigest",
	}) || rubric["format"] != "prodivix.g4-public-human-review-rubric" || rubric["scale"] != "binary-pass-fail" {
		return nil, invalid("evaluation public human review rubric shape is invalid")
	}
	version, versionOK := integerMember(rubric, "version")
	if version != 1 || !versionOK || !evaluationHumanReviewBoundedText(rubric["title"], 256) {
		return nil, invalid("evaluation public human review rubric value is invalid")
	}
	if _, err := evaluationHumanReviewIdentity(rubric["rubricId"], "rubric id"); err != nil {
		return nil, err
	}
	if _, err := evaluationHumanReviewIdentity(rubric["interRaterDisagreementMetricId"], "disagreement metric id"); err != nil {
		return nil, err
	}
	criteria, ok := rubric["criteria"].([]any)
	if !ok || len(criteria) < 1 || len(criteria) > 32 {
		return nil, invalid("evaluation public human review rubric criteria are invalid")
	}
	required := make(map[string]struct{})
	previousCriterionID := ""
	for index, raw := range criteria {
		criterion, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(criterion, []string{"criterionId", "label", "instruction", "required", "anchors"}) ||
			!evaluationHumanReviewBoundedText(criterion["label"], 128) ||
			!evaluationHumanReviewBoundedText(criterion["instruction"], 4_096) {
			return nil, invalid("evaluation public human review rubric criterion is invalid")
		}
		criterionID, err := evaluationHumanReviewIdentity(criterion["criterionId"], "rubric criterion id")
		isRequired, requiredOK := criterion["required"].(bool)
		anchors, anchorsOK := criterion["anchors"].([]any)
		if err != nil || !requiredOK || !anchorsOK || len(anchors) != 2 || (index > 0 && previousCriterionID >= criterionID) {
			return nil, invalid("evaluation public human review rubric criterion drifted")
		}
		for anchorIndex, expectedVerdict := range []string{"failed", "passed"} {
			anchor, ok := anchors[anchorIndex].(map[string]any)
			if !ok || !exactEvaluationKeys(anchor, []string{"verdict", "label", "description"}) ||
				anchor["verdict"] != expectedVerdict || !evaluationHumanReviewBoundedText(anchor["label"], 128) ||
				!evaluationHumanReviewBoundedText(anchor["description"], 2_048) {
				return nil, invalid("evaluation public human review rubric anchor is invalid")
			}
		}
		if isRequired {
			required[criterionID] = struct{}{}
		}
		previousCriterionID = criterionID
	}
	if len(required) == 0 {
		return nil, invalid("evaluation public human review rubric has no required criterion")
	}
	mappings, ok := rubric["metricMappings"].([]any)
	if !ok || len(mappings) < 1 || len(mappings) > 32 {
		return nil, invalid("evaluation public human review rubric mappings are invalid")
	}
	previousMetricID := ""
	mapped := make(map[string]struct{})
	for index, raw := range mappings {
		mapping, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(mapping, []string{"metricId", "criterionIds", "aggregation"}) || mapping["aggregation"] != "all-pass" {
			return nil, invalid("evaluation public human review rubric mapping is invalid")
		}
		metricID, err := evaluationHumanReviewIdentity(mapping["metricId"], "rubric metric id")
		criterionIDs, criterionErr := evaluationHumanReviewCanonicalStringSet(mapping["criterionIds"], false, "rubric metric criterion ids")
		if err != nil || criterionErr != nil || metricID == stringMember(rubric, "interRaterDisagreementMetricId") ||
			(index > 0 && previousMetricID >= metricID) {
			return nil, invalid("evaluation public human review rubric mapping drifted")
		}
		for _, criterionID := range criterionIDs {
			if _, exists := required[criterionID]; !exists {
				return nil, invalid("evaluation public human review rubric maps a non-required criterion")
			}
			mapped[criterionID] = struct{}{}
		}
		previousMetricID = metricID
	}
	for criterionID := range required {
		if _, exists := mapped[criterionID]; !exists {
			return nil, invalid("evaluation public human review rubric criterion is unmapped")
		}
	}
	instructions, ok := rubric["accessibilityInstructions"].([]any)
	if !ok || len(instructions) < 1 || len(instructions) > 16 {
		return nil, invalid("evaluation public human review rubric accessibility instructions are invalid")
	}
	for _, instruction := range instructions {
		if !evaluationHumanReviewBoundedText(instruction, 2_048) {
			return nil, invalid("evaluation public human review rubric accessibility instruction is invalid")
		}
	}
	if err := evaluationHumanReviewDigestMatch(rubric, "rubricDigest"); err != nil {
		return nil, err
	}
	return rubric, nil
}

func validateEvaluationHumanReviewPublicRubrics(value any) ([]map[string]any, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) < 1 || len(raw) > 16 {
		return nil, invalid("evaluation public human review rubrics are invalid")
	}
	result := make([]map[string]any, len(raw))
	previous := ""
	for index, entry := range raw {
		rubric, err := validateEvaluationHumanReviewPublicRubric(entry)
		digest := stringMember(rubric, "rubricDigest")
		if err != nil || (index > 0 && previous >= digest) {
			return nil, invalid("evaluation public human review rubrics are non-canonical")
		}
		result[index] = rubric
		previous = digest
	}
	return result, nil
}

func validateEvaluationHumanReviewTrustRegistry(value any) (map[string]any, error) {
	registry, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(registry, []string{
		"format", "version", "registryId", "authorities", "authoritySetDigest", "registryDigest",
	}) || registry["format"] != "prodivix.g4-human-review-trust-registry" {
		return nil, invalid("evaluation human review trust registry shape is invalid")
	}
	version, versionOK := integerMember(registry, "version")
	if version != 1 || !versionOK {
		return nil, invalid("evaluation human review trust registry version is invalid")
	}
	if _, err := evaluationHumanReviewIdentity(registry["registryId"], "trust registry id"); err != nil {
		return nil, err
	}
	authorities, ok := registry["authorities"].([]any)
	if !ok || len(authorities) < 3 || len(authorities) > 17 {
		return nil, invalid("evaluation human review trust authorities are invalid")
	}
	seenPseudonyms, seenKeyIDs := make(map[string]struct{}), make(map[string]struct{})
	authorityDigests := make([]any, len(authorities))
	previousAuthorityID := ""
	for index, raw := range authorities {
		authority, ok := raw.(map[string]any)
		if !ok || !exactEvaluationKeys(authority, []string{
			"authorityId", "pseudonym", "role", "keyId", "publicKeyBase64Url", "validFrom", "validUntil",
			"independencePolicyDigest", "authorityDigest",
		}) || !oneOfString(stringMember(authority, "role"), "reviewer", "adjudicator") {
			return nil, invalid("evaluation human review trust authority shape is invalid")
		}
		authorityID, authorityErr := evaluationHumanReviewIdentity(authority["authorityId"], "trust authority id")
		pseudonym, pseudonymErr := evaluationHumanReviewIdentity(authority["pseudonym"], "trust authority pseudonym")
		keyID, keyErr := evaluationHumanReviewIdentity(authority["keyId"], "trust authority key id")
		publicKey, publicKeyErr := base64.RawURLEncoding.DecodeString(stringMember(authority, "publicKeyBase64Url"))
		validFrom, fromErr := evaluationInstant(authority["validFrom"], "trust authority validity start")
		validUntil, untilErr := evaluationInstant(authority["validUntil"], "trust authority validity end")
		if authorityErr != nil || pseudonymErr != nil || keyErr != nil || publicKeyErr != nil || len(publicKey) != 32 ||
			fromErr != nil || untilErr != nil || !validUntil.After(validFrom) ||
			(index > 0 && previousAuthorityID >= authorityID) {
			return nil, invalid("evaluation human review trust authority value is invalid")
		}
		if _, duplicate := seenPseudonyms[pseudonym]; duplicate {
			return nil, invalid("evaluation human review trust authority pseudonym is duplicated")
		}
		if _, duplicate := seenKeyIDs[keyID]; duplicate {
			return nil, invalid("evaluation human review trust authority key is duplicated")
		}
		if _, err := evaluationHumanReviewDigest(authority["independencePolicyDigest"], "trust independence policy digest"); err != nil {
			return nil, err
		}
		if err := evaluationHumanReviewDigestMatch(authority, "authorityDigest"); err != nil {
			return nil, err
		}
		seenPseudonyms[pseudonym], seenKeyIDs[keyID] = struct{}{}, struct{}{}
		authorityDigests[index] = authority["authorityDigest"]
		previousAuthorityID = authorityID
	}
	wantSetDigest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-human-review-authority-set", "version": int64(1),
		"authorityDigests": authorityDigests,
	})
	if err != nil || registry["authoritySetDigest"] != wantSetDigest {
		return nil, invalid("evaluation human review trust authority set drifted")
	}
	if err := evaluationHumanReviewDigestMatch(registry, "registryDigest"); err != nil {
		return nil, err
	}
	return registry, nil
}

func validateEvaluationHumanReviewAdjudicationPolicy(value any, registry map[string]any) (map[string]any, error) {
	policy, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(policy, []string{
		"minimumIndependentRatings", "reviewerAuthorityIds", "adjudicationAuthorityId", "adjudicatorKeyId",
		"trigger", "trustRegistryDigest", "independencePolicyDigest", "consensusRule", "disagreementRule",
		"reviewerRatingSignaturesRequired", "adjudicatorDecisionSignatureRequired", "signatureAlgorithm",
		"decisionPayloadFields", "policyDigest",
	}) || policy["trigger"] != "reviewer-disagreement" || policy["consensusRule"] != "unanimous" ||
		policy["disagreementRule"] != "escalate-to-independent-adjudicator" || policy["reviewerRatingSignaturesRequired"] != true ||
		policy["adjudicatorDecisionSignatureRequired"] != true || policy["signatureAlgorithm"] != "Ed25519" {
		return nil, invalid("evaluation human review adjudication policy shape is invalid")
	}
	minimum, err := evaluationHumanReviewPositiveInteger(policy["minimumIndependentRatings"], "minimum independent ratings")
	reviewerIDs, reviewerErr := evaluationHumanReviewCanonicalStringSet(policy["reviewerAuthorityIds"], false, "policy reviewer authorities")
	adjudicatorID, adjudicatorErr := evaluationHumanReviewIdentity(policy["adjudicationAuthorityId"], "policy adjudicator id")
	adjudicatorKeyID, keyErr := evaluationHumanReviewIdentity(policy["adjudicatorKeyId"], "policy adjudicator key id")
	if err != nil || reviewerErr != nil || adjudicatorErr != nil || keyErr != nil || int64(len(reviewerIDs)) < minimum ||
		policy["trustRegistryDigest"] != registry["registryDigest"] {
		return nil, invalid("evaluation human review adjudication policy value is invalid")
	}
	if _, err := evaluationHumanReviewDigest(policy["independencePolicyDigest"], "policy independence digest"); err != nil {
		return nil, err
	}
	rawFields, fieldsOK := policy["decisionPayloadFields"].([]any)
	if !fieldsOK || len(rawFields) != len(evaluationHumanReviewDecisionPayloadFields) {
		return nil, invalid("evaluation human review decision payload fields drifted")
	}
	for index, expected := range evaluationHumanReviewDecisionPayloadFields {
		if rawFields[index] != expected {
			return nil, invalid("evaluation human review decision payload fields drifted")
		}
	}
	authorities, _ := registry["authorities"].([]any)
	authorityByID := make(map[string]map[string]any, len(authorities))
	for _, raw := range authorities {
		authority := raw.(map[string]any)
		authorityByID[stringMember(authority, "authorityId")] = authority
	}
	for _, reviewerID := range reviewerIDs {
		authority := authorityByID[reviewerID]
		if authority == nil || authority["role"] != "reviewer" || authority["independencePolicyDigest"] != policy["independencePolicyDigest"] {
			return nil, invalid("evaluation human review reviewer policy drifted")
		}
	}
	adjudicator := authorityByID[adjudicatorID]
	if adjudicator == nil || adjudicator["role"] != "adjudicator" || adjudicator["keyId"] != adjudicatorKeyID ||
		adjudicator["independencePolicyDigest"] != policy["independencePolicyDigest"] {
		return nil, invalid("evaluation human review adjudicator policy drifted")
	}
	if err := evaluationHumanReviewDigestMatch(policy, "policyDigest"); err != nil {
		return nil, err
	}
	return policy, nil
}

func validateEvaluationHumanReviewSignedRatings(value any) ([]map[string]any, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) < 1 || len(raw) > 16_384 {
		return nil, invalid("evaluation human review signed ratings are invalid")
	}
	result := make([]map[string]any, len(raw))
	for index, entry := range raw {
		rating, ok := entry.(map[string]any)
		if !ok || !exactEvaluationKeys(rating, []string{
			"format", "version", "ratingId", "randomizedPresentationId", "rubricDigest",
			"blindedArtifactSetDigest", "reviewerAuthorityId", "reviewerPseudonym", "keyId",
			"criterionVerdicts", "verdict", "ratedAt", "ratingDigest", "signatureBase64Url",
		}) || rating["format"] != "prodivix.g4-human-review-signed-rating" {
			return nil, invalid(fmt.Sprintf("evaluation human review signed rating %d shape is invalid", index))
		}
		version, versionOK := integerMember(rating, "version")
		if !versionOK || version != 1 || !oneOfString(stringMember(rating, "verdict"), "failed", "passed") {
			return nil, invalid("evaluation human review signed rating value is invalid")
		}
		for _, field := range []string{"ratingId", "randomizedPresentationId", "reviewerAuthorityId", "reviewerPseudonym", "keyId"} {
			if _, err := evaluationHumanReviewIdentity(rating[field], field); err != nil {
				return nil, err
			}
		}
		for _, field := range []string{"rubricDigest", "blindedArtifactSetDigest"} {
			if _, err := evaluationHumanReviewDigest(rating[field], field); err != nil {
				return nil, err
			}
		}
		_, derivedVerdict, err := validateEvaluationHumanReviewCriterionVerdicts(
			rating["criterionVerdicts"], "rating criterion verdicts",
		)
		if err != nil || derivedVerdict != stringMember(rating, "verdict") {
			return nil, invalid("evaluation human review signed rating verdict drifted")
		}
		if _, err := evaluationInstant(rating["ratedAt"], "evaluation human review rating time"); err != nil {
			return nil, err
		}
		if err := evaluationHumanReviewSignature(rating["signatureBase64Url"], "rating signature"); err != nil {
			return nil, err
		}
		if err := evaluationHumanReviewDigestMatch(rating, "ratingDigest", "signatureBase64Url"); err != nil {
			return nil, err
		}
		result[index] = rating
	}
	return result, nil
}

func validateEvaluationHumanReviewIndependence(value any) ([]map[string]any, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) < 2 || len(raw) > 16_384 {
		return nil, invalid("evaluation human review independence attestations are invalid")
	}
	result := make([]map[string]any, len(raw))
	for index, entry := range raw {
		attestation, ok := entry.(map[string]any)
		if !ok || !exactEvaluationKeys(attestation, []string{
			"format", "version", "attestationId", "planDigest", "blindedArtifactSetDigest", "authorityId",
			"authorityPseudonym", "role", "keyId", "independencePolicyDigest", "testedModelFamilyOwnerSetDigest",
			"conflictModelFamilyOwnerSetDigest", "issuedAt", "expiresAt", "attestationDigest", "signatureBase64Url",
		}) || attestation["format"] != "prodivix.g4-human-review-independence-attestation" {
			return nil, invalid(fmt.Sprintf("evaluation human review independence attestation %d shape is invalid", index))
		}
		version, versionOK := integerMember(attestation, "version")
		if !versionOK || version != 1 || !oneOfString(stringMember(attestation, "role"), "reviewer", "adjudicator") {
			return nil, invalid("evaluation human review independence attestation value is invalid")
		}
		for _, field := range []string{"attestationId", "authorityId", "authorityPseudonym", "keyId"} {
			if _, err := evaluationHumanReviewIdentity(attestation[field], field); err != nil {
				return nil, err
			}
		}
		for _, field := range []string{
			"planDigest", "blindedArtifactSetDigest", "independencePolicyDigest",
			"testedModelFamilyOwnerSetDigest", "conflictModelFamilyOwnerSetDigest",
		} {
			if _, err := evaluationHumanReviewDigest(attestation[field], field); err != nil {
				return nil, err
			}
		}
		issuedAt, err := evaluationInstant(attestation["issuedAt"], "evaluation human review independence issue time")
		if err != nil {
			return nil, err
		}
		expiresAt, err := evaluationInstant(attestation["expiresAt"], "evaluation human review independence expiry")
		if err != nil || !expiresAt.After(issuedAt) {
			return nil, invalid("evaluation human review independence expiry is invalid")
		}
		if err := evaluationHumanReviewSignature(attestation["signatureBase64Url"], "independence signature"); err != nil {
			return nil, err
		}
		if err := evaluationHumanReviewDigestMatch(attestation, "attestationDigest", "signatureBase64Url"); err != nil {
			return nil, err
		}
		result[index] = attestation
	}
	return result, nil
}

func validateEvaluationHumanReviewDecisions(value any) ([]map[string]any, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) > 16_384 {
		return nil, invalid("evaluation human review adjudication decisions are invalid")
	}
	result := make([]map[string]any, len(raw))
	for index, entry := range raw {
		decision, ok := entry.(map[string]any)
		if !ok || !exactEvaluationKeys(decision, []string{
			"format", "version", "decisionId", "randomizedPresentationId", "rubricDigest",
			"blindedArtifactSetDigest", "adjudicationAuthorityId", "adjudicatorPseudonym", "keyId",
			"candidateDigest", "planDigest", "policyDigest", "ratingDigests", "reviewerAuthorityIds",
			"criterionVerdicts", "decision", "decidedAt", "decisionDigest", "signatureBase64Url",
		}) || decision["format"] != "prodivix.g4-human-review-adjudication-decision" {
			return nil, invalid(fmt.Sprintf("evaluation human review adjudication decision %d shape is invalid", index))
		}
		version, versionOK := integerMember(decision, "version")
		if !versionOK || version != 1 || !oneOfString(stringMember(decision, "decision"), "failed", "passed") {
			return nil, invalid("evaluation human review adjudication decision is invalid")
		}
		for _, field := range []string{
			"decisionId", "randomizedPresentationId", "adjudicationAuthorityId", "adjudicatorPseudonym", "keyId",
		} {
			if _, err := evaluationHumanReviewIdentity(decision[field], field); err != nil {
				return nil, err
			}
		}
		for _, field := range []string{"rubricDigest", "blindedArtifactSetDigest", "candidateDigest", "planDigest", "policyDigest"} {
			if _, err := evaluationHumanReviewDigest(decision[field], field); err != nil {
				return nil, err
			}
		}
		if _, err := evaluationHumanReviewCanonicalStringSet(decision["ratingDigests"], true, "decision rating digests"); err != nil {
			return nil, err
		}
		if _, err := evaluationHumanReviewCanonicalStringSet(decision["reviewerAuthorityIds"], false, "decision reviewer authorities"); err != nil {
			return nil, err
		}
		_, derivedDecision, err := validateEvaluationHumanReviewCriterionVerdicts(
			decision["criterionVerdicts"], "decision criterion verdicts",
		)
		if err != nil || derivedDecision != stringMember(decision, "decision") {
			return nil, invalid("evaluation human review decision verdict drifted")
		}
		if _, err := evaluationInstant(decision["decidedAt"], "evaluation human review decision time"); err != nil {
			return nil, err
		}
		if err := evaluationHumanReviewSignature(decision["signatureBase64Url"], "decision signature"); err != nil {
			return nil, err
		}
		if err := evaluationHumanReviewDigestMatch(decision, "decisionDigest", "signatureBase64Url"); err != nil {
			return nil, err
		}
		result[index] = decision
	}
	return result, nil
}

func validateEvaluationHumanReviewCandidateAdjudications(value any) ([]any, error) {
	raw, ok := value.([]any)
	if !ok || len(raw) < 1 || len(raw) > 16_384 {
		return nil, invalid("evaluation human review candidate adjudications are invalid")
	}
	for index, entry := range raw {
		adjudication, ok := entry.(map[string]any)
		if !ok || !exactEvaluationKeys(adjudication, []string{
			"randomizedPresentationId", "candidateDigest", "rubricDigest", "ratingDigests",
			"reviewerAuthorityIds", "criterionVerdicts", "verdict",
		}, "decisionDigest") || !oneOfString(stringMember(adjudication, "verdict"), "failed", "passed") {
			return nil, invalid(fmt.Sprintf("evaluation human review candidate adjudication %d is invalid", index))
		}
		if _, err := evaluationHumanReviewIdentity(adjudication["randomizedPresentationId"], "randomized presentation"); err != nil {
			return nil, err
		}
		for _, field := range []string{"candidateDigest", "rubricDigest"} {
			if _, err := evaluationHumanReviewDigest(adjudication[field], field); err != nil {
				return nil, err
			}
		}
		if digest, exists := adjudication["decisionDigest"]; exists {
			if _, err := evaluationHumanReviewDigest(digest, "decision digest"); err != nil {
				return nil, err
			}
		}
		if _, err := evaluationHumanReviewCanonicalStringSet(adjudication["ratingDigests"], true, "candidate rating digests"); err != nil {
			return nil, err
		}
		if _, err := evaluationHumanReviewCanonicalStringSet(adjudication["reviewerAuthorityIds"], false, "candidate reviewer authorities"); err != nil {
			return nil, err
		}
		_, derivedVerdict, err := validateEvaluationHumanReviewCriterionVerdicts(
			adjudication["criterionVerdicts"], "candidate criterion verdicts",
		)
		if err != nil || derivedVerdict != stringMember(adjudication, "verdict") {
			return nil, invalid("evaluation human review candidate verdict drifted")
		}
	}
	return raw, nil
}

func evaluationHumanReviewSignedSetDigest(values []map[string]any, digestField string) (string, error) {
	set := make([]any, len(values))
	for index, value := range values {
		set[index] = map[string]any{digestField: value[digestField], "signatureBase64Url": value["signatureBase64Url"]}
	}
	return canonicaljson.Digest(set)
}

func validateEvaluationHumanReviewValidationReceipt(
	value any,
	review map[string]any,
	signedRatings, independence, decisions []map[string]any,
) (map[string]any, time.Time, error) {
	receipt, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(receipt, []string{
		"format", "version", "receiptId", "submissionId", "submissionDigest", "planDigest", "repositoryCommit",
		"blindBundleDigest", "reviewLeaseDigest", "blindedArtifactSetDigest", "randomizedPresentationPolicyDigest", "sourceProvenance",
		"trustRegistryDigest", "authoritySetDigest", "adjudicationPolicyDigest", "ratingSignatureSetDigest",
		"independenceAttestationSetDigest", "adjudicationDecisionSetDigest", "candidateAdjudications",
		"candidateAdjudicationSetDigest", "adjudicationDigest", "validatedAt", "receiptDigest",
	}) || receipt["format"] != "prodivix.g4-human-review-validation-receipt" {
		return nil, time.Time{}, invalid("evaluation human review validation receipt shape is invalid")
	}
	version, versionOK := integerMember(receipt, "version")
	if !versionOK || version != 1 {
		return nil, time.Time{}, invalid("evaluation human review validation receipt version is invalid")
	}
	for _, field := range []string{"receiptId", "submissionId"} {
		if _, err := evaluationHumanReviewIdentity(receipt[field], field); err != nil {
			return nil, time.Time{}, err
		}
	}
	for _, field := range []string{
		"submissionDigest", "blindBundleDigest", "blindedArtifactSetDigest", "randomizedPresentationPolicyDigest",
		"trustRegistryDigest", "authoritySetDigest", "adjudicationPolicyDigest", "ratingSignatureSetDigest",
		"independenceAttestationSetDigest", "adjudicationDecisionSetDigest", "candidateAdjudicationSetDigest", "adjudicationDigest",
	} {
		if _, err := evaluationHumanReviewDigest(receipt[field], field); err != nil {
			return nil, time.Time{}, err
		}
	}
	receiptReviewLeaseDigest, err := optionalEvaluationAuthenticityDigest(receipt, "reviewLeaseDigest")
	if err != nil {
		return nil, time.Time{}, err
	}
	reviewReviewLeaseDigest, err := optionalEvaluationAuthenticityDigest(review, "reviewLeaseDigest")
	if err != nil || receiptReviewLeaseDigest != reviewReviewLeaseDigest {
		return nil, time.Time{}, invalid("evaluation human review lease binding drifted")
	}
	if receipt["planDigest"] != review["planDigest"] || receipt["repositoryCommit"] != review["repositoryCommit"] ||
		receipt["blindBundleDigest"] != review["blindBundleDigest"] ||
		receipt["blindedArtifactSetDigest"] != review["blindedArtifactSetDigest"] ||
		receipt["randomizedPresentationPolicyDigest"] != review["randomizedPresentationPolicyDigest"] {
		return nil, time.Time{}, invalid("evaluation human review validation partition drifted")
	}
	receiptSource, err := validateEvaluationHumanReviewSourceProvenance(receipt["sourceProvenance"])
	if err != nil {
		return nil, time.Time{}, err
	}
	reviewSource, _ := review["sourceProvenance"].(map[string]any)
	receiptSourceDigest, _ := canonicaljson.Digest(receiptSource)
	reviewSourceDigest, _ := canonicaljson.Digest(reviewSource)
	if receiptSourceDigest != reviewSourceDigest {
		return nil, time.Time{}, invalid("evaluation human review source provenance drifted")
	}
	ratingSetDigest, ratingErr := evaluationHumanReviewSignedSetDigest(signedRatings, "ratingDigest")
	independenceSetDigest, independenceErr := evaluationHumanReviewSignedSetDigest(independence, "attestationDigest")
	decisionSetDigest, decisionErr := evaluationHumanReviewSignedSetDigest(decisions, "decisionDigest")
	if ratingErr != nil || independenceErr != nil || decisionErr != nil ||
		receipt["ratingSignatureSetDigest"] != ratingSetDigest ||
		receipt["independenceAttestationSetDigest"] != independenceSetDigest ||
		receipt["adjudicationDecisionSetDigest"] != decisionSetDigest {
		return nil, time.Time{}, invalid("evaluation human review signed set digest drifted")
	}
	candidateAdjudications, err := validateEvaluationHumanReviewCandidateAdjudications(receipt["candidateAdjudications"])
	if err != nil {
		return nil, time.Time{}, err
	}
	candidateSetDigest, err := canonicaljson.Digest(candidateAdjudications)
	if err != nil || receipt["candidateAdjudicationSetDigest"] != candidateSetDigest {
		return nil, time.Time{}, invalid("evaluation human review candidate adjudication set digest drifted")
	}
	validatedAt, err := evaluationInstant(receipt["validatedAt"], "evaluation human review validation time")
	if err != nil {
		return nil, time.Time{}, err
	}
	if err := evaluationHumanReviewDigestMatch(receipt, "receiptDigest"); err != nil {
		return nil, time.Time{}, err
	}
	return receipt, validatedAt, nil
}

func validateEvaluationHumanReviewImport(value any) (map[string]any, time.Time, error) {
	review, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(review, []string{
		"format", "version", "planDigest", "repositoryCommit", "blindBundleDigest", "reviewLeaseDigest", "blindedArtifactSetDigest",
		"randomizedPresentationPolicyDigest", "sourceProvenance", "signedRatings", "independenceAttestations",
		"adjudicationDecisions", "validationReceipt", "reviewedAt", "artifactAuthority", "artifactDigest",
	}) || review["format"] != evaluationHumanReviewImportFormat {
		return nil, time.Time{}, invalid("evaluation human review import shape is invalid")
	}
	version, versionOK := integerMember(review, "version")
	if !versionOK || version != 1 || !evaluationRepositoryCommitPattern.MatchString(stringMember(review, "repositoryCommit")) {
		return nil, time.Time{}, invalid("evaluation human review import partition is invalid")
	}
	for _, field := range []string{"planDigest", "blindBundleDigest", "blindedArtifactSetDigest", "randomizedPresentationPolicyDigest"} {
		if _, err := evaluationHumanReviewDigest(review[field], field); err != nil {
			return nil, time.Time{}, err
		}
	}
	if _, err := optionalEvaluationAuthenticityDigest(review, "reviewLeaseDigest"); err != nil {
		return nil, time.Time{}, err
	}
	if _, err := validateEvaluationHumanReviewSourceProvenance(review["sourceProvenance"]); err != nil {
		return nil, time.Time{}, err
	}
	signedRatings, err := validateEvaluationHumanReviewSignedRatings(review["signedRatings"])
	if err != nil {
		return nil, time.Time{}, err
	}
	independence, err := validateEvaluationHumanReviewIndependence(review["independenceAttestations"])
	if err != nil {
		return nil, time.Time{}, err
	}
	decisions, err := validateEvaluationHumanReviewDecisions(review["adjudicationDecisions"])
	if err != nil {
		return nil, time.Time{}, err
	}
	_, validatedAt, err := validateEvaluationHumanReviewValidationReceipt(
		review["validationReceipt"], review, signedRatings, independence, decisions,
	)
	if err != nil {
		return nil, time.Time{}, err
	}
	reviewedAt, err := evaluationInstant(review["reviewedAt"], "evaluation human review review time")
	if err != nil || reviewedAt.After(validatedAt) {
		return nil, time.Time{}, invalid("evaluation human review review time follows validation")
	}
	authority, ok := review["artifactAuthority"].(map[string]any)
	if !ok || !exactEvaluationKeys(authority, []string{
		"authorityId", "keyId", "workflowName", "workflowRunId", "workflowRunAttempt",
		"signedAt", "payloadDigest", "signatureBase64Url",
	}) || authority["workflowName"] != "g4-real-model-human-review" {
		return nil, time.Time{}, invalid("evaluation human review artifact authority shape is invalid")
	}
	for _, field := range []string{"authorityId", "keyId", "workflowRunId"} {
		if _, err := evaluationHumanReviewIdentity(authority[field], field); err != nil {
			return nil, time.Time{}, err
		}
	}
	if _, err := evaluationHumanReviewPositiveInteger(authority["workflowRunAttempt"], "workflow run attempt"); err != nil {
		return nil, time.Time{}, err
	}
	if _, err := evaluationInstant(authority["signedAt"], "evaluation human review authority signature time"); err != nil {
		return nil, time.Time{}, err
	}
	if err := evaluationHumanReviewSignature(authority["signatureBase64Url"], "artifact authority signature"); err != nil {
		return nil, time.Time{}, err
	}
	payload := make(map[string]any, len(review)-2)
	for key, entry := range review {
		if key != "artifactAuthority" && key != "artifactDigest" {
			payload[key] = entry
		}
	}
	payloadDigest, err := canonicaljson.Digest(payload)
	if err != nil || authority["payloadDigest"] != payloadDigest {
		return nil, time.Time{}, invalid("evaluation human review artifact authority payload drifted")
	}
	artifactBase := make(map[string]any, len(payload)+1)
	for key, entry := range payload {
		artifactBase[key] = entry
	}
	artifactBase["artifactAuthority"] = authority
	artifactDigest, err := canonicaljson.Digest(artifactBase)
	if err != nil || review["artifactDigest"] != artifactDigest {
		return nil, time.Time{}, invalid("evaluation human review import artifact digest drifted")
	}
	reviewBytes, err := canonicaljson.Bytes(review)
	if err != nil || len(reviewBytes) > maximumEvaluationHumanReviewArtifactBytes {
		return nil, time.Time{}, invalid("evaluation human review import exceeds its byte limit")
	}
	return review, validatedAt, nil
}

func decodeEvaluationValidatedHumanReviewArtifact(source []byte) (evaluationValidatedHumanReviewArtifact, error) {
	value, canonical, err := decodeEvaluationCanonicalObjectWithLimit(source, maximumEvaluationValidatedHumanReviewBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "artifactId", "planDigest", "repositoryCommit", "reviewArtifact",
		"reviewArtifactDigest", "reviewLeaseDigest", "humanReviewReportDigest", "publicRubrics",
		"trustRegistry", "adjudicationPolicy", "validatedAt", "artifactDigest",
	}) || value["format"] != evaluationValidatedHumanReviewFormat {
		return evaluationValidatedHumanReviewArtifact{}, invalid("evaluation validated human review artifact shape is invalid")
	}
	version, versionOK := integerMember(value, "version")
	if !versionOK || version != 1 || !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return evaluationValidatedHumanReviewArtifact{}, invalid("evaluation validated human review partition is invalid")
	}
	artifactID, err := evaluationHumanReviewIdentity(value["artifactId"], "validated artifact id")
	if err != nil {
		return evaluationValidatedHumanReviewArtifact{}, err
	}
	for _, field := range []string{"planDigest", "reviewArtifactDigest", "humanReviewReportDigest"} {
		if _, err := evaluationHumanReviewDigest(value[field], field); err != nil {
			return evaluationValidatedHumanReviewArtifact{}, err
		}
	}
	reviewLeaseDigest, err := optionalEvaluationAuthenticityDigest(value, "reviewLeaseDigest")
	if err != nil {
		return evaluationValidatedHumanReviewArtifact{}, err
	}
	review, validatedAt, err := validateEvaluationHumanReviewImport(value["reviewArtifact"])
	if err != nil {
		return evaluationValidatedHumanReviewArtifact{}, err
	}
	publicRubrics, err := validateEvaluationHumanReviewPublicRubrics(value["publicRubrics"])
	if err != nil {
		return evaluationValidatedHumanReviewArtifact{}, err
	}
	trustRegistry, err := validateEvaluationHumanReviewTrustRegistry(value["trustRegistry"])
	if err != nil {
		return evaluationValidatedHumanReviewArtifact{}, err
	}
	adjudicationPolicy, err := validateEvaluationHumanReviewAdjudicationPolicy(value["adjudicationPolicy"], trustRegistry)
	if err != nil {
		return evaluationValidatedHumanReviewArtifact{}, err
	}
	reviewDigest := stringMember(review, "artifactDigest")
	reviewArtifactLeaseDigest, err := optionalEvaluationAuthenticityDigest(review, "reviewLeaseDigest")
	if err != nil || reviewLeaseDigest != reviewArtifactLeaseDigest {
		return evaluationValidatedHumanReviewArtifact{}, invalid("evaluation validated human review lease binding drifted")
	}
	wantArtifactID := "validated-human-review:" + strings.TrimPrefix(reviewDigest, "sha256-")
	if artifactID != wantArtifactID || value["reviewArtifactDigest"] != reviewDigest ||
		value["planDigest"] != review["planDigest"] || value["repositoryCommit"] != review["repositoryCommit"] ||
		value["validatedAt"] != review["validationReceipt"].(map[string]any)["validatedAt"] {
		return evaluationValidatedHumanReviewArtifact{}, invalid("evaluation validated human review artifact binding drifted")
	}
	validationReceipt := review["validationReceipt"].(map[string]any)
	if validationReceipt["trustRegistryDigest"] != trustRegistry["registryDigest"] ||
		validationReceipt["authoritySetDigest"] != trustRegistry["authoritySetDigest"] ||
		validationReceipt["adjudicationPolicyDigest"] != adjudicationPolicy["policyDigest"] {
		return evaluationValidatedHumanReviewArtifact{}, invalid("evaluation validated human review trust binding drifted")
	}
	rubricDigests := make(map[string]struct{}, len(publicRubrics))
	for _, rubric := range publicRubrics {
		rubricDigests[stringMember(rubric, "rubricDigest")] = struct{}{}
	}
	for _, raw := range review["signedRatings"].([]any) {
		if _, exists := rubricDigests[stringMember(raw.(map[string]any), "rubricDigest")]; !exists {
			return evaluationValidatedHumanReviewArtifact{}, invalid("evaluation validated human review rating rubric is not frozen")
		}
	}
	artifactAuthority := review["artifactAuthority"].(map[string]any)
	authorities := trustRegistry["authorities"].([]any)
	var wrapperAuthority map[string]any
	for _, raw := range authorities {
		authority := raw.(map[string]any)
		if authority["authorityId"] == artifactAuthority["authorityId"] && authority["keyId"] == artifactAuthority["keyId"] && authority["role"] == "adjudicator" {
			wrapperAuthority = authority
			break
		}
	}
	signedAt, signedAtErr := evaluationInstant(artifactAuthority["signedAt"], "evaluation human review wrapper signature time")
	validFrom, validFromErr := instantMember(wrapperAuthority, "validFrom")
	validUntil, validUntilErr := instantMember(wrapperAuthority, "validUntil")
	if wrapperAuthority == nil || wrapperAuthority["authorityId"] != adjudicationPolicy["adjudicationAuthorityId"] ||
		signedAtErr != nil || validFromErr != nil || validUntilErr != nil || signedAt.Before(validFrom) || signedAt.After(validUntil) {
		return evaluationValidatedHumanReviewArtifact{}, invalid("evaluation validated human review wrapper authority drifted")
	}
	outerValidatedAt, err := evaluationInstant(value["validatedAt"], "evaluation validated human review time")
	if err != nil || !outerValidatedAt.Equal(validatedAt) {
		return evaluationValidatedHumanReviewArtifact{}, invalid("evaluation validated human review time drifted")
	}
	artifactDigest, err := verifyEvaluationAuthenticityDigest(value, "artifactDigest")
	if err != nil {
		return evaluationValidatedHumanReviewArtifact{}, err
	}
	return evaluationValidatedHumanReviewArtifact{
		EvaluationValidatedHumanReviewArtifactRecord: EvaluationValidatedHumanReviewArtifactRecord{
			PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit"),
			ArtifactID: artifactID, ReviewArtifactDigest: reviewDigest, ReviewLeaseDigest: reviewLeaseDigest,
			HumanReviewReportDigest:  stringMember(value, "humanReviewReportDigest"),
			BlindedArtifactSetDigest: stringMember(review, "blindedArtifactSetDigest"),
			AdjudicationDigest:       stringMember(validationReceipt, "adjudicationDigest"),
			ValidatedAt:              validatedAt, ArtifactDigest: artifactDigest, ArtifactBytes: canonical,
		},
		Value: value, ReviewArtifact: review,
	}, nil
}

func validateEvaluationValidatedHumanReviewReport(
	artifact *evaluationValidatedHumanReviewArtifact,
	report evaluationArtifactFact,
) error {
	if report.FactType != "evaluation-human-review-report" || report.PlanDigest != artifact.PlanDigest ||
		report.FactDigest != artifact.HumanReviewReportDigest {
		return invalid("evaluation validated human review report binding is invalid")
	}
	if report.Value["blindedArtifactSetDigest"] != artifact.BlindedArtifactSetDigest ||
		report.Value["adjudicationDigest"] != artifact.AdjudicationDigest {
		return invalid("evaluation validated human review report authority drifted")
	}
	generatedAt, err := instantMember(report.Value, "generatedAt")
	if err != nil || generatedAt.Before(artifact.ValidatedAt) {
		return invalid("evaluation validated human review report predates validation")
	}
	ratings, ok := report.Value["ratings"].([]any)
	signedRatings, signedOK := artifact.ReviewArtifact["signedRatings"].([]any)
	if !ok || !signedOK || len(ratings) != len(signedRatings) {
		return invalid("evaluation validated human review ratings are incomplete")
	}
	signedByID := make(map[string]map[string]any, len(signedRatings))
	for _, raw := range signedRatings {
		signed := raw.(map[string]any)
		id := stringMember(signed, "ratingId")
		if _, duplicate := signedByID[id]; duplicate {
			return invalid("evaluation validated human review rating id is duplicated")
		}
		signedByID[id] = signed
	}
	for _, raw := range ratings {
		rating, ok := raw.(map[string]any)
		if !ok {
			return invalid("evaluation validated human review normalized rating is invalid")
		}
		signed, exists := signedByID[stringMember(rating, "ratingId")]
		if !exists || rating["randomizedPresentationId"] != signed["randomizedPresentationId"] ||
			rating["reviewerPseudonym"] != signed["reviewerPseudonym"] ||
			rating["rubricDigest"] != signed["rubricDigest"] || rating["verdict"] != signed["verdict"] {
			return invalid("evaluation validated human review normalized rating drifted")
		}
		ratingCriteriaDigest, ratingCriteriaErr := canonicaljson.Digest(rating["criterionVerdicts"])
		signedCriteriaDigest, signedCriteriaErr := canonicaljson.Digest(signed["criterionVerdicts"])
		if ratingCriteriaErr != nil || signedCriteriaErr != nil || ratingCriteriaDigest != signedCriteriaDigest {
			return invalid("evaluation validated human review normalized criterion verdicts drifted")
		}
	}
	artifact.HumanReviewReportID = report.FactID
	artifact.HumanReviewReportFactBytes = append([]byte(nil), report.Canonical...)
	return nil
}

func insertEvaluationHumanReviewReport(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	report evaluationArtifactFact,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_artifacts (
		namespace_id, plan_digest, fact_type, fact_id, fact_digest, outcome, fact_json, fact_bytes, recorded_at
	) VALUES ($1,$2,$3,$4,$5,NULL,$6::jsonb,$7,$8) ON CONFLICT DO NOTHING`,
		namespaceID, report.PlanDigest, report.FactType, report.FactID, report.FactDigest,
		string(report.Canonical), report.Canonical, report.RecordedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted == 1 {
		return err
	}
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT fact_bytes FROM agent_evaluation_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2 AND fact_type=$3 AND fact_id=$4 FOR SHARE`,
		namespaceID, report.PlanDigest, report.FactType, report.FactID).Scan(&existing); err != nil {
		return err
	}
	if !bytes.Equal(existing, report.Canonical) {
		return conflict("evaluation human review report immutable replay drifted")
	}
	return nil
}

func insertEvaluationValidatedHumanReviewArtifact(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	artifact evaluationValidatedHumanReviewArtifact,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_validated_human_review_artifacts (
		namespace_id, plan_digest, repository_commit, artifact_id, review_artifact_digest,
		review_lease_digest,
		human_review_report_type, human_review_report_id, human_review_report_digest,
		blinded_artifact_set_digest, adjudication_digest, artifact_digest, artifact_json, artifact_bytes, validated_at
	) VALUES ($1,$2,$3,$4,$5,$6,'evaluation-human-review-report',$7,$8,$9,$10,$11,$12::jsonb,$13,$14)
	ON CONFLICT DO NOTHING`, namespaceID, artifact.PlanDigest, artifact.RepositoryCommit, artifact.ArtifactID,
		artifact.ReviewArtifactDigest, nullableEvaluationAuthenticityString(artifact.ReviewLeaseDigest),
		artifact.HumanReviewReportID, artifact.HumanReviewReportDigest,
		artifact.BlindedArtifactSetDigest, artifact.AdjudicationDigest, artifact.ArtifactDigest,
		string(artifact.ArtifactBytes), artifact.ArtifactBytes, artifact.ValidatedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil || inserted == 1 {
		return err
	}
	var existing []byte
	if err := tx.QueryRowContext(ctx, `SELECT artifact_bytes FROM agent_evaluation_validated_human_review_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2 FOR SHARE`, namespaceID, artifact.PlanDigest).Scan(&existing); err != nil {
		return err
	}
	if !bytes.Equal(existing, artifact.ArtifactBytes) {
		return conflict("evaluation validated human review singleton was reused")
	}
	return nil
}

func (repository *Repository) StoreEvaluationValidatedHumanReviewArtifact(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	artifactBytes []byte,
	humanReviewReportFactBytes []byte,
	validatedHumanMetricObservationBytes []byte,
	validatedHumanMetricObservationSetDigest string,
	humanReviewAuthority EvaluationHumanReviewAuthority,
) (EvaluationValidatedHumanReviewArtifactRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	artifact, err := decodeEvaluationValidatedHumanReviewArtifact(artifactBytes)
	if err != nil || artifact.PlanDigest != partition.PlanDigest || artifact.RepositoryCommit != partition.RepositoryCommit {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, ErrInvalid
	}
	report, err := decodeEvaluationArtifact(humanReviewReportFactBytes, "evaluation-human-review-report")
	if err != nil || validateEvaluationValidatedHumanReviewReport(&artifact, report) != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, ErrInvalid
	}
	requestedObservations, requestedObservationBytes, err := decodeEvaluationValidatedHumanMetricObservationSet(
		validatedHumanMetricObservationBytes,
	)
	if err != nil || !evaluationDigestPattern.MatchString(validatedHumanMetricObservationSetDigest) {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, planRecord, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if artifact.ValidatedAt.Before(plan.PlannedAt) || artifact.ValidatedAt.After(plan.ExpiresAt) || report.RecordedAt.After(plan.ExpiresAt) {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review time is outside the frozen plan")
	}
	if humanReviewAuthority == nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review authority is unavailable")
	}
	holdout, err := loadEvaluationHoldoutClosure(writeContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	if holdout == nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review has no sealed config commitment")
	}
	frozenAuthority, err := humanReviewAuthority.ResolveHumanReviewAuthority(writeContext, planRecord, *holdout)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	lease, err := loadEvaluationReviewLeaseByDigest(
		writeContext, tx, authority.NamespaceID, partition, artifact.ReviewLeaseDigest,
	)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	if lease == nil || artifact.ValidatedAt.Before(lease.CreatedAt) || artifact.ValidatedAt.After(lease.ExpiresAt) {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review escaped its lease window")
	}
	machine, err := evaluationReviewMachineSealForPartition(writeContext, tx, authority.NamespaceID, partition, planRecord)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	if machine.MachinePhaseDigest != lease.Commitments.MachinePhaseDigest {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review machine phase drifted from its lease")
	}
	leaseEvidence, err := loadEvaluationReviewLeaseEvidence(
		writeContext, tx, authority.NamespaceID, partition, planRecord, plan,
	)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	currentRoots, currentCounts, err := evaluationFinalizationReviewEvidenceRoots(leaseEvidence)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	for index, family := range evaluationReviewLeaseFamilies {
		stored := lease.Families[index]
		if stored.Family != family || stored.FamilyIndex != int64(index) ||
			stored.ExpectedRecordCount != currentCounts[family] || stored.ExpectedSemanticDigest != currentRoots[family] {
			return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review lease family root drifted")
		}
	}
	mappingDigest, err := evaluationBlindReviewMappingSetDigest(leaseEvidence.Mappings)
	if err != nil || mappingDigest != lease.Commitments.BlindReviewMappingSetDigest ||
		lease.Commitments.RandomizedPresentationPolicyDigest != stringMember(plan.Value["graderPlan"].(map[string]any), "randomizedPresentationPolicyDigest") {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review mapping authority drifted")
	}
	if err := validateEvaluationHumanReviewCryptographicAuthority(plan, frozenAuthority, artifact, report); err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	if err := validateEvaluationHumanReviewDurableBindings(
		writeContext, tx, authority.NamespaceID, partition, plan, leaseEvidence, artifact, report,
	); err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	decodedAttempts, err := evaluationDecodedAttemptsForHumanMetricProjection(
		writeContext, tx, authority.NamespaceID, partition, planRecord,
	)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	serverObservations, err := createEvaluationValidatedHumanMetricObservations(
		plan, decodedAttempts, artifact, report,
	)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	serverObservationBytes, err := canonicaljson.Bytes(serverObservations)
	if err != nil || !bytes.Equal(serverObservationBytes, requestedObservationBytes) ||
		!evaluationHumanReviewCanonicalEqual(serverObservations, requestedObservations) {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human metric projection drifted")
	}
	serverObservationSetDigest, err := evaluationValidatedHumanMetricObservationSetDigest(serverObservations)
	if err != nil || serverObservationSetDigest != validatedHumanMetricObservationSetDigest {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human metric observation set digest drifted")
	}
	var existingArtifact, existingReport, existingObservations []byte
	var existingObservationSetDigest string
	artifactErr := tx.QueryRowContext(writeContext, `SELECT artifact_bytes
		FROM agent_evaluation_validated_human_review_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2 FOR SHARE`, authority.NamespaceID, partition.PlanDigest).Scan(&existingArtifact)
	reportErr := tx.QueryRowContext(writeContext, `SELECT fact_bytes
		FROM agent_evaluation_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2 AND fact_type='evaluation-human-review-report'
		ORDER BY fact_id COLLATE "C" LIMIT 1 FOR SHARE`, authority.NamespaceID, partition.PlanDigest).Scan(&existingReport)
	observationErr := tx.QueryRowContext(writeContext, `SELECT observation_set_digest, observations_bytes
		FROM agent_evaluation_validated_human_metric_observation_sets
		WHERE namespace_id=$1 AND plan_digest=$2 FOR SHARE`, authority.NamespaceID, partition.PlanDigest).
		Scan(&existingObservationSetDigest, &existingObservations)
	artifactExists, reportExists, observationExists := artifactErr == nil, reportErr == nil, observationErr == nil
	if (artifactErr != nil && !errors.Is(artifactErr, sql.ErrNoRows)) ||
		(reportErr != nil && !errors.Is(reportErr, sql.ErrNoRows)) ||
		(observationErr != nil && !errors.Is(observationErr, sql.ErrNoRows)) {
		if artifactErr != nil && !errors.Is(artifactErr, sql.ErrNoRows) {
			return EvaluationValidatedHumanReviewArtifactRecord{}, false, artifactErr
		}
		if reportErr != nil && !errors.Is(reportErr, sql.ErrNoRows) {
			return EvaluationValidatedHumanReviewArtifactRecord{}, false, reportErr
		}
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, observationErr
	}
	if artifactExists != reportExists || artifactExists != observationExists {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review atomic projection is incomplete")
	}
	if artifactExists {
		if !bytes.Equal(existingArtifact, artifact.ArtifactBytes) || !bytes.Equal(existingReport, report.Canonical) ||
			existingObservationSetDigest != serverObservationSetDigest || !bytes.Equal(existingObservations, serverObservationBytes) {
			return EvaluationValidatedHumanReviewArtifactRecord{}, false, conflict("evaluation validated human review replay drifted")
		}
		if err := tx.Commit(); err != nil {
			return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
		}
		result := artifact.EvaluationValidatedHumanReviewArtifactRecord
		result.NamespaceID = authority.NamespaceID
		result.ValidatedHumanMetricObservations = serverObservations
		result.ValidatedHumanMetricObservationBytes = serverObservationBytes
		result.ValidatedHumanMetricObservationSetDigest = serverObservationSetDigest
		return result, true, nil
	}
	if err := insertEvaluationHumanReviewReport(writeContext, tx, authority.NamespaceID, report); err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	if err := insertEvaluationValidatedHumanReviewArtifact(writeContext, tx, authority.NamespaceID, artifact); err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	if err := insertEvaluationValidatedHumanMetricObservations(
		writeContext, tx, authority.NamespaceID, partition, artifact, report,
		serverObservations, serverObservationBytes, serverObservationSetDigest,
	); err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, false, err
	}
	result := artifact.EvaluationValidatedHumanReviewArtifactRecord
	result.NamespaceID = authority.NamespaceID
	result.ValidatedHumanMetricObservations = serverObservations
	result.ValidatedHumanMetricObservationBytes = serverObservationBytes
	result.ValidatedHumanMetricObservationSetDigest = serverObservationSetDigest
	return result, false, nil
}

func scanEvaluationValidatedHumanReviewArtifact(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationValidatedHumanReviewArtifactRecord, error) {
	var record EvaluationValidatedHumanReviewArtifactRecord
	var source, reportSource []byte
	var reviewLeaseDigest sql.NullString
	if err := scanner.Scan(&record.ArtifactID, &record.ReviewArtifactDigest, &reviewLeaseDigest, &record.HumanReviewReportID,
		&record.HumanReviewReportDigest, &record.BlindedArtifactSetDigest, &record.AdjudicationDigest,
		&record.ArtifactDigest, &source, &record.ValidatedAt, &reportSource); err != nil {
		return record, err
	}
	record.ReviewLeaseDigest = reviewLeaseDigest.String
	decoded, err := decodeEvaluationValidatedHumanReviewArtifact(source)
	if err != nil {
		return record, fmt.Errorf("decode persisted evaluation validated human review artifact: %w", err)
	}
	report, err := decodeEvaluationArtifact(reportSource, "evaluation-human-review-report")
	if err != nil || validateEvaluationValidatedHumanReviewReport(&decoded, report) != nil {
		return record, conflict("persisted evaluation validated human review report drifted")
	}
	actual := decoded.EvaluationValidatedHumanReviewArtifactRecord
	if actual.PlanDigest != partition.PlanDigest || actual.RepositoryCommit != partition.RepositoryCommit ||
		record.ArtifactID != actual.ArtifactID || record.ReviewArtifactDigest != actual.ReviewArtifactDigest ||
		record.ReviewLeaseDigest != actual.ReviewLeaseDigest ||
		record.HumanReviewReportID != actual.HumanReviewReportID || record.HumanReviewReportDigest != actual.HumanReviewReportDigest ||
		record.BlindedArtifactSetDigest != actual.BlindedArtifactSetDigest || record.AdjudicationDigest != actual.AdjudicationDigest ||
		record.ArtifactDigest != actual.ArtifactDigest || !record.ValidatedAt.Equal(actual.ValidatedAt) ||
		!bytes.Equal(source, actual.ArtifactBytes) || !bytes.Equal(reportSource, actual.HumanReviewReportFactBytes) {
		return record, conflict("persisted evaluation validated human review metadata drifted")
	}
	actual.NamespaceID = namespaceID
	return actual, nil
}

func queryEvaluationValidatedHumanReviewArtifact(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) (*EvaluationValidatedHumanReviewArtifactRecord, error) {
	row := queryer.QueryRowContext(ctx, `SELECT v.artifact_id, v.review_artifact_digest, v.review_lease_digest, v.human_review_report_id,
		v.human_review_report_digest, v.blinded_artifact_set_digest, v.adjudication_digest,
		v.artifact_digest, v.artifact_bytes, v.validated_at, a.fact_bytes
	FROM agent_evaluation_validated_human_review_artifacts v
	JOIN agent_evaluation_artifacts a
	  ON a.namespace_id=v.namespace_id AND a.plan_digest=v.plan_digest
	 AND a.fact_type=v.human_review_report_type AND a.fact_id=v.human_review_report_id
	WHERE v.namespace_id=$1 AND v.plan_digest=$2 AND v.repository_commit=$3`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	record, err := scanEvaluationValidatedHumanReviewArtifact(row, namespaceID, partition)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	observations, observationBytes, observationSetDigest, err := queryEvaluationValidatedHumanMetricObservations(
		ctx, queryer, namespaceID, partition, record.ArtifactDigest, record.HumanReviewReportDigest,
	)
	if err != nil {
		return nil, err
	}
	if observationSetDigest == "" {
		return nil, conflict("persisted evaluation validated human review lacks its metric projection")
	}
	record.ValidatedHumanMetricObservations = observations
	record.ValidatedHumanMetricObservationBytes = observationBytes
	record.ValidatedHumanMetricObservationSetDigest = observationSetDigest
	return &record, nil
}

func (repository *Repository) GetEvaluationValidatedHumanReviewArtifact(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationValidatedHumanReviewArtifactRecord, error) {
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	record, err := queryEvaluationValidatedHumanReviewArtifact(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, err
	}
	if record == nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, ErrNotFound
	}
	if err := commitEvaluationReadSnapshot(tx); err != nil {
		return EvaluationValidatedHumanReviewArtifactRecord{}, err
	}
	return *record, nil
}

func (repository *Repository) ListEvaluationValidatedHumanReviewArtifacts(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationValidatedHumanReviewArtifactRecord, error) {
	record, err := repository.GetEvaluationValidatedHumanReviewArtifact(ctx, authority, partition)
	if errors.Is(err, ErrNotFound) {
		return []EvaluationValidatedHumanReviewArtifactRecord{}, nil
	}
	if err != nil {
		return nil, err
	}
	return []EvaluationValidatedHumanReviewArtifactRecord{record}, nil
}

func validateEvaluationValidatedHumanReviewSnapshot(
	artifacts []EvaluationArtifactRecord,
	validated *EvaluationValidatedHumanReviewArtifactRecord,
) error {
	var humanReport *EvaluationArtifactRecord
	for index := range artifacts {
		if artifacts[index].FactType != "evaluation-human-review-report" {
			continue
		}
		if humanReport != nil {
			return conflict("evaluation snapshot contains duplicate human review reports")
		}
		humanReport = &artifacts[index]
	}
	if (humanReport == nil) != (validated == nil) {
		return conflict("evaluation snapshot lacks its atomic validated human review pair")
	}
	if humanReport != nil && (humanReport.FactID != validated.HumanReviewReportID ||
		humanReport.FactDigest != validated.HumanReviewReportDigest ||
		!bytes.Equal(humanReport.FactBytes, validated.HumanReviewReportFactBytes)) {
		return conflict("evaluation snapshot validated human review report drifted")
	}
	if validated != nil && !evaluationDigestPattern.MatchString(validated.ReviewLeaseDigest) {
		return conflict("evaluation snapshot validated human review lacks its review lease binding")
	}
	if validated != nil && (!evaluationDigestPattern.MatchString(validated.ValidatedHumanMetricObservationSetDigest) ||
		len(validated.ValidatedHumanMetricObservationBytes) == 0) {
		return conflict("evaluation snapshot validated human review lacks its metric projection")
	}
	return nil
}

func evaluationValidatedHumanReviewLeaseDigest(
	artifacts []EvaluationArtifactRecord,
	validated *EvaluationValidatedHumanReviewArtifactRecord,
) (string, error) {
	if err := validateEvaluationValidatedHumanReviewSnapshot(artifacts, validated); err != nil {
		return "", err
	}
	if validated == nil {
		return "", nil
	}
	return validated.ReviewLeaseDigest, nil
}

func evaluationValidatedHumanReviewArtifactSetDigest(
	records []EvaluationValidatedHumanReviewArtifactRecord,
) (string, error) {
	if len(records) > 1 {
		return "", conflict("evaluation validated human review artifact set is not a singleton")
	}
	ordered := append([]EvaluationValidatedHumanReviewArtifactRecord(nil), records...)
	sort.Slice(ordered, func(left, right int) bool { return ordered[left].ArtifactID < ordered[right].ArtifactID })
	digests := make([]string, len(ordered))
	for index := range ordered {
		digests[index] = ordered[index].ArtifactDigest
	}
	return canonicaljson.Digest(digests)
}
