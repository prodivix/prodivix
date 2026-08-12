package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

var (
	evaluationHoldoutIdentityPattern     = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@/-]{0,255}$`)
	evaluationEnvelopePathSegmentPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._-]*$`)
	evaluationHoldoutCanaryPattern       = regexp.MustCompile(`^[A-Za-z0-9._:@%+=/-]+$`)
)

const (
	evaluationFrozenConfigCommitmentFormat = "prodivix.g4-model-evaluation-frozen-run-commitment"
	evaluationHoldoutEnvelopeFormat        = "prodivix.g4-protected-material"
	evaluationHoldoutEnvelopeKeyRef        = "secret.g4-model-eval.holdout-envelope.v1"
	evaluationHoldoutDirectoryEnvironment  = "PRODIVIX_G4_MODEL_EVAL_HOLDOUT_DIRECTORY"
	evaluationHoldoutKeyEnvironment        = "PRODIVIX_G4_MODEL_EVAL_HOLDOUT_KEY_BASE64"
	evaluationAttestationKeyEnvironment    = "PRODIVIX_G4_MODEL_EVAL_ATTESTATION_PRIVATE_KEY"
	evaluationAttestationKeyRef            = "secret.g4-model-eval.attestation.ed25519.v1"
	maximumEvaluationFrozenConfigBytes     = 1_048_576
	maximumEvaluationHoldoutEnvelopeBytes  = 3_000_000
	maximumEvaluationHoldoutEnvelopeCount  = 2_048
)

type EvaluationFrozenConfigProtectedEnvelope struct {
	CaseID                     string `json:"caseId"`
	FixtureRef                 string `json:"fixtureRef"`
	CaseDigest                 string `json:"caseDigest"`
	Access                     string `json:"access"`
	CapabilityDescriptorDigest string `json:"capabilityDescriptorDigest"`
	CaseDefinitionDigest       string `json:"caseDefinitionDigest"`
	ExpectedAuthorityDigest    string `json:"expectedAuthorityDigest"`
	GradingPolicyDigest        string `json:"gradingPolicyDigest"`
	ResolverRef                string `json:"resolverRef"`
	RelativePath               string `json:"relativePath"`
	EncryptedMaterialDigest    string `json:"encryptedMaterialDigest"`
	EncryptionPolicyDigest     string `json:"encryptionPolicyDigest"`
	LocatorDigest              string `json:"locatorDigest"`
}

type evaluationFrozenConfigCommitmentBase struct {
	Format                           string                                       `json:"format"`
	Version                          int64                                        `json:"version"`
	RunConfigArtifactBinding         EvaluationProductionRunConfigArtifactBinding `json:"runConfigArtifactBinding"`
	SourceConfigDigest               string                                       `json:"sourceConfigDigest"`
	FrozenRunDigest                  string                                       `json:"frozenRunDigest"`
	PlanDigest                       string                                       `json:"planDigest"`
	RepositoryCommit                 string                                       `json:"repositoryCommit"`
	ProtectedHoldoutManifestDigest   string                                       `json:"protectedHoldoutManifestDigest"`
	RestrictedMaterialManifestDigest string                                       `json:"restrictedMaterialManifestDigest"`
	AccessPolicyDigest               string                                       `json:"accessPolicyDigest"`
	ProtectedEnvelopeAllowlist       []EvaluationFrozenConfigProtectedEnvelope    `json:"protectedEnvelopeAllowlist"`
	CommittedAt                      string                                       `json:"committedAt"`
	WorkflowName                     string                                       `json:"workflowName"`
	WorkflowRunID                    string                                       `json:"workflowRunId"`
	JobID                            string                                       `json:"jobId"`
	EnvironmentDigest                string                                       `json:"environmentDigest"`
	AuthorityID                      string                                       `json:"authorityId"`
	KeyID                            string                                       `json:"keyId"`
	Algorithm                        string                                       `json:"algorithm"`
}

type evaluationFrozenConfigCommitment struct {
	evaluationFrozenConfigCommitmentBase
	CommitmentDigest   string `json:"commitmentDigest"`
	SignatureBase64URL string `json:"signatureBase64Url"`
}

type evaluationRestrictedEnvelopeLocator struct {
	CaseID                  string
	ResolverRef             string
	RelativePath            string
	EncryptedMaterialDigest string
	EncryptionPolicyDigest  string
}

type evaluationHoldoutEnvelopeMetadata struct {
	Format                  string `json:"format"`
	Version                 int64  `json:"version"`
	Algorithm               string `json:"algorithm"`
	KeyRef                  string `json:"keyRef"`
	PlanDigest              string `json:"planDigest"`
	RepositoryCommit        string `json:"repositoryCommit"`
	CaseID                  string `json:"caseId"`
	CaseDigest              string `json:"caseDigest"`
	ResolverRef             string `json:"resolverRef"`
	EncryptionPolicyDigest  string `json:"encryptionPolicyDigest"`
	MaterialDigest          string `json:"materialDigest"`
	PlaintextByteLength     int64  `json:"plaintextByteLength"`
	NonceBase64             string `json:"nonceBase64"`
	AuthenticationTagBase64 string `json:"authenticationTagBase64"`
	CiphertextBase64        string `json:"ciphertextBase64"`
}

// EvaluationHoldoutSealAuthorityEvidence contains only public commitments.
// Encrypted envelope bytes and canary values are never returned or persisted.
type EvaluationHoldoutSealAuthorityEvidence struct {
	RunConfigArtifactBinding         EvaluationProductionRunConfigArtifactBinding
	SourceConfigDigest               string
	FrozenRunDigest                  string
	ConfigCommitmentDigest           string
	ConfigCommitmentBytes            []byte
	ProtectedHoldoutManifestDigest   string
	RestrictedMaterialManifestDigest string
	AccessPolicyDigest               string
	EncryptedCorpusDigest            string
	EnvelopeCaseIDs                  []string
	EnvelopeDigests                  []string
}

