package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	maximumEvaluationValidatedHumanMetricObservationBytes    = 131_072
	maximumEvaluationValidatedHumanMetricObservationSetBytes = 4_194_304
	maximumEvaluationValidatedHumanMetricObservationCount    = 72
)

var evaluationValidatedHumanMetricObservationRequiredFields = []string{
	"attemptId", "authority", "basis", "candidateAdjudicationDigest", "criterionIds",
	"descriptorDigest", "format", "graderId", "graderKind", "humanReviewReportDigest",
	"metricId", "observationDigest", "observationId", "observedAt", "planDigest",
	"randomizedPresentationId", "ratingDigests", "repositoryCommit", "reviewLeaseDigest",
	"reviewerAuthorityIds", "rubricDigest", "validatedHumanReviewArtifactDigest", "verdict", "version",
}

func decodeEvaluationValidatedHumanMetricObservationSet(source []byte) ([]map[string]any, []byte, error) {
	if err := canonicaljson.ValidateRawEnvelope(source, maximumEvaluationValidatedHumanMetricObservationSetBytes); err != nil {
		return nil, nil, invalid("evaluation validated human metric observation set is invalid")
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var observations []map[string]any
	if err := decoder.Decode(&observations); err != nil || observations == nil || len(observations) > maximumEvaluationValidatedHumanMetricObservationCount {
		return nil, nil, invalid("evaluation validated human metric observation set is malformed")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return nil, nil, invalid("evaluation validated human metric observation set has trailing data")
	}
	canonical, err := canonicaljson.Bytes(observations)
	if err != nil || !bytes.Equal(canonical, source) {
		return nil, nil, invalid("evaluation validated human metric observation set is not canonical")
	}
	previous := ""
	for index, observation := range observations {
		if err := validateEvaluationValidatedHumanMetricObservation(observation); err != nil {
			return nil, nil, err
		}
		observationID := stringMember(observation, "observationId")
		if index > 0 && previous >= observationID {
			return nil, nil, invalid("evaluation validated human metric observation set order is invalid")
		}
		previous = observationID
	}
	return observations, canonical, nil
}

func validateEvaluationValidatedHumanMetricObservation(value map[string]any) error {
	if len(value) == 0 || !exactEvaluationKeys(
		value, evaluationValidatedHumanMetricObservationRequiredFields, "decisionDigest",
	) || value["format"] != evaluationValidatedHumanMetricObservationFormat || value["version"] != json.Number("1") ||
		!evaluationHumanReviewIdentityPattern.MatchString(stringMember(value, "observationId")) ||
		!evaluationHumanReviewIdentityPattern.MatchString(stringMember(value, "attemptId")) ||
		!evaluationHumanReviewIdentityPattern.MatchString(stringMember(value, "randomizedPresentationId")) ||
		!evaluationHumanReviewIdentityPattern.MatchString(stringMember(value, "metricId")) ||
		!evaluationHumanReviewIdentityPattern.MatchString(stringMember(value, "graderId")) ||
		stringMember(value, "graderKind") != "blind-human-rubric" || stringMember(value, "authority") != "human" ||
		(stringMember(value, "basis") != "rubric-all-pass" && stringMember(value, "basis") != "inter-rater-disagreement") ||
		(stringMember(value, "verdict") != "passed" && stringMember(value, "verdict") != "failed") {
		return invalid("evaluation validated human metric observation shape is invalid")
	}
	for _, field := range []string{
		"planDigest", "descriptorDigest", "rubricDigest", "candidateAdjudicationDigest",
		"reviewLeaseDigest", "humanReviewReportDigest", "validatedHumanReviewArtifactDigest", "observationDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return invalid("evaluation validated human metric observation digest is invalid")
		}
	}
	if decisionDigest, exists := value["decisionDigest"]; exists && !evaluationDigestPattern.MatchString(stringMember(map[string]any{"value": decisionDigest}, "value")) {
		return invalid("evaluation validated human metric decision digest is invalid")
	}
	if !evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) {
		return invalid("evaluation validated human metric repository commit is invalid")
	}
	criterionIDs, err := evaluationHumanReviewCanonicalStringSet(value["criterionIds"], false, "human metric criterion ids")
	if err != nil || len(criterionIDs) > 32 {
		return invalid("evaluation validated human metric criterion ids are invalid")
	}
	for _, field := range []string{"ratingDigests", "reviewerAuthorityIds"} {
		values, err := evaluationHumanReviewCanonicalStringSet(value[field], false, "human metric "+field)
		if err != nil || len(values) < 2 || len(values) > 16 {
			return invalid("evaluation validated human metric authority set is invalid")
		}
		for _, entry := range values {
			if field == "ratingDigests" && !evaluationDigestPattern.MatchString(entry) {
				return invalid("evaluation validated human metric rating digest is invalid")
			}
		}
	}
	observedAt, err := evaluationInstant(value["observedAt"], "evaluation human metric observedAt")
	if err != nil || observedAt.IsZero() {
		return invalid("evaluation validated human metric observedAt is invalid")
	}
	identity := map[string]any{
		"planDigest": value["planDigest"], "attemptId": value["attemptId"], "metricId": value["metricId"],
		"validatedHumanReviewArtifactDigest": value["validatedHumanReviewArtifactDigest"],
	}
	identityDigest, err := canonicaljson.Digest(identity)
	if err != nil || stringMember(value, "observationId") != "human-metric-observation:"+identityDigest[len("sha256-"):] {
		return invalid("evaluation validated human metric observation identity drifted")
	}
	base := make(map[string]any, len(value)-1)
	for key, entry := range value {
		if key != "observationDigest" {
			base[key] = entry
		}
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "observationDigest") {
		return invalid("evaluation validated human metric observation digest drifted")
	}
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) > maximumEvaluationValidatedHumanMetricObservationBytes {
		return invalid("evaluation validated human metric observation exceeds its bound")
	}
	return nil
}

