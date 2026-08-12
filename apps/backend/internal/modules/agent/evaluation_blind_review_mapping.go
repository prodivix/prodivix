package agent

import (
	"bytes"
	"context"
	cryptorand "crypto/rand"
	"encoding/base64"
	"fmt"
	"io"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationBlindReviewMappingFormat = "prodivix.g4-model-evaluation-blind-review-mapping"

const maximumEvaluationBlindReviewRandomAttempts = 8

type EvaluationBlindReviewMappingRecord struct {
	NamespaceID                        string
	PlanDigest                         string
	RepositoryCommit                   string
	MappingID                          string
	CandidateID                        string
	AttemptID                          string
	CandidateDigest                    string
	BytesDigest                        string
	RubricDigest                       string
	RandomizedPresentationPolicyDigest string
	RandomizedPresentationID           string
	MappingDigest                      string
	MappingBytes                       []byte
	CreatedAt                          time.Time
}

type EvaluationBlindReviewMappingRef struct {
	MappingID     string
	MappingDigest string
}

type evaluationBlindReviewMapping struct {
	EvaluationBlindReviewMappingRecord
	Value map[string]any
}

func validEvaluationRandomizedPresentationID(value string) bool {
	const prefix = "blind-review:"
	if !strings.HasPrefix(value, prefix) {
		return false
	}
	encoded := strings.TrimPrefix(value, prefix)
	decoded, err := base64.RawURLEncoding.DecodeString(encoded)
	return err == nil && len(decoded) == 32 && base64.RawURLEncoding.EncodeToString(decoded) == encoded
}

func decodeEvaluationBlindReviewMapping(source []byte) (evaluationBlindReviewMapping, error) {
	if len(source) == 0 || len(source) > maximumEvaluationServiceControlBytes {
		return evaluationBlindReviewMapping{}, invalid("evaluation blind review mapping exceeds its byte limit")
	}
	value, canonical, err := decodeEvaluationAuthenticityObject(source)
	if err != nil {
		return evaluationBlindReviewMapping{}, err
	}
	if !exactEvaluationKeys(value, []string{
		"format", "version", "mappingId", "planDigest", "repositoryCommit", "candidateId", "attemptId",
		"candidateDigest", "bytesDigest", "rubricDigest", "randomizedPresentationPolicyDigest",
		"randomizedPresentationId", "createdAt", "mappingDigest",
	}) || value["format"] != evaluationBlindReviewMappingFormat {
		return evaluationBlindReviewMapping{}, invalid("evaluation blind review mapping shape or format is invalid")
	}
	version, versionOK := integerMember(value, "version")
	if !versionOK || version != 1 {
		return evaluationBlindReviewMapping{}, invalid("evaluation blind review mapping version is invalid")
	}
	for _, field := range []string{"mappingId", "candidateId", "attemptId"} {
		if _, err := evaluationAuthenticityIdentity(value[field], field); err != nil {
			return evaluationBlindReviewMapping{}, err
		}
	}
	planDigest, err := evaluationAuthenticityDigest(value["planDigest"], "plan digest")
	if err != nil {
		return evaluationBlindReviewMapping{}, err
	}
	repositoryCommit, ok := value["repositoryCommit"].(string)
	if !ok || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return evaluationBlindReviewMapping{}, invalid("evaluation blind review mapping commit is invalid")
	}
	for _, field := range []string{
		"candidateDigest", "bytesDigest", "rubricDigest", "randomizedPresentationPolicyDigest", "mappingDigest",
	} {
		if _, err := evaluationAuthenticityDigest(value[field], field); err != nil {
			return evaluationBlindReviewMapping{}, err
		}
	}
	randomizedID, ok := value["randomizedPresentationId"].(string)
	if !ok || !validEvaluationRandomizedPresentationID(randomizedID) {
		return evaluationBlindReviewMapping{}, invalid("evaluation randomized presentation identity is invalid")
	}
	createdAt, err := evaluationInstant(value["createdAt"], "evaluation blind review mapping time")
	if err != nil || !evaluationCanonicalObjectDigest(value, "mappingDigest") {
		return evaluationBlindReviewMapping{}, invalid("evaluation blind review mapping time or digest is invalid")
	}
	return evaluationBlindReviewMapping{
		EvaluationBlindReviewMappingRecord: EvaluationBlindReviewMappingRecord{
			PlanDigest: planDigest, RepositoryCommit: repositoryCommit, MappingID: stringMember(value, "mappingId"),
			CandidateID: stringMember(value, "candidateId"), AttemptID: stringMember(value, "attemptId"),
			CandidateDigest: stringMember(value, "candidateDigest"), BytesDigest: stringMember(value, "bytesDigest"),
			RubricDigest:                       stringMember(value, "rubricDigest"),
			RandomizedPresentationPolicyDigest: stringMember(value, "randomizedPresentationPolicyDigest"),
			RandomizedPresentationID:           randomizedID, MappingDigest: stringMember(value, "mappingDigest"),
			MappingBytes: canonical, CreatedAt: createdAt,
		},
		Value: value,
	}, nil
}