type EvaluationHoldoutCanarySets struct {
	SecretCanaries           [][]byte
	ProtectedHoldoutCanaries [][]byte
}

type EvaluationHoldoutCanarySource func(context.Context) (EvaluationHoldoutCanarySets, error)

// EvaluationHoldoutSealAuthority resolves one server-owned signed commitment.
// Implementations must bind it to the exact tracked source at the plan commit.
type EvaluationHoldoutSealAuthority interface {
	Resolve(context.Context, EvaluationPlanRecord) (EvaluationHoldoutSealAuthorityEvidence, EvaluationHoldoutCanarySets, error)
}

type EvaluationFileHoldoutSealAuthorityConfig struct {
	CommitmentPath            string
	HoldoutDirectory          string
	ExpectedRepositoryCommit  string
	ExpectedWorkflowRunID     string
	ExpectedJobID             string
	ExpectedEnvironmentDigest string
	ExpectedAuthorityID       string
	ExpectedKeyID             string
	Verifier                  EvaluationAuthorityAttestationVerifier
	CanarySource              EvaluationHoldoutCanarySource
	RunConfigArtifactSource   EvaluationProductionRunConfigArtifactSource
}

type fileEvaluationHoldoutSealAuthority struct {
	holdoutDirectory          string
	commitmentRoot            *os.Root
	commitmentName            string
	holdoutRoot               *os.Root
	expectedCommit            string
	expectedRunID             string
	expectedJobID             string
	expectedEnvironmentDigest string
	expectedAuthorityID       string
	expectedKeyID             string
	verifier                  EvaluationAuthorityAttestationVerifier
	canarySource              EvaluationHoldoutCanarySource
	runConfigArtifactSource   EvaluationProductionRunConfigArtifactSource
}

func evaluationRelativeEnvelopePathIsValid(value string) bool {
	if len(value) < 1 || len(value) > 512 || strings.Contains(value, "\\") ||
		strings.HasPrefix(value, "/") || strings.HasSuffix(value, "/") || !strings.HasSuffix(value, ".json") {
		return false
	}
	for _, segment := range strings.Split(value, "/") {
		if segment == "" || segment == "." || segment == ".." ||
			!evaluationEnvelopePathSegmentPattern.MatchString(segment) {
			return false
		}
	}
	return true
}

func evaluationHoldoutIdentityIsValid(value string) bool {
	return evaluationHoldoutIdentityPattern.MatchString(value) &&
		!evaluationAuthenticityCredentialPattern.MatchString(value)
}

