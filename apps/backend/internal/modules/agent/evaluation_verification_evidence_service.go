package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"regexp"
	"sort"
	"strings"
	"time"
	"unicode"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationVerificationEvidenceBridgeFormat         = "prodivix.agent-evaluation-verification-evidence-bridge"
	evaluationVerificationEvidenceBridgeVersion        = int64(1)
	maximumEvaluationVerificationEvidenceRequestBytes  = int64(25_296_896)
	maximumEvaluationVerificationEvidenceResponseBytes = 8_388_608
	maximumEvaluationVerificationEvidenceArtifactBytes = 8_388_608
	maximumEvaluationVerificationEvidenceReceipts      = 128
	maximumEvaluationVerificationGrantReceiptBytes     = 2_097_152
)

var evaluationVerificationMediaTypePattern = regexp.MustCompile(
	`^[a-z0-9][a-z0-9!#$&^_.+\-]*/[a-z0-9][a-z0-9!#$&^_.+\-]*$`,
)

// EvaluationVerificationEvidenceAuthorityRequest is callback-bound. Request
// contains upload capabilities, attestation nonces/proofs, or artifact bytes
// for some operations and therefore must never be logged or persisted by the
// evaluation ledger.
type EvaluationVerificationEvidenceAuthorityRequest struct {
	NamespaceID                      string
	PlanDigest                       string
	RepositoryCommit                 string
	Operation                        string
	RouteBinding                     string
	RequestDigest                    string
	AttemptID                        string
	DescriptorDigest                 string
	Generation                       int64
	ControlledWorkspaceGrantDigest   string
	AuthorityDigest                  string
	SandboxRegistrationReceiptDigest string
	Request                          json.RawMessage
	ClaimGeneration                  int64
	OwnerImplementationDigest        string
	OwnerStateID                     string
	OwnerStateRevision               int64
	OwnerStateBundle                 json.RawMessage
	OwnerStateRootDigest             string
	StageDigest                      string
	DispatchAckDigest                string
	SealedOwnerOperation             json.RawMessage
}

// EvaluationVerificationEvidenceAuthority is a narrow adapter over the real
// Verification owner. Read returns a current verified view without journal
// replay. Execute is request-digest keyed and idempotent so a claimed replay
// can recover an uncertain dispatch without repeating its effect. Reconcile is
// used after Backend records dispatched and may only query owner durable state.
// A process without this adapter keeps every owner-backed route fail-closed.
type EvaluationVerificationEvidenceAuthority interface {
	ReadVerificationEvidence(
		context.Context,
		EvaluationVerificationEvidenceAuthorityRequest,
	) (json.RawMessage, error)
	ExecuteVerificationEvidence(
		context.Context,
		EvaluationVerificationEvidenceAuthorityRequest,
	) (json.RawMessage, error)
	ReconcileVerificationEvidence(
		context.Context,
		EvaluationVerificationEvidenceAuthorityRequest,
	) (json.RawMessage, bool, error)
}

type EvaluationVerificationEvidenceStateAuthority interface {
	StageVerificationEvidenceState(
		context.Context,
		EvaluationVerificationEvidenceAuthorityRequest,
	) (string, error)
	ExecuteVerificationEvidenceState(
		context.Context,
		EvaluationVerificationEvidenceAuthorityRequest,
	) (EvaluationOwnerStateTransition, error)
	ReconcileVerificationEvidenceState(
		context.Context,
		EvaluationVerificationEvidenceAuthorityRequest,
	) (EvaluationOwnerStateTransition, bool, error)
}

type EvaluationVerificationEvidencePublicResponseScanner interface {
	ScanVerificationEvidencePublicResponse(
		context.Context,
		string,
		string,
		[]byte,
	) error
}

type evaluationVerificationEvidenceRepository interface {
	evaluationControlledAuthorityRequestRepository
	evaluationVerificationAttemptGrantReceiptReader
	StoreEvaluationVerificationSandboxRegistration(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationVerificationSandboxRegistrationRecord,
	) (EvaluationVerificationSandboxRegistrationRecord, bool, error)
	GetEvaluationVerificationSandboxRegistration(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
	) (EvaluationVerificationSandboxRegistrationRecord, error)
}

type evaluationVerificationEvidenceRoute struct {
	Operation    string
	RequestKind  string
	ResponseKind string
	Method       string
	RouteBinding string
	AttemptID    string
	PromotionID  string
	ArtifactID   string
}

func evaluationVerificationEvidenceRouteFor(tail []string) (evaluationVerificationEvidenceRoute, error) {
	if len(tail) < 2 || tail[0] != "verification-evidence" {
		return evaluationVerificationEvidenceRoute{}, ErrInvalid
	}
	parts := tail[1:]
	switch {
	case len(parts) == 2 && parts[0] == "sandboxes" && validEvaluationServiceIdentity(parts[1]):
		return evaluationVerificationEvidenceRoute{
			Operation: "sandbox.register", RequestKind: "sandbox-registration-request",
			ResponseKind: "sandbox-registration", Method: http.MethodPut,
			RouteBinding: "sandboxes/{attemptId}", AttemptID: parts[1],
		}, nil
	case len(parts) == 1 && parts[0] == "promotions":
		return evaluationVerificationEvidenceRoute{
			Operation: "promotion.create", RequestKind: "promotion-create-request",
			ResponseKind: "promotion-created", Method: http.MethodPost,
			RouteBinding: "promotions",
		}, nil
	case len(parts) == 4 && parts[0] == "promotions" &&
		validEvaluationServiceIdentity(parts[1]) && parts[2] == "artifacts" &&
		validEvaluationServiceIdentity(parts[3]):
		return evaluationVerificationEvidenceRoute{
			Operation: "artifact.upload", RequestKind: "artifact-upload-request",
			ResponseKind: "artifact-uploaded", Method: http.MethodPut,
			RouteBinding: "promotions/{promotionId}/artifacts/{artifactId}",
			PromotionID:  parts[1], ArtifactID: parts[3],
		}, nil
	case len(parts) == 3 && parts[0] == "promotions" &&
		validEvaluationServiceIdentity(parts[1]) && parts[2] == "prepare":
		return evaluationVerificationEvidenceRoute{
			Operation: "promotion.prepare", RequestKind: "promotion-prepare-request",
			ResponseKind: "promotion-prepared", Method: http.MethodPost,
			RouteBinding: "promotions/{promotionId}/prepare", PromotionID: parts[1],
		}, nil
	case len(parts) == 3 && parts[0] == "promotions" &&
		validEvaluationServiceIdentity(parts[1]) && parts[2] == "final-commit":
		return evaluationVerificationEvidenceRoute{
			Operation: "promotion.final-commit", RequestKind: "promotion-final-commit-request",
			ResponseKind: "promotion-finalized", Method: http.MethodPost,
			RouteBinding: "promotions/{promotionId}/final-commit", PromotionID: parts[1],
		}, nil
	case len(parts) == 2 && parts[0] == "verified-view" && parts[1] == "resolve":
		return evaluationVerificationEvidenceRoute{
			Operation: "verified-view.resolve", RequestKind: "verified-view-resolve-request",
			ResponseKind: "verified-view-resolved", Method: http.MethodPost,
			RouteBinding: "verified-view/resolve",
		}, nil
	default:
		return evaluationVerificationEvidenceRoute{}, ErrInvalid
	}
}

type evaluationVerificationEvidenceRequestAuthority struct {
	Descriptor                      evaluationAttemptDescriptor
	Generation                      int64
	ControlledWorkspaceGrantDigest  string
	ProjectID                       string
	WorkspaceID                     string
	WorkspaceRevision               int64
	VerificationPlanDigest          string
	SandboxPolicyDigest             string
	AdapterRegistryDigest           string
	BaseSnapshotDigest              string
	FinalSnapshotDigest             string
	VerificationAttemptGrantDigests []string
	GrantReceiptSetDigest           string
	AuthorityDigest                 string
}

type evaluationVerificationOwnerStateBinding struct {
	State                  string
	PromotionID            string
	EvidenceID             string
	UploadCapabilityDigest string
}

