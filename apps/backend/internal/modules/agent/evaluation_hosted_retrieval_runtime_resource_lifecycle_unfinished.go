package agent

import (
	"bytes"
	"context"
	"database/sql"
	"regexp"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequestFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-read-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidateFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-candidate"
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPageFormat        = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-unfinished-dispatch-page"
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPageMaximum       = int64(8)
)

var (
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequestKeys = []string{
		"format", "version", "purpose", "namespaceId", "repositoryCommit", "planDigest",
		"frozenRunDigest", "runConfigArtifactBindingDigest", "runtimeResourceSetId",
		"lifecycleOwnerInstanceId", "pageSize", "cursor", "requestedAt",
		"minimumSnapshotExpiresAt", "requestDigest",
	}
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidateKeys = []string{
		"format", "version", "registrationRequest", "registrationRequestDigest",
		"dispatchIntentSet", "dispatchIntentSetDigest",
		"dispatchStageClaimHistorySet", "dispatchStageClaimHistorySetDigest", "unfinishedState",
		"durableTransportReceiptSetDigest", "spoolRef", "transportStoreReceiptDigest", "candidateDigest",
	}
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPageKeys = []string{
		"format", "version", "request", "requestDigest", "recoveryAuthorityIssuerId",
		"recoveryAuthorityImplementationDigest", "snapshotId", "snapshotRevision", "snapshotAt",
		"expiresAt", "candidates", "candidateDigests", "nextCursor", "pageDigest",
	}
	evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedCursorPattern = regexp.MustCompile(
		`^hosted-lifecycle-unfinished-cursor\.([a-f0-9]{64})\.[0-9]+$`,
	)
)

type evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest struct {
	NamespaceID                    string
	RepositoryCommit               string
	PlanDigest                     string
	FrozenRunDigest                string
	RunConfigArtifactBindingDigest string
	RuntimeResourceSetID           string
	LifecycleOwnerInstanceID       string
	PageSize                       int64
	Cursor                         *string
	RequestedAt                    time.Time
	MinimumSnapshotExpiresAt       time.Time
	RequestDigest                  string
	Value                          map[string]any
	Canonical                      []byte
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest, error) {
	value, err := decodeCanonicalEvaluationObject(
		source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil || evaluationAuthenticityCredentialPattern.Match(source) ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest{}, ErrInvalid
	}
	pageSize, pageSizeOK := integerMember(value, "pageSize")
	requestedAt, requestedAtErr := evaluationInstant(value["requestedAt"], "requestedAt")
	minimumExpiresAt, minimumExpiresAtErr := evaluationInstant(value["minimumSnapshotExpiresAt"], "minimumSnapshotExpiresAt")
	var cursor *string
	switch candidate := value["cursor"].(type) {
	case nil:
	case string:
		if !validEvaluationAgentControlIdentity(candidate) ||
			!evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedCursorPattern.MatchString(candidate) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest{}, ErrInvalid
		}
		cursor = &candidate
	default:
		return evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest{}, ErrInvalid
	}
	result := evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest{
		NamespaceID: stringMember(value, "namespaceId"), RepositoryCommit: stringMember(value, "repositoryCommit"),
		PlanDigest: stringMember(value, "planDigest"), FrozenRunDigest: stringMember(value, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID:           stringMember(value, "runtimeResourceSetId"),
		LifecycleOwnerInstanceID:       stringMember(value, "lifecycleOwnerInstanceId"), PageSize: pageSize,
		Cursor: cursor, RequestedAt: requestedAt, MinimumSnapshotExpiresAt: minimumExpiresAt,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if !pageSizeOK || pageSize < 1 || pageSize > evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPageMaximum ||
		requestedAtErr != nil || minimumExpiresAtErr != nil || !minimumExpiresAt.After(requestedAt) ||
		minimumExpiresAt.Sub(requestedAt) > evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime ||
		!validEvaluationAgentControlIdentity(result.NamespaceID) ||
		!validEvaluationAgentControlIdentity(result.RuntimeResourceSetID) ||
		!validEvaluationAgentControlIdentity(result.LifecycleOwnerInstanceID) ||
		!evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!evaluationHostedArchiveDigestMembers(value, "planDigest", "frozenRunDigest",
			"runConfigArtifactBindingDigest", "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest{}, ErrInvalid
	}
	return result, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedNullableDigest(value any) bool {
	if value == nil {
		return true
	}
	candidate, ok := value.(string)
	return ok && evaluationDigestPattern.MatchString(candidate)
}

func evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedNullableIdentity(value any) bool {
	if value == nil {
		return true
	}
	candidate, ok := value.(string)
	return ok && validEvaluationAgentControlIdentity(candidate)
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate(
	value map[string]any,
	request evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
) (string, string, error) {
	registrationValue, registrationOK := objectMember(value, "registrationRequest")
	intentSetValue, intentSetOK := objectMember(value, "dispatchIntentSet")
	historyValue, historyOK := objectMember(value, "dispatchStageClaimHistorySet")
	if !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidateKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidateFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) || !registrationOK || !intentSetOK || !historyOK ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "candidateDigest") ||
		!evaluationHostedArchiveSafe(value, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes) {
		return "", "", ErrConflict
	}
	registrationBytes, err := canonicaljson.Bytes(registrationValue)
	if err != nil {
		return "", "", ErrConflict
	}
	registration, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationRequest(registrationBytes)
	if err != nil || registration.RequestDigest != stringMember(value, "registrationRequestDigest") ||
		registration.NamespaceID != request.NamespaceID || registration.RepositoryCommit != request.RepositoryCommit ||
		registration.PlanDigest != request.PlanDigest || registration.FrozenRunDigest != request.FrozenRunDigest ||
		registration.RunConfigArtifactBindingDigest != request.RunConfigArtifactBindingDigest ||
		registration.RuntimeResourceSetID != request.RuntimeResourceSetID {
		return "", "", ErrConflict
	}
	intentSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(intentSetValue)
	if err != nil || intentSet.SetDigest != stringMember(value, "dispatchIntentSetDigest") ||
		intentSet.RegistrationRequestDigest != registration.RequestDigest || len(intentSet.Intents) == 0 {
		return "", "", ErrConflict
	}
	budgetAuthority, budgetAuthorityOK := objectMember(registration.Value, "budgetReservationAuthority")
	if !budgetAuthorityOK {
		return "", "", ErrConflict
	}
	for _, intent := range intentSet.Intents {
		if intent.NamespaceID != registration.NamespaceID || intent.RepositoryCommit != registration.RepositoryCommit ||
			intent.PlanDigest != registration.PlanDigest || intent.FrozenRunDigest != registration.FrozenRunDigest ||
			intent.RunConfigArtifactBindingDigest != registration.RunConfigArtifactBindingDigest ||
			intent.RuntimeResourceSetID != registration.RuntimeResourceSetID ||
			intent.RegistrationIntentDigest != registration.RegistrationIntentDigest ||
			intent.ProtocolFamily != registration.ProtocolFamily ||
			intent.CapabilityProfileID != registration.CapabilityProfileID ||
			intent.ProviderConfigurationID != registration.ProviderConfigurationID ||
			intent.ProviderConfigurationDigest != registration.ProviderConfigurationDigest ||
			intent.BudgetReservationID != stringMember(budgetAuthority, "reservationId") ||
			intent.BudgetReservationAuthorityDigest != stringMember(registration.Value, "budgetReservationAuthorityDigest") {
			return "", "", ErrConflict
		}
	}
	initialClaimSetValue, initialOK := objectMember(historyValue, "initialClaimReceiptSet")
	if !initialOK {
		return "", "", ErrConflict
	}
	initialClaimSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet(initialClaimSetValue, intentSet)
	if err != nil {
		return "", "", ErrConflict
	}
	history, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet(
		historyValue, intentSet, initialClaimSet,
	)
	if err != nil || history.SetDigest != stringMember(value, "dispatchStageClaimHistorySetDigest") {
		return "", "", ErrConflict
	}
	for _, intent := range intentSet.Intents {
		found := false
		for index := len(history.Receipts) - 1; index >= 0; index-- {
			claim := history.Receipts[index]
			if claim.DispatchIntentDigest == intent.IntentDigest {
				if stringMember(claim.Value, "deliveryDisposition") == "sealed-read-only" {
					return "", "", ErrConflict
				}
				found = true
				break
			}
		}
		if !found {
			return "", "", ErrConflict
		}
	}
	first := intentSet.Intents[0]
	if first.NamespaceID != request.NamespaceID || first.RepositoryCommit != request.RepositoryCommit ||
		first.PlanDigest != request.PlanDigest || first.FrozenRunDigest != request.FrozenRunDigest ||
		first.RunConfigArtifactBindingDigest != request.RunConfigArtifactBindingDigest ||
		first.RuntimeResourceSetID != request.RuntimeResourceSetID {
		return "", "", ErrConflict
	}
	staged := stringMember(value, "unfinishedState") == "staged-before-transport"
	stored := stringMember(value, "unfinishedState") == "transport-stored-before-seal"
	if (!staged && !stored) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedNullableDigest(value["durableTransportReceiptSetDigest"]) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedNullableIdentity(value["spoolRef"]) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedNullableDigest(value["transportStoreReceiptDigest"]) ||
		(staged && (value["durableTransportReceiptSetDigest"] != nil || value["spoolRef"] != nil || value["transportStoreReceiptDigest"] != nil)) ||
		(stored && (value["durableTransportReceiptSetDigest"] == nil || value["spoolRef"] == nil || value["transportStoreReceiptDigest"] == nil)) {
		return "", "", ErrConflict
	}
	return intentSet.SetDigest, stringMember(value, "candidateDigest"), nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(
	source []byte,
	request evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
) error {
	value, err := decodeCanonicalEvaluationObject(
		source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	implementationDigest, implementationErr := evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest()
	if err != nil || implementationErr != nil ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPageKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPageFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "requestDigest") != request.RequestDigest ||
		stringMember(value, "recoveryAuthorityIssuerId") != evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID ||
		stringMember(value, "recoveryAuthorityImplementationDigest") != implementationDigest ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "pageDigest") {
		return ErrConflict
	}
	embeddedRequest, requestOK := objectMember(value, "request")
	embeddedRequestBytes, embeddedErr := canonicaljson.Bytes(embeddedRequest)
	snapshotRevision, revisionOK := integerMember(value, "snapshotRevision")
	snapshotAt, snapshotAtErr := evaluationInstant(value["snapshotAt"], "snapshotAt")
	expiresAt, expiresAtErr := evaluationInstant(value["expiresAt"], "expiresAt")
	if !requestOK || embeddedErr != nil || !bytes.Equal(embeddedRequestBytes, request.Canonical) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "snapshotId")) || !revisionOK || snapshotRevision < 1 ||
		snapshotAtErr != nil || expiresAtErr != nil || snapshotAt.Before(request.RequestedAt) ||
		!expiresAt.After(snapshotAt) || expiresAt.Before(request.MinimumSnapshotExpiresAt) ||
		expiresAt.Sub(snapshotAt) > evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime {
		return ErrConflict
	}
	candidates, candidatesOK := value["candidates"].([]any)
	digests, digestsOK := value["candidateDigests"].([]any)
	if !candidatesOK || !digestsOK || len(candidates) > int(request.PageSize) || len(digests) != len(candidates) {
		return ErrConflict
	}
	intentSetDigests := make([]string, 0, len(candidates))
	candidateDigests := make([]string, 0, len(candidates))
	for index, rawCandidate := range candidates {
		candidate, ok := rawCandidate.(map[string]any)
		if !ok {
			return ErrConflict
		}
		intentSetDigest, candidateDigest, err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchCandidate(candidate, request)
		if err != nil || index >= len(digests) || digests[index] != candidateDigest {
			return ErrConflict
		}
		intentSetDigests = append(intentSetDigests, intentSetDigest)
		candidateDigests = append(candidateDigests, candidateDigest)
	}
	if !sort.StringsAreSorted(intentSetDigests) {
		return ErrConflict
	}
	seen := make(map[string]struct{}, len(intentSetDigests))
	for _, digest := range intentSetDigests {
		if _, exists := seen[digest]; exists {
			return ErrConflict
		}
		seen[digest] = struct{}{}
	}
	for index, digest := range candidateDigests {
		if !evaluationDigestPattern.MatchString(digest) || digests[index] != digest {
			return ErrConflict
		}
	}
	switch nextCursor := value["nextCursor"].(type) {
	case nil:
	case string:
		if !validEvaluationAgentControlIdentity(nextCursor) ||
			!evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedCursorPattern.MatchString(nextCursor) {
			return ErrConflict
		}
	default:
		return ErrConflict
	}
	return nil
}

