package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/jackc/pgx/v5/pgconn"
)

const (
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentFormat         = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-intent"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequestFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceiptFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-stage-claim-receipt"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimPurpose         = "hosted-retrieval-runtime-resource.lifecycle-journal.dispatch.claim"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchAuthorityIssuerID    = "authority.prodivix.hosted-retrieval-runtime-resource-lifecycle-dispatch"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchImplementationFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-dispatch-implementation"
	evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime        = 125 * time.Second
)

var evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentKeys = []string{
	"format", "version", "intentId", "lifecycleOwnerAuthorityIssuerId",
	"lifecycleOwnerImplementationDigest", "namespaceId", "repositoryCommit", "planDigest",
	"frozenRunDigest", "runConfigArtifactBindingDigest", "runtimeResourceSetId",
	"registrationIntentDigest", "registrationRequestDigest", "authorityDigest",
	"lifecycleClaimReceiptDigest", "protocolFamily", "capabilityProfileId",
	"providerConfigurationId", "providerConfigurationDigest", "budgetReservationId",
	"budgetReservationAuthorityDigest", "operation", "mutationKind", "mutationSequence",
	"resourceId", "resourceRole", "endpointId", "endpointClass", "method",
	"requestProjectionDigest", "requestBodyDigest", "requestBytes",
	"providerIdempotencyKeyBinding", "createdAt", "intentDigest",
}

// The public wire owns this exact shape and its parity test. The prior claim
// binding makes owner replacement a generation CAS while ever-authorized
// remains an irreversible first-delivery fence.
var evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequestKeys = []string{
	"format", "version", "purpose", "dispatchIntentDigest", "lifecycleOwnerInstanceId",
	"expectedDispatchLedgerRevision", "expectedDispatchGeneration", "expectedPriorStageClaimReceiptDigest",
	"expectedPriorClaimExpiresAt", "requestedAt", "minimumClaimExpiresAt", "requestDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceiptKeys = []string{
	"format", "version", "claimRequest", "claimRequestDigest", "dispatchIntentDigest",
	"dispatchAuthorityIssuerId", "dispatchAuthorityImplementationDigest",
	"dispatchLedgerRevision", "lifecycleOwnerInstanceId", "dispatchGeneration",
	"generationTransition", "deliveryDisposition", "claimedAt", "claimExpiresAt", "priorTransportReceiptDigest",
	"sealedJournalRecordDigest", "receiptDigest",
}

type evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent struct {
	IntentID                         string
	NamespaceID                      string
	RepositoryCommit                 string
	PlanDigest                       string
	FrozenRunDigest                  string
	RunConfigArtifactBindingDigest   string
	RuntimeResourceSetID             string
	RegistrationIntentDigest         string
	RegistrationRequestDigest        string
	AuthorityDigest                  any
	LifecycleClaimReceiptDigest      any
	ProtocolFamily                   string
	CapabilityProfileID              string
	ProviderConfigurationID          string
	ProviderConfigurationDigest      string
	BudgetReservationID              string
	BudgetReservationAuthorityDigest string
	Operation                        string
	MutationKind                     string
	MutationSequence                 int64
	ResourceID                       any
	ResourceRole                     any
	EndpointID                       string
	CreatedAt                        time.Time
	IntentDigest                     string
	Value                            map[string]any
	Canonical                        []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest struct {
	DispatchIntentDigest                 string
	LifecycleOwnerInstanceID             string
	ExpectedDispatchLedgerRevision       int64
	ExpectedDispatchGeneration           int64
	ExpectedPriorStageClaimReceiptDigest any
	ExpectedPriorClaimExpiresAt          *time.Time
	RequestedAt                          time.Time
	MinimumClaimExpiresAt                time.Time
	RequestDigest                        string
	Value                                map[string]any
	Canonical                            []byte
}

func evaluationHostedRetrievalRuntimeResourceLifecycleDispatchImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                    evaluationHostedRetrievalRuntimeResourceLifecycleDispatchImplementationFormat,
		"version":                   evaluationHostedRetrievalRuntimeResourceVersion,
		"dispatchAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceLifecycleDispatchAuthorityIssuerID,
	})
}

