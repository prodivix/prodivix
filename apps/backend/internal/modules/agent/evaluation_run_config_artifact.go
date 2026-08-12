package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"io"
	"regexp"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationProductionRunConfigArtifactBindingFormat = "prodivix.agent-evaluation-production-run-config-artifact-binding"
	evaluationProductionRunConfigArtifactIngressFormat = "prodivix.agent-evaluation-production-run-config-artifact-ingress"
	evaluationProductionRunConfigArtifactReceiptFormat = "prodivix.agent-evaluation-production-run-config-artifact-ingress-receipt"
	evaluationProductionRunConfigFileName              = "production-run-config.json"
	evaluationProductionRunConfigArtifactVersion       = int64(1)
	maximumEvaluationProductionRunConfigArtifactBytes  = 16_777_216
	maximumEvaluationRunConfigArtifactBindingBytes     = 16_384
	maximumEvaluationRunConfigArtifactIngressBytes     = maximumEvaluationProductionRunConfigArtifactBytes + 65_536
)

var (
	evaluationRunConfigArtifactNamePattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$`)
	evaluationGitHubArtifactDigestPattern  = regexp.MustCompile(`^sha256:[0-9a-f]{64}$`)
	evaluationGitHubWorkflowRunIDPattern   = regexp.MustCompile(`^[1-9][0-9]{0,19}$`)
)

// EvaluationProductionRunConfigArtifactBinding is the canonical GitHub
// artifact identity that replaces a repository-relative config path. It
// commits both workflow provenance and the exact canonical run-config bytes.
type EvaluationProductionRunConfigArtifactBinding struct {
	Format                        string `json:"format"`
	Version                       int64  `json:"version"`
	SourcePlanArtifactName        string `json:"sourcePlanArtifactName"`
	SourcePlanArtifactDigest      string `json:"sourcePlanArtifactDigest"`
	SourcePlanWorkflowRunID       string `json:"sourcePlanWorkflowRunId"`
	SourcePlanWorkflowRunAttempt  int64  `json:"sourcePlanWorkflowRunAttempt"`
	RunConfigFileName             string `json:"runConfigFileName"`
	RunConfigByteLength           int64  `json:"runConfigByteLength"`
	RunConfigCanonicalBytesDigest string `json:"runConfigCanonicalBytesDigest"`
	SourceConfigDigest            string `json:"sourceConfigDigest"`
	FrozenRunDigest               string `json:"frozenRunDigest"`
	PlanDigest                    string `json:"planDigest"`
	RepositoryCommit              string `json:"repositoryCommit"`
	BindingDigest                 string `json:"bindingDigest"`
}

func evaluationProductionRunConfigArtifactBindingBase(
	binding EvaluationProductionRunConfigArtifactBinding,
) map[string]any {
	return map[string]any{
		"format": binding.Format, "version": binding.Version,
		"sourcePlanArtifactName":        binding.SourcePlanArtifactName,
		"sourcePlanArtifactDigest":      binding.SourcePlanArtifactDigest,
		"sourcePlanWorkflowRunId":       binding.SourcePlanWorkflowRunID,
		"sourcePlanWorkflowRunAttempt":  binding.SourcePlanWorkflowRunAttempt,
		"runConfigFileName":             binding.RunConfigFileName,
		"runConfigByteLength":           binding.RunConfigByteLength,
		"runConfigCanonicalBytesDigest": binding.RunConfigCanonicalBytesDigest,
		"sourceConfigDigest":            binding.SourceConfigDigest,
		"frozenRunDigest":               binding.FrozenRunDigest,
		"planDigest":                    binding.PlanDigest,
		"repositoryCommit":              binding.RepositoryCommit,
	}
}

func validateEvaluationProductionRunConfigArtifactBinding(
	binding EvaluationProductionRunConfigArtifactBinding,
) error {
	if binding.Format != evaluationProductionRunConfigArtifactBindingFormat ||
		binding.Version != evaluationProductionRunConfigArtifactVersion ||
		!evaluationRunConfigArtifactNamePattern.MatchString(binding.SourcePlanArtifactName) ||
		!evaluationGitHubArtifactDigestPattern.MatchString(binding.SourcePlanArtifactDigest) ||
		!evaluationGitHubWorkflowRunIDPattern.MatchString(binding.SourcePlanWorkflowRunID) ||
		binding.SourcePlanWorkflowRunAttempt < 1 ||
		binding.RunConfigFileName != evaluationProductionRunConfigFileName ||
		binding.RunConfigByteLength < 2 ||
		binding.RunConfigByteLength > maximumEvaluationProductionRunConfigArtifactBytes ||
		!evaluationDigestPattern.MatchString(binding.RunConfigCanonicalBytesDigest) ||
		binding.SourceConfigDigest != binding.RunConfigCanonicalBytesDigest ||
		!evaluationDigestPattern.MatchString(binding.FrozenRunDigest) ||
		!evaluationDigestPattern.MatchString(binding.PlanDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(binding.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(binding.BindingDigest) {
		return ErrInvalid
	}
	computed, err := canonicaljson.Digest(evaluationProductionRunConfigArtifactBindingBase(binding))
	canonical, canonicalErr := canonicaljson.Bytes(binding)
	if err != nil || canonicalErr != nil || computed != binding.BindingDigest ||
		len(canonical) > maximumEvaluationRunConfigArtifactBindingBytes {
		return ErrInvalid
	}
	return nil
}

func decodeEvaluationProductionRunConfigArtifactBinding(
	value any,
) (EvaluationProductionRunConfigArtifactBinding, []byte, error) {
	object, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(object, []string{
		"format", "version", "sourcePlanArtifactName", "sourcePlanArtifactDigest",
		"sourcePlanWorkflowRunId", "sourcePlanWorkflowRunAttempt", "runConfigFileName",
		"runConfigByteLength", "runConfigCanonicalBytesDigest", "sourceConfigDigest",
		"frozenRunDigest", "planDigest", "repositoryCommit", "bindingDigest",
	}) || agentcontract.ValidateSanitizedAgentPayload(object) != nil {
		return EvaluationProductionRunConfigArtifactBinding{}, nil, ErrInvalid
	}
	version, versionOK := integerMember(object, "version")
	workflowAttempt, attemptOK := integerMember(object, "sourcePlanWorkflowRunAttempt")
	byteLength, lengthOK := integerMember(object, "runConfigByteLength")
	if !versionOK || !attemptOK || !lengthOK {
		return EvaluationProductionRunConfigArtifactBinding{}, nil, ErrInvalid
	}
	binding := EvaluationProductionRunConfigArtifactBinding{
		Format: stringMember(object, "format"), Version: version,
		SourcePlanArtifactName:        stringMember(object, "sourcePlanArtifactName"),
		SourcePlanArtifactDigest:      stringMember(object, "sourcePlanArtifactDigest"),
		SourcePlanWorkflowRunID:       stringMember(object, "sourcePlanWorkflowRunId"),
		SourcePlanWorkflowRunAttempt:  workflowAttempt,
		RunConfigFileName:             stringMember(object, "runConfigFileName"),
		RunConfigByteLength:           byteLength,
		RunConfigCanonicalBytesDigest: stringMember(object, "runConfigCanonicalBytesDigest"),
		SourceConfigDigest:            stringMember(object, "sourceConfigDigest"),
		FrozenRunDigest:               stringMember(object, "frozenRunDigest"),
		PlanDigest:                    stringMember(object, "planDigest"),
		RepositoryCommit:              stringMember(object, "repositoryCommit"),
		BindingDigest:                 stringMember(object, "bindingDigest"),
	}
	canonical, err := canonicaljson.Bytes(object)
	if err != nil || validateEvaluationProductionRunConfigArtifactBinding(binding) != nil {
		return EvaluationProductionRunConfigArtifactBinding{}, nil, ErrInvalid
	}
	return binding, canonical, nil
}

func sameEvaluationProductionRunConfigArtifactBinding(
	left EvaluationProductionRunConfigArtifactBinding,
	right EvaluationProductionRunConfigArtifactBinding,
) bool {
	leftBytes, leftErr := canonicaljson.Bytes(left)
	rightBytes, rightErr := canonicaljson.Bytes(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}

func evaluationProductionRunConfigArtifactBindingBytes(
	binding EvaluationProductionRunConfigArtifactBinding,
) []byte {
	value, err := canonicaljson.Bytes(binding)
	if err != nil {
		return nil
	}
	return value
}

func validateEvaluationProductionRunConfigArtifactPartition(
	binding EvaluationProductionRunConfigArtifactBinding,
	partition EvaluationPlanPartition,
) error {
	if validateEvaluationProductionRunConfigArtifactBinding(binding) != nil ||
		binding.PlanDigest != partition.PlanDigest ||
		binding.RepositoryCommit != partition.RepositoryCommit {
		return ErrInvalid
	}
	return nil
}

type evaluationProductionRunConfigArtifactIngress struct {
	NamespaceID    string
	Partition      EvaluationPlanPartition
	Binding        EvaluationProductionRunConfigArtifactBinding
	BindingBytes   []byte
	RunConfig      map[string]any
	RunConfigBytes []byte
	IngressDigest  string
	Value          map[string]any
	Bytes          []byte
}

type EvaluationProductionRunConfigArtifactRecord struct {
	NamespaceID    string
	Partition      EvaluationPlanPartition
	Binding        EvaluationProductionRunConfigArtifactBinding
	BindingBytes   []byte
	RunConfigBytes []byte
	IngressDigest  string
	ReceiptDigest  string
	ReceiptBytes   []byte
	StoredAt       time.Time
}

type EvaluationProductionRunConfigArtifactSource interface {
	ResolveEvaluationProductionRunConfigArtifact(
		context.Context,
		EvaluationPlanPartition,
		EvaluationProductionRunConfigArtifactBinding,
	) ([]byte, error)
}

type repositoryEvaluationProductionRunConfigArtifactSource struct {
	repository  *Repository
	namespaceID string
}

func NewRepositoryEvaluationProductionRunConfigArtifactSource(
	repository *Repository,
	namespaceID string,
) (EvaluationProductionRunConfigArtifactSource, error) {
	if repository == nil || repository.available() != nil || !validEvaluationServiceIdentity(namespaceID) {
		return nil, ErrInvalid
	}
	return &repositoryEvaluationProductionRunConfigArtifactSource{
		repository: repository, namespaceID: namespaceID,
	}, nil
}

func (source *repositoryEvaluationProductionRunConfigArtifactSource) ResolveEvaluationProductionRunConfigArtifact(
	ctx context.Context,
	partition EvaluationPlanPartition,
	binding EvaluationProductionRunConfigArtifactBinding,
) ([]byte, error) {
	if source == nil || source.repository == nil ||
		validateEvaluationProductionRunConfigArtifactPartition(binding, partition) != nil {
		return nil, ErrInvalid
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	record, _, err := loadEvaluationProductionRunConfigArtifact(
		readContext, source.repository.db, source.namespaceID, partition, binding.BindingDigest,
	)
	if err != nil {
		return nil, err
	}
	if !sameEvaluationProductionRunConfigArtifactBinding(record.Binding, binding) {
		return nil, conflict("evaluation production run-config artifact binding drifted")
	}
	return append([]byte(nil), record.RunConfigBytes...), nil
}

func decodeEvaluationProductionRunConfigArtifactIngress(
	source []byte,
	authority EvaluationAuthority,
) (evaluationProductionRunConfigArtifactIngress, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationRunConfigArtifactIngressBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit",
		"runConfigArtifactBinding", "runConfig", "ingressDigest",
	}) || stringMember(value, "format") != evaluationProductionRunConfigArtifactIngressFormat ||
		stringMember(value, "namespaceId") != authority.NamespaceID ||
		agentcontract.ValidateSanitizedAgentPayload(value) != nil {
		return evaluationProductionRunConfigArtifactIngress{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	partition := EvaluationPlanPartition{
		PlanDigest:       stringMember(value, "planDigest"),
		RepositoryCommit: stringMember(value, "repositoryCommit"),
	}
	binding, bindingBytes, bindingErr := decodeEvaluationProductionRunConfigArtifactBinding(value["runConfigArtifactBinding"])
	runConfig, configOK := value["runConfig"].(map[string]any)
	runConfigBytes, configErr := canonicaljson.Bytes(runConfig)
	base := map[string]any{
		"format": stringMember(value, "format"), "version": version,
		"namespaceId": stringMember(value, "namespaceId"),
		"planDigest":  partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"runConfigArtifactBinding": value["runConfigArtifactBinding"], "runConfig": value["runConfig"],
	}
	computed, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationProductionRunConfigArtifactVersion ||
		validateEvaluationPartition(partition) != nil || bindingErr != nil ||
		validateEvaluationProductionRunConfigArtifactPartition(binding, partition) != nil ||
		!configOK || configErr != nil || len(runConfigBytes) != int(binding.RunConfigByteLength) ||
		len(runConfigBytes) < 2 || len(runConfigBytes) > maximumEvaluationProductionRunConfigArtifactBytes ||
		computed != stringMember(value, "ingressDigest") || digestErr != nil {
		return evaluationProductionRunConfigArtifactIngress{}, ErrInvalid
	}
	runConfigDigest, digestErr := canonicaljson.Digest(runConfig)
	if digestErr != nil || runConfigDigest != binding.RunConfigCanonicalBytesDigest {
		return evaluationProductionRunConfigArtifactIngress{}, conflict("evaluation production run-config artifact bytes drifted from their binding")
	}
	if _, _, err := decodeEvaluationTrackedConfig(runConfigBytes); err != nil {
		return evaluationProductionRunConfigArtifactIngress{}, err
	}
	return evaluationProductionRunConfigArtifactIngress{
		NamespaceID: authority.NamespaceID, Partition: partition, Binding: binding,
		BindingBytes: bindingBytes, RunConfig: runConfig, RunConfigBytes: runConfigBytes,
		IngressDigest: computed, Value: value, Bytes: canonical,
	}, nil
}

func evaluationProductionRunConfigArtifactReceipt(
	ingress evaluationProductionRunConfigArtifactIngress,
	storedAt time.Time,
) (map[string]any, []byte, string, error) {
	base := map[string]any{
		"format":             evaluationProductionRunConfigArtifactReceiptFormat,
		"version":            evaluationProductionRunConfigArtifactVersion,
		"namespaceId":        ingress.NamespaceID,
		"planDigest":         ingress.Partition.PlanDigest,
		"repositoryCommit":   ingress.Partition.RepositoryCommit,
		"bindingDigest":      ingress.Binding.BindingDigest,
		"sourceConfigDigest": ingress.Binding.SourceConfigDigest,
		"storedAt":           evaluationExportInstant(storedAt),
		"ingressDigest":      ingress.IngressDigest,
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, nil, "", err
	}
	receipt := make(map[string]any, len(base)+1)
	for key, value := range base {
		receipt[key] = value
	}
	receipt["receiptDigest"] = receiptDigest
	receiptBytes, err := canonicaljson.Bytes(receipt)
	return receipt, receiptBytes, receiptDigest, err
}

func decodeEvaluationProductionRunConfigArtifactRecord(
	record EvaluationProductionRunConfigArtifactRecord,
) (map[string]any, error) {
	if validateEvaluationProductionRunConfigArtifactPartition(record.Binding, record.Partition) != nil ||
		record.NamespaceID == "" || len(record.RunConfigBytes) != int(record.Binding.RunConfigByteLength) ||
		len(record.BindingBytes) == 0 || len(record.ReceiptBytes) == 0 || record.StoredAt.IsZero() {
		return nil, conflict("persisted evaluation production run-config artifact is invalid")
	}
	bindingValue, bindingCanonical, err := decodeEvaluationJSONObject(record.BindingBytes, maximumEvaluationRunConfigArtifactBindingBytes)
	if err != nil || !bytes.Equal(bindingCanonical, record.BindingBytes) {
		return nil, conflict("persisted evaluation production run-config artifact binding drifted")
	}
	decodedBinding, _, err := decodeEvaluationProductionRunConfigArtifactBinding(bindingValue)
	if err != nil || !sameEvaluationProductionRunConfigArtifactBinding(decodedBinding, record.Binding) {
		return nil, conflict("persisted evaluation production run-config artifact binding drifted")
	}
	configValue, configCanonical, err := decodeEvaluationJSONObject(record.RunConfigBytes, maximumEvaluationProductionRunConfigArtifactBytes)
	if err != nil || !bytes.Equal(configCanonical, record.RunConfigBytes) || agentcontract.ValidateSanitizedAgentPayload(configValue) != nil {
		return nil, conflict("persisted evaluation production run-config artifact bytes drifted")
	}
	configDigest, err := canonicaljson.Digest(configValue)
	if err != nil || configDigest != record.Binding.SourceConfigDigest {
		return nil, conflict("persisted evaluation production run-config artifact digest drifted")
	}
	receiptValue, receiptCanonical, err := decodeEvaluationJSONObject(record.ReceiptBytes, maximumEvaluationServiceControlBytes)
	if err != nil || !bytes.Equal(receiptCanonical, record.ReceiptBytes) || !exactEvaluationKeys(receiptValue, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "bindingDigest",
		"sourceConfigDigest", "storedAt", "ingressDigest", "receiptDigest",
	}) || stringMember(receiptValue, "format") != evaluationProductionRunConfigArtifactReceiptFormat ||
		stringMember(receiptValue, "namespaceId") != record.NamespaceID ||
		stringMember(receiptValue, "planDigest") != record.Partition.PlanDigest ||
		stringMember(receiptValue, "repositoryCommit") != record.Partition.RepositoryCommit ||
		stringMember(receiptValue, "bindingDigest") != record.Binding.BindingDigest ||
		stringMember(receiptValue, "sourceConfigDigest") != record.Binding.SourceConfigDigest ||
		stringMember(receiptValue, "ingressDigest") != record.IngressDigest ||
		stringMember(receiptValue, "receiptDigest") != record.ReceiptDigest ||
		!evaluationOwnerStateDigestMatches(receiptValue, "receiptDigest") {
		return nil, conflict("persisted evaluation production run-config artifact receipt drifted")
	}
	storedAt, timeErr := time.Parse(time.RFC3339Nano, stringMember(receiptValue, "storedAt"))
	if timeErr != nil || !storedAt.Equal(record.StoredAt) || evaluationExportInstant(storedAt) != stringMember(receiptValue, "storedAt") {
		return nil, conflict("persisted evaluation production run-config artifact time drifted")
	}
	return configValue, nil
}

func loadEvaluationProductionRunConfigArtifact(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	bindingDigest string,
) (*EvaluationProductionRunConfigArtifactRecord, map[string]any, error) {
	if !validEvaluationServiceIdentity(namespaceID) || validateEvaluationPartition(partition) != nil ||
		!evaluationDigestPattern.MatchString(bindingDigest) {
		return nil, nil, ErrInvalid
	}
	var record EvaluationProductionRunConfigArtifactRecord
	record.NamespaceID, record.Partition = namespaceID, partition
	var bindingJSON, runConfigJSON []byte
	err := queryer.QueryRowContext(ctx, `SELECT binding_json,binding_bytes,run_config_json,run_config_bytes,
		ingress_digest,receipt_digest,receipt_bytes,stored_at
		FROM agent_evaluation_production_run_config_artifacts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND binding_digest=$4`,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, bindingDigest).Scan(
		&bindingJSON, &record.BindingBytes, &runConfigJSON, &record.RunConfigBytes,
		&record.IngressDigest, &record.ReceiptDigest, &record.ReceiptBytes, &record.StoredAt,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil, ErrNotFound
	}
	if err != nil {
		return nil, nil, err
	}
	binding, err := decodeEvaluationProductionRunConfigArtifactBindingBytes(record.BindingBytes)
	if err != nil || !evaluationJSONColumnMatchesCanonical(
		bindingJSON, record.BindingBytes, maximumEvaluationRunConfigArtifactBindingBytes,
	) || !evaluationJSONColumnMatchesCanonical(
		runConfigJSON, record.RunConfigBytes, maximumEvaluationProductionRunConfigArtifactBytes,
	) {
		return nil, nil, conflict("persisted evaluation production run-config artifact JSON drifted")
	}
	record.Binding = binding
	value, err := decodeEvaluationProductionRunConfigArtifactRecord(record)
	if err != nil {
		return nil, nil, err
	}
	return &record, value, nil
}

func (repository *Repository) StoreEvaluationProductionRunConfigArtifact(
	ctx context.Context,
	authority EvaluationAuthority,
	ingress evaluationProductionRunConfigArtifactIngress,
	storedAt time.Time,
) (EvaluationProductionRunConfigArtifactRecord, bool, error) {
	if err := repository.available(); err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, false, err
	}
	if err := validateEvaluationAuthority(authority); err != nil || ingress.NamespaceID != authority.NamespaceID ||
		storedAt.IsZero() || validateEvaluationProductionRunConfigArtifactPartition(ingress.Binding, ingress.Partition) != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, false, ErrInvalid
	}
	decodedIngress, decodeErr := decodeEvaluationProductionRunConfigArtifactIngress(ingress.Bytes, authority)
	if decodeErr != nil || decodedIngress.IngressDigest != ingress.IngressDigest ||
		!sameEvaluationProductionRunConfigArtifactBinding(decodedIngress.Binding, ingress.Binding) ||
		!bytes.Equal(decodedIngress.BindingBytes, ingress.BindingBytes) ||
		!bytes.Equal(decodedIngress.RunConfigBytes, ingress.RunConfigBytes) {
		return EvaluationProductionRunConfigArtifactRecord{}, false, ErrInvalid
	}
	storedAt = storedAt.UTC().Truncate(time.Millisecond)
	_, receiptBytes, receiptDigest, err := evaluationProductionRunConfigArtifactReceipt(ingress, storedAt)
	if err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, false, err
	}
	writeContext, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(writeContext, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, false, err
	}
	defer func() { _ = tx.Rollback() }()
	plan, err := loadEvaluationPlanRecord(writeContext, tx, authority.NamespaceID, ingress.Partition)
	if err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, false, err
	}
	if plan.PlanDigest != ingress.Binding.PlanDigest ||
		plan.RepositoryCommit != ingress.Binding.RepositoryCommit ||
		storedAt.Before(plan.PlannedAt) || storedAt.After(plan.ExpiresAt) {
		return EvaluationProductionRunConfigArtifactRecord{}, false, conflict("evaluation production run-config artifact drifted from its plan")
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_production_run_config_artifacts (
		namespace_id,plan_digest,repository_commit,binding_digest,binding_json,binding_bytes,
		run_config_json,run_config_bytes,source_config_digest,frozen_run_digest,ingress_digest,
		receipt_digest,receipt_bytes,stored_at
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
	ON CONFLICT DO NOTHING`, authority.NamespaceID, ingress.Partition.PlanDigest, ingress.Partition.RepositoryCommit,
		ingress.Binding.BindingDigest, ingress.BindingBytes, ingress.BindingBytes,
		ingress.RunConfigBytes, ingress.RunConfigBytes, ingress.Binding.SourceConfigDigest,
		ingress.Binding.FrozenRunDigest, ingress.IngressDigest, receiptDigest, receiptBytes, storedAt)
	if err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, false, err
	}
	replayed := inserted == 0
	record, _, err := loadEvaluationProductionRunConfigArtifact(writeContext, tx, authority.NamespaceID,
		ingress.Partition, ingress.Binding.BindingDigest)
	if err != nil {
		if replayed && errors.Is(err, ErrNotFound) {
			return EvaluationProductionRunConfigArtifactRecord{}, false, conflict("evaluation production run-config artifact partition is already sealed to another binding")
		}
		return EvaluationProductionRunConfigArtifactRecord{}, false, err
	}
	if !sameEvaluationProductionRunConfigArtifactBinding(record.Binding, ingress.Binding) ||
		!bytes.Equal(record.BindingBytes, ingress.BindingBytes) ||
		!bytes.Equal(record.RunConfigBytes, ingress.RunConfigBytes) ||
		record.IngressDigest != ingress.IngressDigest ||
		(!replayed && (record.ReceiptDigest != receiptDigest ||
			!bytes.Equal(record.ReceiptBytes, receiptBytes) || !record.StoredAt.Equal(storedAt))) {
		return EvaluationProductionRunConfigArtifactRecord{}, false, conflict("evaluation production run-config artifact identity was reused with different immutable bytes")
	}
	if err := tx.Commit(); err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, false, err
	}
	return *record, replayed, nil
}