func evaluationVerificationOwnerStateBindingFromBundle(source []byte) (evaluationVerificationOwnerStateBinding, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationVerificationOwnerStateBytes)
	if err != nil {
		return evaluationVerificationOwnerStateBinding{}, err
	}
	snapshot, ok := objectMember(value, "snapshot")
	if !ok || !oneOfString(stringMember(snapshot, "state"), "registered", "active", "prepared", "finalized", "destroyed") ||
		!evaluationDigestPattern.MatchString(stringMember(snapshot, "uploadCapabilityDigest")) {
		return evaluationVerificationOwnerStateBinding{}, ErrInvalid
	}
	binding := evaluationVerificationOwnerStateBinding{
		State: stringMember(snapshot, "state"), UploadCapabilityDigest: stringMember(snapshot, "uploadCapabilityDigest"),
	}
	if snapshot["promotionId"] != nil {
		binding.PromotionID = stringMember(snapshot, "promotionId")
		if !validEvaluationAgentControlIdentity(binding.PromotionID) {
			return evaluationVerificationOwnerStateBinding{}, ErrInvalid
		}
	}
	if snapshot["evidenceId"] != nil {
		binding.EvidenceID = stringMember(snapshot, "evidenceId")
		if !validEvaluationAgentControlIdentity(binding.EvidenceID) {
			return evaluationVerificationOwnerStateBinding{}, ErrInvalid
		}
	}
	return binding, nil
}

func validateEvaluationVerificationOwnerStateRequestBinding(
	route evaluationVerificationEvidenceRoute,
	requestValue map[string]any,
	binding evaluationVerificationOwnerStateBinding,
) error {
	if route.Operation == "promotion.create" {
		return nil
	}
	if binding.PromotionID == "" || binding.EvidenceID == "" || binding.PromotionID != route.PromotionID {
		return ErrConflict
	}
	capabilityDigest, err := canonicaljson.Digest(stringMember(requestValue, "uploadCapability"))
	if err != nil || capabilityDigest != binding.UploadCapabilityDigest {
		return ErrConflict
	}
	switch route.Operation {
	case "artifact.upload":
		if binding.State != "active" {
			return ErrConflict
		}
	case "promotion.prepare":
		if !oneOfString(binding.State, "active", "prepared") {
			return ErrConflict
		}
	case "promotion.final-commit":
		if !oneOfString(binding.State, "prepared", "finalized") {
			return ErrConflict
		}
	default:
		return ErrInvalid
	}
	return nil
}

func validateEvaluationVerificationOwnerStateTransitionBinding(
	route evaluationVerificationEvidenceRoute,
	requestValue map[string]any,
	binding evaluationVerificationOwnerStateBinding,
) error {
	expectedState := map[string]string{
		"promotion.create": "active", "artifact.upload": "active",
		"promotion.prepare": "prepared", "promotion.final-commit": "finalized",
	}[route.Operation]
	if expectedState == "" || binding.State != expectedState || binding.PromotionID == "" || binding.EvidenceID == "" {
		return ErrConflict
	}
	if route.Operation != "promotion.create" && binding.PromotionID != route.PromotionID {
		return ErrConflict
	}
	if route.Operation != "promotion.create" {
		capabilityDigest, err := canonicaljson.Digest(stringMember(requestValue, "uploadCapability"))
		if err != nil || capabilityDigest != binding.UploadCapabilityDigest {
			return ErrConflict
		}
	}
	return nil
}

func evaluationStringArray(value any, maximum int, allowEmpty bool) ([]string, error) {
	values, ok := value.([]any)
	if !ok || len(values) > maximum || !allowEmpty && len(values) == 0 {
		return nil, ErrInvalid
	}
	result := make([]string, len(values))
	for index, entry := range values {
		text, ok := entry.(string)
		if !ok {
			return nil, ErrInvalid
		}
		result[index] = text
	}
	return result, nil
}

func canonicalEvaluationValueBytes(value any, maximum int) ([]byte, error) {
	source, err := canonicaljson.Bytes(value)
	if err != nil || len(source) == 0 || len(source) > maximum ||
		canonicaljson.ValidateRawEnvelope(source, maximum) != nil {
		return nil, ErrInvalid
	}
	return source, nil
}

