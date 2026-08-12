package agent

import (
	"encoding/json"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationOwnerStateIdentityFormat           = "prodivix.agent-evaluation-owner-state-identity"
	evaluationOwnerStateBundleFormat             = "prodivix.agent-evaluation-owner-state-bundle"
	evaluationOwnerStateOperationRecordFormat    = "prodivix.agent-evaluation-owner-state-operation-record"
	evaluationOwnerStateStageFormat              = "prodivix.agent-evaluation-owner-state-stage"
	evaluationOwnerStateDispatchAckFormat        = "prodivix.agent-evaluation-owner-state-dispatch-ack"
	evaluationOwnerStateSealedOperationFormat    = "prodivix.agent-evaluation-sealed-owner-operation"
	evaluationOwnerStateResultIngressFormat      = "prodivix.agent-evaluation-owner-state-result-ingress"
	evaluationOwnerStateResultResponseFormat     = "prodivix.agent-evaluation-owner-state-result-ingress-response"
	evaluationOwnerStateCASIngressFormat         = "prodivix.agent-evaluation-owner-state-cas-ingress"
	evaluationOwnerStateCASResponseFormat        = "prodivix.agent-evaluation-owner-state-cas-ingress-response"
	evaluationOwnerStateCASReadResponseFormat    = "prodivix.agent-evaluation-owner-state-cas-read-response"
	evaluationOwnerStateCASDescriptorFormat      = "prodivix.agent-evaluation-owner-state-cas-descriptor"
	evaluationOwnerStateListResponseFormat       = "prodivix.agent-evaluation-owner-state-list-response"
	evaluationOwnerStateReadResponseFormat       = "prodivix.agent-evaluation-owner-state-read-response"
	evaluationOwnerStateVersion                  = int64(1)
	maximumEvaluationOwnerStateOuterBytes        = 33_619_968
	maximumEvaluationControlledOwnerStateBytes   = 25_165_824
	maximumEvaluationVerificationOwnerStateBytes = 7_864_320
	maximumEvaluationOwnerStateCASArtifactBytes  = 8_388_608
	maximumEvaluationOwnerStateCASArtifacts      = 128
	maximumEvaluationOwnerStateRecentOperations  = 4
	maximumEvaluationOwnerStateListRecords       = 128
)

type EvaluationOwnerStatePrior struct {
	OwnerStateID              string
	Revision                  int64
	Bundle                    json.RawMessage
	RootDigest                string
	OwnerImplementationDigest string
}

type EvaluationOwnerStateSealedOperation struct {
	Bytes                     json.RawMessage
	ServiceKind               string
	Operation                 string
	RouteBinding              string
	RequestDigest             string
	OwnerImplementationDigest string
	OwnerStateID              string
	PriorRevision             int64
	PriorRootDigest           string
	StageDigest               string
	PublicResult              json.RawMessage
	ResponseDigest            string
	OwnerStateRevision        int64
	OwnerStateRootDigest      string
	DispatchAckDigest         string
	ResultReceiptDigest       string
}

type EvaluationOwnerStateTransition struct {
	PublicResult              json.RawMessage
	AuthorityResponse         json.RawMessage
	ResponseDigest            string
	OwnerImplementationDigest string
	OwnerStateID              string
	PriorRevision             int64
	PriorRootDigest           string
	StageDigest               string
	DispatchAckDigest         string
	OwnerStateRevision        int64
	OwnerStateBundle          json.RawMessage
	OwnerStateRootDigest      string
	ResultReceiptDigest       string
}

type EvaluationOwnerStateImplementationDigestSource interface {
	ControlledWorkspaceImplementationDigest() (string, bool)
	VerificationEvidenceImplementationDigest() (string, bool)
}

type EvaluationOwnerStateRecord struct {
	NamespaceID      string
	PlanDigest       string
	RepositoryCommit string
	ServiceKind      string
	OwnerStateID     string
	Revision         int64
	RootDigest       string
	SnapshotKind     string
	SnapshotDigest   string
	SnapshotState    string
	BundleBytes      []byte
	UpdatedAt        time.Time
}

