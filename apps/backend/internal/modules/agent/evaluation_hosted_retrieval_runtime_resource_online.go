package agent

import (
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceRegistrationsRouteSegment              = "hosted-retrieval-runtime-resource-registrations"
	evaluationHostedRetrievalRuntimeResourceResultsRouteSegment                    = "hosted-retrieval-runtime-resource-results"
	evaluationHostedRetrievalRuntimeResourceReadsRouteSegment                      = "hosted-retrieval-runtime-resource-reads"
	evaluationHostedRetrievalRuntimeResourceTerminalFencesRouteSegment             = "hosted-retrieval-runtime-resource-terminal-fences"
	evaluationHostedRetrievalRuntimeResourceRecoveryCandidatesRouteSegment         = "hosted-retrieval-runtime-resource-recovery-candidates"
	evaluationHostedRetrievalRuntimeResourceCleanupClaimsRouteSegment              = "hosted-retrieval-runtime-resource-cleanup-claims"
	evaluationHostedRetrievalRuntimeResourceCleanupsRouteSegment                   = "hosted-retrieval-runtime-resource-cleanups"
	evaluationHostedRetrievalRuntimeResourceCleanupResultsRouteSegment             = "hosted-retrieval-runtime-resource-cleanup-results"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentsRouteSegment   = "hosted-retrieval-runtime-resource-lifecycle-journal/dispatch-intents"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptsRouteSegment = "hosted-retrieval-runtime-resource-lifecycle-journal/transport-receipts"
	evaluationHostedRetrievalRuntimeResourceLifecycleRecordsRouteSegment           = "hosted-retrieval-runtime-resource-lifecycle-journal/records"

	evaluationHostedRetrievalRuntimeResourcePreparePurpose                         = "hosted-retrieval-runtime-resource.prepare"
	evaluationHostedRetrievalRuntimeResourceRegistrationSetReadPurpose             = "hosted-retrieval-runtime-resource.registration-set.read"
	evaluationHostedRetrievalRuntimeResourceReadPurpose                            = "hosted-retrieval-runtime-resource.read"
	evaluationHostedRetrievalRuntimeResourceTerminalFencePurpose                   = "hosted-retrieval-runtime-resource.terminal-fence.derive"
	evaluationHostedRetrievalRuntimeResourceRecoveryListPurpose                    = "hosted-retrieval-runtime-resource.cleanup.recovery.list"
	evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupClaimPurpose          = "hosted-retrieval-runtime-resource.cleanup.post-matrix.claim"
	evaluationHostedRetrievalRuntimeResourceRecoveryCleanupClaimPurpose            = "hosted-retrieval-runtime-resource.cleanup.claim"
	evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupExecutePurpose        = "hosted-retrieval-runtime-resource.cleanup.post-matrix.execute"
	evaluationHostedRetrievalRuntimeResourceRecoveryCleanupExecutePurpose          = "hosted-retrieval-runtime-resource.cleanup.execute"
	evaluationHostedRetrievalRuntimeResourcePostMatrixCleanupResultReadPurpose     = "hosted-retrieval-runtime-resource.cleanup.post-matrix.result.read"
	evaluationHostedRetrievalRuntimeResourceRecoveryCleanupResultReadPurpose       = "hosted-retrieval-runtime-resource.cleanup.result.read"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportPurpose              = "hosted-retrieval-runtime-resource.lifecycle-journal.transport"
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose = "hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.unfinished.read"
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReadPurpose     = "hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.read"
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationStorePurpose    = "hosted-retrieval-runtime-resource.lifecycle-journal.transport.reconcile.store"
	evaluationHostedRetrievalRuntimeResourceLifecycleTransportRecoveryReadPurpose  = "hosted-retrieval-runtime-resource.lifecycle-journal.transport.recovery.read"
	evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose                   = "hosted-retrieval-runtime-resource.lifecycle-journal.seal"

	maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes                   = 16_384
	maximumEvaluationHostedRetrievalRuntimeResourceRegistrationResultBytes          = 32_768
	maximumEvaluationHostedRetrievalRuntimeResourceRegistrationSetLookupBytes       = 180_224
	evaluationHostedRetrievalRuntimeResourceLookupAuthorityIssuerID                 = "authority.prodivix.hosted-retrieval-runtime-resource-registration-set-lookup"
	evaluationHostedRetrievalRuntimeResourceLookupAuthorityImplementationDigest     = "sha256-e0e1fdc31d87d024b3c5ffcc9ac06925ecbc7a146d3623aeb256289a6f10c589"
	evaluationHostedRetrievalRuntimeResourceReadLedgerAuthorityIssuerID             = "authority.prodivix.hosted-retrieval-runtime-resource-read-ledger"
	evaluationHostedRetrievalRuntimeResourceReadLedgerAuthorityImplementationDigest = "sha256-1c36ad8d3c36d7495595283698b7fc20c12a201f4a6a37d88a845808d7678321"
)