func verificationEvidenceAuthority(
	ctx context.Context,
	repository evaluationVerificationEvidenceRepository,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	value map[string]any,
) (evaluationVerificationEvidenceRequestAuthority, error) {
	if !exactEvaluationKeys(value, []string{
		"namespaceId", "evaluationPlanDigest", "repositoryCommit", "descriptor",
		"generation", "controlledWorkspaceGrantDigest", "projectId", "workspaceId",
		"workspaceRevision", "verificationPlanDigest", "sandboxPolicyDigest",
		"adapterRegistryDigest", "baseSnapshotDigest", "finalSnapshotDigest",
		"verificationAttemptGrantReceiptDigests", "verificationAttemptGrantReceiptSetDigest",
		"verificationAttemptGrantReceipts", "authorityDigest",
	}) || stringMember(value, "namespaceId") != authority.NamespaceID ||
		stringMember(value, "evaluationPlanDigest") != partition.PlanDigest ||
		stringMember(value, "repositoryCommit") != partition.RepositoryCommit {
		return evaluationVerificationEvidenceRequestAuthority{}, ErrConflict
	}
	descriptorValue, descriptorOK := objectMember(value, "descriptor")
	descriptorBytes, err := canonicalEvaluationValueBytes(descriptorValue, 1_048_576)
	if !descriptorOK || err != nil {
		return evaluationVerificationEvidenceRequestAuthority{}, ErrInvalid
	}
	descriptor, err := decodeEvaluationAttemptDescriptor(descriptorBytes)
	if err != nil || descriptor.PlanDigest != partition.PlanDigest {
		return evaluationVerificationEvidenceRequestAuthority{}, ErrConflict
	}
	generation, generationOK := integerMember(value, "generation")
	workspaceRevision, revisionOK := integerMember(value, "workspaceRevision")
	projectID, workspaceID := stringMember(value, "projectId"), stringMember(value, "workspaceId")
	controlledGrantDigest := stringMember(value, "controlledWorkspaceGrantDigest")
	verificationPlanDigest := stringMember(value, "verificationPlanDigest")
	for _, identity := range []string{projectID, workspaceID} {
		if !validEvaluationServiceIdentity(identity) {
			return evaluationVerificationEvidenceRequestAuthority{}, ErrInvalid
		}
	}
	for _, digest := range []string{
		controlledGrantDigest, verificationPlanDigest,
		stringMember(value, "sandboxPolicyDigest"), stringMember(value, "adapterRegistryDigest"),
		stringMember(value, "baseSnapshotDigest"), stringMember(value, "finalSnapshotDigest"),
		stringMember(value, "verificationAttemptGrantReceiptSetDigest"),
		stringMember(value, "authorityDigest"),
	} {
		if !evaluationDigestPattern.MatchString(digest) {
			return evaluationVerificationEvidenceRequestAuthority{}, ErrInvalid
		}
	}
	if !generationOK || generation < 1 || !revisionOK || workspaceRevision < 1 {
		return evaluationVerificationEvidenceRequestAuthority{}, ErrInvalid
	}
	receiptDigests, err := evaluationStringArray(
		value["verificationAttemptGrantReceiptDigests"],
		maximumEvaluationVerificationEvidenceReceipts,
		false,
	)
	if err != nil {
		return evaluationVerificationEvidenceRequestAuthority{}, err
	}
	receiptValues, ok := value["verificationAttemptGrantReceipts"].([]any)
	if !ok || len(receiptValues) != len(receiptDigests) || len(receiptValues) == 0 ||
		len(receiptValues) > maximumEvaluationVerificationEvidenceReceipts {
		return evaluationVerificationEvidenceRequestAuthority{}, ErrInvalid
	}
	seenDigests := make(map[string]struct{}, len(receiptValues))
	previousIdentity := ""
	for index, receiptValue := range receiptValues {
		receiptBytes, err := canonicalEvaluationValueBytes(
			receiptValue,
			maximumEvaluationVerificationGrantReceiptBytes,
		)
		if err != nil {
			return evaluationVerificationEvidenceRequestAuthority{}, err
		}
		receipt, canonical, err := decodeEvaluationVerificationAttemptGrantReceipt(receiptBytes)
		if err != nil || !bytes.Equal(canonical, receiptBytes) || receipt.ReceiptDigest != receiptDigests[index] ||
			receipt.NamespaceID != authority.NamespaceID ||
			receipt.EvaluationPlanDigest != partition.PlanDigest ||
			receipt.RepositoryCommit != partition.RepositoryCommit ||
			receipt.EvaluationAttemptID != descriptor.AttemptID ||
			receipt.DescriptorDigest != descriptor.DescriptorDigest ||
			receipt.CapabilityDescriptorDigest != descriptor.CapabilityDescriptorDigest ||
			receipt.CaseID != descriptor.CaseID || receipt.Generation != generation ||
			receipt.VerificationPlanDigest != verificationPlanDigest ||
			receipt.Grant.ProjectID != projectID || receipt.Grant.WorkspaceID != workspaceID ||
			receipt.Grant.WorkspaceRevision != workspaceRevision {
			return evaluationVerificationEvidenceRequestAuthority{}, ErrConflict
		}
		identity := receipt.EvaluationAttemptID + "\x00" + receipt.CellID + "\x00" + receipt.Grant.GrantID
		if index > 0 && previousIdentity >= identity {
			return evaluationVerificationEvidenceRequestAuthority{}, ErrInvalid
		}
		previousIdentity = identity
		if _, duplicate := seenDigests[receipt.ReceiptDigest]; duplicate {
			return evaluationVerificationEvidenceRequestAuthority{}, ErrInvalid
		}
		seenDigests[receipt.ReceiptDigest] = struct{}{}
		durable, err := repository.GetEvaluationVerificationAttemptGrantReceipt(
			ctx, authority, partition, receipt.ReceiptDigest,
		)
		if err != nil || durable.AttemptID != descriptor.AttemptID ||
			durable.DescriptorDigest != descriptor.DescriptorDigest ||
			durable.Generation != generation || durable.WorkspaceID != workspaceID ||
			durable.WorkspaceRevision != workspaceRevision ||
			durable.VerificationPlanDigest != verificationPlanDigest ||
			durable.CellID != receipt.CellID || !bytes.Equal(durable.ReceiptBytes, receiptBytes) {
			if err != nil {
				return evaluationVerificationEvidenceRequestAuthority{}, err
			}
			return evaluationVerificationEvidenceRequestAuthority{}, ErrConflict
		}
		if !time.Now().UTC().Before(durable.ExpiresAt) {
			return evaluationVerificationEvidenceRequestAuthority{}, ErrUnauthorized
		}
	}
	setDigests := append([]string(nil), receiptDigests...)
	sort.Strings(setDigests)
	setDigest, err := canonicaljson.Digest(map[string]any{
		"verificationAttemptGrantReceiptDigests": setDigests,
	})
	if err != nil || setDigest != stringMember(value, "verificationAttemptGrantReceiptSetDigest") {
		return evaluationVerificationEvidenceRequestAuthority{}, ErrConflict
	}
	authorityBase := map[string]any{
		"namespaceId": authority.NamespaceID, "evaluationPlanDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "descriptor": descriptorValue,
		"generation": generation, "controlledWorkspaceGrantDigest": controlledGrantDigest,
		"projectId": projectID, "workspaceId": workspaceID, "workspaceRevision": workspaceRevision,
		"verificationPlanDigest":                   verificationPlanDigest,
		"sandboxPolicyDigest":                      stringMember(value, "sandboxPolicyDigest"),
		"adapterRegistryDigest":                    stringMember(value, "adapterRegistryDigest"),
		"baseSnapshotDigest":                       stringMember(value, "baseSnapshotDigest"),
		"finalSnapshotDigest":                      stringMember(value, "finalSnapshotDigest"),
		"verificationAttemptGrantReceiptDigests":   receiptDigests,
		"verificationAttemptGrantReceiptSetDigest": setDigest,
	}
	authorityDigest, err := canonicaljson.Digest(authorityBase)
	if err != nil || authorityDigest != stringMember(value, "authorityDigest") {
		return evaluationVerificationEvidenceRequestAuthority{}, ErrConflict
	}
	return evaluationVerificationEvidenceRequestAuthority{
		Descriptor: descriptor, Generation: generation,
		ControlledWorkspaceGrantDigest: controlledGrantDigest,
		ProjectID:                      projectID, WorkspaceID: workspaceID, WorkspaceRevision: workspaceRevision,
		VerificationPlanDigest:          verificationPlanDigest,
		SandboxPolicyDigest:             stringMember(value, "sandboxPolicyDigest"),
		AdapterRegistryDigest:           stringMember(value, "adapterRegistryDigest"),
		BaseSnapshotDigest:              stringMember(value, "baseSnapshotDigest"),
		FinalSnapshotDigest:             stringMember(value, "finalSnapshotDigest"),
		VerificationAttemptGrantDigests: receiptDigests,
		GrantReceiptSetDigest:           setDigest, AuthorityDigest: authorityDigest,
	}, nil
}

func validVerificationEvidenceIdempotencyKey(value string, generated bool) bool {
	maximum := 256
	if generated {
		maximum = 1_024
	}
	if len(value) < 16 || len(value) > maximum || strings.TrimSpace(value) != value {
		return false
	}
	for index, character := range value {
		allowed := character >= 'A' && character <= 'Z' || character >= 'a' && character <= 'z' ||
			character >= '0' && character <= '9' || strings.ContainsRune("._:@-", character)
		if !allowed || index == 0 && !(character >= 'A' && character <= 'Z' ||
			character >= 'a' && character <= 'z' || character >= '0' && character <= '9') {
			return false
		}
	}
	return true
}

func verificationEvidenceRequestBase(
	value map[string]any,
	route evaluationVerificationEvidenceRoute,
) (map[string]any, string, error) {
	required := map[string][]string{
		"sandbox.register": {
			"format", "version", "kind", "authority", "idempotencyKey", "requestDigest",
		},
		"promotion.create": {
			"format", "version", "kind", "authority", "sandboxRegistrationReceiptDigest",
			"cellId", "candidate", "idempotencyKey", "requestDigest",
		},
		"artifact.upload": {
			"format", "version", "kind", "authority", "sandboxRegistrationReceiptDigest",
			"promotionId", "cellId", "uploadCapability", "artifact", "idempotencyKey", "requestDigest",
		},
		"promotion.prepare": {
			"format", "version", "kind", "authority", "sandboxRegistrationReceiptDigest",
			"promotionId", "cellId", "uploadCapability", "idempotencyKey", "requestDigest",
		},
		"promotion.final-commit": {
			"format", "version", "kind", "authority", "sandboxRegistrationReceiptDigest",
			"promotionId", "cellId", "uploadCapability", "attestation", "idempotencyKey", "requestDigest",
		},
		"verified-view.resolve": {
			"format", "version", "kind", "authority", "sandboxRegistrationReceiptDigest",
			"evidenceIds", "workspaceRevision", "verificationPlanDigest", "idempotencyKey", "requestDigest",
		},
	}
	version, versionOK := integerMember(value, "version")
	if !exactEvaluationKeys(value, required[route.Operation]) ||
		stringMember(value, "format") != evaluationVerificationEvidenceBridgeFormat ||
		!versionOK || version != evaluationVerificationEvidenceBridgeVersion ||
		stringMember(value, "kind") != route.RequestKind {
		return nil, "", ErrInvalid
	}
	base := cloneEvaluationObject(value)
	delete(base, "requestDigest")
	requestDigest, err := canonicaljson.Digest(base)
	if err != nil || !evaluationDigestPattern.MatchString(stringMember(value, "requestDigest")) ||
		requestDigest != stringMember(value, "requestDigest") {
		return nil, "", ErrInvalid
	}
	return base, requestDigest, nil
}

func verificationEvidenceCellAuthorized(
	repository evaluationVerificationEvidenceRepository,
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	requestAuthority evaluationVerificationEvidenceRequestAuthority,
	cellID string,
) error {
	if !validEvaluationServiceIdentity(cellID) {
		return ErrInvalid
	}
	for _, digest := range requestAuthority.VerificationAttemptGrantDigests {
		record, err := repository.GetEvaluationVerificationAttemptGrantReceipt(ctx, authority, partition, digest)
		if err != nil {
			return err
		}
		if record.CellID == cellID {
			return nil
		}
	}
	return ErrUnauthorized
}