type EvaluationOwnerStateDispatchRecord struct {
	NamespaceID               string
	PlanDigest                string
	RepositoryCommit          string
	ServiceKind               string
	Operation                 string
	RouteBinding              string
	RequestDigest             string
	OwnerImplementationDigest string
	OwnerStateID              string
	PriorRevision             int64
	PriorRootDigest           string
	StageDigest               string
	DispatchAckDigest         string
	ResponseDigest            string
	OwnerStateRevision        int64
	OwnerStateRootDigest      string
	ResultReceiptDigest       string
	PublicResultBytes         []byte
}

type EvaluationOwnerStateCASRecord struct {
	NamespaceID               string
	PlanDigest                string
	RepositoryCommit          string
	ServiceKind               string
	RequestDigest             string
	OwnerImplementationDigest string
	StageDigest               string
	OwnerStateID              string
	ArtifactRef               string
	ArtifactKind              string
	MediaType                 string
	ArtifactDigest            string
	ByteLength                int64
	ContentBytes              []byte
	ArtifactIdentityDigest    string
	DescriptorDigest          string
	UploadDigest              string
	CASReceiptDigest          string
}

func evaluationOwnerStatefulOperation(serviceKind, operation, routeBinding string) bool {
	switch serviceKind {
	case "controlled-workspace":
		bindings := map[string]string{
			"session.load-or-reattach":     "sessions/load-or-reattach",
			"session.preflight":            "sessions/{sessionId}/preflight",
			"session.restore-checkpoint":   "sessions/{sessionId}/restore-checkpoint",
			"session.execute":              "sessions/{sessionId}/execute",
			"session.reconcile-dispatched": "sessions/{sessionId}/reconcile-dispatched",
			"session.artifact.resolve":     "sessions/{sessionId}/artifacts/resolve",
			"session.assess-final":         "sessions/{sessionId}/assess-final",
			"session.destroy":              "sessions/{sessionId}/destroy",
		}
		return bindings[operation] == routeBinding
	case "verification-evidence":
		bindings := map[string]string{
			"promotion.create":       "promotions",
			"artifact.upload":        "promotions/{promotionId}/artifacts/{artifactId}",
			"promotion.prepare":      "promotions/{promotionId}/prepare",
			"promotion.final-commit": "promotions/{promotionId}/final-commit",
		}
		return bindings[operation] == routeBinding
	default:
		return false
	}
}

func evaluationOwnerStateMaximumBytes(serviceKind string) int {
	if serviceKind == "controlled-workspace" {
		return maximumEvaluationControlledOwnerStateBytes
	}
	if serviceKind == "verification-evidence" {
		return maximumEvaluationVerificationOwnerStateBytes
	}
	return 0
}

func evaluationOwnerStateIdentity(
	serviceKind string,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
	descriptorDigest string,
	grantOrAuthorityDigest string,
	generation int64,
) (string, error) {
	if !oneOfString(serviceKind, "controlled-workspace", "verification-evidence") ||
		!validEvaluationAgentControlIdentity(namespaceID) ||
		!evaluationDigestPattern.MatchString(partition.PlanDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(partition.RepositoryCommit) ||
		!validEvaluationAgentControlIdentity(attemptID) ||
		!evaluationDigestPattern.MatchString(descriptorDigest) ||
		!evaluationDigestPattern.MatchString(grantOrAuthorityDigest) || generation < 1 {
		return "", ErrInvalid
	}
	base := map[string]any{
		"format": evaluationOwnerStateIdentityFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": serviceKind, "namespaceId": namespaceID,
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId": attemptID, "descriptorDigest": descriptorDigest, "generation": generation,
	}
	if serviceKind == "controlled-workspace" {
		base["grantDigest"] = grantOrAuthorityDigest
	} else {
		base["authorityDigest"] = grantOrAuthorityDigest
	}
	return canonicaljson.Digest(base)
}

func evaluationOwnerStateDigestMatches(value map[string]any, digestKey string) bool {
	digest := stringMember(value, digestKey)
	if !evaluationDigestPattern.MatchString(digest) {
		return false
	}
	base := cloneEvaluationObject(value)
	delete(base, digestKey)
	computed, err := canonicaljson.Digest(base)
	return err == nil && computed == digest
}

func evaluationOwnerStateNullableDigest(value any, required bool) bool {
	if value == nil {
		return !required
	}
	text, ok := value.(string)
	return ok && evaluationDigestPattern.MatchString(text)
}

func evaluationOwnerStateCanonicalDigest(value any, digest any) bool {
	text, ok := digest.(string)
	if !ok || !evaluationDigestPattern.MatchString(text) {
		return false
	}
	computed, err := canonicaljson.Digest(value)
	return err == nil && computed == text
}

func evaluationVerificationEvidenceStatementEnvelopeDigest(statement any) (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.verification-evidence-statement", "version": int64(1), "statement": statement,
	})
}