func evaluationDecodedAttemptsForHumanMetricProjection(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	planRecord EvaluationPlanRecord,
) ([]evaluationAttemptFact, error) {
	records, err := queryEvaluationAttempts(ctx, queryer, namespaceID, partition, planRecord, "")
	if err != nil {
		return nil, err
	}
	decoded := make([]evaluationAttemptFact, len(records))
	for index, record := range records {
		decoded[index], err = decodeEvaluationAttempt(record.FactBytes)
		if err != nil {
			return nil, err
		}
	}
	return decoded, nil
}

func insertEvaluationValidatedHumanMetricObservations(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	partition EvaluationPlanPartition,
	artifact evaluationValidatedHumanReviewArtifact,
	report evaluationArtifactFact,
	observations []map[string]any,
	observationBytes []byte,
	setDigest string,
) error {
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_validated_human_metric_observation_sets (
		namespace_id, plan_digest, repository_commit, validated_human_review_artifact_digest,
		human_review_report_digest, observation_set_digest, observation_count, observations_bytes, observed_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, artifact.ArtifactDigest,
		report.FactDigest, setDigest, len(observations), observationBytes, report.RecordedAt)
	if err != nil {
		return err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return err
	}
	if inserted != 1 {
		return conflict("evaluation validated human metric observation set was preoccupied")
	}
	for _, observation := range observations {
		observedAt, err := time.Parse(time.RFC3339Nano, stringMember(observation, "observedAt"))
		if err != nil || !observedAt.Equal(report.RecordedAt) {
			return conflict("evaluation validated human metric observation time drifted")
		}
		encoded, err := canonicaljson.Bytes(observation)
		if err != nil {
			return err
		}
		result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_validated_human_metric_observations (
			namespace_id, plan_digest, repository_commit, observation_id, attempt_id, descriptor_digest,
			randomized_presentation_id, metric_id, observation_digest, observation_json, observation_bytes, observed_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) ON CONFLICT DO NOTHING`,
			namespaceID, partition.PlanDigest, partition.RepositoryCommit,
			stringMember(observation, "observationId"), stringMember(observation, "attemptId"),
			stringMember(observation, "descriptorDigest"), stringMember(observation, "randomizedPresentationId"),
			stringMember(observation, "metricId"), stringMember(observation, "observationDigest"),
			string(encoded), encoded, observedAt)
		if err != nil {
			return err
		}
		inserted, err := result.RowsAffected()
		if err != nil || inserted != 1 {
			if err != nil {
				return err
			}
			return conflict("evaluation validated human metric observation was preoccupied")
		}
	}
	return nil
}

func queryEvaluationValidatedHumanMetricObservations(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	artifactDigest string,
	reportDigest string,
) ([]map[string]any, []byte, string, error) {
	var setDigest string
	var count int64
	var source []byte
	err := queryer.QueryRowContext(ctx, `SELECT observation_set_digest, observation_count, observations_bytes
		FROM agent_evaluation_validated_human_metric_observation_sets
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		  AND validated_human_review_artifact_digest=$4 AND human_review_report_digest=$5`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, artifactDigest, reportDigest).
		Scan(&setDigest, &count, &source)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, "", nil
	}
	if err != nil {
		return nil, nil, "", err
	}
	observations, canonical, err := decodeEvaluationValidatedHumanMetricObservationSet(source)
	if err != nil || int64(len(observations)) != count {
		return nil, nil, "", conflict("persisted evaluation validated human metric observation set drifted")
	}
	actualDigest, err := evaluationValidatedHumanMetricObservationSetDigest(observations)
	if err != nil || actualDigest != setDigest {
		return nil, nil, "", conflict("persisted evaluation validated human metric observation set digest drifted")
	}
	rows, err := queryer.QueryContext(ctx, `SELECT observation_id, observation_digest, observation_bytes
		FROM agent_evaluation_validated_human_metric_observations
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
		ORDER BY observation_id COLLATE "C" ASC`, namespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, nil, "", err
	}
	defer rows.Close()
	type persisted struct {
		id, digest string
		source     []byte
	}
	values := make([]persisted, 0, len(observations))
	for rows.Next() {
		var value persisted
		if err := rows.Scan(&value.id, &value.digest, &value.source); err != nil {
			return nil, nil, "", err
		}
		values = append(values, value)
	}
	if err := rows.Err(); err != nil || len(values) != len(observations) {
		if err != nil {
			return nil, nil, "", err
		}
		return nil, nil, "", conflict("persisted evaluation validated human metric observation count drifted")
	}
	for index, observation := range observations {
		encoded, err := canonicaljson.Bytes(observation)
		if err != nil || values[index].id != stringMember(observation, "observationId") ||
			values[index].digest != stringMember(observation, "observationDigest") || !bytes.Equal(values[index].source, encoded) {
			return nil, nil, "", conflict("persisted evaluation validated human metric observation drifted")
		}
	}
	return observations, canonical, setDigest, nil
}

func queryEvaluationValidatedHumanMetricObservationSnapshot(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
) ([]map[string]any, string, error) {
	var artifactDigest, reportDigest string
	err := queryer.QueryRowContext(ctx, `SELECT validated_human_review_artifact_digest, human_review_report_digest
		FROM agent_evaluation_validated_human_metric_observation_sets
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit).Scan(&artifactDigest, &reportDigest)
	if errors.Is(err, sql.ErrNoRows) {
		// Holdout sealing intentionally precedes review. Keep that machine-only
		// phase content-addressed with the canonical empty observation set; once
		// review is imported, the immutable v44 row replaces this projection with
		// the exact non-empty human authority root.
		empty := []map[string]any{}
		digest, digestErr := evaluationValidatedHumanMetricObservationSetDigest(empty)
		return empty, digest, digestErr
	}
	if err != nil {
		return nil, "", err
	}
	observations, _, setDigest, err := queryEvaluationValidatedHumanMetricObservations(
		ctx, queryer, namespaceID, partition, artifactDigest, reportDigest,
	)
	return observations, setDigest, err
}

func canonicalEvaluationValidatedHumanMetricObservations(observations []map[string]any) []map[string]any {
	ordered := append([]map[string]any(nil), observations...)
	sort.Slice(ordered, func(left, right int) bool {
		return stringMember(ordered[left], "observationId") < stringMember(ordered[right], "observationId")
	})
	return ordered
}