func exactVerificationEvidenceCandidate(
	value map[string]any,
	requestAuthority evaluationVerificationEvidenceRequestAuthority,
	cellID string,
	idempotencyKey string,
) bool {
	if !exactEvaluationKeys(value, []string{
		"wireVersion", "candidateId", "projectId", "workspaceId", "workspaceRevision",
		"partitionRevisions", "executableSnapshotDigest", "policyRevision", "policyDigest",
		"impactDigest", "planDigest", "policyEvaluationInstant", "cellId", "checkId",
		"checkKind", "targetId", "attemptId", "run", "timing", "result", "provenance",
		"toolchain", "normalization", "controls", "inputs", "artifacts", "sourceTraces",
		"sourceTraceDigest", "dependencyLockDigest", "redaction", "requestedRetention",
		"promotion", "candidateDigest",
	}, "scenario") {
		return false
	}
	wireVersion, wireOK := integerMember(value, "wireVersion")
	workspaceRevision, revisionOK := integerMember(value, "workspaceRevision")
	promotion, promotionOK := objectMember(value, "promotion")
	if !wireOK || wireVersion != 1 || !revisionOK ||
		stringMember(value, "projectId") != requestAuthority.ProjectID ||
		stringMember(value, "workspaceId") != requestAuthority.WorkspaceID ||
		workspaceRevision != requestAuthority.WorkspaceRevision ||
		stringMember(value, "planDigest") != requestAuthority.VerificationPlanDigest ||
		stringMember(value, "cellId") != cellID ||
		stringMember(value, "attemptId") != requestAuthority.Descriptor.AttemptID ||
		!promotionOK || stringMember(promotion, "idempotencyKey") != idempotencyKey {
		return false
	}
	for _, identity := range []string{
		stringMember(value, "candidateId"), stringMember(value, "checkId"), stringMember(value, "targetId"),
	} {
		if !validEvaluationServiceIdentity(identity) {
			return false
		}
	}
	candidateDigest := stringMember(value, "candidateDigest")
	if !evaluationDigestPattern.MatchString(candidateDigest) {
		return false
	}
	current := cloneEvaluationObject(value)
	delete(current, "wireVersion")
	delete(current, "candidateDigest")
	digest, err := canonicaljson.Digest(current)
	return err == nil && digest == candidateDigest
}

func validVerificationEvidenceMediaType(value string) bool {
	return value == strings.ToLower(value) && evaluationVerificationMediaTypePattern.MatchString(value)
}

func validateVerificationEvidenceRequestPayload(
	ctx context.Context,
	repository evaluationVerificationEvidenceRepository,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	route evaluationVerificationEvidenceRoute,
	value map[string]any,
	requestAuthority evaluationVerificationEvidenceRequestAuthority,
) error {
	idempotencyKey := stringMember(value, "idempotencyKey")
	generatedKey := oneOfString(route.Operation, "artifact.upload", "promotion.prepare", "promotion.final-commit")
	if !validVerificationEvidenceIdempotencyKey(idempotencyKey, generatedKey) {
		return ErrInvalid
	}
	switch route.Operation {
	case "sandbox.register":
		if route.AttemptID != requestAuthority.Descriptor.AttemptID {
			return ErrConflict
		}
	case "promotion.create":
		cellID := stringMember(value, "cellId")
		if err := verificationEvidenceCellAuthorized(repository, ctx, authority, partition, requestAuthority, cellID); err != nil {
			return err
		}
		candidate, ok := objectMember(value, "candidate")
		if !ok || !exactVerificationEvidenceCandidate(candidate, requestAuthority, cellID, idempotencyKey) {
			return ErrConflict
		}
	case "artifact.upload":
		if stringMember(value, "promotionId") != route.PromotionID {
			return ErrConflict
		}
		if err := verificationEvidenceCellAuthorized(
			repository, ctx, authority, partition, requestAuthority, stringMember(value, "cellId"),
		); err != nil {
			return err
		}
		capability := stringMember(value, "uploadCapability")
		artifact, ok := objectMember(value, "artifact")
		if !ok || len(capability) < 32 || len(capability) > 4_096 ||
			strings.IndexFunc(capability, unicode.IsControl) >= 0 ||
			!exactEvaluationKeys(artifact, []string{
				"id", "stagingArtifactId", "kind", "digest", "size", "mediaType", "bytesBase64",
			}) || stringMember(artifact, "id") != route.ArtifactID ||
			!validEvaluationServiceIdentity(stringMember(artifact, "stagingArtifactId")) ||
			!evaluationDigestPattern.MatchString(stringMember(artifact, "digest")) ||
			!validVerificationEvidenceMediaType(stringMember(artifact, "mediaType")) {
			return ErrInvalid
		}
		size, sizeOK := integerMember(artifact, "size")
		encoded := stringMember(artifact, "bytesBase64")
		decoded, err := base64.StdEncoding.DecodeString(encoded)
		defer clear(decoded)
		if !sizeOK || size < 0 || size > maximumEvaluationVerificationEvidenceArtifactBytes ||
			err != nil || int64(len(decoded)) != size ||
			base64.StdEncoding.EncodeToString(decoded) != encoded {
			return ErrInvalid
		}
		digest := sha256.Sum256(decoded)
		if stringMember(artifact, "digest") != fmt.Sprintf("sha256-%x", digest) {
			return ErrConflict
		}
	case "promotion.prepare", "promotion.final-commit":
		if stringMember(value, "promotionId") != route.PromotionID {
			return ErrConflict
		}
		if err := verificationEvidenceCellAuthorized(
			repository, ctx, authority, partition, requestAuthority, stringMember(value, "cellId"),
		); err != nil {
			return err
		}
		capability := stringMember(value, "uploadCapability")
		if len(capability) < 32 || len(capability) > 4_096 ||
			strings.IndexFunc(capability, unicode.IsControl) >= 0 ||
			route.Operation == "promotion.final-commit" && value["attestation"] == nil {
			return ErrInvalid
		}
	case "verified-view.resolve":
		evidenceIDs, err := evaluationStringArray(value["evidenceIds"], maximumEvaluationVerificationEvidenceReceipts, false)
		workspaceRevision, revisionOK := integerMember(value, "workspaceRevision")
		if err != nil || !revisionOK || workspaceRevision != requestAuthority.WorkspaceRevision ||
			stringMember(value, "verificationPlanDigest") != requestAuthority.VerificationPlanDigest {
			return ErrConflict
		}
		for index, evidenceID := range evidenceIDs {
			if !validEvaluationServiceIdentity(evidenceID) || index > 0 && evidenceIDs[index-1] >= evidenceID {
				return ErrInvalid
			}
		}
	default:
		return ErrInvalid
	}
	return nil
}