func validateEvaluationBlindReviewRubric(plan evaluationPlanFact, mapping evaluationBlindReviewMapping) error {
	graderPlan, ok := objectMember(plan.Value, "graderPlan")
	if !ok || stringMember(graderPlan, "randomizedPresentationPolicyDigest") != mapping.RandomizedPresentationPolicyDigest {
		return conflict("evaluation blind review mapping presentation policy drifted from the frozen plan")
	}
	blindIDs, _ := graderPlan["blindHumanGraderIds"].([]any)
	blind := make(map[string]struct{}, len(blindIDs))
	for _, raw := range blindIDs {
		if id, ok := raw.(string); ok {
			blind[id] = struct{}{}
		}
	}
	graders, _ := graderPlan["graders"].([]any)
	matched := 0
	for _, raw := range graders {
		grader, _ := raw.(map[string]any)
		_, isBlind := blind[stringMember(grader, "graderId")]
		if isBlind && stringMember(grader, "kind") == "blind-human-rubric" &&
			stringMember(grader, "authority") == "human" &&
			stringMember(grader, "configurationDigest") == mapping.RubricDigest {
			matched++
		}
	}
	if matched != 1 {
		return conflict("evaluation blind review mapping rubric is outside the frozen human grader plan")
	}
	return nil
}

func validateEvaluationBlindReviewCandidateBinding(
	plan evaluationPlanFact,
	candidate EvaluationReviewCandidateRef,
	mapping evaluationBlindReviewMapping,
) error {
	if mapping.PlanDigest != plan.PlanDigest || mapping.RepositoryCommit != plan.RepositoryCommit ||
		mapping.CandidateID != candidate.CandidateID || mapping.AttemptID != candidate.AttemptID ||
		mapping.CandidateDigest != candidate.CandidateDigest || mapping.BytesDigest != candidate.BytesDigest ||
		mapping.CreatedAt.Before(candidate.GeneratedAt) || mapping.CreatedAt.After(plan.ExpiresAt) {
		return conflict("evaluation blind review mapping drifted from its safe candidate")
	}
	return validateEvaluationBlindReviewRubric(plan, mapping)
}

func evaluationBlindReviewConfiguration(plan evaluationPlanFact) (string, string, error) {
	graderPlan, ok := objectMember(plan.Value, "graderPlan")
	if !ok {
		return "", "", conflict("evaluation blind review configuration is missing")
	}
	policyDigest := stringMember(graderPlan, "randomizedPresentationPolicyDigest")
	if !evaluationDigestPattern.MatchString(policyDigest) {
		return "", "", conflict("evaluation blind review presentation policy is invalid")
	}
	blindIDs, ok := graderPlan["blindHumanGraderIds"].([]any)
	if !ok || len(blindIDs) == 0 {
		return "", "", conflict("evaluation blind review grader authority is missing")
	}
	blind := make(map[string]struct{}, len(blindIDs))
	for _, raw := range blindIDs {
		id, ok := raw.(string)
		if !ok || !validEvaluationServiceIdentity(id) {
			return "", "", conflict("evaluation blind review grader identity is invalid")
		}
		blind[id] = struct{}{}
	}
	graders, ok := graderPlan["graders"].([]any)
	if !ok {
		return "", "", conflict("evaluation blind review grader plan is invalid")
	}
	rubricDigest := ""
	for _, raw := range graders {
		grader, ok := raw.(map[string]any)
		if !ok {
			return "", "", conflict("evaluation blind review grader plan is invalid")
		}
		if _, isBlind := blind[stringMember(grader, "graderId")]; !isBlind {
			continue
		}
		if stringMember(grader, "kind") != "blind-human-rubric" || stringMember(grader, "authority") != "human" ||
			!evaluationDigestPattern.MatchString(stringMember(grader, "configurationDigest")) || rubricDigest != "" {
			return "", "", conflict("evaluation blind review grader authority is ambiguous")
		}
		rubricDigest = stringMember(grader, "configurationDigest")
	}
	if rubricDigest == "" {
		return "", "", conflict("evaluation blind review grader authority is missing")
	}
	return rubricDigest, policyDigest, nil
}