var evaluationHostedRetrievalRuntimeResourceExpectedAuthorityKeys = []string{
	"gemini-interactions\x00g4-provider-hosted-retrieval-core",
	"gemini-interactions\x00g4-provider-hosted-retrieval-document",
	"openai-responses\x00g4-provider-hosted-retrieval-core",
	"openai-responses\x00g4-provider-hosted-retrieval-document",
}

type evaluationHostedRetrievalRuntimeResourceRegistrationRequest struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	RegistrationIntentDigest       string
	ProtocolFamily                 string
	CapabilityProfileID            string
	ProviderConfigurationID        string
	ProviderConfigurationDigest    string
	MinimumExpiresAt               time.Time
	RequestDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

type evaluationHostedRetrievalRuntimeResourceRegistrationResult struct {
	Request                        evaluationHostedRetrievalRuntimeResourceRegistrationRequest
	ResultDigest                   string
	AuthorityDigest                string
	ProviderResourceKind           string
	ProviderResourceID             string
	ResourceManifestDigest         string
	DeletionAuthorityReceiptDigest string
	RegisteredAt                   time.Time
	ExpiresAt                      time.Time
	Authority                      map[string]any
	DeletionAuthorityReceipt       map[string]any
	Value                          map[string]any
	Canonical                      []byte
}

type evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RequestedAt                    time.Time
	RequestDigest                  string
	IntentBindings                 []any
	Value                          map[string]any
	Canonical                      []byte
}

type evaluationHostedRetrievalRuntimeResourceReadRequest struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	AuthorityDigest                string
	ResourceSetCommitmentDigest    string
	ReaderOwnerInstanceID          string
	ReadLeaseID                    string
	MinimumExpiresAt               time.Time
	RequestDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

func evaluationHostedRetrievalRuntimeResourceSelfDigest(value map[string]any, key string) bool {
	digest := stringMember(value, key)
	if !evaluationDigestPattern.MatchString(digest) {
		return false
	}
	base := cloneEvaluationObject(value)
	delete(base, key)
	expected, err := canonicaljson.Digest(base)
	return err == nil && digest == expected
}

func evaluationHostedRetrievalRuntimeResourceVersionOne(value map[string]any) bool {
	version, ok := integerMember(value, "version")
	return ok && version == 1
}