func verificationEvidenceSandboxRegistrationResponse(
	partition EvaluationPlanPartition,
	requestDigest string,
	idempotencyKey string,
	requestAuthority evaluationVerificationEvidenceRequestAuthority,
) (EvaluationVerificationSandboxRegistrationRecord, error) {
	idempotencyKeyDigest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-verification-idempotency-key", "version": int64(1),
		"idempotencyKey": idempotencyKey,
	})
	if err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, err
	}
	digestMaterial := strings.TrimPrefix(requestAuthority.AuthorityDigest, "sha256-")
	registrationID := "sandbox-registration-" + digestMaterial[:40]
	registrationBase := map[string]any{
		"format": "prodivix.agent-evaluation-verification-sandbox-registration", "version": int64(1),
		"planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"attemptId":        requestAuthority.Descriptor.AttemptID,
		"descriptorDigest": requestAuthority.Descriptor.DescriptorDigest,
		"generation":       requestAuthority.Generation, "workspaceId": requestAuthority.WorkspaceID,
		"workspaceRevision":      requestAuthority.WorkspaceRevision,
		"verificationPlanDigest": requestAuthority.VerificationPlanDigest,
		"authorityDigest":        requestAuthority.AuthorityDigest,
		"grantReceiptSetDigest":  requestAuthority.GrantReceiptSetDigest,
		"idempotencyKeyDigest":   idempotencyKeyDigest, "requestDigest": requestDigest,
		"registrationId": registrationID,
	}
	registrationDigest, err := canonicaljson.Digest(registrationBase)
	if err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, err
	}
	responseBase := map[string]any{
		"format":  evaluationVerificationEvidenceBridgeFormat,
		"version": evaluationVerificationEvidenceBridgeVersion,
		"kind":    "sandbox-registration", "requestDigest": requestDigest,
		"idempotencyKey": idempotencyKey, "registrationId": registrationID,
		"registrationDigest": registrationDigest,
	}
	receiptDigest, err := canonicaljson.Digest(responseBase)
	if err != nil {
		return EvaluationVerificationSandboxRegistrationRecord{}, err
	}
	response := cloneEvaluationObject(responseBase)
	response["receiptDigest"] = receiptDigest
	responseBytes, err := canonicaljson.Bytes(response)
	if err != nil || len(responseBytes) > maximumEvaluationSandboxRegistrationResponseBytes {
		return EvaluationVerificationSandboxRegistrationRecord{}, errEvaluationServiceResponseTooLarge
	}
	return EvaluationVerificationSandboxRegistrationRecord{
		AttemptID:        requestAuthority.Descriptor.AttemptID,
		DescriptorDigest: requestAuthority.Descriptor.DescriptorDigest,
		Generation:       requestAuthority.Generation, WorkspaceID: requestAuthority.WorkspaceID,
		WorkspaceRevision:      requestAuthority.WorkspaceRevision,
		VerificationPlanDigest: requestAuthority.VerificationPlanDigest,
		AuthorityDigest:        requestAuthority.AuthorityDigest,
		GrantReceiptSetDigest:  requestAuthority.GrantReceiptSetDigest,
		IdempotencyKeyDigest:   idempotencyKeyDigest, RequestDigest: requestDigest,
		RegistrationID: registrationID, RegistrationDigest: registrationDigest,
		ReceiptDigest: receiptDigest, ResponseBytes: responseBytes, RegisteredAt: time.Now().UTC(),
	}, nil
}

func verificationEvidenceReceiptDigestMatches(value map[string]any) bool {
	receiptDigest := stringMember(value, "receiptDigest")
	if !evaluationDigestPattern.MatchString(receiptDigest) {
		return false
	}
	base := cloneEvaluationObject(value)
	delete(base, "receiptDigest")
	digest, err := canonicaljson.Digest(base)
	return err == nil && digest == receiptDigest
}

func verificationEvidenceManifestMatches(
	manifest map[string]any,
	evidenceID string,
	cellID string,
	requestAuthority evaluationVerificationEvidenceRequestAuthority,
) bool {
	if !exactEvaluationKeys(manifest, []string{
		"wireVersion", "format", "candidateDigest", "statement", "statementDigest",
		"verifiedProvenance", "evidence", "manifestDigest",
	}) {
		return false
	}
	wireVersion, wireOK := integerMember(manifest, "wireVersion")
	evidence, evidenceOK := objectMember(manifest, "evidence")
	workspaceRevision, revisionOK := integerMember(evidence, "workspaceRevision")
	statementDigest, err := canonicaljson.Digest(manifest["statement"])
	if !wireOK || wireVersion != 1 || stringMember(manifest, "format") != "prodivix.verification-evidence-manifest" ||
		!evaluationDigestPattern.MatchString(stringMember(manifest, "candidateDigest")) ||
		err != nil || statementDigest != stringMember(manifest, "statementDigest") ||
		!evidenceOK || !revisionOK || stringMember(evidence, "id") != evidenceID ||
		stringMember(evidence, "projectId") != requestAuthority.ProjectID ||
		stringMember(evidence, "workspaceId") != requestAuthority.WorkspaceID ||
		workspaceRevision != requestAuthority.WorkspaceRevision ||
		stringMember(evidence, "planDigest") != requestAuthority.VerificationPlanDigest ||
		stringMember(evidence, "cellId") != cellID ||
		stringMember(evidence, "attemptId") != requestAuthority.Descriptor.AttemptID {
		return false
	}
	current := cloneEvaluationObject(manifest)
	delete(current, "wireVersion")
	delete(current, "manifestDigest")
	manifestDigest, err := canonicaljson.Digest(current)
	return err == nil && manifestDigest == stringMember(manifest, "manifestDigest")
}

func exactVerificationEvidenceView(
	value map[string]any,
	expectedEvidenceIDs []string,
) bool {
	if !exactEvaluationKeys(value, []string{
		"wireVersion", "format", "closureEvaluationInstant", "revocationRecordDigest", "records", "viewDigest",
	}) {
		return false
	}
	wireVersion, wireOK := integerMember(value, "wireVersion")
	records, recordsOK := value["records"].([]any)
	if !wireOK || wireVersion != 1 || stringMember(value, "format") != "prodivix.verification-evidence-view.v1" ||
		!evaluationDigestPattern.MatchString(stringMember(value, "revocationRecordDigest")) ||
		!recordsOK || len(records) != len(expectedEvidenceIDs) {
		return false
	}
	for index, entry := range records {
		record, ok := entry.(map[string]any)
		if !ok || !exactEvaluationKeys(record, []string{
			"evidenceId", "manifestDigest", "materializedEvidenceDigest", "effectiveTrust",
			"trustStatus", "retentionState", "revocationRecordDigests", "artifacts", "recordDigest",
		}, "attestationDigest", "retentionExpiresAt", "supersededByEvidenceId", "tombstoneDigest") ||
			stringMember(record, "evidenceId") != expectedEvidenceIDs[index] {
			return false
		}
		for _, digestField := range []string{"manifestDigest", "materializedEvidenceDigest", "recordDigest"} {
			if !evaluationDigestPattern.MatchString(stringMember(record, digestField)) {
				return false
			}
		}
		recordBase := cloneEvaluationObject(record)
		delete(recordBase, "recordDigest")
		recordDigest, err := canonicaljson.Digest(recordBase)
		if err != nil || recordDigest != stringMember(record, "recordDigest") {
			return false
		}
	}
	current := cloneEvaluationObject(value)
	delete(current, "wireVersion")
	delete(current, "viewDigest")
	viewDigest, err := canonicaljson.Digest(current)
	return err == nil && viewDigest == stringMember(value, "viewDigest")
}