func evaluationBlindReviewMappingID(plan evaluationPlanFact, candidate EvaluationReviewCandidateRef, policyDigest string) (string, error) {
	digest, err := canonicaljson.Digest(map[string]any{
		"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
		"candidateId": candidate.CandidateID, "candidateDigest": candidate.CandidateDigest,
		"policyDigest": policyDigest,
	})
	if err != nil {
		return "", err
	}
	return "evaluation-blind-mapping:" + strings.TrimPrefix(digest, "sha256-"), nil
}

func evaluationBlindReviewCandidateByID(
	candidates []EvaluationReviewCandidateRef,
	candidateID string,
) (EvaluationReviewCandidateRef, error) {
	var matched *EvaluationReviewCandidateRef
	for index := range candidates {
		if candidates[index].CandidateID != candidateID {
			continue
		}
		if matched != nil {
			return EvaluationReviewCandidateRef{}, conflict("evaluation blind review candidate identity is duplicated")
		}
		candidate := candidates[index]
		matched = &candidate
	}
	if matched == nil {
		return EvaluationReviewCandidateRef{}, ErrNotFound
	}
	return *matched, nil
}

func (repository *Repository) CreateEvaluationBlindReviewMapping(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	candidateID string,
) (EvaluationBlindReviewMappingRecord, bool, error) {
	return repository.createEvaluationBlindReviewMapping(
		ctx, authority, partition, candidateID, time.Now().UTC(), cryptorand.Reader,
	)
}