func evaluationOwnerStateSorted(values []any, key string) bool {
	previous := ""
	for index, raw := range values {
		value, ok := raw.(map[string]any)
		if !ok {
			return false
		}
		current := stringMember(value, key)
		if current == "" || index > 0 && current <= previous {
			return false
		}
		previous = current
	}
	return true
}

func validateEvaluationOwnerStateOperationRecords(value any) bool {
	entries, ok := value.([]any)
	if !ok || len(entries) == 0 || len(entries) > maximumEvaluationOwnerStateRecentOperations {
		return false
	}
	previous := int64(0)
	for _, raw := range entries {
		entry, ok := raw.(map[string]any)
		sequence, sequenceOK := integerMember(entry, "sequence")
		if !ok || !sequenceOK || sequence <= previous || !exactEvaluationKeys(entry, []string{
			"format", "version", "sequence", "operation", "routeBinding", "requestDigest",
			"stageDigest", "responseDigest", "recordDigest",
		}) || stringMember(entry, "format") != evaluationOwnerStateOperationRecordFormat ||
			!validEvaluationServiceIdentity(stringMember(entry, "operation")) ||
			stringMember(entry, "routeBinding") == "" ||
			!evaluationDigestPattern.MatchString(stringMember(entry, "requestDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(entry, "stageDigest")) ||
			!evaluationDigestPattern.MatchString(stringMember(entry, "responseDigest")) ||
			!evaluationOwnerStateDigestMatches(entry, "recordDigest") {
			return false
		}
		version, versionOK := integerMember(entry, "version")
		if !versionOK || version != evaluationOwnerStateVersion {
			return false
		}
		previous = sequence
	}
	return true
}

func decodeEvaluationOwnerStateCASDescriptor(value any) (map[string]any, error) {
	descriptor, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(descriptor, []string{
		"format", "version", "artifactRef", "artifactKind", "mediaType", "artifactDigest",
		"byteLength", "casReceiptDigest", "descriptorDigest",
	}) || stringMember(descriptor, "format") != evaluationOwnerStateCASDescriptorFormat ||
		!validEvaluationAgentControlIdentity(stringMember(descriptor, "artifactRef")) ||
		!validEvaluationAgentControlIdentity(stringMember(descriptor, "artifactKind")) ||
		!validVerificationEvidenceMediaType(stringMember(descriptor, "mediaType")) ||
		!evaluationDigestPattern.MatchString(stringMember(descriptor, "artifactDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(descriptor, "casReceiptDigest")) ||
		!evaluationOwnerStateDigestMatches(descriptor, "descriptorDigest") {
		return nil, ErrInvalid
	}
	version, versionOK := integerMember(descriptor, "version")
	byteLength, lengthOK := integerMember(descriptor, "byteLength")
	if !versionOK || version != evaluationOwnerStateVersion || !lengthOK ||
		byteLength < 0 || byteLength > maximumEvaluationOwnerStateCASArtifactBytes {
		return nil, ErrInvalid
	}
	return descriptor, nil
}

func validateEvaluationOwnerStateCASDescriptors(value any, digest any) bool {
	entries, ok := value.([]any)
	if !ok || len(entries) > maximumEvaluationOwnerStateCASArtifacts ||
		!evaluationOwnerStateSorted(entries, "artifactRef") ||
		!evaluationOwnerStateCanonicalDigest(entries, digest) {
		return false
	}
	for _, entry := range entries {
		if _, err := decodeEvaluationOwnerStateCASDescriptor(entry); err != nil {
			return false
		}
	}
	return true
}

func validateEvaluationOwnerStateCheckpoint(
	value any,
	attemptID string,
	grantDigest string,
	generation int64,
) (map[string]any, error) {
	checkpoint, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(checkpoint, []string{
		"checkpointRef", "attemptId", "grantDigest", "generation", "snapshotDigest",
		"securePersistenceReceiptDigest", "checkpointDigest",
	}, "predecessorCheckpointDigest") ||
		!validEvaluationAgentControlIdentity(stringMember(checkpoint, "checkpointRef")) ||
		stringMember(checkpoint, "attemptId") != attemptID ||
		stringMember(checkpoint, "grantDigest") != grantDigest ||
		!evaluationDigestPattern.MatchString(stringMember(checkpoint, "snapshotDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(checkpoint, "securePersistenceReceiptDigest")) ||
		!evaluationOwnerStateDigestMatches(checkpoint, "checkpointDigest") {
		return nil, ErrInvalid
	}
	checkpointGeneration, generationOK := integerMember(checkpoint, "generation")
	if !generationOK || checkpointGeneration != generation {
		return nil, ErrConflict
	}
	if predecessor, exists := checkpoint["predecessorCheckpointDigest"]; exists {
		predecessorDigest, ok := predecessor.(string)
		if !ok || !evaluationDigestPattern.MatchString(predecessorDigest) {
			return nil, ErrInvalid
		}
	}
	return checkpoint, nil
}

func validateEvaluationControlledOwnerStateSnapshot(
	snapshot map[string]any,
	identity map[string]any,
	revision int64,
) error {
	keys := []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "caseId", "materialDigest", "fixtureDigest", "grantDigest", "generation",
		"sessionId", "isolationPolicyDigest", "revision", "state", "initialCheckpoint",
		"initialCheckpointDigest", "currentCheckpoint", "currentCheckpointDigest", "workspaceSnapshot",
		"workspaceSnapshotDigest", "toolDefinitions",
		"toolDefinitionSetDigest", "actionRegistry", "actionRegistryDigest", "g3VerificationPlan",
		"verificationPlanDigest", "adapterRegistry", "adapterRegistryDigest", "finalWorkspaceSnapshotDigest",
		"artifactDescriptors", "artifactDescriptorSetDigest", "finalAuthorityReceiptDigest",
		"cleanupReceiptDigest", "snapshotDigest",
	}
	if !exactEvaluationKeys(snapshot, keys) ||
		stringMember(snapshot, "format") != "prodivix.agent-evaluation-controlled-workspace-owner-state-snapshot" ||
		stringMember(snapshot, "namespaceId") != stringMember(identity, "namespaceId") ||
		stringMember(snapshot, "planDigest") != stringMember(identity, "planDigest") ||
		stringMember(snapshot, "repositoryCommit") != stringMember(identity, "repositoryCommit") ||
		stringMember(snapshot, "attemptId") != stringMember(identity, "attemptId") ||
		stringMember(snapshot, "descriptorDigest") != stringMember(identity, "descriptorDigest") ||
		stringMember(snapshot, "grantDigest") != stringMember(identity, "grantDigest") ||
		!validEvaluationAgentControlIdentity(stringMember(snapshot, "caseId")) ||
		!evaluationDigestPattern.MatchString(stringMember(snapshot, "materialDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(snapshot, "fixtureDigest")) ||
		!validEvaluationAgentControlIdentity(stringMember(snapshot, "sessionId")) ||
		!evaluationDigestPattern.MatchString(stringMember(snapshot, "isolationPolicyDigest")) ||
		!oneOfString(stringMember(snapshot, "state"), "active", "destroyed") ||
		!evaluationOwnerStateDigestMatches(snapshot, "snapshotDigest") {
		return ErrInvalid
	}
	version, versionOK := integerMember(snapshot, "version")
	generation, generationOK := integerMember(snapshot, "generation")
	snapshotRevision, revisionOK := integerMember(snapshot, "revision")
	identityGeneration, identityGenerationOK := integerMember(identity, "generation")
	if !versionOK || version != evaluationOwnerStateVersion || !generationOK || !identityGenerationOK ||
		generation != identityGeneration || !revisionOK || snapshotRevision != revision {
		return ErrInvalid
	}
	for _, pair := range [][2]string{
		{"workspaceSnapshot", "workspaceSnapshotDigest"}, {"toolDefinitions", "toolDefinitionSetDigest"},
		{"actionRegistry", "actionRegistryDigest"}, {"g3VerificationPlan", "verificationPlanDigest"},
		{"adapterRegistry", "adapterRegistryDigest"}, {"artifactDescriptors", "artifactDescriptorSetDigest"},
	} {
		if !evaluationOwnerStateCanonicalDigest(snapshot[pair[0]], snapshot[pair[1]]) {
			return ErrConflict
		}
	}
	tools, ok := snapshot["toolDefinitions"].([]any)
	artifacts, artifactsOK := snapshot["artifactDescriptors"].([]any)
	if !ok || !evaluationOwnerStateSorted(tools, "toolId") || !artifactsOK ||
		!evaluationOwnerStateSorted(artifacts, "artifactRef") {
		return ErrInvalid
	}
	active := stringMember(snapshot, "state") == "active"
	checkpointPairs := [][2]string{
		{"initialCheckpoint", "initialCheckpointDigest"},
		{"currentCheckpoint", "currentCheckpointDigest"},
	}
	checkpointPresence := false
	for index, pair := range checkpointPairs {
		checkpointValue, present := snapshot[pair[0]].(map[string]any)
		if snapshot[pair[0]] == nil {
			if snapshot[pair[1]] != nil || active {
				return ErrInvalid
			}
		} else {
			if !present {
				return ErrInvalid
			}
			checkpoint, err := validateEvaluationOwnerStateCheckpoint(
				checkpointValue, stringMember(snapshot, "attemptId"), stringMember(snapshot, "grantDigest"), generation,
			)
			if err != nil || stringMember(checkpoint, "checkpointDigest") != stringMember(snapshot, pair[1]) {
				return ErrConflict
			}
		}
		if index == 0 {
			checkpointPresence = present
		} else if checkpointPresence != present {
			return ErrInvalid
		}
	}
	for _, key := range []string{"finalWorkspaceSnapshotDigest", "finalAuthorityReceiptDigest", "cleanupReceiptDigest"} {
		if !evaluationOwnerStateNullableDigest(snapshot[key], false) {
			return ErrInvalid
		}
	}
	return nil
}

func validateEvaluationVerificationOwnerStateSnapshot(
	snapshot map[string]any,
	identity map[string]any,
	revision int64,
) error {
	keys := []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId",
		"descriptorDigest", "generation", "authorityDigest", "sandboxRegistrationReceiptDigest",
		"revision", "state", "promotionId", "evidenceId", "projectId", "workspaceId", "workspaceRevision",
		"verificationPlanDigest", "adapterRegistryDigest", "candidate", "candidateDigest", "createdAt",
		"deadlineAt", "uploadCapabilityDigest", "attestationNonceDigest", "attestationStatement",
		"attestationStatementDigest", "uploadedArtifactManifests", "artifactManifestSetDigest",
		"verifiedClaims", "verifiedClaimSetDigest", "finalManifest", "finalManifestDigest",
		"evidenceRecords", "evidenceRecordSetDigest", "snapshotDigest",
	}
	if !exactEvaluationKeys(snapshot, keys) ||
		stringMember(snapshot, "format") != "prodivix.agent-evaluation-verification-evidence-owner-state-snapshot" ||
		stringMember(snapshot, "namespaceId") != stringMember(identity, "namespaceId") ||
		stringMember(snapshot, "planDigest") != stringMember(identity, "planDigest") ||
		stringMember(snapshot, "repositoryCommit") != stringMember(identity, "repositoryCommit") ||
		stringMember(snapshot, "attemptId") != stringMember(identity, "attemptId") ||
		stringMember(snapshot, "descriptorDigest") != stringMember(identity, "descriptorDigest") ||
		stringMember(snapshot, "authorityDigest") != stringMember(identity, "authorityDigest") ||
		!oneOfString(stringMember(snapshot, "state"), "registered", "active", "prepared", "finalized", "destroyed") ||
		!evaluationOwnerStateDigestMatches(snapshot, "snapshotDigest") {
		return ErrInvalid
	}
	version, versionOK := integerMember(snapshot, "version")
	generation, generationOK := integerMember(snapshot, "generation")
	snapshotRevision, revisionOK := integerMember(snapshot, "revision")
	identityGeneration, identityGenerationOK := integerMember(identity, "generation")
	workspaceRevision, workspaceRevisionOK := integerMember(snapshot, "workspaceRevision")
	if !versionOK || version != evaluationOwnerStateVersion || !generationOK || !identityGenerationOK ||
		generation != identityGeneration || !revisionOK || snapshotRevision != revision ||
		!workspaceRevisionOK || workspaceRevision < 0 {
		return ErrInvalid
	}
	for _, key := range []string{
		"sandboxRegistrationReceiptDigest", "verificationPlanDigest", "adapterRegistryDigest", "uploadCapabilityDigest",
	} {
		if !evaluationOwnerStateNullableDigest(snapshot[key], true) {
			return ErrInvalid
		}
	}
	if !evaluationOwnerStateNullableDigest(snapshot["attestationNonceDigest"], false) {
		return ErrInvalid
	}
	for _, key := range []string{"promotionId", "evidenceId", "projectId", "workspaceId"} {
		if snapshot[key] != nil {
			text, ok := snapshot[key].(string)
			if !ok || !validEvaluationAgentControlIdentity(text) {
				return ErrInvalid
			}
		}
	}
	for _, key := range []string{"createdAt", "deadlineAt"} {
		if snapshot[key] != nil {
			text, ok := snapshot[key].(string)
			if !ok {
				return ErrInvalid
			}
			if _, err := parseEvaluationServiceInstant(text); err != nil {
				return ErrInvalid
			}
		}
	}
	for _, pair := range [][2]string{
		{"candidate", "candidateDigest"},
		{"uploadedArtifactManifests", "artifactManifestSetDigest"}, {"verifiedClaims", "verifiedClaimSetDigest"},
		{"finalManifest", "finalManifestDigest"}, {"evidenceRecords", "evidenceRecordSetDigest"},
	} {
		if snapshot[pair[0]] == nil {
			if snapshot[pair[1]] != nil {
				return ErrInvalid
			}
			continue
		}
		if !evaluationOwnerStateCanonicalDigest(snapshot[pair[0]], snapshot[pair[1]]) {
			return ErrConflict
		}
	}
	if snapshot["attestationStatement"] == nil {
		if snapshot["attestationStatementDigest"] != nil {
			return ErrInvalid
		}
	} else {
		digest, err := evaluationVerificationEvidenceStatementEnvelopeDigest(snapshot["attestationStatement"])
		if err != nil || digest != stringMember(snapshot, "attestationStatementDigest") {
			return ErrConflict
		}
	}
	for _, pair := range [][2]string{{"uploadedArtifactManifests", "artifactId"}, {"verifiedClaims", "claimDigest"}, {"evidenceRecords", "evidenceId"}} {
		if snapshot[pair[0]] == nil {
			continue
		}
		entries, ok := snapshot[pair[0]].([]any)
		if !ok || !evaluationOwnerStateSorted(entries, pair[1]) {
			return ErrInvalid
		}
	}
	state := stringMember(snapshot, "state")
	if oneOfString(state, "active", "prepared", "finalized") &&
		(snapshot["promotionId"] == nil || snapshot["evidenceId"] == nil) {
		return ErrInvalid
	}
	if oneOfString(state, "registered", "active") &&
		(snapshot["attestationNonceDigest"] != nil || snapshot["attestationStatement"] != nil ||
			snapshot["attestationStatementDigest"] != nil) {
		return ErrInvalid
	}
	if oneOfString(state, "prepared", "finalized") &&
		(snapshot["attestationNonceDigest"] == nil || snapshot["attestationStatement"] == nil ||
			snapshot["attestationStatementDigest"] == nil) {
		return ErrInvalid
	}
	if state == "prepared" && snapshot["finalManifest"] != nil {
		return ErrInvalid
	}
	if state == "finalized" && (snapshot["finalManifest"] == nil || snapshot["evidenceRecords"] == nil) {
		return ErrInvalid
	}
	return nil
}

func decodeEvaluationOwnerStateBundle(
	source []byte,
	serviceKind string,
	namespaceID string,
	partition EvaluationPlanPartition,
	ownerStateID string,
	expectedRevision int64,
	expectedPreviousRoot string,
) (map[string]any, string, error) {
	maximum := evaluationOwnerStateMaximumBytes(serviceKind)
	value, err := decodeCanonicalEvaluationObject(source, maximum)
	if err != nil || agentcontract.ValidateSanitizedAgentPayload(value) != nil ||
		!exactEvaluationKeys(value, []string{
			"format", "version", "serviceKind", "namespaceId", "planDigest", "repositoryCommit",
			"ownerStateId", "revision", "previousOwnerStateRootDigest", "snapshotKind", "snapshot",
			"snapshotDigest", "casArtifacts", "casArtifactSetDigest", "recentOperations",
			"recentOperationSetDigest",
		}) || stringMember(value, "format") != evaluationOwnerStateBundleFormat ||
		stringMember(value, "serviceKind") != serviceKind ||
		stringMember(value, "namespaceId") != namespaceID ||
		stringMember(value, "planDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit ||
		stringMember(value, "ownerStateId") != ownerStateID ||
		stringMember(value, "snapshotKind") != serviceKind {
		return nil, "", ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	revision, revisionOK := integerMember(value, "revision")
	if !versionOK || version != evaluationOwnerStateVersion || !revisionOK || revision != expectedRevision || revision < 1 {
		return nil, "", ErrInvalid
	}
	if expectedPreviousRoot == "" {
		if value["previousOwnerStateRootDigest"] != nil {
			return nil, "", ErrConflict
		}
	} else if stringMember(value, "previousOwnerStateRootDigest") != expectedPreviousRoot {
		return nil, "", ErrConflict
	}
	if !validateEvaluationOwnerStateCASDescriptors(value["casArtifacts"], value["casArtifactSetDigest"]) ||
		!validateEvaluationOwnerStateOperationRecords(value["recentOperations"]) ||
		!evaluationOwnerStateCanonicalDigest(value["recentOperations"], value["recentOperationSetDigest"]) {
		return nil, "", ErrInvalid
	}
	snapshot, ok := value["snapshot"].(map[string]any)
	if !ok || stringMember(snapshot, "snapshotDigest") != stringMember(value, "snapshotDigest") {
		return nil, "", ErrInvalid
	}
	identity, identityErr := evaluationOwnerStateIdentityValue(value, snapshot)
	if identityErr != nil || stringMember(value, "ownerStateId") != ownerStateID {
		return nil, "", ErrConflict
	}
	computedOwnerStateID, digestErr := canonicaljson.Digest(identity)
	if digestErr != nil || computedOwnerStateID != ownerStateID {
		return nil, "", ErrConflict
	}
	if serviceKind == "controlled-workspace" {
		err = validateEvaluationControlledOwnerStateSnapshot(snapshot, identity, revision)
	} else {
		err = validateEvaluationVerificationOwnerStateSnapshot(snapshot, identity, revision)
	}
	if err != nil {
		return nil, "", err
	}
	rootDigest, err := canonicaljson.Digest(value)
	if err != nil {
		return nil, "", ErrInvalid
	}
	return value, rootDigest, nil
}

func evaluationOwnerStateIdentityValue(bundle, snapshot map[string]any) (map[string]any, error) {
	identity := map[string]any{
		"format": evaluationOwnerStateIdentityFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": bundle["serviceKind"], "namespaceId": bundle["namespaceId"],
		"planDigest": bundle["planDigest"], "repositoryCommit": bundle["repositoryCommit"],
		"attemptId": snapshot["attemptId"], "descriptorDigest": snapshot["descriptorDigest"],
		"generation": snapshot["generation"],
	}
	if stringMember(bundle, "serviceKind") == "controlled-workspace" {
		identity["grantDigest"] = snapshot["grantDigest"]
	} else if stringMember(bundle, "serviceKind") == "verification-evidence" {
		identity["authorityDigest"] = snapshot["authorityDigest"]
	} else {
		return nil, ErrInvalid
	}
	return identity, nil
}

func evaluationOwnerStateStageDigest(
	serviceKind, operation, routeBinding, requestDigest, ownerImplementationDigest, ownerStateID string,
	priorRevision int64,
	priorRootDigest string,
) (string, error) {
	base := map[string]any{
		"format": evaluationOwnerStateStageFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": serviceKind, "operation": operation, "routeBinding": routeBinding,
		"requestDigest": requestDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"ownerStateId": ownerStateID, "priorOwnerStateRevision": priorRevision,
		"priorOwnerStateRootDigest": nil,
	}
	if priorRootDigest != "" {
		base["priorOwnerStateRootDigest"] = priorRootDigest
	}
	return canonicaljson.Digest(base)
}

func evaluationOwnerStateDispatchAckDigest(transition EvaluationOwnerStateTransition, serviceKind, operation, routeBinding, requestDigest string) (string, error) {
	base := map[string]any{
		"format": evaluationOwnerStateDispatchAckFormat, "version": evaluationOwnerStateVersion,
		"serviceKind": serviceKind, "operation": operation, "routeBinding": routeBinding,
		"requestDigest": requestDigest, "ownerImplementationDigest": transition.OwnerImplementationDigest,
		"ownerStateId": transition.OwnerStateID, "priorOwnerStateRevision": transition.PriorRevision,
		"priorOwnerStateRootDigest": nil, "stageDigest": transition.StageDigest,
		"responseDigest": transition.ResponseDigest, "ownerStateRevision": transition.OwnerStateRevision,
		"ownerStateRootDigest": transition.OwnerStateRootDigest,
	}
	if transition.PriorRootDigest != "" {
		base["priorOwnerStateRootDigest"] = transition.PriorRootDigest
	}
	return canonicaljson.Digest(base)
}

func decodeEvaluationOwnerStateSealedOperation(source []byte) (EvaluationOwnerStateSealedOperation, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationOwnerStateOuterBytes)
	if err != nil || agentcontract.ValidateSanitizedAgentPayload(value) != nil ||
		!exactEvaluationKeys(value, []string{
			"format", "version", "serviceKind", "operation", "routeBinding", "requestDigest",
			"ownerImplementationDigest", "ownerStateId", "priorOwnerStateRevision",
			"priorOwnerStateRootDigest", "stageDigest", "publicResult", "responseDigest",
			"ownerStateRevision", "ownerStateRootDigest", "dispatchAckDigest", "resultReceiptDigest",
		}) || stringMember(value, "format") != evaluationOwnerStateSealedOperationFormat ||
		!evaluationOwnerStateDigestMatches(value, "resultReceiptDigest") {
		return EvaluationOwnerStateSealedOperation{}, ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	priorRevision, priorOK := integerMember(value, "priorOwnerStateRevision")
	revision, revisionOK := integerMember(value, "ownerStateRevision")
	publicResult, canonicalErr := canonicaljson.Bytes(value["publicResult"])
	responseDigest, digestErr := canonicaljson.Digest(value["publicResult"])
	priorRoot := ""
	if value["priorOwnerStateRootDigest"] != nil {
		priorRoot = stringMember(value, "priorOwnerStateRootDigest")
	}
	if !versionOK || version != evaluationOwnerStateVersion || !priorOK || !revisionOK || revision != priorRevision+1 ||
		canonicalErr != nil || digestErr != nil || responseDigest != stringMember(value, "responseDigest") ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerImplementationDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerStateId")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerStateRootDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "dispatchAckDigest")) ||
		(priorRevision == 0 && priorRoot != "") || (priorRevision > 0 && !evaluationDigestPattern.MatchString(priorRoot)) {
		return EvaluationOwnerStateSealedOperation{}, ErrInvalid
	}
	return EvaluationOwnerStateSealedOperation{
		Bytes: append(json.RawMessage(nil), source...), ServiceKind: stringMember(value, "serviceKind"),
		Operation: stringMember(value, "operation"), RouteBinding: stringMember(value, "routeBinding"),
		RequestDigest:             stringMember(value, "requestDigest"),
		OwnerImplementationDigest: stringMember(value, "ownerImplementationDigest"),
		OwnerStateID:              stringMember(value, "ownerStateId"), PriorRevision: priorRevision,
		PriorRootDigest: priorRoot, StageDigest: stringMember(value, "stageDigest"), PublicResult: publicResult,
		ResponseDigest: stringMember(value, "responseDigest"), OwnerStateRevision: revision,
		OwnerStateRootDigest: stringMember(value, "ownerStateRootDigest"),
		DispatchAckDigest:    stringMember(value, "dispatchAckDigest"),
		ResultReceiptDigest:  stringMember(value, "resultReceiptDigest"),
	}, nil
}