func validateVerificationEvidenceAuthorityResponse(
	source []byte,
	route evaluationVerificationEvidenceRoute,
	requestDigest string,
	requestValue map[string]any,
	requestAuthority evaluationVerificationEvidenceRequestAuthority,
	expectedState evaluationVerificationOwnerStateBinding,
) ([]byte, bool, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationVerificationEvidenceResponseBytes)
	if err != nil {
		return nil, false, err
	}
	commonValid := stringMember(value, "format") == evaluationVerificationEvidenceBridgeFormat &&
		stringMember(value, "kind") == route.ResponseKind &&
		stringMember(value, "requestDigest") == requestDigest && verificationEvidenceReceiptDigestMatches(value)
	version, versionOK := integerMember(value, "version")
	if !commonValid || !versionOK || version != evaluationVerificationEvidenceBridgeVersion {
		return nil, false, ErrInvalid
	}
	persistable := true
	switch route.Operation {
	case "promotion.create":
		if !exactEvaluationKeys(value, []string{
			"format", "version", "kind", "requestDigest", "promotionId", "evidenceId",
			"uploadCapability", "receiptDigest",
		}) || !validEvaluationAgentControlIdentity(stringMember(value, "promotionId")) ||
			!validEvaluationAgentControlIdentity(stringMember(value, "evidenceId")) ||
			expectedState.PromotionID != "" && stringMember(value, "promotionId") != expectedState.PromotionID ||
			expectedState.EvidenceID != "" && stringMember(value, "evidenceId") != expectedState.EvidenceID {
			return nil, false, ErrInvalid
		}
		capability := stringMember(value, "uploadCapability")
		capabilityDigest, digestErr := canonicaljson.Digest(capability)
		if len(capability) < 32 || len(capability) > 4_096 || strings.IndexFunc(capability, unicode.IsControl) >= 0 ||
			digestErr != nil || expectedState.UploadCapabilityDigest != "" && capabilityDigest != expectedState.UploadCapabilityDigest {
			return nil, false, ErrInvalid
		}
		persistable = false
	case "artifact.upload":
		artifact, ok := objectMember(requestValue, "artifact")
		if !ok || !exactEvaluationKeys(value, []string{
			"format", "version", "kind", "requestDigest", "promotionId", "artifactId",
			"artifactDigest", "artifactSize", "mediaType", "receiptDigest",
		}) || stringMember(value, "promotionId") != route.PromotionID ||
			stringMember(value, "artifactId") != route.ArtifactID ||
			stringMember(value, "artifactDigest") != stringMember(artifact, "digest") ||
			stringMember(value, "mediaType") != stringMember(artifact, "mediaType") {
			return nil, false, ErrConflict
		}
		responseSize, responseSizeOK := integerMember(value, "artifactSize")
		requestSize, requestSizeOK := integerMember(artifact, "size")
		if !responseSizeOK || !requestSizeOK || responseSize != requestSize {
			return nil, false, ErrConflict
		}
	case "promotion.prepare":
		if !exactEvaluationKeys(value, []string{
			"format", "version", "kind", "requestDigest", "promotionId", "evidenceId",
			"attestationNonce", "attestationStatement", "attestationStatementDigest", "receiptDigest",
		}) || stringMember(value, "promotionId") != route.PromotionID ||
			!validEvaluationAgentControlIdentity(stringMember(value, "evidenceId")) ||
			expectedState.EvidenceID != "" && stringMember(value, "evidenceId") != expectedState.EvidenceID {
			return nil, false, ErrConflict
		}
		nonce := stringMember(value, "attestationNonce")
		statementDigest, digestErr := evaluationVerificationEvidenceStatementEnvelopeDigest(value["attestationStatement"])
		if len(nonce) < 16 || len(nonce) > 4_096 || strings.IndexFunc(nonce, unicode.IsControl) >= 0 ||
			digestErr != nil || statementDigest != stringMember(value, "attestationStatementDigest") {
			return nil, false, ErrInvalid
		}
		persistable = false
	case "promotion.final-commit":
		manifest, ok := objectMember(value, "manifest")
		responseEvidenceID := stringMember(value, "evidenceId")
		if !ok || !exactEvaluationKeys(value, []string{
			"format", "version", "kind", "requestDigest", "promotionId", "evidenceId", "manifest", "receiptDigest",
		}) || stringMember(value, "promotionId") != route.PromotionID ||
			!validEvaluationAgentControlIdentity(responseEvidenceID) ||
			expectedState.EvidenceID != "" && responseEvidenceID != expectedState.EvidenceID ||
			!verificationEvidenceManifestMatches(
				manifest, responseEvidenceID, stringMember(requestValue, "cellId"), requestAuthority,
			) {
			return nil, false, ErrConflict
		}
	case "verified-view.resolve":
		verifiedView, ok := objectMember(value, "verifiedEvidenceView")
		evidenceIDs, idsErr := evaluationStringArray(
			requestValue["evidenceIds"], maximumEvaluationVerificationEvidenceReceipts, false,
		)
		revokedIDs, revokedErr := evaluationStringArray(
			value["revokedEvidenceIds"], maximumEvaluationVerificationEvidenceReceipts, true,
		)
		if !ok || idsErr != nil || revokedErr != nil || !exactEvaluationKeys(value, []string{
			"format", "version", "kind", "requestDigest", "verifiedEvidenceView", "revokedEvidenceIds", "receiptDigest",
		}) || !exactVerificationEvidenceView(verifiedView, evidenceIDs) {
			return nil, false, ErrConflict
		}
		seen := make(map[string]struct{}, len(revokedIDs))
		for _, id := range revokedIDs {
			if !validEvaluationServiceIdentity(id) {
				return nil, false, ErrInvalid
			}
			if _, duplicate := seen[id]; duplicate {
				return nil, false, ErrInvalid
			}
			seen[id] = struct{}{}
		}
	default:
		return nil, false, ErrInvalid
	}
	return append([]byte(nil), source...), persistable, nil
}

func evaluationVerificationEvidencePublicResult(
	canonicalResponse []byte,
	route evaluationVerificationEvidenceRoute,
	requestDigest string,
) ([]byte, error) {
	value, err := decodeCanonicalEvaluationObject(canonicalResponse, maximumEvaluationVerificationEvidenceResponseBytes)
	if err != nil || stringMember(value, "requestDigest") != requestDigest ||
		!evaluationDigestPattern.MatchString(stringMember(value, "receiptDigest")) {
		return nil, ErrInvalid
	}
	var projection any
	if route.Operation == "promotion.create" {
		uploadCapabilityDigest, uploadErr := canonicaljson.Digest(stringMember(value, "uploadCapability"))
		if uploadErr != nil {
			return nil, ErrInvalid
		}
		projection = map[string]any{
			"kind": value["kind"], "promotionId": value["promotionId"], "evidenceId": value["evidenceId"],
			"uploadCapabilityDigest": uploadCapabilityDigest,
		}
	} else if route.Operation == "promotion.prepare" {
		attestationNonceDigest, nonceErr := canonicaljson.Digest(stringMember(value, "attestationNonce"))
		if nonceErr != nil {
			return nil, ErrInvalid
		}
		projection = map[string]any{
			"kind": value["kind"], "promotionId": value["promotionId"], "evidenceId": value["evidenceId"],
			"attestationNonceDigest":     attestationNonceDigest,
			"attestationStatement":       value["attestationStatement"],
			"attestationStatementDigest": value["attestationStatementDigest"],
		}
	} else {
		projection = value
	}
	projectionDigest, err := canonicaljson.Digest(projection)
	if err != nil {
		return nil, err
	}
	return canonicaljson.Bytes(map[string]any{
		"format":  "prodivix.agent-evaluation-verification-evidence-public-result",
		"version": evaluationOwnerStateVersion, "operation": route.Operation,
		"requestDigest": requestDigest, "responseReceiptDigest": value["receiptDigest"],
		"responseProjection": projection, "responseProjectionDigest": projectionDigest,
	})
}

func verificationEvidenceRequestBinding(
	partition EvaluationPlanPartition,
	route evaluationVerificationEvidenceRoute,
	requestDigest string,
	requestAuthority evaluationVerificationEvidenceRequestAuthority,
	sandboxReceiptDigest string,
) (EvaluationControlledAuthorityRequestBinding, error) {
	base := map[string]any{
		"format": "prodivix.agent-evaluation-server-only-request-binding", "version": int64(1),
		"serviceKind": "verification-evidence", "operation": route.Operation,
		"routeBinding": route.RouteBinding, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "requestDigest": requestDigest,
		"attemptId":        requestAuthority.Descriptor.AttemptID,
		"descriptorDigest": requestAuthority.Descriptor.DescriptorDigest,
		"grantDigest":      requestAuthority.ControlledWorkspaceGrantDigest,
		"generation":       requestAuthority.Generation, "authorityDigest": requestAuthority.AuthorityDigest,
		"sandboxRegistrationReceiptDigest": sandboxReceiptDigest,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return EvaluationControlledAuthorityRequestBinding{}, err
	}
	return EvaluationControlledAuthorityRequestBinding{
		ServiceKind: "verification-evidence", Operation: route.Operation,
		RouteBinding: route.RouteBinding, RequestDigest: requestDigest,
		RequestBindingDigest: digest, AttemptID: requestAuthority.Descriptor.AttemptID,
		DescriptorDigest: requestAuthority.Descriptor.DescriptorDigest,
		GrantDigest:      requestAuthority.ControlledWorkspaceGrantDigest,
		Generation:       requestAuthority.Generation,
	}, nil
}