func evaluationHostedRetrievalRuntimeResourceLifecycleNullableIdentity(value map[string]any, key string) bool {
	entry, exists := value[key]
	return exists && (entry == nil || validEvaluationAgentControlIdentity(stringMember(value, key)))
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "intentDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "authorityDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "lifecycleClaimReceiptDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableIdentity(value, "resourceId") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent{}, ErrInvalid
	}
	createdAt, instantErr := evaluationInstant(value["createdAt"], "createdAt")
	mutationSequence, mutationSequenceOK := integerMember(value, "mutationSequence")
	requestBytes, requestBytesOK := integerMember(value, "requestBytes")
	result := evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent{
		IntentID: stringMember(value, "intentId"), NamespaceID: stringMember(value, "namespaceId"),
		RepositoryCommit: stringMember(value, "repositoryCommit"), PlanDigest: stringMember(value, "planDigest"),
		FrozenRunDigest:                stringMember(value, "frozenRunDigest"),
		RunConfigArtifactBindingDigest: stringMember(value, "runConfigArtifactBindingDigest"),
		RuntimeResourceSetID:           stringMember(value, "runtimeResourceSetId"),
		RegistrationIntentDigest:       stringMember(value, "registrationIntentDigest"),
		RegistrationRequestDigest:      stringMember(value, "registrationRequestDigest"),
		AuthorityDigest:                value["authorityDigest"], LifecycleClaimReceiptDigest: value["lifecycleClaimReceiptDigest"],
		ProtocolFamily: stringMember(value, "protocolFamily"), CapabilityProfileID: stringMember(value, "capabilityProfileId"),
		ProviderConfigurationID:          stringMember(value, "providerConfigurationId"),
		ProviderConfigurationDigest:      stringMember(value, "providerConfigurationDigest"),
		BudgetReservationID:              stringMember(value, "budgetReservationId"),
		BudgetReservationAuthorityDigest: stringMember(value, "budgetReservationAuthorityDigest"),
		Operation:                        stringMember(value, "operation"), MutationKind: stringMember(value, "mutationKind"),
		MutationSequence: mutationSequence, ResourceID: value["resourceId"], ResourceRole: value["resourceRole"],
		EndpointID: stringMember(value, "endpointId"), CreatedAt: createdAt,
		IntentDigest: stringMember(value, "intentDigest"), Value: value, Canonical: append([]byte(nil), source...),
	}
	if instantErr != nil || !mutationSequenceOK || mutationSequence < 0 || mutationSequence > 3 ||
		!requestBytesOK || requestBytes < 0 || requestBytes > 16_777_216 ||
		!validEvaluationAgentControlIdentity(result.IntentID) || !validEvaluationAgentControlIdentity(result.NamespaceID) ||
		!validEvaluationAgentControlIdentity(result.RuntimeResourceSetID) ||
		!validEvaluationAgentControlIdentity(result.ProviderConfigurationID) ||
		!validEvaluationAgentControlIdentity(result.BudgetReservationID) ||
		!validEvaluationAgentControlIdentity(result.EndpointID) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "lifecycleOwnerAuthorityIssuerId")) ||
		!evaluationRepositoryCommitPattern.MatchString(result.RepositoryCommit) ||
		!oneOfString(result.ProtocolFamily, "gemini-interactions", "openai-responses") ||
		!oneOfString(result.CapabilityProfileID, "g4-provider-hosted-retrieval-core", "g4-provider-hosted-retrieval-document") ||
		!oneOfString(result.Operation, "create", "delete") ||
		!oneOfString(result.MutationKind, "create-primary", "delete-resource", "upload-content", "upload-content-finalize", "upload-content-start") ||
		!oneOfString(stringMember(value, "resourceRole"), "", "auxiliary", "primary") ||
		stringMember(value, "endpointClass") != "provider-hosted-retrieval-resource" ||
		!oneOfString(stringMember(value, "method"), "DELETE", "POST") ||
		stringMember(value, "providerIdempotencyKeyBinding") != "dispatch-intent-digest" {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent{}, ErrInvalid
	}
	for _, field := range []string{
		"lifecycleOwnerImplementationDigest", "planDigest", "frozenRunDigest",
		"runConfigArtifactBindingDigest", "registrationIntentDigest", "registrationRequestDigest",
		"providerConfigurationDigest", "budgetReservationAuthorityDigest", "requestProjectionDigest",
		"requestBodyDigest", "intentDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent{}, ErrInvalid
		}
	}
	if result.Operation == "create" {
		if result.AuthorityDigest != nil || result.LifecycleClaimReceiptDigest != nil ||
			stringMember(value, "method") != "POST" || result.MutationKind == "delete-resource" {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent{}, ErrInvalid
		}
	} else if result.AuthorityDigest == nil || result.LifecycleClaimReceiptDigest == nil ||
		result.ResourceID == nil || result.ResourceRole == nil || stringMember(value, "method") != "DELETE" ||
		result.MutationKind != "delete-resource" || result.MutationSequence != 0 {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent{}, ErrInvalid
	}
	return result, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest, error) {
	value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest{}, ErrInvalid
	}
	requestedAt, requestedAtErr := evaluationInstant(value["requestedAt"], "requestedAt")
	minimumExpiresAt, expiresErr := evaluationInstant(value["minimumClaimExpiresAt"], "minimumClaimExpiresAt")
	expectedLedgerRevision, ledgerRevisionOK := integerMember(value, "expectedDispatchLedgerRevision")
	expectedGeneration, generationOK := integerMember(value, "expectedDispatchGeneration")
	var expectedPriorClaimExpiresAt *time.Time
	if value["expectedPriorClaimExpiresAt"] != nil {
		parsed, parseErr := evaluationInstant(value["expectedPriorClaimExpiresAt"], "expectedPriorClaimExpiresAt")
		if parseErr != nil {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest{}, ErrInvalid
		}
		expectedPriorClaimExpiresAt = &parsed
	}
	result := evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest{
		DispatchIntentDigest:                 stringMember(value, "dispatchIntentDigest"),
		LifecycleOwnerInstanceID:             stringMember(value, "lifecycleOwnerInstanceId"),
		ExpectedDispatchLedgerRevision:       expectedLedgerRevision,
		ExpectedDispatchGeneration:           expectedGeneration,
		ExpectedPriorStageClaimReceiptDigest: value["expectedPriorStageClaimReceiptDigest"],
		ExpectedPriorClaimExpiresAt:          expectedPriorClaimExpiresAt,
		RequestedAt:                          requestedAt,
		MinimumClaimExpiresAt:                minimumExpiresAt, RequestDigest: stringMember(value, "requestDigest"),
		Value: value, Canonical: append([]byte(nil), source...),
	}
	if requestedAtErr != nil || expiresErr != nil || !ledgerRevisionOK || expectedLedgerRevision < 0 ||
		!generationOK || expectedGeneration < 0 ||
		!evaluationDigestPattern.MatchString(result.DispatchIntentDigest) ||
		!validEvaluationAgentControlIdentity(result.LifecycleOwnerInstanceID) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "expectedPriorStageClaimReceiptDigest") ||
		!minimumExpiresAt.After(requestedAt) ||
		minimumExpiresAt.Sub(requestedAt) > evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest{}, ErrInvalid
	}
	if expectedGeneration == 0 {
		if expectedLedgerRevision != 0 || result.ExpectedPriorStageClaimReceiptDigest != nil || expectedPriorClaimExpiresAt != nil {
			return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest{}, ErrInvalid
		}
	} else if expectedLedgerRevision < expectedGeneration || result.ExpectedPriorStageClaimReceiptDigest == nil || expectedPriorClaimExpiresAt == nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest{}, ErrInvalid
	}
	return result, nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
	receiptBytes []byte,
	request evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest,
	receiptDigest string,
	deliveryDisposition string,
	generationTransition string,
	dispatchGeneration int64,
	dispatchLedgerRevision int64,
) error {
	expectedImplementationDigest, implementationErr := evaluationHostedRetrievalRuntimeResourceLifecycleDispatchImplementationDigest()
	value, err := decodeCanonicalEvaluationObject(receiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if implementationErr != nil || err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		stringMember(value, "receiptDigest") != receiptDigest ||
		stringMember(value, "claimRequestDigest") != request.RequestDigest ||
		stringMember(value, "dispatchIntentDigest") != request.DispatchIntentDigest ||
		stringMember(value, "lifecycleOwnerInstanceId") != request.LifecycleOwnerInstanceID ||
		stringMember(value, "deliveryDisposition") != deliveryDisposition ||
		stringMember(value, "generationTransition") != generationTransition ||
		stringMember(value, "dispatchAuthorityIssuerId") != evaluationHostedRetrievalRuntimeResourceLifecycleDispatchAuthorityIssuerID ||
		stringMember(value, "dispatchAuthorityImplementationDigest") != expectedImplementationDigest ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "priorTransportReceiptDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "sealedJournalRecordDigest") {
		return ErrConflict
	}
	embeddedRequest, ok := objectMember(value, "claimRequest")
	if !ok {
		return ErrConflict
	}
	embeddedBytes, err := canonicaljson.Bytes(embeddedRequest)
	if err != nil || !bytes.Equal(embeddedBytes, request.Canonical) {
		return ErrConflict
	}
	storedGeneration, generationOK := integerMember(value, "dispatchGeneration")
	storedRevision, revisionOK := integerMember(value, "dispatchLedgerRevision")
	claimedAt, claimedAtErr := evaluationInstant(value["claimedAt"], "claimedAt")
	claimExpiresAt, expiresErr := evaluationInstant(value["claimExpiresAt"], "claimExpiresAt")
	if !generationOK || !revisionOK || storedGeneration != dispatchGeneration || storedRevision != dispatchLedgerRevision ||
		dispatchGeneration < 1 || dispatchLedgerRevision < 1 || claimedAtErr != nil || expiresErr != nil ||
		claimedAt.Before(request.RequestedAt) || claimExpiresAt.Before(request.MinimumClaimExpiresAt) ||
		!claimExpiresAt.After(claimedAt) || claimExpiresAt.Sub(claimedAt) > evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime ||
		!oneOfString(generationTransition, "initial-first-delivery", "generation-retained", "expired-owner-takeover") ||
		!oneOfString(deliveryDisposition, "dispatch-authorized-first-delivery", "reconcile-only-replay", "sealed-read-only") {
		return ErrConflict
	}
	switch generationTransition {
	case "initial-first-delivery":
		if request.ExpectedDispatchGeneration != 0 || request.ExpectedDispatchLedgerRevision != 0 ||
			dispatchGeneration != 1 || dispatchLedgerRevision != 1 ||
			deliveryDisposition != "dispatch-authorized-first-delivery" ||
			value["priorTransportReceiptDigest"] != nil || value["sealedJournalRecordDigest"] != nil {
			return ErrConflict
		}
	case "expired-owner-takeover":
		if request.ExpectedDispatchGeneration < 1 || request.ExpectedPriorClaimExpiresAt == nil ||
			request.RequestedAt.Before(*request.ExpectedPriorClaimExpiresAt) ||
			dispatchGeneration != request.ExpectedDispatchGeneration+1 ||
			dispatchLedgerRevision != request.ExpectedDispatchLedgerRevision+1 ||
			deliveryDisposition != "reconcile-only-replay" || value["sealedJournalRecordDigest"] != nil {
			return ErrConflict
		}
	case "generation-retained":
		if dispatchGeneration != request.ExpectedDispatchGeneration ||
			dispatchLedgerRevision != request.ExpectedDispatchLedgerRevision ||
			deliveryDisposition == "dispatch-authorized-first-delivery" ||
			(deliveryDisposition == "sealed-read-only" &&
				(value["priorTransportReceiptDigest"] == nil || value["sealedJournalRecordDigest"] == nil)) ||
			(deliveryDisposition == "reconcile-only-replay" && value["sealedJournalRecordDigest"] != nil) {
			return ErrConflict
		}
	}
	return nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err error) error {
	var postgresError *pgconn.PgError
	if errors.As(err, &postgresError) && oneOfString(postgresError.Code, "23505", "23514", "40001") {
		return ErrConflict
	}
	return err
}

func storeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentTx(
	ctx context.Context,
	tx *sql.Tx,
	intent evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
) (bool, error) {
	var existing []byte
	err := tx.QueryRowContext(ctx, `SELECT intent_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents
		WHERE namespace_id=$1 AND intent_digest=$2 FOR UPDATE`, intent.NamespaceID, intent.IntentDigest).Scan(&existing)
	if err == nil {
		if !bytes.Equal(existing, intent.Canonical) {
			return false, ErrConflict
		}
		return true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents (
		namespace_id,plan_digest,repository_commit,runtime_resource_set_id,registration_request_digest,
		authority_digest,lifecycle_claim_receipt_digest,intent_id,intent_digest,protocol_family,
		capability_profile_id,budget_reservation_id,budget_reservation_authority_digest,operation,
		mutation_kind,mutation_sequence,created_at,intent_json,intent_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::jsonb,$19,TRUE)`,
		intent.NamespaceID, intent.PlanDigest, intent.RepositoryCommit, intent.RuntimeResourceSetID,
		intent.RegistrationRequestDigest, evaluationHostedNullableString(intent.AuthorityDigest),
		evaluationHostedNullableString(intent.LifecycleClaimReceiptDigest), intent.IntentID, intent.IntentDigest,
		intent.ProtocolFamily, intent.CapabilityProfileID, intent.BudgetReservationID,
		intent.BudgetReservationAuthorityDigest, intent.Operation, intent.MutationKind,
		intent.MutationSequence, intent.CreatedAt, string(intent.Canonical), intent.Canonical)
	if err != nil {
		return false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	return false, nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimCASTx(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	request evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest,
) error {
	var currentLedgerRevision, currentGeneration int64
	var currentReceiptDigest, currentOwnerInstanceID string
	var currentClaimExpiresAt time.Time
	var everDispatchAuthorized bool
	err := tx.QueryRowContext(ctx, `SELECT dispatch_ledger_revision,dispatch_generation,
		current_claim_receipt_digest,lifecycle_owner_instance_id,claim_expires_at,ever_dispatch_authorized
		FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_current
		WHERE namespace_id=$1 AND intent_digest=$2 FOR UPDATE`, namespaceID, request.DispatchIntentDigest).Scan(
		&currentLedgerRevision, &currentGeneration, &currentReceiptDigest, &currentOwnerInstanceID,
		&currentClaimExpiresAt, &everDispatchAuthorized,
	)
	if errors.Is(err, sql.ErrNoRows) {
		if request.ExpectedDispatchLedgerRevision != 0 || request.ExpectedDispatchGeneration != 0 ||
			request.ExpectedPriorStageClaimReceiptDigest != nil || request.ExpectedPriorClaimExpiresAt != nil {
			return ErrConflict
		}
		return nil
	}
	if err != nil {
		return err
	}
	priorReceiptDigest, priorReceiptOK := request.ExpectedPriorStageClaimReceiptDigest.(string)
	if !everDispatchAuthorized || request.ExpectedDispatchLedgerRevision != currentLedgerRevision ||
		request.ExpectedDispatchGeneration != currentGeneration || !priorReceiptOK ||
		priorReceiptDigest != currentReceiptDigest || request.ExpectedPriorClaimExpiresAt == nil ||
		!request.ExpectedPriorClaimExpiresAt.Equal(currentClaimExpiresAt) {
		return ErrConflict
	}
	// Owner replacement is legal only after the durable prior lease expires.
	// This contextual check complements the receipt shape validation and keeps
	// an unexpired generation-retained claim bound to its original instance.
	if request.RequestedAt.Before(currentClaimExpiresAt) &&
		request.LifecycleOwnerInstanceID != currentOwnerInstanceID {
		return ErrConflict
	}
	return nil
}

// StageAndClaimLifecycleDispatch persists the immutable intent and consumes
// the database-owned first-delivery fence in one serializable transaction.
// A caller can therefore never observe a provider-callable intent without its
// durable claim receipt, including after an acknowledgement loss.
func (owner *EvaluationHostedRetrievalRuntimeResource) StageAndClaimLifecycleDispatch(
	ctx context.Context,
	authority EvaluationAuthority,
	intent evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntent,
	request evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimRequest,
	requiredOperation string,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || owner.lifecycleOwnerInstanceID == "" ||
		intent.NamespaceID != authority.NamespaceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	if request.DispatchIntentDigest != intent.IntentDigest ||
		request.LifecycleOwnerInstanceID != owner.lifecycleOwnerInstanceID {
		return nil, false, ErrConflict
	}
	if requiredOperation != "" && (!oneOfString(requiredOperation, "create", "delete") || intent.Operation != requiredOperation) {
		return nil, false, ErrConflict
	}
	claimedAt := owner.clock().UTC().Truncate(time.Millisecond)
	claimExpiresAt := claimedAt.Add(evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimLifetime)
	if claimedAt.IsZero() || intent.CreatedAt.After(claimedAt) || claimedAt.Before(request.RequestedAt) ||
		claimExpiresAt.Before(request.MinimumClaimExpiresAt) {
		return nil, false, ErrConflict
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleDispatchImplementationDigest()
	if err != nil {
		return nil, false, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := owner.repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return nil, false, err
	}
	defer func() { _ = tx.Rollback() }()
	var existingIntent, existingRequest, existingReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT intent.intent_bytes,request.request_bytes,receipt.receipt_bytes
		FROM agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_requests request
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_claim_receipts receipt
		  ON receipt.namespace_id=request.namespace_id AND receipt.request_digest=request.request_digest
		JOIN agent_evaluation_hosted_retrieval_runtime_resource_lifecycle_dispatch_intents intent
		  ON intent.namespace_id=request.namespace_id AND intent.intent_digest=request.intent_digest
		WHERE request.namespace_id=$1 AND request.request_digest=$2 FOR SHARE`,
		authority.NamespaceID, request.RequestDigest).Scan(&existingIntent, &existingRequest, &existingReceipt)
	if err == nil {
		if !bytes.Equal(existingIntent, intent.Canonical) || !bytes.Equal(existingRequest, request.Canonical) {
			return nil, false, ErrConflict
		}
		if err := tx.Commit(); err != nil {
			return nil, false, err
		}
		return existingReceipt, true, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return nil, false, err
	}
	if _, err := storeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentTx(ctx, tx, intent); err != nil {
		return nil, false, err
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimCASTx(
		ctx, tx, authority.NamespaceID, request,
	); err != nil {
		return nil, false, err
	}
	var receiptJSON, receiptBytes []byte
	var receiptDigest, deliveryDisposition, generationTransition string
	var dispatchGeneration, dispatchLedgerRevision int64
	err = tx.QueryRowContext(ctx, `SELECT receipt_json,receipt_bytes,receipt_digest,delivery_disposition,generation_transition,
		dispatch_generation,dispatch_ledger_revision
		FROM claim_agent_evaluation_hosted_runtime_lifecycle_dispatch($1,$2,$3::jsonb,$4,$5,$6,$7,$8)`,
		authority.NamespaceID, request.DispatchIntentDigest, string(request.Canonical), request.Canonical,
		evaluationHostedRetrievalRuntimeResourceLifecycleDispatchAuthorityIssuerID, implementationDigest,
		claimedAt, claimExpiresAt).Scan(&receiptJSON, &receiptBytes, &receiptDigest, &deliveryDisposition, &generationTransition,
		&dispatchGeneration, &dispatchLedgerRevision)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	canonicalReceiptJSON, err := decodeCanonicalEvaluationObject(receiptJSON, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes)
	if err != nil {
		return nil, false, ErrConflict
	}
	canonicalReceiptBytes, err := canonicaljson.Bytes(canonicalReceiptJSON)
	if err != nil || !bytes.Equal(canonicalReceiptBytes, receiptBytes) ||
		validateEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimReceipt(
			receiptBytes, request, receiptDigest, deliveryDisposition, generationTransition,
			dispatchGeneration, dispatchLedgerRevision,
		) != nil {
		return nil, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	return receiptBytes, false, nil
}