func decodeEvaluationHostedRetrievalRuntimeResourceRegistrationRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceRegistrationRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
		"runConfigArtifactBindingDigest", "runtimeResourceSetId", "registrationIntent",
		"registrationIntentDigest", "providerConfigurationId", "providerConfigurationDigest",
		"protocolFamily", "modelId", "modelLineageDigest", "adapterDigest", "capabilityProfileId",
		"capabilityProfileDigest", "probeProgramDigest", "publicResourceDescriptorDigest",
		"budgetReservationAuthority", "budgetReservationAuthorityDigest", "networkPolicyAuthority",
		"networkPolicyAuthorityDigest", "minimumExpiresAt", "requestDigest",
	}) || stringMember(value, "format") != "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-request" ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceRegistrationRequest{}, ErrInvalid
	}
	minimumExpiresAt, err := evaluationInstant(value["minimumExpiresAt"], "minimumExpiresAt")
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceRegistrationRequest{}, ErrInvalid
	}
	result := evaluationHostedRetrievalRuntimeResourceRegistrationRequest{
		NamespaceID:                    stringMember(value, "namespaceId"),
		RepositoryCommit:               stringMember(value, "repositoryCommit"),
		PlanDigest:                     stringMember(value, "planDigest"),
		FrozenRunDigest:                stringMember(value, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID:           stringMember(value, "runtimeResourceSetId"),
		RegistrationIntentDigest:       stringMember(value, "registrationIntentDigest"),
		ProtocolFamily:                 stringMember(value, "protocolFamily"),
		CapabilityProfileID:            stringMember(value, "capabilityProfileId"),
		ProviderConfigurationID:        stringMember(value, "providerConfigurationId"),
		ProviderConfigurationDigest:    stringMember(value, "providerConfigurationDigest"),
		MinimumExpiresAt:               minimumExpiresAt,
		RequestDigest:                  stringMember(value, "requestDigest"),
		Value:                          value,
		Canonical:                      append([]byte(nil), source...),
	}
	if !validEvaluationServiceIdentity(result.NamespaceID) || !evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!validEvaluationServiceIdentity(result.RuntimeResourceSetID) || !validEvaluationServiceIdentity(result.ProviderConfigurationID) ||
		!oneOfString(result.ProtocolFamily, "gemini-interactions", "openai-responses") ||
		!oneOfString(result.CapabilityProfileID, "g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document") ||
		!evaluationDigestPattern.MatchString(result.PlanDigest) || !evaluationDigestPattern.MatchString(result.FrozenRunDigest) ||
		!evaluationDigestPattern.MatchString(result.RunConfigArtifactBindingDigest) ||
		!evaluationDigestPattern.MatchString(result.RegistrationIntentDigest) ||
		!evaluationDigestPattern.MatchString(result.ProviderConfigurationDigest) {
		return evaluationHostedRetrievalRuntimeResourceRegistrationRequest{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceRegistrationResult(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceRegistrationResult, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceRegistrationResultBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "registrationRequestDigest", "registrationRequest", "authority",
		"authorityDigest", "deletionAuthorityReceipt", "deletionAuthorityReceiptDigest", "resultDigest",
	}) || stringMember(value, "format") != "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-result" ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "resultDigest") {
		return evaluationHostedRetrievalRuntimeResourceRegistrationResult{}, ErrInvalid
	}
	requestValue, requestOK := objectMember(value, "registrationRequest")
	authorityValue, authorityOK := objectMember(value, "authority")
	deletionValue, deletionOK := objectMember(value, "deletionAuthorityReceipt")
	if !requestOK || !authorityOK || !deletionOK {
		return evaluationHostedRetrievalRuntimeResourceRegistrationResult{}, ErrInvalid
	}
	requestBytes, err := canonicaljson.Bytes(requestValue)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceRegistrationResult{}, ErrInvalid
	}
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationRequest(requestBytes)
	if err != nil || request.RequestDigest != stringMember(value, "registrationRequestDigest") ||
		stringMember(authorityValue, "authorityDigest") != stringMember(value, "authorityDigest") ||
		stringMember(deletionValue, "deletionAuthorityReceiptDigest") != stringMember(value, "deletionAuthorityReceiptDigest") ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(authorityValue, "authorityDigest") ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(deletionValue, "deletionAuthorityReceiptDigest") {
		return evaluationHostedRetrievalRuntimeResourceRegistrationResult{}, ErrInvalid
	}
	registeredAt, err := evaluationInstant(authorityValue["registeredAt"], "registeredAt")
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceRegistrationResult{}, ErrInvalid
	}
	expiresAt, err := evaluationInstant(authorityValue["expiresAt"], "expiresAt")
	if err != nil || !expiresAt.After(registeredAt) || expiresAt.Sub(registeredAt) > 8*24*time.Hour {
		return evaluationHostedRetrievalRuntimeResourceRegistrationResult{}, ErrInvalid
	}
	result := evaluationHostedRetrievalRuntimeResourceRegistrationResult{
		Request:                        request,
		ResultDigest:                   stringMember(value, "resultDigest"),
		AuthorityDigest:                stringMember(value, "authorityDigest"),
		ProviderResourceKind:           stringMember(authorityValue, "providerResourceKind"),
		ProviderResourceID:             stringMember(authorityValue, "providerResourceId"),
		ResourceManifestDigest:         stringMember(authorityValue, "resourceManifestDigest"),
		DeletionAuthorityReceiptDigest: stringMember(value, "deletionAuthorityReceiptDigest"),
		RegisteredAt:                   registeredAt,
		ExpiresAt:                      expiresAt,
		Authority:                      authorityValue,
		DeletionAuthorityReceipt:       deletionValue,
		Value:                          value,
		Canonical:                      append([]byte(nil), source...),
	}
	if !evaluationDigestPattern.MatchString(result.AuthorityDigest) ||
		!evaluationDigestPattern.MatchString(result.ResourceManifestDigest) ||
		!evaluationDigestPattern.MatchString(result.DeletionAuthorityReceiptDigest) ||
		!validEvaluationServiceIdentity(result.ProviderResourceID) ||
		(result.Request.ProtocolFamily == "gemini-interactions" && result.ProviderResourceKind != "gemini-file-search-store-name") ||
		(result.Request.ProtocolFamily == "openai-responses" && result.ProviderResourceKind != "openai-vector-store-id") {
		return evaluationHostedRetrievalRuntimeResourceRegistrationResult{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "planDigest", "frozenRunDigest",
		"runConfigArtifactBindingDigest", "registrationIntentBindings", "requestedAt", "requestDigest",
	}) || stringMember(value, "format") != "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-registration-set-lookup-request" ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest{}, ErrInvalid
	}
	bindings, ok := arrayMember(value, "registrationIntentBindings")
	if !ok || len(bindings) != 4 {
		return evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest{}, ErrInvalid
	}
	keys := make([]string, 0, len(bindings))
	for _, candidate := range bindings {
		binding, ok := candidate.(map[string]any)
		if !ok || !exactEvaluationKeys(binding, []string{"protocolFamily", "capabilityProfileId", "registrationIntentDigest"}) ||
			!evaluationDigestPattern.MatchString(stringMember(binding, "registrationIntentDigest")) {
			return evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest{}, ErrInvalid
		}
		keys = append(keys, stringMember(binding, "protocolFamily")+"\x00"+stringMember(binding, "capabilityProfileId"))
	}
	if len(keys) != len(evaluationHostedRetrievalRuntimeResourceExpectedAuthorityKeys) {
		return evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest{}, ErrInvalid
	}
	for index := range keys {
		if keys[index] != evaluationHostedRetrievalRuntimeResourceExpectedAuthorityKeys[index] {
			return evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest{}, ErrInvalid
		}
	}
	requestedAt, err := evaluationInstant(value["requestedAt"], "requestedAt")
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest{}, ErrInvalid
	}
	result := evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest{
		NamespaceID:                    stringMember(value, "namespaceId"),
		RepositoryCommit:               stringMember(value, "repositoryCommit"),
		PlanDigest:                     stringMember(value, "planDigest"),
		FrozenRunDigest:                stringMember(value, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RequestedAt:                    requestedAt,
		RequestDigest:                  stringMember(value, "requestDigest"),
		IntentBindings:                 bindings,
		Value:                          value,
		Canonical:                      append([]byte(nil), source...),
	}
	if !validEvaluationServiceIdentity(result.NamespaceID) || !evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(result.PlanDigest) || !evaluationDigestPattern.MatchString(result.FrozenRunDigest) ||
		!evaluationDigestPattern.MatchString(result.RunConfigArtifactBindingDigest) {
		return evaluationHostedRetrievalRuntimeResourceRegistrationSetLookupRequest{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceReadRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceReadRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "repositoryCommit", "planDigest", "runConfigArtifactBindingDigest",
		"runtimeResourceSetId", "authorityDigest", "resourceSetCommitmentDigest", "readerOwnerInstanceId",
		"readLeaseId", "minimumExpiresAt", "requestDigest",
	}) || stringMember(value, "format") != "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-read-request" ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceReadRequest{}, ErrInvalid
	}
	minimumExpiresAt, err := evaluationInstant(value["minimumExpiresAt"], "minimumExpiresAt")
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceReadRequest{}, ErrInvalid
	}
	result := evaluationHostedRetrievalRuntimeResourceReadRequest{
		NamespaceID:                    stringMember(value, "namespaceId"),
		RepositoryCommit:               stringMember(value, "repositoryCommit"),
		PlanDigest:                     stringMember(value, "planDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID:           stringMember(value, "runtimeResourceSetId"),
		AuthorityDigest:                stringMember(value, "authorityDigest"),
		ResourceSetCommitmentDigest:    stringMember(value, "resourceSetCommitmentDigest"),
		ReaderOwnerInstanceID:          stringMember(value, "readerOwnerInstanceId"),
		ReadLeaseID:                    stringMember(value, "readLeaseId"),
		MinimumExpiresAt:               minimumExpiresAt,
		RequestDigest:                  stringMember(value, "requestDigest"),
		Value:                          value,
		Canonical:                      append([]byte(nil), source...),
	}
	if !validEvaluationServiceIdentity(result.NamespaceID) || !evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!validEvaluationServiceIdentity(result.RuntimeResourceSetID) || !validEvaluationServiceIdentity(result.ReaderOwnerInstanceID) ||
		!validEvaluationServiceIdentity(result.ReadLeaseID) || !evaluationDigestPattern.MatchString(result.PlanDigest) ||
		!evaluationDigestPattern.MatchString(result.RunConfigArtifactBindingDigest) || !evaluationDigestPattern.MatchString(result.AuthorityDigest) ||
		!evaluationDigestPattern.MatchString(result.ResourceSetCommitmentDigest) {
		return evaluationHostedRetrievalRuntimeResourceReadRequest{}, ErrInvalid
	}
	return result, nil
}