func decodeEvaluationFrozenConfigCommitment(source []byte) (evaluationFrozenConfigCommitment, error) {
	if err := canonicaljson.ValidateRawEnvelope(source, maximumEvaluationFrozenConfigBytes); err != nil {
		return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment is invalid")
	}
	var value evaluationFrozenConfigCommitment
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&value); err != nil {
		return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment shape is invalid")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment has trailing data")
	}
	canonical, err := canonicaljson.Bytes(value)
	if err != nil || !bytes.Equal(canonical, source) || value.Format != evaluationFrozenConfigCommitmentFormat ||
		value.Version != 1 || validateEvaluationProductionRunConfigArtifactBinding(value.RunConfigArtifactBinding) != nil ||
		!evaluationDigestPattern.MatchString(value.SourceConfigDigest) ||
		!evaluationDigestPattern.MatchString(value.FrozenRunDigest) ||
		!evaluationDigestPattern.MatchString(value.PlanDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(value.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(value.ProtectedHoldoutManifestDigest) ||
		!evaluationDigestPattern.MatchString(value.RestrictedMaterialManifestDigest) ||
		!evaluationDigestPattern.MatchString(value.AccessPolicyDigest) ||
		!evaluationDigestPattern.MatchString(value.CommitmentDigest) ||
		value.ProtectedHoldoutManifestDigest != value.RestrictedMaterialManifestDigest ||
		value.WorkflowName != "g4-real-model-evaluation" || value.JobID != "full_shards" ||
		!validEvaluationServiceIdentity(value.WorkflowRunID) ||
		!evaluationDigestPattern.MatchString(value.EnvironmentDigest) ||
		!validEvaluationServiceIdentity(value.AuthorityID) || !validEvaluationServiceIdentity(value.KeyID) ||
		value.Algorithm != "Ed25519" || len(value.ProtectedEnvelopeAllowlist) < 1 ||
		len(value.ProtectedEnvelopeAllowlist) > maximumEvaluationHoldoutEnvelopeCount {
		return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment fields are invalid")
	}
	if value.RunConfigArtifactBinding.SourceConfigDigest != value.SourceConfigDigest ||
		value.RunConfigArtifactBinding.FrozenRunDigest != value.FrozenRunDigest ||
		value.RunConfigArtifactBinding.PlanDigest != value.PlanDigest ||
		value.RunConfigArtifactBinding.RepositoryCommit != value.RepositoryCommit {
		return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config artifact binding drifted")
	}
	committedAt, timeErr := time.Parse(time.RFC3339Nano, value.CommittedAt)
	if timeErr != nil || value.CommittedAt != evaluationExportInstant(committedAt) {
		return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment time is invalid")
	}
	signature, signatureErr := base64.RawURLEncoding.DecodeString(value.SignatureBase64URL)
	if signatureErr != nil || len(signature) != 64 ||
		base64.RawURLEncoding.EncodeToString(signature) != value.SignatureBase64URL {
		return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment signature is invalid")
	}
	previousCaseID := ""
	seenResolvers, seenPaths := make(map[string]struct{}), make(map[string]struct{})
	for _, entry := range value.ProtectedEnvelopeAllowlist {
		if !evaluationHoldoutIdentityIsValid(entry.CaseID) || !evaluationHoldoutIdentityIsValid(entry.FixtureRef) ||
			!validEvaluationServiceIdentity(entry.ResolverRef) || !evaluationRelativeEnvelopePathIsValid(entry.RelativePath) ||
			entry.Access != "protected-holdout" ||
			!evaluationDigestPattern.MatchString(entry.CapabilityDescriptorDigest) ||
			!evaluationDigestPattern.MatchString(entry.CaseDefinitionDigest) ||
			!evaluationDigestPattern.MatchString(entry.ExpectedAuthorityDigest) ||
			!evaluationDigestPattern.MatchString(entry.GradingPolicyDigest) ||
			!evaluationDigestPattern.MatchString(entry.CaseDigest) ||
			!evaluationDigestPattern.MatchString(entry.EncryptedMaterialDigest) ||
			!evaluationDigestPattern.MatchString(entry.EncryptionPolicyDigest) ||
			!evaluationDigestPattern.MatchString(entry.LocatorDigest) ||
			(previousCaseID != "" && entry.CaseID <= previousCaseID) {
			return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment allowlist is invalid")
		}
		if _, duplicate := seenResolvers[entry.ResolverRef]; duplicate {
			return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment resolver is duplicated")
		}
		if _, duplicate := seenPaths[entry.RelativePath]; duplicate {
			return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment path is duplicated")
		}
		seenResolvers[entry.ResolverRef], seenPaths[entry.RelativePath] = struct{}{}, struct{}{}
		previousCaseID = entry.CaseID
	}
	baseDigest, err := canonicaljson.Digest(value.evaluationFrozenConfigCommitmentBase)
	if err != nil || baseDigest != value.CommitmentDigest {
		return evaluationFrozenConfigCommitment{}, conflict("evaluation frozen config commitment digest drifted")
	}
	return value, nil
}

func NewFileEvaluationHoldoutSealAuthority(config EvaluationFileHoldoutSealAuthorityConfig) (EvaluationHoldoutSealAuthority, error) {
	directory, directoryErr := filepath.Abs(config.HoldoutDirectory)
	commitmentPath, commitmentPathErr := filepath.Abs(config.CommitmentPath)
	if directoryErr != nil || commitmentPathErr != nil || config.Verifier == nil || config.CanarySource == nil ||
		config.RunConfigArtifactSource == nil || config.HoldoutDirectory == "" ||
		config.CommitmentPath == "" || !filepath.IsAbs(config.CommitmentPath) ||
		!filepath.IsAbs(config.HoldoutDirectory) || filepath.Clean(config.HoldoutDirectory) != directory ||
		filepath.Clean(config.CommitmentPath) != commitmentPath ||
		!evaluationRepositoryCommitPattern.MatchString(config.ExpectedRepositoryCommit) ||
		!validEvaluationServiceIdentity(config.ExpectedWorkflowRunID) ||
		config.ExpectedJobID != "full_shards" ||
		!evaluationDigestPattern.MatchString(config.ExpectedEnvironmentDigest) ||
		!validEvaluationServiceIdentity(config.ExpectedAuthorityID) ||
		!validEvaluationServiceIdentity(config.ExpectedKeyID) {
		return nil, ErrInvalid
	}
	for _, directoryPath := range []string{directory, filepath.Dir(commitmentPath)} {
		realPath, err := filepath.EvalSymlinks(directoryPath)
		if err != nil || filepath.Clean(realPath) != directoryPath {
			return nil, ErrInvalid
		}
	}
	commitmentRoot, err := os.OpenRoot(filepath.Dir(commitmentPath))
	if err != nil {
		return nil, ErrInvalid
	}
	holdoutRoot, err := os.OpenRoot(directory)
	if err != nil {
		_ = commitmentRoot.Close()
		return nil, ErrInvalid
	}
	return &fileEvaluationHoldoutSealAuthority{
		holdoutDirectory: directory, commitmentRoot: commitmentRoot,
		commitmentName: filepath.Base(commitmentPath), holdoutRoot: holdoutRoot,
		expectedCommit:            config.ExpectedRepositoryCommit,
		expectedRunID:             config.ExpectedWorkflowRunID,
		expectedJobID:             config.ExpectedJobID,
		expectedEnvironmentDigest: config.ExpectedEnvironmentDigest,
		expectedAuthorityID:       config.ExpectedAuthorityID, expectedKeyID: config.ExpectedKeyID,
		verifier: config.Verifier, canarySource: config.CanarySource,
		runConfigArtifactSource: config.RunConfigArtifactSource,
	}, nil
}

func decodeEvaluationTrackedConfig(source []byte) (map[string]any, []evaluationRestrictedEnvelopeLocator, error) {
	if err := canonicaljson.ValidateRawEnvelope(source, maximumEvaluationFrozenConfigBytes); err != nil {
		return nil, nil, conflict("evaluation tracked frozen config contains ambiguous JSON")
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var root map[string]any
	if err := decoder.Decode(&root); err != nil || len(root) == 0 {
		return nil, nil, conflict("evaluation tracked frozen config is invalid")
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return nil, nil, conflict("evaluation tracked frozen config has trailing data")
	}
	material, materialOK := objectMember(root, "material")
	rawLocators, locatorsOK := material["restrictedEnvelopeLocators"].([]any)
	catalog, catalogOK := objectMember(material, "catalogDigests")
	if !materialOK || !locatorsOK || !catalogOK ||
		!exactKeys(material, "catalogDigests", "holdoutDirectoryEnvironmentName",
			"holdoutKeyEnvironmentName", "holdoutKeyRef", "restrictedEnvelopeLocators") ||
		!exactKeys(catalog, "caseSetDigest", "publicMaterialSetDigest", "restrictedMaterialManifestDigest", "catalogDigest") ||
		stringMember(material, "holdoutDirectoryEnvironmentName") != evaluationHoldoutDirectoryEnvironment ||
		stringMember(material, "holdoutKeyEnvironmentName") != evaluationHoldoutKeyEnvironment ||
		stringMember(material, "holdoutKeyRef") != evaluationHoldoutEnvelopeKeyRef ||
		len(rawLocators) < 1 || len(rawLocators) > maximumEvaluationHoldoutEnvelopeCount {
		return nil, nil, conflict("evaluation tracked frozen config material catalog is invalid")
	}
	locators := make([]evaluationRestrictedEnvelopeLocator, 0, len(rawLocators))
	previous := ""
	for _, raw := range rawLocators {
		locator, ok := raw.(map[string]any)
		entry := evaluationRestrictedEnvelopeLocator{
			CaseID: stringMember(locator, "caseId"), ResolverRef: stringMember(locator, "resolverRef"),
			RelativePath:            stringMember(locator, "relativePath"),
			EncryptedMaterialDigest: stringMember(locator, "encryptedMaterialDigest"),
			EncryptionPolicyDigest:  stringMember(locator, "encryptionPolicyDigest"),
		}
		if !ok || len(locator) != 5 || !evaluationHoldoutIdentityIsValid(entry.CaseID) ||
			!validEvaluationServiceIdentity(entry.ResolverRef) || !evaluationRelativeEnvelopePathIsValid(entry.RelativePath) ||
			!evaluationDigestPattern.MatchString(entry.EncryptedMaterialDigest) ||
			!evaluationDigestPattern.MatchString(entry.EncryptionPolicyDigest) || (previous != "" && entry.CaseID <= previous) {
			return nil, nil, conflict("evaluation tracked frozen config locator catalog drifted")
		}
		locators = append(locators, entry)
		previous = entry.CaseID
	}
	return root, locators, nil
}

func evaluationPlanProtectedCases(plan evaluationPlanFact) ([]EvaluationFrozenConfigProtectedEnvelope, error) {
	rawCases, ok := plan.Value["concreteCases"].([]any)
	if !ok {
		return nil, conflict("evaluation protected case catalog is invalid")
	}
	result := make([]EvaluationFrozenConfigProtectedEnvelope, 0, len(rawCases)/4)
	for _, raw := range rawCases {
		evaluationCase, caseOK := raw.(map[string]any)
		if !caseOK {
			return nil, conflict("evaluation protected case catalog drifted")
		}
		access := stringMember(evaluationCase, "access")
		if access == "public" {
			continue
		}
		if access != "protected-holdout" {
			return nil, conflict("evaluation plan contains an unsupported private material class")
		}
		result = append(result, EvaluationFrozenConfigProtectedEnvelope{
			CaseID: stringMember(evaluationCase, "caseId"), FixtureRef: stringMember(evaluationCase, "fixtureRef"),
			CaseDigest: stringMember(evaluationCase, "caseDigest"), Access: "protected-holdout",
			CapabilityDescriptorDigest: stringMember(evaluationCase, "capabilityDescriptorDigest"),
			CaseDefinitionDigest:       stringMember(evaluationCase, "caseDefinitionDigest"),
			ExpectedAuthorityDigest:    stringMember(evaluationCase, "expectedAuthorityDigest"),
			GradingPolicyDigest:        stringMember(evaluationCase, "gradingPolicyDigest"),
		})
	}
	sort.Slice(result, func(left, right int) bool { return result[left].CaseID < result[right].CaseID })
	if len(result) < 1 {
		return nil, conflict("evaluation plan has no protected holdout cases")
	}
	return result, nil
}

func evaluationHoldoutLocatorDigest(entry EvaluationFrozenConfigProtectedEnvelope) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"caseId": entry.CaseID, "caseDigest": entry.CaseDigest, "access": entry.Access,
		"capabilityDescriptorDigest": entry.CapabilityDescriptorDigest,
		"caseDefinitionDigest":       entry.CaseDefinitionDigest,
		"expectedAuthorityDigest":    entry.ExpectedAuthorityDigest,
		"gradingPolicyDigest":        entry.GradingPolicyDigest,
		"resolverRef":                entry.ResolverRef, "encryptedMaterialDigest": entry.EncryptedMaterialDigest,
		"encryptionPolicyDigest": entry.EncryptionPolicyDigest,
	})
}

