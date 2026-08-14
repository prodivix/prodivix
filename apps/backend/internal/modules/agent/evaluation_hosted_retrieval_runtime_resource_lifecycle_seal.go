package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationHostedRetrievalRuntimeResourceLifecycleSealRequestFormat             = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleSealReceiptFormat             = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-receipt"
	evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResultFormat          = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-business-result"
	evaluationHostedRetrievalRuntimeResourceLifecycleSpoolDispositionReceiptFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-result-spool-disposition-receipt"
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationRequestFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-request"
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReceiptFormat   = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-receipt"
	evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationSetFormat       = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-reconciliation-observation-receipt-set"
	evaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjectionFormat = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-budget-closure-projection"
	evaluationHostedRetrievalRuntimeResourceLifecycleSealAuthorityIssuerID         = "authority.prodivix.hosted-retrieval-runtime-resource-lifecycle-seal"
	evaluationHostedRetrievalRuntimeResourceLifecycleSealImplementationFormat      = "prodivix.agent-evaluation-hosted-retrieval-runtime-resource-lifecycle-seal-implementation"
)

var evaluationHostedRetrievalRuntimeResourceLifecycleSealRequestKeys = []string{
	"format", "version", "purpose", "journalRecord", "transportStoreReceiptHistory", "spoolDispositionReceipt", "requestDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleSealReceiptKeys = []string{
	"format", "version", "requestDigest", "sealAuthorityIssuerId", "sealAuthorityImplementationDigest",
	"sealLedgerRevision", "journalRecordDigest", "transportStoreReceiptHistoryDigest", "spoolDispositionReceiptDigest", "archiveRecordDigest",
	"sealedAt", "receiptDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResultKeys = []string{
	"format", "version", "operation", "providerResourceId", "auxiliaryResourceIds", "resourceManifestDigest",
	"resourceId", "resourceRole", "reconciliationObservationReceiptSet",
	"reconciliationObservationReceiptSetDigest", "outcome", "completedAt", "resultDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleSpoolDispositionReceiptKeys = []string{
	"format", "version", "spoolRef", "spoolReceiptDigest", "operation", "registrationRequestDigest",
	"authorityDigest", "lifecycleClaimReceiptDigest", "disposition", "businessSealKind",
	"businessSealReceiptDigest", "encryptionState", "envelopeDigest", "ciphertextDigest",
	"retentionPolicyDigest", "createdAt", "retainedUntil", "disposedAt", "receiptDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationSetKeys = []string{
	"format", "version", "operation", "registrationRequestDigest", "receipts", "receiptDigests", "setDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReceiptKeys = []string{
	"format", "version", "request", "requestDigest", "observationAuthorityIssuerId",
	"observationAuthorityImplementationDigest", "dispatchIntentDigest", "transportReceiptDigest",
	"mutationKind", "dispatchStageClaimReceiptDigest", "mutationSequence", "observationOutcome",
	"resourceId", "resourceRole", "resourceManifestDigest", "httpStatus", "providerRequestId",
	"observedAt", "receiptDigest",
}

var evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationRequestKeys = []string{
	"format", "version", "purpose", "dispatchIntentDigest", "dispatchStageClaimReceiptDigest",
	"transportReceiptDigest", "mutationKind", "mutationSequence", "providerConfigurationId", "endpointId",
	"method", "requestedAt", "requestDigest",
}

type evaluationHostedRetrievalRuntimeResourceLifecycleObservation struct {
	TransportReceiptDigest string
	ClaimReceiptDigest     string
	MutationKind           string
	MutationSequence       int64
	Outcome                string
	ResourceID             string
	ResourceRole           string
	ManifestDigest         string
	HTTPStatus             int64
	ObservedAt             time.Time
}

type evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult struct {
	Operation          string
	ProviderResourceID string
	AuxiliaryIDs       []string
	ManifestDigest     string
	ResourceID         string
	ResourceRole       string
	Outcome            string
	CompletedAt        time.Time
	ResultDigest       string
	Observations       map[string]evaluationHostedRetrievalRuntimeResourceLifecycleObservation
	Value              map[string]any
	Canonical          []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord struct {
	IntentSet         evaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet
	InitialClaimSet   evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet
	ClaimHistorySet   evaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet
	TransportSet      evaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet
	BusinessResult    evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult
	SpoolReceipt      map[string]any
	SpoolReceiptBytes []byte
	Disposition       map[string]any
	DispositionBytes  []byte
	AuthorityDigest   any
	LifecycleClaim    any
	RecordDigest      string
	Value             map[string]any
	Canonical         []byte
}

type evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest struct {
	Journal                     evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord
	TransportStoreHistory       map[string]any
	TransportStoreHistoryBytes  []byte
	TransportStoreHistoryDigest string
	Disposition                 map[string]any
	DispositionBytes            []byte
	RequestDigest               string
	Value                       map[string]any
	Canonical                   []byte
}

func evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(value any) string {
	if value == nil {
		return ""
	}
	text, _ := value.(string)
	return text
}

func evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationSet(
	value any,
	operation string,
	registrationRequestDigest string,
) (map[string]evaluationHostedRetrievalRuntimeResourceLifecycleObservation, string, error) {
	if value == nil {
		return nil, "", nil
	}
	set, ok := value.(map[string]any)
	if !ok || !exactEvaluationKeys(set, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationSetKeys) ||
		stringMember(set, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationSetFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(set) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(set, "setDigest") ||
		stringMember(set, "operation") != operation ||
		stringMember(set, "registrationRequestDigest") != registrationRequestDigest {
		return nil, "", ErrInvalid
	}
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(set, 65_536)
	if err != nil || len(canonical) == 0 {
		return nil, "", ErrInvalid
	}
	rawReceipts, receiptsOK := arrayMember(set, "receipts")
	digests, digestsOK := evaluationHostedRetrievalRuntimeResourceLifecycleDigestArray(set["receiptDigests"], 4)
	if !receiptsOK || !digestsOK || len(rawReceipts) < 1 || len(rawReceipts) != len(digests) {
		return nil, "", ErrInvalid
	}
	observations := make(map[string]evaluationHostedRetrievalRuntimeResourceLifecycleObservation, len(rawReceipts))
	previousSequence := int64(-1)
	for index, raw := range rawReceipts {
		receipt, receiptOK := raw.(map[string]any)
		request, requestOK := objectMember(receipt, "request")
		sequence, sequenceOK := integerMember(receipt, "mutationSequence")
		httpStatus, statusOK := integerMember(receipt, "httpStatus")
		observedAt, observedErr := evaluationInstant(receipt["observedAt"], "observedAt")
		requestedAt, requestedErr := evaluationInstant(request["requestedAt"], "requestedAt")
		if !receiptOK || !requestOK || !sequenceOK || !statusOK || sequence < 0 || sequence > 3 ||
			sequence <= previousSequence || observedErr != nil || requestedErr != nil || observedAt.Before(requestedAt) ||
			!exactEvaluationKeys(receipt, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReceiptKeys) ||
			!exactEvaluationKeys(request, evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationRequestKeys) ||
			stringMember(receipt, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReceiptFormat ||
			stringMember(request, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationRequestFormat ||
			!evaluationHostedRetrievalRuntimeResourceVersionOne(receipt) ||
			!evaluationHostedRetrievalRuntimeResourceVersionOne(request) ||
			!evaluationHostedRetrievalRuntimeResourceSelfDigest(receipt, "receiptDigest") ||
			!evaluationHostedRetrievalRuntimeResourceSelfDigest(request, "requestDigest") ||
			stringMember(receipt, "receiptDigest") != digests[index] ||
			stringMember(receipt, "requestDigest") != stringMember(request, "requestDigest") ||
			stringMember(request, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationReadPurpose ||
			stringMember(request, "method") != "GET" ||
			stringMember(receipt, "dispatchIntentDigest") != stringMember(request, "dispatchIntentDigest") ||
			stringMember(receipt, "dispatchStageClaimReceiptDigest") != stringMember(request, "dispatchStageClaimReceiptDigest") ||
			stringMember(receipt, "transportReceiptDigest") != stringMember(request, "transportReceiptDigest") ||
			stringMember(receipt, "mutationKind") != stringMember(request, "mutationKind") ||
			sequence != func() int64 { v, _ := integerMember(request, "mutationSequence"); return v }() ||
			!oneOfString(stringMember(receipt, "observationOutcome"), "accepted", "already-absent", "created", "deleted", "uploaded") ||
			!validEvaluationAgentControlIdentity(stringMember(receipt, "observationAuthorityIssuerId")) ||
			!evaluationDigestPattern.MatchString(stringMember(receipt, "observationAuthorityImplementationDigest")) {
			return nil, "", ErrInvalid
		}
		transportDigest := stringMember(receipt, "transportReceiptDigest")
		if _, duplicate := observations[transportDigest]; duplicate {
			return nil, "", ErrInvalid
		}
		resourceID := evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(receipt["resourceId"])
		resourceRole := evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(receipt["resourceRole"])
		manifest := evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(receipt["resourceManifestDigest"])
		if (resourceID != "" && !validEvaluationAgentControlIdentity(resourceID)) ||
			!oneOfString(resourceRole, "", "auxiliary", "primary") ||
			(manifest != "" && !evaluationDigestPattern.MatchString(manifest)) ||
			httpStatus < 100 || httpStatus > 599 {
			return nil, "", ErrInvalid
		}
		observations[transportDigest] = evaluationHostedRetrievalRuntimeResourceLifecycleObservation{
			TransportReceiptDigest: transportDigest,
			ClaimReceiptDigest:     stringMember(receipt, "dispatchStageClaimReceiptDigest"),
			MutationKind:           stringMember(receipt, "mutationKind"),
			MutationSequence:       sequence,
			Outcome:                stringMember(receipt, "observationOutcome"),
			ResourceID:             resourceID,
			ResourceRole:           resourceRole,
			ManifestDigest:         manifest,
			HTTPStatus:             httpStatus,
			ObservedAt:             observedAt,
		}
		previousSequence = sequence
	}
	return observations, stringMember(set, "setDigest"), nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult(
	value map[string]any,
	operation string,
	registrationRequestDigest string,
) (evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	completedAt, completedErr := evaluationInstant(value["completedAt"], "completedAt")
	if err != nil || completedErr != nil ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResultKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResultFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "resultDigest") ||
		stringMember(value, "operation") != operation || completedAt.IsZero() {
		return evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult{}, ErrInvalid
	}
	auxiliaryIDs, auxiliaryOK := evaluationHostedArchiveStringArray(value["auxiliaryResourceIds"])
	if !auxiliaryOK || len(auxiliaryIDs) > 20 ||
		!evaluationHostedArchiveCanonicalAuxiliaryIDs(value["auxiliaryResourceIds"], evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(value["providerResourceId"])) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult{}, ErrInvalid
	}
	observations, observationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleReconciliationSet(
		value["reconciliationObservationReceiptSet"], operation, registrationRequestDigest,
	)
	declaredObservationDigest := evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(value["reconciliationObservationReceiptSetDigest"])
	if err != nil || observationDigest != declaredObservationDigest ||
		(value["reconciliationObservationReceiptSet"] == nil) != (value["reconciliationObservationReceiptSetDigest"] == nil) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult{}, ErrInvalid
	}
	providerResourceID := evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(value["providerResourceId"])
	manifest := evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(value["resourceManifestDigest"])
	resourceID := evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(value["resourceId"])
	resourceRole := evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(value["resourceRole"])
	outcome := stringMember(value, "outcome")
	if (providerResourceID != "" && !validEvaluationAgentControlIdentity(providerResourceID)) ||
		(manifest != "" && !evaluationDigestPattern.MatchString(manifest)) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult{}, ErrInvalid
	}
	if operation == "create" {
		if resourceID != "" || resourceRole != "" ||
			!oneOfString(outcome, "abandoned-before-provider-effect", "created-and-uploaded", "partial-create-requires-cleanup") ||
			(outcome == "created-and-uploaded" && (providerResourceID == "" || manifest == "")) ||
			(outcome == "partial-create-requires-cleanup" && providerResourceID == "" && len(auxiliaryIDs) == 0) ||
			(outcome == "abandoned-before-provider-effect" && (providerResourceID != "" || len(auxiliaryIDs) != 0 || manifest != "")) {
			return evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult{}, ErrInvalid
		}
	} else if providerResourceID != "" || len(auxiliaryIDs) != 0 || manifest != "" ||
		!validEvaluationAgentControlIdentity(resourceID) || !oneOfString(resourceRole, "auxiliary", "primary") ||
		!oneOfString(outcome, "already-absent", "deleted") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult{
		Operation: operation, ProviderResourceID: providerResourceID, AuxiliaryIDs: auxiliaryIDs,
		ManifestDigest: manifest, ResourceID: resourceID, ResourceRole: resourceRole, Outcome: outcome,
		CompletedAt: completedAt, ResultDigest: stringMember(value, "resultDigest"), Observations: observations,
		Value: value, Canonical: canonical,
	}, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptForJournal(
	value map[string]any,
) ([]byte, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(value, 65_536)
	createdAt, createdErr := evaluationInstant(value["createdAt"], "createdAt")
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "expiresAt")
	if err != nil || createdErr != nil || expiresErr != nil || !createdAt.Before(expiresAt) ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		!validEvaluationAgentControlIdentity(stringMember(value, "spoolRef")) ||
		!oneOfString(stringMember(value, "operation"), "create", "delete") {
		return nil, ErrInvalid
	}
	return canonical, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolDispositionForJournal(
	value map[string]any,
	spool map[string]any,
	business evaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult,
) ([]byte, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(value, 65_536)
	createdAt, createdErr := evaluationInstant(value["createdAt"], "createdAt")
	retainedUntil, retainedErr := evaluationInstant(value["retainedUntil"], "retainedUntil")
	disposedAt, disposedErr := evaluationInstant(value["disposedAt"], "disposedAt")
	if err != nil || createdErr != nil || retainedErr != nil || disposedErr != nil ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleSpoolDispositionReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleSpoolDispositionReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		stringMember(value, "disposition") != "destroyed-after-business-seal" ||
		stringMember(value, "encryptionState") != "destroyed" ||
		stringMember(value, "businessSealReceiptDigest") != business.ResultDigest ||
		stringMember(value, "spoolRef") != stringMember(spool, "spoolRef") ||
		stringMember(value, "spoolReceiptDigest") != stringMember(spool, "receiptDigest") ||
		stringMember(value, "operation") != business.Operation ||
		stringMember(value, "registrationRequestDigest") != stringMember(spool, "registrationRequestDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value["authorityDigest"], spool["authorityDigest"]) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value["lifecycleClaimReceiptDigest"], spool["lifecycleClaimReceiptDigest"]) ||
		stringMember(value, "envelopeDigest") != stringMember(spool, "envelopeDigest") ||
		stringMember(value, "ciphertextDigest") != stringMember(spool, "ciphertextDigest") ||
		stringMember(value, "retentionPolicyDigest") != stringMember(spool, "retentionPolicyDigest") ||
		!createdAt.Equal(func() time.Time { parsed, _ := evaluationInstant(spool["createdAt"], "createdAt"); return parsed }()) ||
		!retainedUntil.Equal(func() time.Time { parsed, _ := evaluationInstant(spool["expiresAt"], "expiresAt"); return parsed }()) ||
		disposedAt.Before(createdAt) || !disposedAt.Before(retainedUntil) {
		return nil, ErrInvalid
	}
	expectedKind := "cleanup-result"
	if business.Operation == "create" {
		switch business.Outcome {
		case "abandoned-before-provider-effect":
			expectedKind = "abandoned-before-provider-effect"
		case "created-and-uploaded":
			expectedKind = "registration-result"
		case "partial-create-requires-cleanup":
			expectedKind = "partial-create-result"
		}
	}
	if stringMember(value, "businessSealKind") != expectedKind {
		return nil, ErrInvalid
	}
	return canonical, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleJournalTransportSemantics(
	journal evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord,
) error {
	knownPrimaryIDs := make(map[string]struct{}, 1)
	knownAuxiliaryIDs := make(map[string]struct{}, 4)
	knownManifests := make(map[string]struct{}, 1)
	unknownCount := 0
	latest := time.Time{}
	for index, receipt := range journal.TransportSet.Receipts {
		if latest.Before(receipt.CompletedAt) {
			latest = receipt.CompletedAt
		}
		intent := journal.IntentSet.Intents[index]
		projection, projectionOK := objectMember(receipt.Value, "responseProjection")
		observation, observed := journal.BusinessResult.Observations[receipt.ReceiptDigest]
		if receipt.Outcome == "post-dispatch-unknown" {
			unknownCount++
			if !observed || observation.MutationKind != intent.MutationKind ||
				observation.MutationSequence != intent.MutationSequence || observation.ObservedAt.Before(receipt.CompletedAt) {
				return ErrInvalid
			}
			claimKnown := false
			claimCount := 0
			for _, claim := range journal.ClaimHistorySet.Receipts {
				if claim.DispatchIntentDigest == intent.IntentDigest {
					claimCount++
					if claim.ReceiptDigest == observation.ClaimReceiptDigest &&
						stringMember(claim.Value, "deliveryDisposition") == "reconcile-only-replay" {
						claimKnown = true
					}
				}
			}
			if claimCount < 2 || !claimKnown {
				return ErrInvalid
			}
			if latest.Before(observation.ObservedAt) {
				latest = observation.ObservedAt
			}
		} else if observed {
			return ErrInvalid
		}
		resourceID := ""
		resourceRole := ""
		manifest := ""
		if observed {
			resourceID, resourceRole, manifest = observation.ResourceID, observation.ResourceRole, observation.ManifestDigest
		} else if projectionOK && receipt.Outcome == "completed" {
			resourceID = evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(projection["resourceId"])
			resourceRole = evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(projection["resourceRole"])
			manifest = evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(projection["resourceManifestDigest"])
		}
		if resourceID != "" {
			switch resourceRole {
			case "primary":
				knownPrimaryIDs[resourceID] = struct{}{}
			case "auxiliary":
				knownAuxiliaryIDs[resourceID] = struct{}{}
			default:
				return ErrInvalid
			}
		}
		if manifest != "" {
			knownManifests[manifest] = struct{}{}
		}
	}
	if unknownCount != len(journal.BusinessResult.Observations) ||
		!journal.BusinessResult.CompletedAt.Equal(latest) || len(knownPrimaryIDs) > 1 || len(knownManifests) > 1 {
		return ErrInvalid
	}
	primaryID := ""
	for value := range knownPrimaryIDs {
		primaryID = value
	}
	manifest := ""
	for value := range knownManifests {
		manifest = value
	}
	auxiliaryIDs := make([]string, 0, len(knownAuxiliaryIDs))
	for value := range knownAuxiliaryIDs {
		auxiliaryIDs = append(auxiliaryIDs, value)
	}
	sort.Strings(auxiliaryIDs)
	if journal.BusinessResult.ProviderResourceID != primaryID ||
		journal.BusinessResult.ManifestDigest != manifest ||
		len(auxiliaryIDs) != len(journal.BusinessResult.AuxiliaryIDs) {
		return ErrInvalid
	}
	for index := range auxiliaryIDs {
		if auxiliaryIDs[index] != journal.BusinessResult.AuxiliaryIDs[index] {
			return ErrInvalid
		}
	}
	if journal.IntentSet.Operation == "delete" {
		if len(journal.TransportSet.Receipts) != 1 {
			return ErrInvalid
		}
		receipt := journal.TransportSet.Receipts[0]
		projection, projectionOK := objectMember(receipt.Value, "responseProjection")
		outcome := ""
		resourceID := ""
		resourceRole := ""
		httpStatus := int64(0)
		if observation, observed := journal.BusinessResult.Observations[receipt.ReceiptDigest]; observed {
			outcome, resourceID, resourceRole, httpStatus = observation.Outcome, observation.ResourceID, observation.ResourceRole, observation.HTTPStatus
		} else if projectionOK {
			outcome = stringMember(projection, "outcome")
			resourceID = evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(projection["resourceId"])
			resourceRole = evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(projection["resourceRole"])
			httpStatus, _ = integerMember(projection, "httpStatus")
		}
		if receipt.DispatchState != "dispatched" || resourceID != journal.BusinessResult.ResourceID ||
			resourceRole != journal.BusinessResult.ResourceRole || outcome != journal.BusinessResult.Outcome ||
			(outcome == "already-absent" && httpStatus != 404) ||
			(outcome == "deleted" && (httpStatus < 200 || httpStatus > 299)) {
			return ErrInvalid
		}
		return nil
	}
	switch journal.BusinessResult.Outcome {
	case "abandoned-before-provider-effect":
		for _, receipt := range journal.TransportSet.Receipts {
			if receipt.DispatchState != "not-dispatched" {
				return ErrInvalid
			}
		}
	case "created-and-uploaded":
		if primaryID == "" || manifest == "" {
			return ErrInvalid
		}
		for _, receipt := range journal.TransportSet.Receipts {
			if receipt.DispatchState != "dispatched" ||
				(receipt.Outcome != "completed" && journal.BusinessResult.Observations[receipt.ReceiptDigest].TransportReceiptDigest == "") {
				return ErrInvalid
			}
		}
	case "partial-create-requires-cleanup":
		if primaryID == "" && len(auxiliaryIDs) == 0 {
			return ErrInvalid
		}
	default:
		return ErrInvalid
	}
	return nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord(
	value map[string]any,
) (evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord, error) {
	canonical, err := evaluationHostedRetrievalRuntimeResourceLifecycleNestedBytes(
		value, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordBytes,
	)
	if err != nil || !exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecordFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "recordDigest") ||
		!oneOfString(stringMember(value, "operation"), "create", "delete") ||
		!evaluationDigestPattern.MatchString(stringMember(value, "registrationRequestDigest")) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "authorityDigest") ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableDigest(value, "lifecycleClaimReceiptDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	intentValue, intentOK := objectMember(value, "dispatchIntentSet")
	claimValue, claimOK := objectMember(value, "dispatchStageClaimReceiptSet")
	historyValue, historyOK := objectMember(value, "dispatchStageClaimHistorySet")
	transportValue, transportOK := objectMember(value, "transportReceiptSet")
	businessValue, businessOK := objectMember(value, "businessResult")
	spoolValue, spoolOK := objectMember(value, "resultSpoolReceipt")
	dispositionValue, dispositionOK := objectMember(value, "resultSpoolDispositionReceipt")
	if !intentOK || !claimOK || !historyOK || !transportOK || !businessOK || !spoolOK || !dispositionOK {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	intentSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchIntentSet(intentValue)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	claimSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimSet(claimValue, intentSet)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	historySet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleDispatchClaimHistorySet(historyValue, intentSet, claimSet)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	transportSet, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportReceiptSet(transportValue, intentSet, claimSet)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	business, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleBusinessResult(
		businessValue, intentSet.Operation, intentSet.RegistrationRequestDigest,
	)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	spoolBytes, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolReceiptForJournal(spoolValue)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	dispositionBytes, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleSpoolDispositionForJournal(
		dispositionValue, spoolValue, business,
	)
	if err != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	first := intentSet.Intents[0]
	if stringMember(value, "operation") != intentSet.Operation ||
		stringMember(value, "registrationRequestDigest") != intentSet.RegistrationRequestDigest ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value["authorityDigest"], first.AuthorityDigest) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(value["lifecycleClaimReceiptDigest"], intentSet.LifecycleClaimReceiptDigest) ||
		stringMember(value, "dispatchIntentSetDigest") != intentSet.SetDigest ||
		stringMember(value, "dispatchStageClaimReceiptSetDigest") != claimSet.SetDigest ||
		stringMember(value, "dispatchStageClaimHistorySetDigest") != historySet.SetDigest ||
		stringMember(value, "transportReceiptSetDigest") != transportSet.SetDigest ||
		stringMember(value, "businessResultDigest") != business.ResultDigest ||
		stringMember(value, "resultSpoolReceiptDigest") != stringMember(spoolValue, "receiptDigest") ||
		stringMember(value, "resultSpoolDispositionReceiptDigest") != stringMember(dispositionValue, "receiptDigest") ||
		stringMember(spoolValue, "namespaceId") != first.NamespaceID ||
		stringMember(spoolValue, "repositoryCommit") != first.RepositoryCommit ||
		stringMember(spoolValue, "planDigest") != first.PlanDigest ||
		stringMember(spoolValue, "frozenRunDigest") != first.FrozenRunDigest ||
		stringMember(spoolValue, "runConfigArtifactBindingDigest") != first.RunConfigArtifactBindingDigest ||
		stringMember(spoolValue, "runtimeResourceSetId") != first.RuntimeResourceSetID ||
		stringMember(spoolValue, "registrationRequestDigest") != intentSet.RegistrationRequestDigest ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(spoolValue["authorityDigest"], first.AuthorityDigest) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleNullableEqual(spoolValue["lifecycleClaimReceiptDigest"], intentSet.LifecycleClaimReceiptDigest) ||
		stringMember(spoolValue, "dispatchIntentSetDigest") != intentSet.SetDigest ||
		stringMember(spoolValue, "dispatchStageClaimReceiptSetDigest") != claimSet.SetDigest ||
		stringMember(spoolValue, "transportReceiptSetDigest") != transportSet.SetDigest ||
		stringMember(spoolValue, "businessResultDigest") != business.ResultDigest ||
		evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(spoolValue["resourceId"]) != business.ResourceID ||
		evaluationHostedRetrievalRuntimeResourceLifecycleNullableText(spoolValue["resourceRole"]) != business.ResourceRole {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	journal := evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{
		IntentSet: intentSet, InitialClaimSet: claimSet, ClaimHistorySet: historySet,
		TransportSet: transportSet, BusinessResult: business, SpoolReceipt: spoolValue,
		SpoolReceiptBytes: spoolBytes, Disposition: dispositionValue, DispositionBytes: dispositionBytes,
		AuthorityDigest: value["authorityDigest"], LifecycleClaim: value["lifecycleClaimReceiptDigest"],
		RecordDigest: stringMember(value, "recordDigest"), Value: value, Canonical: canonical,
	}
	if evaluationHostedRetrievalRuntimeResourceLifecycleJournalTransportSemantics(journal) != nil {
		return evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord{}, ErrInvalid
	}
	return journal, nil
}

func decodeEvaluationHostedRetrievalRuntimeResourceLifecycleSealRequest(
	source []byte,
) (evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest, error) {
	value, canonical, err := decodeEvaluationJSONObject(
		source, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	if err != nil || !bytes.Equal(source, canonical) ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleSealRequestKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleSealRequestFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		stringMember(value, "purpose") != evaluationHostedRetrievalRuntimeResourceLifecycleSealPurpose ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "requestDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest{}, ErrInvalid
	}
	journalValue, journalOK := objectMember(value, "journalRecord")
	transportHistoryValue, transportHistoryOK := objectMember(value, "transportStoreReceiptHistory")
	dispositionValue, dispositionOK := objectMember(value, "spoolDispositionReceipt")
	if !journalOK || !transportHistoryOK || !dispositionOK {
		return evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest{}, ErrInvalid
	}
	journal, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord(journalValue)
	if err != nil || !sameEvaluationCanonicalValue(dispositionValue, journal.Disposition) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest{}, ErrInvalid
	}
	dispositionBytes, err := canonicaljson.Bytes(dispositionValue)
	if err != nil || !bytes.Equal(dispositionBytes, journal.DispositionBytes) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest{}, ErrInvalid
	}
	transportHistoryBytes, err := canonicaljson.Bytes(transportHistoryValue)
	if err != nil || !exactEvaluationKeys(
		transportHistoryValue, evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistoryKeys,
	) || stringMember(transportHistoryValue, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistoryFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(transportHistoryValue) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(transportHistoryValue, "historyDigest") ||
		stringMember(transportHistoryValue, "operation") != journal.IntentSet.Operation ||
		stringMember(transportHistoryValue, "registrationRequestDigest") != journal.IntentSet.RegistrationRequestDigest {
		return evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest{}, ErrInvalid
	}
	receipts, receiptsOK := arrayMember(transportHistoryValue, "receipts")
	digests, digestsOK := evaluationHostedRetrievalRuntimeResourceLifecycleDigestArray(
		transportHistoryValue["receiptDigests"], maximumEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreHistory,
	)
	if !receiptsOK || !digestsOK || len(receipts) < 1 || len(receipts) != len(digests) {
		return evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest{}, ErrInvalid
	}
	latest, latestOK := receipts[len(receipts)-1].(map[string]any)
	if !latestOK || stringMember(latest, "receiptDigest") != digests[len(digests)-1] ||
		stringMember(latest, "dispatchIntentSetDigest") != journal.IntentSet.SetDigest ||
		stringMember(latest, "dispatchStageClaimReceiptSetDigest") != journal.InitialClaimSet.SetDigest ||
		stringMember(latest, "dispatchStageClaimHistorySetDigest") != journal.ClaimHistorySet.SetDigest ||
		stringMember(latest, "transportReceiptSetDigest") != journal.TransportSet.SetDigest ||
		stringMember(latest, "spoolReceiptDigest") != stringMember(journal.SpoolReceipt, "receiptDigest") ||
		stringMember(latest, "spoolAadDigest") != stringMember(journal.SpoolReceipt, "aadDigest") ||
		stringMember(latest, "spoolEnvelopeDigest") != stringMember(journal.SpoolReceipt, "envelopeDigest") {
		return evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest{}, ErrInvalid
	}
	return evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest{
		Journal: journal, TransportStoreHistory: transportHistoryValue,
		TransportStoreHistoryBytes:  transportHistoryBytes,
		TransportStoreHistoryDigest: stringMember(transportHistoryValue, "historyDigest"),
		Disposition:                 dispositionValue, DispositionBytes: dispositionBytes,
		RequestDigest: stringMember(value, "requestDigest"), Value: value, Canonical: canonical,
	}, nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleSealImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":                evaluationHostedRetrievalRuntimeResourceLifecycleSealImplementationFormat,
		"version":               int64(1),
		"sealAuthorityIssuerId": evaluationHostedRetrievalRuntimeResourceLifecycleSealAuthorityIssuerID,
	})
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleSealReceipt(
	receiptBytes []byte,
	request evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest,
	receiptDigest string,
	archiveRecordDigest string,
	ledgerRevision int64,
) error {
	value, err := decodeCanonicalEvaluationObject(
		receiptBytes, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	implementationDigest, implementationErr := evaluationHostedRetrievalRuntimeResourceLifecycleSealImplementationDigest()
	sealedAt, sealedErr := evaluationInstant(value["sealedAt"], "sealedAt")
	revision, revisionOK := integerMember(value, "sealLedgerRevision")
	if err != nil || implementationErr != nil || sealedErr != nil ||
		!exactEvaluationKeys(value, evaluationHostedRetrievalRuntimeResourceLifecycleSealReceiptKeys) ||
		stringMember(value, "format") != evaluationHostedRetrievalRuntimeResourceLifecycleSealReceiptFormat ||
		!evaluationHostedRetrievalRuntimeResourceVersionOne(value) ||
		!evaluationHostedRetrievalRuntimeResourceSelfDigest(value, "receiptDigest") ||
		stringMember(value, "receiptDigest") != receiptDigest ||
		stringMember(value, "requestDigest") != request.RequestDigest ||
		stringMember(value, "sealAuthorityIssuerId") != evaluationHostedRetrievalRuntimeResourceLifecycleSealAuthorityIssuerID ||
		stringMember(value, "sealAuthorityImplementationDigest") != implementationDigest ||
		!revisionOK || revision != ledgerRevision || revision < 1 ||
		stringMember(value, "journalRecordDigest") != request.Journal.RecordDigest ||
		stringMember(value, "transportStoreReceiptHistoryDigest") != request.TransportStoreHistoryDigest ||
		stringMember(value, "spoolDispositionReceiptDigest") != stringMember(request.Disposition, "receiptDigest") ||
		stringMember(value, "archiveRecordDigest") != archiveRecordDigest ||
		sealedAt.Before(request.Journal.BusinessResult.CompletedAt) {
		return ErrConflict
	}
	return nil
}

func evaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjectionTx(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	journal evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord,
) (map[string]any, string, error) {
	first := journal.IntentSet.Intents[0]
	if journal.IntentSet.Operation == "delete" {
		var projectionDigest string
		err := tx.QueryRowContext(ctx, `SELECT budget_closure_projection_digest
			FROM ae_hrrr_lifecycle_journal_archives
			WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			  AND runtime_resource_set_id=$4 AND registration_request_digest=$5
			  AND operation='create' AND v46_eligible FOR SHARE`,
			namespaceID, first.PlanDigest, first.RepositoryCommit, first.RuntimeResourceSetID,
			first.RegistrationRequestDigest).Scan(&projectionDigest)
		if err != nil || !evaluationDigestPattern.MatchString(projectionDigest) {
			if err != nil {
				return nil, "", err
			}
			return nil, "", ErrConflict
		}
		return nil, projectionDigest, nil
	}
	var registrationRequestBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT request_bytes
		FROM ae_hrrr_registration_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND request_digest=$4
		  AND runtime_resource_set_id=$5 AND v46_eligible FOR SHARE`,
		namespaceID, first.PlanDigest, first.RepositoryCommit, first.RegistrationRequestDigest,
		first.RuntimeResourceSetID).Scan(&registrationRequestBytes); err != nil {
		return nil, "", err
	}
	registration, err := decodeCanonicalEvaluationObject(
		registrationRequestBytes, maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes,
	)
	budgetAuthority, budgetOK := objectMember(registration, "budgetReservationAuthority")
	if err != nil || !budgetOK || stringMember(registration, "namespaceId") != namespaceID ||
		stringMember(registration, "requestDigest") != first.RegistrationRequestDigest ||
		stringMember(registration, "frozenRunDigest") != first.FrozenRunDigest ||
		stringMember(registration, "runConfigArtifactBindingDigest") != first.RunConfigArtifactBindingDigest ||
		stringMember(registration, "registrationIntentDigest") != first.RegistrationIntentDigest ||
		stringMember(budgetAuthority, "reservationId") != first.BudgetReservationID ||
		stringMember(budgetAuthority, "authorityDigest") != first.BudgetReservationAuthorityDigest ||
		stringMember(registration, "budgetReservationAuthorityDigest") != first.BudgetReservationAuthorityDigest {
		return nil, "", ErrConflict
	}
	var reservationRevision int64
	var demandDigest, settlementDigest string
	var demandBytes, settlementBytes []byte
	var reservedAt, settledAt time.Time
	err = tx.QueryRowContext(ctx, `SELECT reservation.ledger_revision,reservation.demand_digest,
		reservation.demand_bytes,reservation.reserved_at,settlement.settlement_digest,
		settlement.settlement_bytes,settlement.settled_at
		FROM agent_evaluation_budget_reservations reservation
		JOIN agent_evaluation_budget_settlements settlement
		  ON settlement.namespace_id=reservation.namespace_id
		 AND settlement.plan_digest=reservation.plan_digest
		 AND settlement.reservation_id=reservation.reservation_id
		WHERE reservation.namespace_id=$1 AND reservation.plan_digest=$2
		  AND reservation.reservation_id=$3 FOR SHARE`,
		namespaceID, first.PlanDigest, first.BudgetReservationID).Scan(
		&reservationRevision, &demandDigest, &demandBytes, &reservedAt,
		&settlementDigest, &settlementBytes, &settledAt,
	)
	if err != nil {
		return nil, "", err
	}
	demand, err := decodeEvaluationBudgetDemand(demandBytes, true)
	if err != nil {
		return nil, "", ErrConflict
	}
	settlement, err := decodeEvaluationBudgetSettlement(settlementBytes, demand, reservedAt.UTC().Truncate(time.Millisecond))
	budgetRevision, budgetRevisionOK := integerMember(budgetAuthority, "ledgerRevision")
	budgetReservedAt, budgetTimeErr := evaluationInstant(budgetAuthority["reservedAt"], "reservedAt")
	if err != nil || !budgetRevisionOK || budgetTimeErr != nil ||
		reservationRevision != budgetRevision || demand.Digest != demandDigest || settlement.Digest != settlementDigest ||
		!reservedAt.UTC().Truncate(time.Millisecond).Equal(budgetReservedAt) ||
		!settledAt.UTC().Truncate(time.Millisecond).Equal(settlement.SettledAt) ||
		stringMember(budgetAuthority, "demandDigest") != demandDigest ||
		stringMember(budgetAuthority, "demandBytesDigest") != demandDigest ||
		!bytes.Equal(settlement.Actual.Canonical, demand.Canonical) ||
		!bytes.Equal(settlement.Charged.Canonical, demand.Canonical) {
		return nil, "", ErrConflict
	}
	demandValue, err := decodeCanonicalEvaluationObject(demand.Canonical, maximumEvaluationBudgetFactBytes)
	if err != nil {
		return nil, "", ErrConflict
	}
	settlementValue, err := decodeCanonicalEvaluationObject(settlement.Canonical, maximumEvaluationBudgetFactBytes)
	if err != nil {
		return nil, "", ErrConflict
	}
	closureKind := "settled"
	if settlement.RequiresReconciliation {
		closureKind = "reconciled"
	}
	base := map[string]any{
		"format":                           evaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjectionFormat,
		"version":                          int64(1),
		"budgetReservationAuthority":       budgetAuthority,
		"budgetReservationAuthorityDigest": first.BudgetReservationAuthorityDigest,
		"reservationId":                    first.BudgetReservationID,
		"ledgerRevision":                   reservationRevision,
		"demand":                           demandValue,
		"demandDigest":                     demandDigest,
		"demandBytesDigest":                demandDigest,
		"reservedAt":                       evaluationExportInstant(reservedAt),
		"closureKind":                      closureKind,
		"settlement":                       settlementValue,
		"settlementDigest":                 settlementDigest,
	}
	projectionDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, "", err
	}
	projection := cloneEvaluationObject(base)
	projection["projectionDigest"] = projectionDigest
	projectionBytes, err := canonicaljson.Bytes(projection)
	if err != nil || len(projectionBytes) > maximumEvaluationHostedRetrievalRuntimeResourceComponentBytes {
		return nil, "", ErrConflict
	}
	return projection, projectionDigest, nil
}

func validateEvaluationHostedRetrievalRuntimeResourceLifecycleSealHistoryTx(
	ctx context.Context,
	tx *sql.Tx,
	namespaceID string,
	ownerInstanceID string,
	journal evaluationHostedRetrievalRuntimeResourceLifecycleJournalRecord,
) error {
	for _, claim := range journal.ClaimHistorySet.Receipts {
		var stored []byte
		if err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
			FROM ae_hrrr_lifecycle_dispatch_claim_receipts
			WHERE namespace_id=$1 AND receipt_digest=$2 FOR SHARE`,
			namespaceID, claim.ReceiptDigest).Scan(&stored); err != nil {
			return err
		} else if !bytes.Equal(stored, claim.Canonical) {
			return ErrConflict
		}
	}
	for index, intent := range journal.IntentSet.Intents {
		var currentReceiptDigest, currentOwnerInstanceID string
		var priorTransportReceiptDigest, sealedRecordDigest sql.NullString
		if err := tx.QueryRowContext(ctx, `SELECT current_claim_receipt_digest,lifecycle_owner_instance_id,
			prior_transport_receipt_digest,sealed_journal_record_digest
			FROM ae_hrrr_lifecycle_dispatch_claim_current
			WHERE namespace_id=$1 AND intent_digest=$2 FOR UPDATE`, namespaceID, intent.IntentDigest).Scan(
			&currentReceiptDigest, &currentOwnerInstanceID, &priorTransportReceiptDigest, &sealedRecordDigest,
		); err != nil {
			return err
		}
		latest := ""
		for _, claim := range journal.ClaimHistorySet.Receipts {
			if claim.DispatchIntentDigest == intent.IntentDigest {
				latest = claim.ReceiptDigest
			}
		}
		if latest == "" || currentReceiptDigest != latest || currentOwnerInstanceID != ownerInstanceID ||
			!priorTransportReceiptDigest.Valid ||
			priorTransportReceiptDigest.String != journal.TransportSet.Receipts[index].ReceiptDigest ||
			sealedRecordDigest.Valid {
			return ErrConflict
		}
	}
	return nil
}

// SealLifecycleJournal is the only production path from an active encrypted
// lifecycle spool to an immutable v46 archive record. All mutations, including
// ciphertext zeroing and the signed acknowledgement, commit in one transaction.
func (owner *EvaluationHostedRetrievalRuntimeResource) SealLifecycleJournal(
	ctx context.Context,
	authority EvaluationAuthority,
	request evaluationHostedRetrievalRuntimeResourceLifecycleSealRequest,
) ([]byte, bool, error) {
	if owner == nil || owner.repository == nil || owner.repository.available() != nil ||
		validateEvaluationAuthority(authority) != nil || owner.lifecycleOwnerInstanceID == "" ||
		len(request.Journal.IntentSet.Intents) < 1 ||
		request.Journal.IntentSet.Intents[0].NamespaceID != authority.NamespaceID {
		return nil, false, errEvaluationServiceUnavailable
	}
	sealedAt := owner.clock().UTC().Truncate(time.Millisecond)
	disposedAt, disposedErr := evaluationInstant(request.Disposition["disposedAt"], "disposedAt")
	if sealedAt.IsZero() || disposedErr != nil || sealedAt.Before(disposedAt) ||
		sealedAt.Before(request.Journal.BusinessResult.CompletedAt) {
		return nil, false, ErrConflict
	}
	implementationDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleSealImplementationDigest()
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
	var existingRequest, existingReceipt []byte
	err = tx.QueryRowContext(ctx, `SELECT request_bytes,receipt_bytes
		FROM ae_hrrr_lifecycle_seal_receipts
		WHERE namespace_id=$1 AND request_digest=$2 FOR UPDATE`,
		authority.NamespaceID, request.RequestDigest).Scan(&existingRequest, &existingReceipt)
	if err == nil {
		if !bytes.Equal(existingRequest, request.Canonical) {
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
	var spoolState, storedTransportHistoryDigest string
	var storedSpoolReceiptBytes, storedTransportRequestBytes, storedTransportHistoryBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT state,spool_receipt_bytes,transport_store_request_bytes,
		transport_store_receipt_history_bytes,transport_store_receipt_history_digest
		FROM ae_hrrr_lifecycle_result_spools
		WHERE namespace_id=$1 AND spool_ref=$2 FOR UPDATE`, authority.NamespaceID,
		stringMember(request.Journal.SpoolReceipt, "spoolRef")).Scan(
		&spoolState, &storedSpoolReceiptBytes, &storedTransportRequestBytes,
		&storedTransportHistoryBytes, &storedTransportHistoryDigest,
	)
	if err != nil {
		return nil, false, err
	}
	storedTransport, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleTransportStoreRequest(storedTransportRequestBytes)
	if err != nil || spoolState != "active" ||
		!bytes.Equal(storedSpoolReceiptBytes, request.Journal.SpoolReceiptBytes) ||
		!bytes.Equal(storedTransportHistoryBytes, request.TransportStoreHistoryBytes) ||
		storedTransportHistoryDigest != request.TransportStoreHistoryDigest ||
		!bytes.Equal(storedTransport.DispatchIntentSet.Canonical, request.Journal.IntentSet.Canonical) ||
		!bytes.Equal(storedTransport.DispatchClaimSet.Canonical, request.Journal.InitialClaimSet.Canonical) ||
		!bytes.Equal(storedTransport.TransportReceiptSet.Canonical, request.Journal.TransportSet.Canonical) ||
		!evaluationHostedRetrievalRuntimeResourceLifecycleClaimHistoryPrefix(
			storedTransport.DispatchClaimHistorySet, request.Journal.ClaimHistorySet, request.Journal.IntentSet,
		) || stringMember(storedTransport.SpoolAAD, "businessResultDigest") != request.Journal.BusinessResult.ResultDigest {
		return nil, false, ErrConflict
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleSealHistoryTx(
		ctx, tx, authority.NamespaceID, owner.lifecycleOwnerInstanceID, request.Journal,
	); err != nil {
		return nil, false, err
	}
	var disposedJSON []byte
	err = tx.QueryRowContext(ctx, `SELECT dispose_agent_evaluation_hosted_runtime_lifecycle_spool(
		$1,$2,$3::jsonb,$4)`, authority.NamespaceID, stringMember(request.Journal.SpoolReceipt, "spoolRef"),
		string(request.DispositionBytes), request.DispositionBytes).Scan(&disposedJSON)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	disposedValue, err := decodeCanonicalEvaluationObject(disposedJSON, 65_536)
	if err != nil || !sameEvaluationCanonicalValue(disposedValue, request.Disposition) {
		return nil, false, ErrConflict
	}
	first := request.Journal.IntentSet.Intents[0]
	_, err = tx.ExecContext(ctx, `INSERT INTO ae_hrrr_lifecycle_transport_journals(
		namespace_id,plan_digest,repository_commit,runtime_resource_set_id,operation,
		registration_request_digest,authority_digest,lifecycle_claim_receipt_digest,record_digest,
		result_spool_ref,result_spool_receipt_digest,result_spool_disposition_receipt_digest,
		business_outcome,completed_at,record_json,record_bytes,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15::jsonb,$16,TRUE)`,
		authority.NamespaceID, first.PlanDigest, first.RepositoryCommit, first.RuntimeResourceSetID,
		request.Journal.IntentSet.Operation, first.RegistrationRequestDigest, request.Journal.AuthorityDigest,
		request.Journal.LifecycleClaim, request.Journal.RecordDigest,
		stringMember(request.Journal.SpoolReceipt, "spoolRef"), stringMember(request.Journal.SpoolReceipt, "receiptDigest"),
		stringMember(request.Disposition, "receiptDigest"), request.Journal.BusinessResult.Outcome,
		request.Journal.BusinessResult.CompletedAt, string(request.Journal.Canonical), request.Journal.Canonical)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	projection, projectionDigest, err := evaluationHostedRetrievalRuntimeResourceLifecycleBudgetClosureProjectionTx(
		ctx, tx, authority.NamespaceID, request.Journal,
	)
	if err != nil {
		return nil, false, err
	}
	projectionJSON := "null"
	if projection != nil {
		projectionBytes, encodeErr := canonicaljson.Bytes(projection)
		if encodeErr != nil {
			return nil, false, encodeErr
		}
		projectionJSON = string(projectionBytes)
	}
	var archiveJSON []byte
	err = tx.QueryRowContext(ctx, `SELECT materialize_ae_hrrr_lc_journal_archive(
		$1,$2,$3::jsonb,$4,$5)`, authority.NamespaceID, request.Journal.RecordDigest,
		projectionJSON, projectionDigest, sealedAt).Scan(&archiveJSON)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	archiveBytes, err := func() ([]byte, error) {
		value, decodeErr := decodeCanonicalEvaluationObject(
			archiveJSON, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecordBytes,
		)
		if decodeErr != nil {
			return nil, decodeErr
		}
		return canonicaljson.Bytes(value)
	}()
	if err != nil {
		return nil, false, ErrConflict
	}
	archive, err := decodeEvaluationHostedRetrievalRuntimeResourceLifecycleJournalArchiveRecord(archiveBytes)
	if err != nil || archive.JournalRecordDigest != request.Journal.RecordDigest {
		return nil, false, ErrConflict
	}
	var receiptJSON, receiptBytes []byte
	var receiptDigest, archiveRecordDigest string
	var ledgerRevision int64
	err = tx.QueryRowContext(ctx, `SELECT receipt_json,receipt_bytes,receipt_digest,archive_record_digest,seal_ledger_revision
		FROM acknowledge_agent_evaluation_hosted_runtime_lifecycle_seal($1,$2::jsonb,$3,$4,$5,$6,$7)`,
		authority.NamespaceID, string(request.Canonical), request.Canonical, archive.ArchiveRecordDigest,
		evaluationHostedRetrievalRuntimeResourceLifecycleSealAuthorityIssuerID, implementationDigest, sealedAt).Scan(
		&receiptJSON, &receiptBytes, &receiptDigest, &archiveRecordDigest, &ledgerRevision,
	)
	if err != nil {
		return nil, false, evaluationHostedRetrievalRuntimeResourceLifecycleDispatchDatabaseError(err)
	}
	receiptValue, err := decodeCanonicalEvaluationObject(
		receiptJSON, maximumEvaluationHostedRetrievalRuntimeResourceLifecycleRawBytes,
	)
	canonicalReceipt, encodeErr := canonicaljson.Bytes(receiptValue)
	if err != nil || encodeErr != nil || !bytes.Equal(canonicalReceipt, receiptBytes) ||
		validateEvaluationHostedRetrievalRuntimeResourceLifecycleSealReceipt(
			receiptBytes, request, receiptDigest, archiveRecordDigest, ledgerRevision,
		) != nil || archiveRecordDigest != archive.ArchiveRecordDigest {
		return nil, false, ErrConflict
	}
	if err := tx.Commit(); err != nil {
		return nil, false, err
	}
	return receiptBytes, false, nil
}