func createEvaluationHostedRetrievalRuntimeResourceAuthoritySet(
	results []evaluationHostedRetrievalRuntimeResourceRegistrationResult,
) (map[string]any, map[string]any, error) {
	if len(results) != 4 {
		return nil, nil, ErrConflict
	}
	sort.Slice(results, func(left, right int) bool {
		leftKey := results[left].Request.ProtocolFamily + "\x00" + results[left].Request.CapabilityProfileID
		rightKey := results[right].Request.ProtocolFamily + "\x00" + results[right].Request.CapabilityProfileID
		return leftKey < rightKey
	})
	keys := make([]string, 0, 4)
	authorities := make([]any, 0, 4)
	authorityDigests := make([]any, 0, 4)
	bindings := make([]any, 0, 4)
	first := results[0].Request
	for _, result := range results {
		key := result.Request.ProtocolFamily + "\x00" + result.Request.CapabilityProfileID
		keys = append(keys, key)
		if result.Request.PlanDigest != first.PlanDigest || result.Request.FrozenRunDigest != first.FrozenRunDigest ||
			result.Request.RunConfigArtifactBindingDigest != first.RunConfigArtifactBindingDigest ||
			result.Request.RuntimeResourceSetID != first.RuntimeResourceSetID {
			return nil, nil, ErrConflict
		}
		authorities = append(authorities, result.Authority)
		authorityDigests = append(authorityDigests, result.AuthorityDigest)
		budget, budgetOK := objectMember(result.Authority, "budgetReservationAuthority")
		if !budgetOK {
			return nil, nil, ErrConflict
		}
		bindings = append(bindings, map[string]any{
			"authorityDigest":                  result.AuthorityDigest,
			"registrationIntentDigest":         result.Request.RegistrationIntentDigest,
			"protocolFamily":                   result.Request.ProtocolFamily,
			"capabilityProfileId":              result.Request.CapabilityProfileID,
			"providerConfigurationDigest":      result.Request.ProviderConfigurationDigest,
			"budgetReservationId":              stringMember(budget, "reservationId"),
			"budgetReservationAuthorityDigest": stringMember(result.Authority, "budgetReservationAuthorityDigest"),
			"networkPolicyAuthorityDigest":     stringMember(result.Authority, "networkPolicyAuthorityDigest"),
		})
	}
	for index := range keys {
		if keys[index] != evaluationHostedRetrievalRuntimeResourceExpectedAuthorityKeys[index] {
			return nil, nil, ErrConflict
		}
	}
	authoritySetBase := map[string]any{
		"format":                         "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-authority-set",
		"version":                        int64(1),
		"planDigest":                     first.PlanDigest,
		"frozenRunDigest":                first.FrozenRunDigest,
		"runConfigArtifactBindingDigest": first.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId":           first.RuntimeResourceSetID,
		"authorities":                    authorities,
		"authorityDigests":               authorityDigests,
	}
	authoritySetDigest, err := canonicaljson.Digest(authoritySetBase)
	if err != nil {
		return nil, nil, err
	}
	authoritySet := cloneEvaluationObject(authoritySetBase)
	authoritySet["authoritySetDigest"] = authoritySetDigest
	commitmentBase := map[string]any{
		"format":                         "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-set-commitment",
		"version":                        int64(1),
		"planDigest":                     first.PlanDigest,
		"frozenRunDigest":                first.FrozenRunDigest,
		"runConfigArtifactBindingDigest": first.RunConfigArtifactBindingDigest,
		"runtimeResourceSetId":           first.RuntimeResourceSetID,
		"authoritySetDigest":             authoritySetDigest,
		"authorityBindings":              bindings,
	}
	commitmentDigest, err := canonicaljson.Digest(commitmentBase)
	if err != nil {
		return nil, nil, err
	}
	commitment := cloneEvaluationObject(commitmentBase)
	commitment["commitmentDigest"] = commitmentDigest
	return authoritySet, commitment, nil
}

func createEvaluationHostedRetrievalRuntimeResourceActiveState(
	authorityDigest string,
	resourceSetCommitmentDigest string,
	ownerInstanceID string,
	claimGeneration int64,
	readLeaseNotAfter *time.Time,
	updatedAt time.Time,
) (map[string]any, []byte, error) {
	var lease any
	if readLeaseNotAfter != nil {
		lease = evaluationExportInstant(*readLeaseNotAfter)
	}
	base := map[string]any{
		"format":                      "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-active-state",
		"version":                     int64(1),
		"authorityDigest":             authorityDigest,
		"resourceSetCommitmentDigest": resourceSetCommitmentDigest,
		"activeOwnerInstanceId":       ownerInstanceID,
		"claimGeneration":             claimGeneration,
		"lifecycle":                   "active",
		"readLeaseNotAfter":           lease,
		"updatedAt":                   evaluationExportInstant(updatedAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, nil, err
	}
	value := cloneEvaluationObject(base)
	value["stateDigest"] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) > maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes {
		return nil, nil, ErrConflict
	}
	return value, encoded, nil
}