func evaluationRestrictedMaterialManifestDigest(entries []EvaluationFrozenConfigProtectedEnvelope) (string, error) {
	refs := make([]map[string]any, len(entries))
	for index, entry := range entries {
		refs[index] = map[string]any{"caseId": entry.CaseID, "locatorDigest": entry.LocatorDigest}
	}
	return canonicaljson.Digest(refs)
}

func evaluationHoldoutAccessPolicyDigest(commitment evaluationFrozenConfigCommitment) (string, error) {
	policies := make([]map[string]any, len(commitment.ProtectedEnvelopeAllowlist))
	for index, envelope := range commitment.ProtectedEnvelopeAllowlist {
		policies[index] = map[string]any{
			"caseId": envelope.CaseID, "caseDigest": envelope.CaseDigest, "access": envelope.Access,
			"resolverRef": envelope.ResolverRef, "relativePath": envelope.RelativePath,
			"locatorDigest": envelope.LocatorDigest, "encryptionPolicyDigest": envelope.EncryptionPolicyDigest,
		}
	}
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-model-evaluation-holdout-access-policy", "version": int64(1),
		"runConfigArtifactBindingDigest": commitment.RunConfigArtifactBinding.BindingDigest,
		"sourceConfigDigest":             commitment.SourceConfigDigest,
		"frozenRunDigest":                commitment.FrozenRunDigest,
		"planDigest":                     commitment.PlanDigest, "repositoryCommit": commitment.RepositoryCommit,
		"protectedHoldoutManifestDigest": commitment.ProtectedHoldoutManifestDigest,
		"runtimeZone":                    "server", "purpose": "protected-holdout-decryption",
		"directoryEnvironmentName": "PRODIVIX_G4_MODEL_EVAL_HOLDOUT_DIRECTORY",
		"keyEnvironmentName":       "PRODIVIX_G4_MODEL_EVAL_HOLDOUT_KEY_BASE64",
		"keyRef":                   evaluationHoldoutEnvelopeKeyRef, "executorPrincipalId": evaluationHoldoutExecutorPrincipal,
		"allowlist": policies,
	})
}