func (owner *EvaluationHostedRetrievalRuntimeResource) ReadLifecycleUnfinishedDispatches(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchReadRequest,
) ([]byte, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || owner.lifecycleOwnerInstanceID == "" ||
		request.NamespaceID != authority.NamespaceID || request.LifecycleOwnerInstanceID != owner.lifecycleOwnerInstanceID {
		return nil, errEvaluationServiceUnavailable
	}
	snapshotAt := owner.clock().UTC().Truncate(time.Millisecond)
	if snapshotAt.IsZero() || snapshotAt.Before(request.RequestedAt) {
		return nil, ErrConflict
	}
	expiresAt := snapshotAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime)
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryImplementationDigest()
	if err != nil {
		return nil, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	if request.Cursor != nil {
		match := evaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedCursorPattern.FindStringSubmatch(*request.Cursor)
		if len(match) != 2 {
			return nil, ErrConflict
		}
		snapshotID := "hosted-lifecycle-unfinished-snapshot." + match[1]
		if err := tx.QueryRowContext(ctx, `SELECT snapshot_at,expires_at
			FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_unfinished_dispatch_snapshots
			WHERE namespace_id=$1 AND snapshot_id=$2 FOR SHARE`, authority.NamespaceID, snapshotID).Scan(
			&snapshotAt, &expiresAt,
		); err != nil {
			return nil, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
		}
	}
	if expiresAt.Before(request.MinimumSnapshotExpiresAt) || !expiresAt.After(snapshotAt) ||
		expiresAt.Sub(snapshotAt) > evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime {
		return nil, ErrConflict
	}
	var pageJSON, pageBytes []byte
	var pageDigest, snapshotID string
	var snapshotRevision int64
	err = tx.QueryRowContext(ctx, `SELECT page_json,page_bytes,page_digest,snapshot_id,snapshot_revision
		FROM read_agent_evaluation_hosted_runtime_lifecycle_unfinished_dispatches($1,$2::jsonb,$3,$4,$5,$6,$7)`,
		authority.NamespaceID, string(request.Canonical), request.Canonical,
		evaluationHostedRetrievalRuntimeResourceLifecycleRecoveryAuthorityIssuerID,
		implementationDigest, snapshotAt, expiresAt,
	).Scan(&pageJSON, &pageBytes, &pageDigest, &snapshotID, &snapshotRevision)
	if err != nil {
		return nil, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	pageValue, err := decodeCanonicalEvaluationObject(
		pageJSON, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil {
		return nil, ErrConflict
	}
	canonicalPage, err := canonicaljson.Bytes(pageValue)
	if err != nil || !bytes.Equal(canonicalPage, pageBytes) ||
		stringMember(pageValue, "pageDigest") != pageDigest || stringMember(pageValue, "snapshotId") != snapshotID ||
		integerMemberOrZero(pageValue, "snapshotRevision") != snapshotRevision ||
		validateEvaluationHostedRetrievalRuntimeResourceLifecycleUnfinishedDispatchPage(pageBytes, request) != nil {
		return nil, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	return pageBytes, nil
}