func (handler *EvaluationServiceHandler) handleVerificationEvidence(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	route, err := evaluationVerificationEvidenceRouteFor(tail)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if request.Method != route.Method {
		methodNotAllowed(writer, route.Method)
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	// Presence of this adapter means the complete Verification owner is
	// configured. The default ledger process returns a stable sanitized 503
	// before accepting registration or creating a journal claim.
	if handler.verificationEvidenceAuthority == nil || handler.verificationEvidenceResponseScanner == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	repository, ok := handler.repository.(evaluationVerificationEvidenceRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationVerificationEvidenceRequestBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	requestValue, err := decodeCanonicalEvaluationObject(source, int(maximumEvaluationVerificationEvidenceRequestBytes))
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	_, requestDigest, err := verificationEvidenceRequestBase(requestValue, route)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	authorityValue, ok := objectMember(requestValue, "authority")
	if !ok {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	requestAuthority, err := verificationEvidenceAuthority(
		request.Context(), repository, handler.authority, partition, authorityValue,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := validateVerificationEvidenceRequestPayload(
		request.Context(), repository, handler.authority, partition, route, requestValue, requestAuthority,
	); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	sandboxReceiptDigest := ""
	if route.Operation != "sandbox.register" {
		sandboxReceiptDigest = stringMember(requestValue, "sandboxRegistrationReceiptDigest")
		if !evaluationDigestPattern.MatchString(sandboxReceiptDigest) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
	}
	binding, err := verificationEvidenceRequestBinding(
		partition, route, requestDigest, requestAuthority, sandboxReceiptDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	digestSource, productionStateAuthority := handler.verificationEvidenceAuthority.(EvaluationOwnerStateImplementationDigestSource)
	ownerStateRequired := evaluationOwnerStatefulOperation("verification-evidence", route.Operation, route.RouteBinding)
	ownerStateful := ownerStateRequired && productionStateAuthority
	if ownerStateRequired && !productionStateAuthority {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	var ownerStateRepository evaluationOwnerStateRepository
	var ownerStateAuthority EvaluationVerificationEvidenceStateAuthority
	var ownerStatePrior EvaluationOwnerStatePrior
	var ownerStateBinding evaluationVerificationOwnerStateBinding
	if ownerStateful {
		var repositoryOK, authorityOK bool
		ownerStateRepository, repositoryOK = handler.repository.(evaluationOwnerStateRepository)
		ownerStateAuthority, authorityOK = handler.verificationEvidenceAuthority.(EvaluationVerificationEvidenceStateAuthority)
		implementationDigest, digestOK := digestSource.VerificationEvidenceImplementationDigest()
		if !repositoryOK || !authorityOK || !digestOK {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		binding.OwnerImplementationDigest = implementationDigest
	}
	workspaceAuthorizer, ok := handler.repository.(evaluationControlledWorkspaceRequestAuthorizer)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if err := workspaceAuthorizer.AuthorizeEvaluationControlledWorkspaceRequest(
		request.Context(), handler.authority, partition, binding,
	); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if route.Operation == "sandbox.register" {
		record, err := verificationEvidenceSandboxRegistrationResponse(
			partition, requestDigest, stringMember(requestValue, "idempotencyKey"), requestAuthority,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if err := handler.verificationEvidenceResponseScanner.ScanVerificationEvidencePublicResponse(
			request.Context(), route.Operation, requestDigest, record.ResponseBytes,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
		durable, _, err := repository.StoreEvaluationVerificationSandboxRegistration(
			request.Context(), handler.authority, partition, record,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, durable.ResponseBytes)
		return
	}
	registration, err := repository.GetEvaluationVerificationSandboxRegistration(
		request.Context(), handler.authority, partition, requestAuthority.Descriptor.AttemptID,
	)
	if err != nil || registration.ReceiptDigest != sandboxReceiptDigest ||
		registration.AuthorityDigest != requestAuthority.AuthorityDigest ||
		registration.DescriptorDigest != requestAuthority.Descriptor.DescriptorDigest ||
		registration.Generation != requestAuthority.Generation ||
		registration.GrantReceiptSetDigest != requestAuthority.GrantReceiptSetDigest ||
		registration.WorkspaceID != requestAuthority.WorkspaceID ||
		registration.WorkspaceRevision != requestAuthority.WorkspaceRevision ||
		registration.VerificationPlanDigest != requestAuthority.VerificationPlanDigest {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	if ownerStateful {
		ownerStateID, identityErr := evaluationOwnerStateIdentity(
			"verification-evidence", handler.authority.NamespaceID, partition,
			requestAuthority.Descriptor.AttemptID, requestAuthority.Descriptor.DescriptorDigest,
			requestAuthority.AuthorityDigest, requestAuthority.Generation,
		)
		if identityErr != nil {
			respondEvaluationServiceError(writer, identityErr)
			return
		}
		ownerStatePrior = EvaluationOwnerStatePrior{
			OwnerStateID: ownerStateID, OwnerImplementationDigest: binding.OwnerImplementationDigest,
		}
		current, stateErr := ownerStateRepository.GetEvaluationOwnerState(
			request.Context(), handler.authority, partition, "verification-evidence", ownerStateID,
		)
		if stateErr == nil {
			ownerStatePrior.Revision = current.Revision
			ownerStatePrior.RootDigest = current.RootDigest
			ownerStatePrior.Bundle = append(json.RawMessage(nil), current.BundleBytes...)
			ownerStateBinding, stateErr = evaluationVerificationOwnerStateBindingFromBundle(current.BundleBytes)
			if stateErr == nil {
				stateErr = validateEvaluationVerificationOwnerStateRequestBinding(route, requestValue, ownerStateBinding)
			}
		} else if !errors.Is(stateErr, ErrNotFound) || route.Operation != "promotion.create" {
			if errors.Is(stateErr, ErrNotFound) {
				stateErr = ErrConflict
			}
			respondEvaluationServiceError(writer, stateErr)
			return
		} else {
			stateErr = nil
		}
		if stateErr != nil {
			respondEvaluationServiceError(writer, stateErr)
			return
		}
	}
	if route.Operation == "verified-view.resolve" {
		authorityRequest := EvaluationVerificationEvidenceAuthorityRequest{
			NamespaceID: handler.authority.NamespaceID, PlanDigest: partition.PlanDigest,
			RepositoryCommit: partition.RepositoryCommit, Operation: route.Operation,
			RouteBinding: route.RouteBinding, RequestDigest: requestDigest,
			AttemptID:                        requestAuthority.Descriptor.AttemptID,
			DescriptorDigest:                 requestAuthority.Descriptor.DescriptorDigest,
			Generation:                       requestAuthority.Generation,
			ControlledWorkspaceGrantDigest:   requestAuthority.ControlledWorkspaceGrantDigest,
			AuthorityDigest:                  requestAuthority.AuthorityDigest,
			SandboxRegistrationReceiptDigest: sandboxReceiptDigest,
			Request:                          append(json.RawMessage(nil), source...),
		}
		response, err := handler.verificationEvidenceAuthority.ReadVerificationEvidence(
			request.Context(), authorityRequest,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		canonicalResponse, _, err := validateVerificationEvidenceAuthorityResponse(
			response, route, requestDigest, requestValue, requestAuthority, evaluationVerificationOwnerStateBinding{},
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if err := handler.verificationEvidenceResponseScanner.ScanVerificationEvidencePublicResponse(
			request.Context(), route.Operation, requestDigest, canonicalResponse,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, canonicalResponse)
		return
	}
	record, _, err := repository.ClaimEvaluationControlledAuthorityRequest(
		request.Context(), handler.authority, partition, binding, time.Now().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if record.State == "sealed" && len(record.ResponseBytes) != 0 {
		if err := handler.verificationEvidenceResponseScanner.ScanVerificationEvidencePublicResponse(
			request.Context(), route.Operation, requestDigest, record.ResponseBytes,
		); err != nil {
			respondEvaluationServiceError(writer, ErrUnauthorized)
			return
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, record.ResponseBytes)
		return
	}
	authorityRequest := EvaluationVerificationEvidenceAuthorityRequest{
		NamespaceID: handler.authority.NamespaceID, PlanDigest: partition.PlanDigest,
		RepositoryCommit: partition.RepositoryCommit, Operation: route.Operation,
		RouteBinding: route.RouteBinding, RequestDigest: requestDigest,
		AttemptID:                        requestAuthority.Descriptor.AttemptID,
		DescriptorDigest:                 requestAuthority.Descriptor.DescriptorDigest,
		Generation:                       requestAuthority.Generation,
		ControlledWorkspaceGrantDigest:   requestAuthority.ControlledWorkspaceGrantDigest,
		AuthorityDigest:                  requestAuthority.AuthorityDigest,
		SandboxRegistrationReceiptDigest: sandboxReceiptDigest,
		Request:                          append(json.RawMessage(nil), source...), ClaimGeneration: record.ClaimGeneration,
	}
	if ownerStateful {
		authorityRequest.OwnerImplementationDigest = binding.OwnerImplementationDigest
		authorityRequest.OwnerStateID = ownerStatePrior.OwnerStateID
		authorityRequest.OwnerStateRevision = ownerStatePrior.Revision
		authorityRequest.OwnerStateBundle = append(json.RawMessage(nil), ownerStatePrior.Bundle...)
		authorityRequest.OwnerStateRootDigest = ownerStatePrior.RootDigest
	}
	var response json.RawMessage
	if ownerStateful {
		response, err = handler.executeVerificationEvidenceOwnerState(
			request, partition, binding, record, ownerStatePrior, ownerStateRepository,
			ownerStateAuthority, authorityRequest, route, requestValue, requestAuthority,
		)
	} else if record.State == "claimed" {
		response, err = handler.verificationEvidenceAuthority.ExecuteVerificationEvidence(
			request.Context(), authorityRequest,
		)
		if err == nil {
			record, _, err = repository.MarkEvaluationControlledAuthorityDispatched(
				request.Context(), handler.authority, partition, binding,
				record.ClaimGeneration, time.Now().UTC(),
			)
		}
	} else {
		var reconciled bool
		response, reconciled, err = handler.verificationEvidenceAuthority.ReconcileVerificationEvidence(
			request.Context(), authorityRequest,
		)
		if err == nil && !reconciled {
			err = errEvaluationServiceUnavailable
		}
	}
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	canonicalResponse, persistable, err := validateVerificationEvidenceAuthorityResponse(
		response, route, requestDigest, requestValue, requestAuthority, ownerStateBinding,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.verificationEvidenceResponseScanner.ScanVerificationEvidencePublicResponse(
		request.Context(), route.Operation, requestDigest, canonicalResponse,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	responseDigest, err := evaluationCanonicalByteDigest(
		canonicalResponse, maximumEvaluationVerificationEvidenceResponseBytes,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if record.State == "sealed" {
		if record.ResponseDigest != responseDigest {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, canonicalResponse)
		return
	}
	var persistedResponse []byte
	if persistable {
		persistedResponse = canonicalResponse
	}
	sealed, _, err := repository.SealEvaluationControlledAuthorityRequest(
		request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
		responseDigest, persistedResponse, time.Now().UTC(),
	)
	if err != nil || sealed.ResponseDigest != responseDigest ||
		persistable && !bytes.Equal(sealed.ResponseBytes, canonicalResponse) {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, canonicalResponse)
}

func (handler *EvaluationServiceHandler) executeVerificationEvidenceOwnerState(
	request *http.Request,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	record EvaluationControlledAuthorityRequestRecord,
	prior EvaluationOwnerStatePrior,
	repository evaluationOwnerStateRepository,
	authority EvaluationVerificationEvidenceStateAuthority,
	authorityRequest EvaluationVerificationEvidenceAuthorityRequest,
	route evaluationVerificationEvidenceRoute,
	requestValue map[string]any,
	requestAuthority evaluationVerificationEvidenceRequestAuthority,
) (json.RawMessage, error) {
	var transition EvaluationOwnerStateTransition
	if record.State == "claimed" {
		stageDigest, err := authority.StageVerificationEvidenceState(request.Context(), authorityRequest)
		if err != nil {
			return nil, err
		}
		expectedStage, err := evaluationOwnerStateStageDigest(
			"verification-evidence", binding.Operation, binding.RouteBinding, binding.RequestDigest,
			binding.OwnerImplementationDigest, prior.OwnerStateID, prior.Revision, prior.RootDigest,
		)
		if err != nil || stageDigest != expectedStage {
			return nil, ErrConflict
		}
		if _, _, err := repository.StageEvaluationOwnerStateDispatch(
			request.Context(), handler.authority, partition, binding, prior, handler.clock().UTC(),
		); err != nil {
			return nil, err
		}
		authorityRequest.StageDigest = stageDigest
		transition, err = authority.ExecuteVerificationEvidenceState(request.Context(), authorityRequest)
		if err != nil {
			return nil, err
		}
	} else if record.State == "dispatched" || record.State == "sealed" {
		dispatch, err := repository.GetEvaluationOwnerStateDispatch(
			request.Context(), handler.authority, partition, "verification-evidence", binding.RequestDigest,
		)
		if err != nil || dispatch.ResultReceiptDigest == "" {
			if err != nil {
				return nil, err
			}
			return nil, errEvaluationServiceUnavailable
		}
		current, err := repository.GetEvaluationOwnerState(
			request.Context(), handler.authority, partition, "verification-evidence", dispatch.OwnerStateID,
		)
		if err != nil || current.Revision != dispatch.OwnerStateRevision || current.RootDigest != dispatch.OwnerStateRootDigest {
			if err != nil {
				return nil, err
			}
			return nil, ErrConflict
		}
		sealedValue, err := evaluationOwnerStateSealedOperationValue(EvaluationOwnerStateTransition{
			PublicResult: dispatch.PublicResultBytes, ResponseDigest: dispatch.ResponseDigest,
			OwnerImplementationDigest: dispatch.OwnerImplementationDigest, OwnerStateID: dispatch.OwnerStateID,
			PriorRevision: dispatch.PriorRevision, PriorRootDigest: dispatch.PriorRootDigest,
			StageDigest: dispatch.StageDigest, DispatchAckDigest: dispatch.DispatchAckDigest,
			OwnerStateRevision: dispatch.OwnerStateRevision, OwnerStateRootDigest: dispatch.OwnerStateRootDigest,
		}, "verification-evidence", dispatch.Operation, dispatch.RouteBinding, dispatch.RequestDigest)
		if err != nil || stringMember(sealedValue, "resultReceiptDigest") != dispatch.ResultReceiptDigest {
			return nil, ErrConflict
		}
		sealedBytes, err := canonicaljson.Bytes(sealedValue)
		if err != nil {
			return nil, err
		}
		authorityRequest.OwnerStateRevision = current.Revision
		authorityRequest.OwnerStateRootDigest = current.RootDigest
		authorityRequest.OwnerStateBundle = append(json.RawMessage(nil), current.BundleBytes...)
		authorityRequest.StageDigest = dispatch.StageDigest
		authorityRequest.DispatchAckDigest = dispatch.DispatchAckDigest
		authorityRequest.SealedOwnerOperation = sealedBytes
		var reconciled bool
		transition, reconciled, err = authority.ReconcileVerificationEvidenceState(request.Context(), authorityRequest)
		if err != nil {
			return nil, err
		}
		if !reconciled {
			return nil, errEvaluationServiceUnavailable
		}
	} else {
		return nil, ErrConflict
	}
	dispatch, err := repository.GetEvaluationOwnerStateDispatch(
		request.Context(), handler.authority, partition, "verification-evidence", binding.RequestDigest,
	)
	if err != nil || dispatch.ResultReceiptDigest != transition.ResultReceiptDigest ||
		dispatch.DispatchAckDigest != transition.DispatchAckDigest ||
		dispatch.OwnerStateRootDigest != transition.OwnerStateRootDigest ||
		!bytes.Equal(dispatch.PublicResultBytes, transition.PublicResult) {
		if err != nil {
			return nil, err
		}
		return nil, ErrConflict
	}
	transitionBinding, err := evaluationVerificationOwnerStateBindingFromBundle(transition.OwnerStateBundle)
	if err != nil || validateEvaluationVerificationOwnerStateTransitionBinding(route, requestValue, transitionBinding) != nil {
		return nil, ErrConflict
	}
	canonicalResponse, _, err := validateVerificationEvidenceAuthorityResponse(
		transition.AuthorityResponse, route, binding.RequestDigest, requestValue, requestAuthority, transitionBinding,
	)
	if err != nil {
		return nil, err
	}
	publicResult, err := evaluationVerificationEvidencePublicResult(canonicalResponse, route, binding.RequestDigest)
	if err != nil || !bytes.Equal(publicResult, transition.PublicResult) {
		return nil, ErrConflict
	}
	return canonicalResponse, nil
}