func evaluationHoldoutEncryptedCorpusDigest(commitment evaluationFrozenConfigCommitment) (string, error) {
	envelopes := make([]map[string]any, len(commitment.ProtectedEnvelopeAllowlist))
	for index, envelope := range commitment.ProtectedEnvelopeAllowlist {
		envelopes[index] = map[string]any{
			"caseId": envelope.CaseID, "resolverRef": envelope.ResolverRef,
			"relativePath": envelope.RelativePath, "locatorDigest": envelope.LocatorDigest,
			"encryptedMaterialDigest": envelope.EncryptedMaterialDigest,
			"encryptionPolicyDigest":  envelope.EncryptionPolicyDigest,
		}
	}
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.g4-model-evaluation-encrypted-holdout-corpus", "version": int64(1),
		"planDigest": commitment.PlanDigest, "repositoryCommit": commitment.RepositoryCommit,
		"protectedHoldoutManifestDigest": commitment.ProtectedHoldoutManifestDigest,
		"envelopes":                      envelopes,
	})
}

func canonicalBase64Length(value string, expectedBytes int) bool {
	decoded, err := base64.StdEncoding.DecodeString(value)
	if err != nil || (expectedBytes >= 0 && len(decoded) != expectedBytes) || base64.StdEncoding.EncodeToString(decoded) != value {
		return false
	}
	for index := range decoded {
		decoded[index] = 0
	}
	return true
}

func decodeEvaluationHoldoutEnvelope(source []byte) (evaluationHoldoutEnvelopeMetadata, error) {
	if err := canonicaljson.ValidateRawEnvelope(source, maximumEvaluationHoldoutEnvelopeBytes); err != nil {
		return evaluationHoldoutEnvelopeMetadata{}, conflict("evaluation protected envelope is invalid")
	}
	var envelope evaluationHoldoutEnvelopeMetadata
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&envelope); err != nil {
		return envelope, conflict("evaluation protected envelope shape is invalid")
	}
	canonical, err := canonicaljson.Bytes(envelope)
	if err != nil || !bytes.Equal(canonical, source) || envelope.Format != evaluationHoldoutEnvelopeFormat ||
		envelope.Version != 1 || envelope.Algorithm != "AES-256-GCM" || envelope.KeyRef != evaluationHoldoutEnvelopeKeyRef ||
		!evaluationDigestPattern.MatchString(envelope.PlanDigest) || !evaluationRepositoryCommitPattern.MatchString(envelope.RepositoryCommit) ||
		!validEvaluationServiceIdentity(envelope.CaseID) || !validEvaluationServiceIdentity(envelope.ResolverRef) ||
		!evaluationDigestPattern.MatchString(envelope.CaseDigest) || !evaluationDigestPattern.MatchString(envelope.EncryptionPolicyDigest) ||
		!evaluationDigestPattern.MatchString(envelope.MaterialDigest) || envelope.PlaintextByteLength < 1 ||
		envelope.PlaintextByteLength > 2_097_152 || !canonicalBase64Length(envelope.NonceBase64, 12) ||
		!canonicalBase64Length(envelope.AuthenticationTagBase64, 16) || !canonicalBase64Length(envelope.CiphertextBase64, int(envelope.PlaintextByteLength)) {
		return evaluationHoldoutEnvelopeMetadata{}, conflict("evaluation protected envelope metadata is invalid")
	}
	return envelope, nil
}

func evaluationOpenedRootInfo(root *os.Root) (os.FileInfo, error) {
	file, err := root.Open(".")
	if err != nil {
		return nil, err
	}
	defer file.Close()
	return file.Stat()
}

// evaluationOpenRootDirectory advances one descriptor-anchored component and
// proves that the opened directory handle is the same non-symlink entry seen
// from its parent both before and after the open.
func evaluationOpenRootDirectory(root *os.Root, component string) (*os.Root, error) {
	before, err := root.Lstat(component)
	if err != nil {
		return nil, err
	}
	if before.Mode()&os.ModeSymlink != 0 || !before.IsDir() {
		return nil, ErrInvalid
	}
	child, err := root.OpenRoot(component)
	if err != nil {
		return nil, err
	}
	opened, openedErr := evaluationOpenedRootInfo(child)
	after, afterErr := root.Lstat(component)
	if openedErr != nil || afterErr != nil || after.Mode()&os.ModeSymlink != 0 || !after.IsDir() ||
		!os.SameFile(before, after) || !os.SameFile(opened, after) {
		_ = child.Close()
		return nil, conflict("evaluation protected path changed during inspection")
	}
	return child, nil
}