func (repository *Repository) GetEvaluationProductionRunConfigArtifact(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	bindingDigest string,
) (EvaluationProductionRunConfigArtifactRecord, map[string]any, error) {
	if err := repository.available(); err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, nil, err
	}
	if err := validateEvaluationAuthority(authority); err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, nil, err
	}
	readContext, cancel := evaluationReadContext(ctx)
	defer cancel()
	record, value, err := loadEvaluationProductionRunConfigArtifact(readContext, repository.db,
		authority.NamespaceID, partition, bindingDigest)
	if err != nil {
		return EvaluationProductionRunConfigArtifactRecord{}, nil, err
	}
	return *record, value, nil
}

func decodeEvaluationProductionRunConfigArtifactReceipt(source []byte) (map[string]any, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationServiceControlBytes)
	if err != nil || !bytes.Equal(canonical, source) || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "bindingDigest",
		"sourceConfigDigest", "storedAt", "ingressDigest", "receiptDigest",
	}) || stringMember(value, "format") != evaluationProductionRunConfigArtifactReceiptFormat ||
		!evaluationOwnerStateDigestMatches(value, "receiptDigest") {
		return nil, ErrInvalid
	}
	return value, nil
}

func decodeEvaluationProductionRunConfigArtifactBindingBytes(source []byte) (EvaluationProductionRunConfigArtifactBinding, error) {
	if err := canonicaljson.ValidateRaw(source, maximumEvaluationRunConfigArtifactBindingBytes); err != nil {
		return EvaluationProductionRunConfigArtifactBinding{}, ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return EvaluationProductionRunConfigArtifactBinding{}, ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return EvaluationProductionRunConfigArtifactBinding{}, ErrInvalid
	}
	binding, canonical, err := decodeEvaluationProductionRunConfigArtifactBinding(value)
	if err != nil || !bytes.Equal(canonical, source) {
		return EvaluationProductionRunConfigArtifactBinding{}, ErrInvalid
	}
	return binding, nil
}

// JSONB preserves the JSON value while PostgreSQL may reorder object members
// and add insignificant whitespace when it is read back. The canonical bytea
// column remains the digest authority; this check proves that its JSONB
// projection still represents those exact canonical bytes.
func evaluationJSONColumnMatchesCanonical(source []byte, expected []byte, maximumCanonicalBytes int) bool {
	maximumReadBytes := maximumCanonicalBytes*2 + 65_536
	if len(source) == 0 || len(source) > maximumReadBytes {
		return false
	}
	if err := canonicaljson.ValidateRawEnvelope(source, maximumReadBytes); err != nil {
		return false
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return false
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return false
	}
	canonical, err := canonicaljson.Bytes(value)
	return err == nil && bytes.Equal(canonical, expected)
}