func (repository *Repository) createEvaluationBlindReviewMapping(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	candidateID string,
	now time.Time,
	randomness io.Reader,
) (EvaluationBlindReviewMappingRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	if !validEvaluationServiceIdentity(candidateID) || randomness == nil || now.IsZero() {
		return EvaluationBlindReviewMappingRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, planRecord, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	candidates, err := queryEvaluationReviewCandidateRefs(writeContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	candidate, err := evaluationBlindReviewCandidateByID(candidates, candidateID)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	attempts, err := queryEvaluationAttempts(writeContext, tx, authority.NamespaceID, partition, planRecord,
		" AND attempt_id = $4", candidate.AttemptID)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	invocations, err := queryEvaluationInvocationTurnReceipts(writeContext, tx, authority.NamespaceID, partition, candidate.AttemptID)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	executions, err := queryEvaluationExecutionReceipts(writeContext, tx, authority.NamespaceID, partition, planRecord, attempts,
		" AND attempt_id = $4", candidate.AttemptID)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	scans, err := queryEvaluationReviewRasterScanReceipts(writeContext, tx, authority.NamespaceID, partition,
		" AND attempt_id = $4", candidate.AttemptID)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	if err := validateEvaluationReviewCandidateBindings(planRecord, attempts, invocations, executions, scans,
		[]EvaluationReviewCandidateRef{candidate}, false); err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	existing, err := queryEvaluationBlindReviewMappings(writeContext, tx, authority.NamespaceID, partition,
		" AND candidate_id = $4", candidate.CandidateID)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	if len(existing) == 1 {
		mapping, err := decodeEvaluationBlindReviewMapping(existing[0].MappingBytes)
		if err != nil || validateEvaluationBlindReviewCandidateBinding(plan, candidate, mapping) != nil {
			return EvaluationBlindReviewMappingRecord{}, false, conflict("evaluation blind review mapping replay drifted")
		}
		if err := tx.Commit(); err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, err
		}
		return existing[0], true, nil
	}
	if len(existing) != 0 {
		return EvaluationBlindReviewMappingRecord{}, false, conflict("evaluation blind review candidate has duplicate mappings")
	}
	rubricDigest, policyDigest, err := evaluationBlindReviewConfiguration(plan)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	mappingID, err := evaluationBlindReviewMappingID(plan, candidate, policyDigest)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, false, err
	}
	createdAt, err := time.Parse(time.RFC3339Nano, evaluationExportInstant(now))
	if err != nil || createdAt.Before(candidate.GeneratedAt) || createdAt.After(plan.ExpiresAt) {
		return EvaluationBlindReviewMappingRecord{}, false, conflict("evaluation blind review server time is outside the candidate qualification window")
	}
	for attempt := 0; attempt < maximumEvaluationBlindReviewRandomAttempts; attempt++ {
		randomBytes := make([]byte, 32)
		if _, err := io.ReadFull(randomness, randomBytes); err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, fmt.Errorf("generate evaluation blind review identity: %w", err)
		}
		randomizedPresentationID := "blind-review:" + base64.RawURLEncoding.EncodeToString(randomBytes)
		base := map[string]any{
			"format": evaluationBlindReviewMappingFormat, "version": int64(1), "mappingId": mappingID,
			"planDigest": plan.PlanDigest, "repositoryCommit": plan.RepositoryCommit,
			"candidateId": candidate.CandidateID, "attemptId": candidate.AttemptID,
			"candidateDigest": candidate.CandidateDigest, "bytesDigest": candidate.BytesDigest,
			"rubricDigest": rubricDigest, "randomizedPresentationPolicyDigest": policyDigest,
			"randomizedPresentationId": randomizedPresentationID, "createdAt": evaluationExportInstant(createdAt),
		}
		mappingDigest, err := canonicaljson.Digest(base)
		if err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, err
		}
		base["mappingDigest"] = mappingDigest
		mappingBytes, err := canonicaljson.Bytes(base)
		if err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, err
		}
		mapping, err := decodeEvaluationBlindReviewMapping(mappingBytes)
		if err != nil || validateEvaluationBlindReviewCandidateBinding(plan, candidate, mapping) != nil {
			return EvaluationBlindReviewMappingRecord{}, false, conflict("generated evaluation blind review mapping is invalid")
		}
		result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_blind_review_mappings (
			namespace_id, plan_digest, repository_commit, mapping_id, candidate_id, attempt_id,
			candidate_digest, bytes_digest, rubric_digest, randomized_presentation_policy_digest,
			randomized_presentation_id, mapping_digest, mapping_json, mapping_bytes, created_at
		) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14, $15)
		ON CONFLICT DO NOTHING`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
			mapping.MappingID, mapping.CandidateID, mapping.AttemptID, mapping.CandidateDigest, mapping.BytesDigest,
			mapping.RubricDigest, mapping.RandomizedPresentationPolicyDigest, mapping.RandomizedPresentationID,
			mapping.MappingDigest, string(mapping.MappingBytes), mapping.MappingBytes, mapping.CreatedAt)
		if err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, err
		}
		inserted, err := result.RowsAffected()
		if err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, err
		}
		if inserted == 1 {
			if err := tx.Commit(); err != nil {
				return EvaluationBlindReviewMappingRecord{}, false, err
			}
			record := mapping.EvaluationBlindReviewMappingRecord
			record.NamespaceID = authority.NamespaceID
			return record, false, nil
		}
		existing, err := queryEvaluationBlindReviewMappings(writeContext, tx, authority.NamespaceID, partition,
			" AND candidate_id = $4", candidate.CandidateID)
		if err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, err
		}
		if len(existing) == 1 {
			if err := tx.Commit(); err != nil {
				return EvaluationBlindReviewMappingRecord{}, false, err
			}
			return existing[0], true, nil
		}
		identityCollision, err := queryEvaluationBlindReviewMappings(writeContext, tx, authority.NamespaceID, partition,
			" AND mapping_id = $4", mappingID)
		if err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, err
		}
		if len(identityCollision) != 0 {
			return EvaluationBlindReviewMappingRecord{}, false, conflict("evaluation blind review mapping identity collided")
		}
		presentationCollision, err := queryEvaluationBlindReviewMappings(writeContext, tx, authority.NamespaceID, partition,
			" AND randomized_presentation_id = $4", randomizedPresentationID)
		if err != nil {
			return EvaluationBlindReviewMappingRecord{}, false, err
		}
		if len(presentationCollision) == 0 {
			return EvaluationBlindReviewMappingRecord{}, false, conflict("evaluation blind review mapping insert conflict is unexplained")
		}
	}
	return EvaluationBlindReviewMappingRecord{}, false, conflict("evaluation blind review random identity collisions were exhausted")
}

func scanEvaluationBlindReviewMapping(
	scanner interface{ Scan(...any) error },
	namespaceID string,
	partition EvaluationPlanPartition,
) (EvaluationBlindReviewMappingRecord, error) {
	var record EvaluationBlindReviewMappingRecord
	var source []byte
	if err := scanner.Scan(&record.MappingID, &record.CandidateID, &record.AttemptID, &record.CandidateDigest,
		&record.BytesDigest, &record.RubricDigest, &record.RandomizedPresentationPolicyDigest,
		&record.RandomizedPresentationID, &record.MappingDigest, &source, &record.CreatedAt); err != nil {
		return EvaluationBlindReviewMappingRecord{}, err
	}
	decoded, err := decodeEvaluationBlindReviewMapping(source)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, fmt.Errorf("decode persisted blind review mapping: %w", err)
	}
	actual := decoded.EvaluationBlindReviewMappingRecord
	if !bytes.Equal(source, decoded.MappingBytes) || actual.PlanDigest != partition.PlanDigest ||
		actual.RepositoryCommit != partition.RepositoryCommit || record.MappingID != actual.MappingID ||
		record.CandidateID != actual.CandidateID || record.AttemptID != actual.AttemptID ||
		record.CandidateDigest != actual.CandidateDigest || record.BytesDigest != actual.BytesDigest ||
		record.RubricDigest != actual.RubricDigest ||
		record.RandomizedPresentationPolicyDigest != actual.RandomizedPresentationPolicyDigest ||
		record.RandomizedPresentationID != actual.RandomizedPresentationID || record.MappingDigest != actual.MappingDigest ||
		!record.CreatedAt.Equal(actual.CreatedAt) {
		return EvaluationBlindReviewMappingRecord{}, conflict("persisted blind review mapping metadata drifted")
	}
	actual.NamespaceID, actual.MappingBytes = namespaceID, append([]byte(nil), source...)
	return actual, nil
}

func queryEvaluationBlindReviewMappings(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	condition string,
	args ...any,
) ([]EvaluationBlindReviewMappingRecord, error) {
	queryArgs := append([]any{namespaceID, partition.PlanDigest, partition.RepositoryCommit}, args...)
	rows, err := queryer.QueryContext(ctx, `SELECT mapping_id, candidate_id, attempt_id, candidate_digest,
		bytes_digest, rubric_digest, randomized_presentation_policy_digest, randomized_presentation_id,
		mapping_digest, mapping_bytes, created_at
	FROM agent_evaluation_blind_review_mappings
	WHERE namespace_id = $1 AND plan_digest = $2 AND repository_commit = $3`+condition+`
	ORDER BY randomized_presentation_id COLLATE "C" ASC`, queryArgs...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationBlindReviewMappingRecord, 0)
	seenCandidate, seenAttempt, seenPresentation, seenDigest := map[string]bool{}, map[string]bool{}, map[string]bool{}, map[string]bool{}
	for rows.Next() {
		record, err := scanEvaluationBlindReviewMapping(rows, namespaceID, partition)
		if err != nil {
			return nil, err
		}
		if seenCandidate[record.CandidateID] || seenAttempt[record.AttemptID] ||
			seenPresentation[record.RandomizedPresentationID] || seenDigest[record.MappingDigest] {
			return nil, conflict("evaluation blind review mapping set contains duplicate identity")
		}
		seenCandidate[record.CandidateID], seenAttempt[record.AttemptID] = true, true
		seenPresentation[record.RandomizedPresentationID], seenDigest[record.MappingDigest] = true, true
		records = append(records, record)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].RandomizedPresentationID < records[right].RandomizedPresentationID
	})
	return records, nil
}

func validateEvaluationBlindReviewMappingSet(
	plan evaluationPlanFact,
	candidates []EvaluationReviewCandidateRef,
	mappings []EvaluationBlindReviewMappingRecord,
	requireComplete bool,
) error {
	candidateByID := make(map[string]EvaluationReviewCandidateRef, len(candidates))
	for _, candidate := range candidates {
		candidateByID[candidate.CandidateID] = candidate
	}
	seen := make(map[string]struct{}, len(mappings))
	for _, record := range mappings {
		mapping, err := decodeEvaluationBlindReviewMapping(record.MappingBytes)
		if err != nil {
			return err
		}
		candidate, exists := candidateByID[mapping.CandidateID]
		if !exists {
			return conflict("evaluation blind review mapping has no safe candidate")
		}
		if err := validateEvaluationBlindReviewCandidateBinding(plan, candidate, mapping); err != nil {
			return err
		}
		seen[mapping.CandidateID] = struct{}{}
	}
	if requireComplete && len(seen) != len(candidates) {
		return conflict("evaluation blind review mapping set does not exactly cover review candidates")
	}
	return nil
}

func evaluationBlindReviewMappingSetDigest(records []EvaluationBlindReviewMappingRecord) (string, error) {
	ordered := append([]EvaluationBlindReviewMappingRecord(nil), records...)
	sort.Slice(ordered, func(left, right int) bool {
		return ordered[left].MappingID < ordered[right].MappingID
	})
	refs := make([]any, len(ordered))
	for index, record := range ordered {
		refs[index] = map[string]any{"mappingId": record.MappingID, "mappingDigest": record.MappingDigest}
	}
	return canonicaljson.Digest(refs)
}

func evaluationBlindReviewMappingRefs(records []EvaluationBlindReviewMappingRecord) ([]EvaluationBlindReviewMappingRef, error) {
	ordered := append([]EvaluationBlindReviewMappingRecord(nil), records...)
	sort.Slice(ordered, func(left, right int) bool { return ordered[left].MappingID < ordered[right].MappingID })
	refs := make([]EvaluationBlindReviewMappingRef, len(ordered))
	for index, record := range ordered {
		if index > 0 && ordered[index-1].MappingID == record.MappingID {
			return nil, conflict("evaluation blind review mapping references contain duplicate identity")
		}
		refs[index] = EvaluationBlindReviewMappingRef{MappingID: record.MappingID, MappingDigest: record.MappingDigest}
	}
	return refs, nil
}

func (repository *Repository) ListEvaluationBlindReviewMappings(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationBlindReviewMappingRecord, error) {
	readContext, cancel, tx, planRecord, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return nil, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	mappings, err := queryEvaluationBlindReviewMappings(readContext, tx, authority.NamespaceID, partition, "")
	if err != nil {
		return nil, err
	}
	candidates, err := queryEvaluationReviewCandidateRefs(readContext, tx, authority.NamespaceID, partition)
	if err != nil {
		return nil, err
	}
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil {
		return nil, err
	}
	if err := validateEvaluationBlindReviewMappingSet(plan, candidates, mappings, false); err != nil {
		return nil, err
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	return mappings, nil
}

func (repository *Repository) GetEvaluationBlindReviewMappingByPresentationID(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	randomizedPresentationID string,
) (EvaluationBlindReviewMappingRecord, error) {
	if !validEvaluationRandomizedPresentationID(randomizedPresentationID) {
		return EvaluationBlindReviewMappingRecord{}, ErrInvalid
	}
	records, err := repository.ListEvaluationBlindReviewMappings(ctx, authority, partition)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, err
	}
	for _, record := range records {
		if record.RandomizedPresentationID == randomizedPresentationID {
			return record, nil
		}
	}
	return EvaluationBlindReviewMappingRecord{}, ErrNotFound
}

func (repository *Repository) GetEvaluationBlindReviewMappingByCandidateID(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	candidateID string,
) (EvaluationBlindReviewMappingRecord, error) {
	if !validEvaluationServiceIdentity(candidateID) {
		return EvaluationBlindReviewMappingRecord{}, ErrInvalid
	}
	records, err := repository.ListEvaluationBlindReviewMappings(ctx, authority, partition)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, err
	}
	for _, record := range records {
		if record.CandidateID == candidateID {
			return record, nil
		}
	}
	return EvaluationBlindReviewMappingRecord{}, ErrNotFound
}

func (repository *Repository) GetEvaluationBlindReviewMapping(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	mappingID string,
) (EvaluationBlindReviewMappingRecord, error) {
	if !validEvaluationServiceIdentity(mappingID) {
		return EvaluationBlindReviewMappingRecord{}, ErrInvalid
	}
	records, err := repository.ListEvaluationBlindReviewMappings(ctx, authority, partition)
	if err != nil {
		return EvaluationBlindReviewMappingRecord{}, err
	}
	for _, record := range records {
		if record.MappingID == mappingID {
			return record, nil
		}
	}
	return EvaluationBlindReviewMappingRecord{}, ErrNotFound
}