func evaluationBoundedRootFile(root *os.Root, relativePath string, maximum int64) ([]byte, error) {
	if root == nil || relativePath == "" || maximum < 1 || filepath.IsAbs(relativePath) ||
		filepath.Clean(relativePath) != relativePath {
		return nil, ErrInvalid
	}
	components := strings.Split(filepath.ToSlash(relativePath), "/")
	for _, component := range components {
		if component == "" || component == "." || component == ".." {
			return nil, ErrInvalid
		}
	}
	current := root
	openedRoots := make([]*os.Root, 0, len(components)-1)
	defer func() {
		for index := len(openedRoots) - 1; index >= 0; index-- {
			_ = openedRoots[index].Close()
		}
	}()
	for _, component := range components[:len(components)-1] {
		child, err := evaluationOpenRootDirectory(current, component)
		if err != nil {
			return nil, err
		}
		openedRoots = append(openedRoots, child)
		current = child
	}
	name := components[len(components)-1]
	before, err := current.Lstat(name)
	if err != nil {
		return nil, err
	}
	if before.Mode()&os.ModeSymlink != 0 || !before.Mode().IsRegular() ||
		before.Size() < 1 || before.Size() > maximum {
		return nil, ErrInvalid
	}
	file, err := current.Open(name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	opened, err := file.Stat()
	afterOpen, afterOpenErr := current.Lstat(name)
	if err != nil || afterOpenErr != nil || afterOpen.Mode()&os.ModeSymlink != 0 ||
		!afterOpen.Mode().IsRegular() || !os.SameFile(before, afterOpen) || !os.SameFile(opened, afterOpen) {
		return nil, conflict("evaluation protected file handle drifted from its allowlisted entry")
	}
	buffer := make([]byte, before.Size())
	if _, err := io.ReadFull(file, buffer); err != nil {
		for index := range buffer {
			buffer[index] = 0
		}
		return nil, err
	}
	afterRead, err := file.Stat()
	listed, listedErr := current.Lstat(name)
	if err != nil || listedErr != nil || listed.Mode()&os.ModeSymlink != 0 || !afterRead.Mode().IsRegular() ||
		afterRead.Size() != before.Size() || !afterRead.ModTime().Equal(before.ModTime()) ||
		!os.SameFile(afterRead, listed) || !os.SameFile(before, listed) {
		for index := range buffer {
			buffer[index] = 0
		}
		return nil, conflict("evaluation protected file changed during inspection")
	}
	return buffer, nil
}

func validateEvaluationHoldoutCanaries(sets EvaluationHoldoutCanarySets) error {
	for _, values := range [][][]byte{sets.SecretCanaries, sets.ProtectedHoldoutCanaries} {
		if len(values) < 1 || len(values) > 256 {
			return ErrInvalid
		}
		seen := make(map[[sha256.Size]byte]struct{}, len(values))
		for _, value := range values {
			if len(value) < 8 || len(value) > 4_096 || !utf8.Valid(value) ||
				!evaluationHoldoutCanaryPattern.Match(value) || len(bytes.TrimSpace(value)) != len(value) {
				return ErrInvalid
			}
			key := sha256.Sum256(value)
			if _, duplicate := seen[key]; duplicate {
				return ErrInvalid
			}
			seen[key] = struct{}{}
		}
	}
	return nil
}

func clearEvaluationHoldoutCanaries(sets *EvaluationHoldoutCanarySets) {
	for _, values := range [][][]byte{sets.SecretCanaries, sets.ProtectedHoldoutCanaries} {
		for _, value := range values {
			for index := range value {
				value[index] = 0
			}
		}
	}
	sets.SecretCanaries, sets.ProtectedHoldoutCanaries = nil, nil
}

func evaluationTrackedPricingAuthority(container map[string]any) (map[string]any, error) {
	pricing, pricingOK := objectMember(container, "pricing")
	model, modelOK := objectMember(container, "model")
	if !pricingOK {
		return nil, conflict("evaluation tracked pricing authority is missing")
	}
	modelID, immutableVersion := stringMember(container, "modelId"), stringMember(container, "immutableModelVersion")
	if modelOK {
		modelID, immutableVersion = stringMember(model, "modelId"), stringMember(model, "immutableVersion")
	}
	source, sourceOK := objectMember(pricing, "source")
	snapshot, snapshotOK := objectMember(pricing, "snapshot")
	if !sourceOK || !snapshotOK || !validEvaluationServiceIdentity(stringMember(container, "providerConfigurationId")) ||
		!evaluationHoldoutIdentityIsValid(modelID) || immutableVersion == "" ||
		!evaluationDigestPattern.MatchString(stringMember(pricing, "authorityDigest")) {
		return nil, conflict("evaluation tracked pricing authority drifted")
	}
	return map[string]any{
		"providerConfigurationId": stringMember(container, "providerConfigurationId"),
		"modelId":                 modelID, "immutableModelVersion": immutableVersion,
		"modelTier": stringMember(pricing, "modelTier"), "source": source, "snapshot": snapshot,
		"authorityDigest": stringMember(pricing, "authorityDigest"),
	}, nil
}

func evaluationTrackedFrozenRunDigest(tracked map[string]any, planDigest, sourceConfigDigest string) (string, error) {
	attestation, attestationOK := objectMember(tracked, "attestation")
	controlledRuntime, controlledOK := objectMember(tracked, "controlledRuntime")
	execution, executionOK := objectMember(tracked, "execution")
	endpointSpool, endpointSpoolOK := objectMember(tracked, "endpointSmokeResponseSpoolEncryption")
	responseSpool, responseSpoolOK := objectMember(tracked, "responseSpoolEncryption")
	providers, providersOK := objectMember(tracked, "providers")
	compatibility, compatibilityOK := objectMember(tracked, "compatibilitySmokes")
	if !attestationOK || !controlledOK || !executionOK || !endpointSpoolOK || !responseSpoolOK ||
		!providersOK || !compatibilityOK {
		return "", conflict("evaluation tracked frozen run inputs are incomplete")
	}
	pricingAuthorities := make([]string, 0, 5)
	for _, key := range []string{"openaiResponses", "anthropicMessages", "geminiInteractions"} {
		provider, ok := objectMember(providers, key)
		if !ok {
			return "", conflict("evaluation tracked native pricing authority is missing")
		}
		authority, err := evaluationTrackedPricingAuthority(provider)
		if err != nil {
			return "", err
		}
		pricingAuthorities = append(pricingAuthorities, stringMember(authority, "authorityDigest"))
	}
	for _, key := range []string{"hosted", "local"} {
		entry, ok := objectMember(compatibility, key)
		runtime, runtimeOK := objectMember(entry, "runtime")
		if !ok || !runtimeOK {
			return "", conflict("evaluation tracked compatibility pricing authority is missing")
		}
		authority, err := evaluationTrackedPricingAuthority(runtime)
		if err != nil {
			return "", err
		}
		pricingAuthorities = append(pricingAuthorities, stringMember(authority, "authorityDigest"))
	}
	return canonicaljson.Digest(map[string]any{
		"attestation": attestation, "controlledRuntime": controlledRuntime, "execution": execution,
		"planDigest": planDigest, "pricingAuthorityDigests": pricingAuthorities,
		"endpointSmokeResponseSpoolEncryption": endpointSpool,
		"responseSpoolEncryption":              responseSpool, "sourceConfigDigest": sourceConfigDigest,
	})
}

func evaluationTrackedAttestationMatches(tracked map[string]any, commitment evaluationFrozenConfigCommitment) bool {
	attestation, ok := objectMember(tracked, "attestation")
	return ok && exactKeys(attestation, "authorityId", "keyId", "algorithm", "privateKeyEnvironmentName", "privateKeyRef") &&
		stringMember(attestation, "authorityId") == commitment.AuthorityID &&
		stringMember(attestation, "keyId") == commitment.KeyID && stringMember(attestation, "algorithm") == "Ed25519" &&
		stringMember(attestation, "privateKeyEnvironmentName") == evaluationAttestationKeyEnvironment &&
		stringMember(attestation, "privateKeyRef") == evaluationAttestationKeyRef
}

func verifyEvaluationFrozenConfigCommitment(
	ctx context.Context,
	verifier EvaluationAuthorityAttestationVerifier,
	commitment evaluationFrozenConfigCommitment,
) error {
	if verifier == nil {
		return ErrUnauthorized
	}
	messageValue := struct {
		evaluationFrozenConfigCommitmentBase
		CommitmentDigest string `json:"commitmentDigest"`
	}{commitment.evaluationFrozenConfigCommitmentBase, commitment.CommitmentDigest}
	message, err := canonicaljson.Bytes(messageValue)
	if err != nil {
		return err
	}
	messageDigest, err := canonicaljson.Digest(messageValue)
	if err != nil || verifier(ctx, EvaluationAuthorityAttestationVerification{
		AuthorityID: commitment.AuthorityID, KeyID: commitment.KeyID, Algorithm: "ed25519",
		AttestedPayloadDigest: messageDigest, AttestedPayloadBytes: message,
		SignatureBase64URL: commitment.SignatureBase64URL,
	}) != nil {
		return ErrUnauthorized
	}
	return nil
}

func (authority *fileEvaluationHoldoutSealAuthority) Resolve(ctx context.Context, planRecord EvaluationPlanRecord) (EvaluationHoldoutSealAuthorityEvidence, EvaluationHoldoutCanarySets, error) {
	commitmentBytes, err := evaluationBoundedRootFile(authority.commitmentRoot, authority.commitmentName, maximumEvaluationFrozenConfigBytes)
	if err != nil {
		if errors.Is(err, os.ErrNotExist) {
			return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, errEvaluationHoldoutAuthorityUnavailable
		}
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation frozen config commitment could not be read safely")
	}
	commitment, err := decodeEvaluationFrozenConfigCommitment(commitmentBytes)
	if err != nil {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, err
	}
	partition := EvaluationPlanPartition{PlanDigest: planRecord.PlanDigest, RepositoryCommit: planRecord.RepositoryCommit}
	if commitment.PlanDigest != partition.PlanDigest || commitment.RepositoryCommit != partition.RepositoryCommit ||
		commitment.RepositoryCommit != authority.expectedCommit ||
		validateEvaluationProductionRunConfigArtifactPartition(commitment.RunConfigArtifactBinding, partition) != nil ||
		commitment.WorkflowRunID != authority.expectedRunID ||
		commitment.JobID != authority.expectedJobID || commitment.EnvironmentDigest != authority.expectedEnvironmentDigest ||
		commitment.AuthorityID != authority.expectedAuthorityID || commitment.KeyID != authority.expectedKeyID {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation frozen config commitment partition drifted")
	}
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil || plan.PlanDigest != commitment.PlanDigest || plan.RepositoryCommit != commitment.RepositoryCommit ||
		stringMember(plan.Value, "protectedHoldoutManifestDigest") != commitment.ProtectedHoldoutManifestDigest ||
		commitment.CommittedAt != evaluationExportInstant(plan.PlannedAt) {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation frozen config commitment plan binding drifted")
	}
	if err := verifyEvaluationFrozenConfigCommitment(ctx, authority.verifier, commitment); err != nil {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, err
	}
	source, err := authority.runConfigArtifactSource.ResolveEvaluationProductionRunConfigArtifact(
		ctx, partition, commitment.RunConfigArtifactBinding,
	)
	if err != nil {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, err
	}
	defer func() {
		for index := range source {
			source[index] = 0
		}
	}()
	tracked, locators, err := decodeEvaluationTrackedConfig(source)
	if err != nil {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, err
	}
	sourceDigest, err := canonicaljson.Digest(tracked)
	material, _ := objectMember(tracked, "material")
	catalog, _ := objectMember(material, "catalogDigests")
	configVersion, versionOK := integerMember(tracked, "version")
	if err != nil || sourceDigest != commitment.SourceConfigDigest ||
		stringMember(tracked, "format") != "prodivix.g4-real-model-evaluation-run-config" ||
		!versionOK || configVersion != 1 || stringMember(tracked, "purpose") != "production" ||
		stringMember(tracked, "repositoryCommit") != commitment.RepositoryCommit ||
		stringMember(catalog, "restrictedMaterialManifestDigest") != commitment.RestrictedMaterialManifestDigest ||
		!evaluationTrackedAttestationMatches(tracked, commitment) {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation tracked frozen config digest or identity drifted")
	}
	frozenRunDigest, err := evaluationTrackedFrozenRunDigest(tracked, plan.PlanDigest, sourceDigest)
	if err != nil || frozenRunDigest != commitment.FrozenRunDigest {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation tracked frozen run digest drifted")
	}
	locatorByID := make(map[string]evaluationRestrictedEnvelopeLocator, len(locators))
	for _, locator := range locators {
		locatorByID[locator.CaseID] = locator
	}
	protectedCases, err := evaluationPlanProtectedCases(plan)
	if err != nil || len(protectedCases) != len(commitment.ProtectedEnvelopeAllowlist) {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation protected envelope allowlist denominator drifted")
	}
	if len(locators) != len(protectedCases) {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation tracked restricted locator denominator drifted")
	}
	accessPolicyDigest, err := evaluationHoldoutAccessPolicyDigest(commitment)
	if err != nil || accessPolicyDigest != commitment.AccessPolicyDigest {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation holdout access policy drifted")
	}
	envelopeCaseIDs := make([]string, len(protectedCases))
	envelopeDigests := make([]string, len(protectedCases))
	for index, expected := range protectedCases {
		allowed := commitment.ProtectedEnvelopeAllowlist[index]
		locator, exists := locatorByID[expected.CaseID]
		if !exists || allowed.CaseID != expected.CaseID || allowed.FixtureRef != expected.FixtureRef ||
			allowed.CaseDigest != expected.CaseDigest || allowed.Access != expected.Access ||
			allowed.CapabilityDescriptorDigest != expected.CapabilityDescriptorDigest ||
			allowed.CaseDefinitionDigest != expected.CaseDefinitionDigest ||
			allowed.ExpectedAuthorityDigest != expected.ExpectedAuthorityDigest ||
			allowed.GradingPolicyDigest != expected.GradingPolicyDigest ||
			allowed.ResolverRef != locator.ResolverRef || allowed.RelativePath != locator.RelativePath ||
			allowed.EncryptedMaterialDigest != locator.EncryptedMaterialDigest ||
			allowed.EncryptionPolicyDigest != locator.EncryptionPolicyDigest {
			return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation protected envelope allowlist drifted from plan or tracked config")
		}
		locatorDigest, digestErr := evaluationHoldoutLocatorDigest(allowed)
		if digestErr != nil || locatorDigest != allowed.LocatorDigest {
			return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation protected envelope locator digest drifted")
		}
		envelopeBytes, readErr := evaluationBoundedRootFile(authority.holdoutRoot, filepath.FromSlash(allowed.RelativePath), maximumEvaluationHoldoutEnvelopeBytes)
		if readErr != nil {
			return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation protected envelope file could not be inspected")
		}
		rawDigest := fmt.Sprintf("sha256-%x", sha256Bytes(envelopeBytes))
		envelope, decodeErr := decodeEvaluationHoldoutEnvelope(envelopeBytes)
		for byteIndex := range envelopeBytes {
			envelopeBytes[byteIndex] = 0
		}
		if decodeErr != nil || rawDigest != allowed.EncryptedMaterialDigest || envelope.PlanDigest != commitment.PlanDigest ||
			envelope.RepositoryCommit != commitment.RepositoryCommit || envelope.CaseID != allowed.CaseID ||
			envelope.CaseDigest != allowed.CaseDigest || envelope.ResolverRef != allowed.ResolverRef ||
			envelope.EncryptionPolicyDigest != allowed.EncryptionPolicyDigest {
			return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation protected envelope bytes or metadata drifted")
		}
		envelopeCaseIDs[index], envelopeDigests[index] = allowed.CaseID, rawDigest
	}
	manifestDigest, err := evaluationRestrictedMaterialManifestDigest(commitment.ProtectedEnvelopeAllowlist)
	if err != nil || manifestDigest != commitment.RestrictedMaterialManifestDigest ||
		manifestDigest != commitment.ProtectedHoldoutManifestDigest {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation restricted material manifest digest drifted")
	}
	encryptedCorpusDigest, err := evaluationHoldoutEncryptedCorpusDigest(commitment)
	if err != nil {
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, err
	}
	canaries, err := authority.canarySource(ctx)
	if err != nil || validateEvaluationHoldoutCanaries(canaries) != nil {
		clearEvaluationHoldoutCanaries(&canaries)
		return EvaluationHoldoutSealAuthorityEvidence{}, EvaluationHoldoutCanarySets{}, conflict("evaluation holdout canary authority is unavailable")
	}
	return EvaluationHoldoutSealAuthorityEvidence{
		RunConfigArtifactBinding: commitment.RunConfigArtifactBinding, SourceConfigDigest: commitment.SourceConfigDigest,
		FrozenRunDigest: commitment.FrozenRunDigest, ConfigCommitmentDigest: commitment.CommitmentDigest,
		ConfigCommitmentBytes:            append([]byte(nil), commitmentBytes...),
		ProtectedHoldoutManifestDigest:   commitment.ProtectedHoldoutManifestDigest,
		RestrictedMaterialManifestDigest: commitment.RestrictedMaterialManifestDigest,
		AccessPolicyDigest:               commitment.AccessPolicyDigest, EncryptedCorpusDigest: encryptedCorpusDigest,
		EnvelopeCaseIDs: envelopeCaseIDs, EnvelopeDigests: envelopeDigests,
	}, canaries, nil
}

func sha256Bytes(value []byte) [32]byte {
	return sha256.Sum256(value)
}
