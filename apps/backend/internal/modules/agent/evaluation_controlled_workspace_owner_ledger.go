package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"sort"
	"strings"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationControlledWorkspaceOwnerLedgerRequestFormat = "prodivix.agent-evaluation-controlled-workspace-owner-ledger-request"
	evaluationControlledWorkspaceOwnerLedgerResultFormat  = "prodivix.agent-evaluation-controlled-workspace-owner-ledger-result"
	evaluationControlledWorkspaceOwnerLedgerHealthFormat  = "prodivix.agent-evaluation-controlled-workspace-owner-ledger-health"
	evaluationControlledWorkspaceOwnerLedgerPurpose       = "controlled-workspace-owner"
	evaluationControlledWorkspaceOwnerLedgerAuthorityID   = "evaluation.controlled-workspace-owner-ledger.v1"
	evaluationControlledWorkspaceOwnerLedgerPurposeHeader = "X-Prodivix-Controlled-Workspace-Owner-Purpose"

	maximumEvaluationControlledWorkspaceOwnerLedgerRequestBytes = 67_108_864
	maximumEvaluationControlledWorkspaceOwnerLedgerRecords      = 512
	maximumEvaluationControlledWorkspaceOwnerLedgerHistoryBytes = 134_217_728
	evaluationControlledWorkspaceGrantLifetime                  = 15 * time.Minute
)

type evaluationControlledWorkspaceOwnerLedgerEnvelope struct {
	Format                    string          `json:"format"`
	Version                   int64           `json:"version"`
	Purpose                   string          `json:"purpose"`
	Mode                      string          `json:"mode"`
	Request                   json.RawMessage `json:"request"`
	OwnerResultFacts          json.RawMessage `json:"ownerResultFacts"`
	OwnerImplementationDigest *string         `json:"ownerImplementationDigest"`
	StageDigest               *string         `json:"stageDigest"`
	DispatchAckDigest         *string         `json:"dispatchAckDigest"`
	RequestDigest             string          `json:"requestDigest"`
}

type evaluationControlledWorkspaceOwnerLedgerEnvelopeBase struct {
	Format           string          `json:"format"`
	Version          int64           `json:"version"`
	Purpose          string          `json:"purpose"`
	Request          json.RawMessage `json:"request"`
	OwnerResultFacts json.RawMessage `json:"ownerResultFacts"`
}

type EvaluationControlledWorkspaceOwnerLedgerRecord struct {
	Operation     string
	RequestDigest string
	ResponseBytes []byte
	ClaimedAt     time.Time
	SealedAt      time.Time
}

type evaluationControlledWorkspaceOwnerLedgerHistoryReader interface {
	ListEvaluationControlledWorkspaceOwnerLedgerRecords(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
	) ([]EvaluationControlledWorkspaceOwnerLedgerRecord, error)
}

func evaluationControlledWorkspaceOwnerLedgerReadOperation(operation string) bool {
	return oneOfString(operation,
		"session.orphans.list",
		"operation.attempt-state.load",
		"operation.reconcile-dispatched",
		"operation.sealed.load",
		"operation.sealed.list",
		"operation.cleanup.reconcile",
	)
}

func evaluationControlledWorkspaceOwnerLedgerOperation(operation string) bool {
	return oneOfString(operation,
		"grant.issue",
		"session.orphans.list",
		"session.orphan.destroy",
		"operation.attempt-state.load",
		"operation.claim",
		"operation.dispatch",
		"operation.seal-rejected",
		"operation.seal-atomic",
		"operation.reconcile-dispatched",
		"operation.sealed.load",
		"operation.sealed.list",
		"operation.cleanup.claim",
		"operation.cleanup.dispatch",
		"operation.cleanup.seal",
		"operation.cleanup.reconcile",
	)
}

func evaluationControlledWorkspaceOwnerLedgerRouteFor(tail []string) (evaluationControlledWorkspaceRoute, error) {
	if len(tail) < 2 || tail[0] != "controlled-workspace-owner" {
		return evaluationControlledWorkspaceRoute{}, ErrInvalid
	}
	publicTail := append([]string{"controlled-workspace"}, tail[1:]...)
	route, err := evaluationControlledWorkspaceRouteFor(publicTail)
	if err != nil || !evaluationControlledWorkspaceOwnerLedgerOperation(route.Operation) || route.SessionID != "" {
		return evaluationControlledWorkspaceRoute{}, ErrInvalid
	}
	return route, nil
}

func decodeEvaluationControlledWorkspaceOwnerResultFacts(
	source json.RawMessage,
	operation string,
) ([]json.RawMessage, error) {
	if bytes.Equal(source, []byte("null")) {
		if operation == "session.orphan.destroy" {
			return nil, ErrInvalid
		}
		return nil, nil
	}
	if operation != "session.orphan.destroy" || len(source) == 0 ||
		canonicaljson.ValidateRawEnvelope(source, maximumEvaluationControlledAuthorityResponseBytes) != nil {
		return nil, ErrInvalid
	}
	var values []json.RawMessage
	decoder := json.NewDecoder(bytes.NewReader(source))
	if err := decoder.Decode(&values); err != nil || len(values) != 1 {
		return nil, ErrInvalid
	}
	canonical, err := canonicaljson.Bytes(values)
	if err != nil || !bytes.Equal(canonical, source) {
		return nil, ErrInvalid
	}
	return values, nil
}

func decodeEvaluationControlledWorkspaceOwnerLedgerEnvelope(
	source []byte,
	partition EvaluationPlanPartition,
	namespaceID string,
	route evaluationControlledWorkspaceRoute,
) (evaluationControlledWorkspaceServiceEnvelope, []json.RawMessage, evaluationControlledWorkspaceOwnerLedgerEnvelope, error) {
	if len(source) == 0 || len(source) > maximumEvaluationControlledWorkspaceOwnerLedgerRequestBytes ||
		canonicaljson.ValidateRawEnvelope(source, maximumEvaluationControlledWorkspaceOwnerLedgerRequestBytes) != nil {
		return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, ErrInvalid
	}
	var envelope evaluationControlledWorkspaceOwnerLedgerEnvelope
	if err := decodeEvaluationServiceRawJSON(source, &envelope); err != nil {
		return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, err
	}
	canonical, err := canonicaljson.Bytes(envelope)
	base := evaluationControlledWorkspaceOwnerLedgerEnvelopeBase{
		Format: envelope.Format, Version: envelope.Version, Purpose: envelope.Purpose,
		Request: envelope.Request, OwnerResultFacts: envelope.OwnerResultFacts,
	}
	digest, digestErr := canonicaljson.Digest(base)
	if err != nil || digestErr != nil || !bytes.Equal(canonical, source) ||
		envelope.Format != evaluationControlledWorkspaceOwnerLedgerRequestFormat || envelope.Version != 1 ||
		envelope.Purpose != evaluationControlledWorkspaceOwnerLedgerPurpose || envelope.RequestDigest != digest {
		return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, ErrInvalid
	}
	innerValue, err := decodeCanonicalEvaluationObject(envelope.Request, maximumEvaluationControlledWorkspaceRequestBytes)
	if err != nil || !exactEvaluationKeys(innerValue, []string{
		"format", "version", "operation", "namespaceId", "planDigest", "repositoryCommit", "payload", "requestDigest",
	}) {
		return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, ErrInvalid
	}
	var request evaluationControlledWorkspaceServiceEnvelope
	if err := decodeEvaluationServiceRawJSON(envelope.Request, &request); err != nil {
		return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, err
	}
	requestBase := evaluationControlledWorkspaceServiceRequestBase{
		Format: request.Format, Version: request.Version, Operation: request.Operation,
		NamespaceID: request.NamespaceID, PlanDigest: request.PlanDigest,
		RepositoryCommit: request.RepositoryCommit, Payload: request.Payload,
	}
	innerDigest, err := canonicaljson.Digest(requestBase)
	if err != nil || request.Format != evaluationControlledWorkspaceServiceFormat ||
		request.Version != evaluationControlledWorkspaceServiceVersion || request.Operation != route.Operation ||
		request.NamespaceID != namespaceID || request.PlanDigest != partition.PlanDigest ||
		request.RepositoryCommit != partition.RepositoryCommit || request.RequestDigest != innerDigest {
		return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, ErrConflict
	}
	facts, err := decodeEvaluationControlledWorkspaceOwnerResultFacts(envelope.OwnerResultFacts, route.Operation)
	if err != nil {
		return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, err
	}
	readMode := evaluationControlledWorkspaceOwnerLedgerReadOperation(route.Operation)
	if !oneOfString(envelope.Mode, "read", "execute", "reconcile") ||
		(envelope.Mode == "read") != readMode ||
		(envelope.Mode == "read" && (envelope.OwnerImplementationDigest != nil || envelope.StageDigest != nil || envelope.DispatchAckDigest != nil)) ||
		(envelope.Mode == "execute" && (envelope.OwnerImplementationDigest == nil || envelope.StageDigest == nil || envelope.DispatchAckDigest != nil)) ||
		(envelope.Mode == "reconcile" && (envelope.OwnerImplementationDigest == nil || envelope.StageDigest == nil || envelope.DispatchAckDigest == nil)) {
		return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, ErrInvalid
	}
	if envelope.Mode != "read" {
		if !evaluationDigestPattern.MatchString(*envelope.OwnerImplementationDigest) ||
			!evaluationDigestPattern.MatchString(*envelope.StageDigest) ||
			(envelope.DispatchAckDigest != nil && !evaluationDigestPattern.MatchString(*envelope.DispatchAckDigest)) {
			return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, ErrInvalid
		}
		expectedStage, err := evaluationControlledWorkspaceDirectStageDigest(
			namespaceID, partition, route, request.RequestDigest, *envelope.OwnerImplementationDigest,
		)
		if err != nil || expectedStage != *envelope.StageDigest {
			return evaluationControlledWorkspaceServiceEnvelope{}, nil, evaluationControlledWorkspaceOwnerLedgerEnvelope{}, ErrConflict
		}
	}
	return request, facts, envelope, nil
}

func evaluationControlledWorkspaceDirectStageDigest(
	namespaceID string,
	partition EvaluationPlanPartition,
	route evaluationControlledWorkspaceRoute,
	requestDigest string,
	ownerImplementationDigest string,
) (string, error) {
	if !validEvaluationServiceIdentity(namespaceID) || validateEvaluationPartition(partition) != nil ||
		route.Operation == "" || route.RouteBinding == "" ||
		!evaluationDigestPattern.MatchString(requestDigest) ||
		!evaluationDigestPattern.MatchString(ownerImplementationDigest) {
		return "", ErrInvalid
	}
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-controlled-workspace-direct-stage", "version": int64(1),
		"serviceKind": "controlled-workspace", "operation": route.Operation, "routeBinding": route.RouteBinding,
		"namespaceId": namespaceID, "planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"requestDigest": requestDigest, "ownerImplementationDigest": ownerImplementationDigest,
	})
}

func evaluationControlledWorkspaceDirectDispatchAckDigest(
	namespaceID string,
	partition EvaluationPlanPartition,
	route evaluationControlledWorkspaceRoute,
	requestDigest string,
	ownerImplementationDigest string,
	stageDigest string,
	facts []json.RawMessage,
) (string, error) {
	if !evaluationDigestPattern.MatchString(stageDigest) || len(facts) > maximumEvaluationControlledWorkspaceFacts {
		return "", ErrInvalid
	}
	base := make([]any, len(facts))
	for index, source := range facts {
		value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationControlledAuthorityResponseBytes)
		if err != nil {
			return "", err
		}
		base[index] = value
	}
	responseDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return "", err
	}
	return canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-controlled-workspace-direct-dispatch-ack", "version": int64(1),
		"serviceKind": "controlled-workspace", "operation": route.Operation, "routeBinding": route.RouteBinding,
		"namespaceId": namespaceID, "planDigest": partition.PlanDigest, "repositoryCommit": partition.RepositoryCommit,
		"requestDigest": requestDigest, "ownerImplementationDigest": ownerImplementationDigest,
		"stageDigest": stageDigest, "responseDigest": responseDigest,
	})
}

func evaluationControlledWorkspaceOwnerLedgerResponseFacts(
	record EvaluationControlledWorkspaceOwnerLedgerRecord,
) ([]map[string]any, error) {
	value, err := decodeCanonicalEvaluationObject(record.ResponseBytes, maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "operation", "requestDigest", "facts", "receiptDigest",
	}) || stringMember(value, "format") != evaluationControlledWorkspaceServiceFormat ||
		stringMember(value, "operation") != record.Operation ||
		stringMember(value, "requestDigest") != record.RequestDigest ||
		!verificationEvidenceReceiptDigestMatches(value) {
		return nil, ErrConflict
	}
	version, versionOK := integerMember(value, "version")
	entries, entriesOK := value["facts"].([]any)
	if !versionOK || version != evaluationControlledWorkspaceServiceVersion || !entriesOK ||
		len(entries) > maximumEvaluationControlledWorkspaceFacts {
		return nil, ErrConflict
	}
	facts := make([]map[string]any, len(entries))
	for index, entry := range entries {
		fact, ok := entry.(map[string]any)
		if !ok || !exactControlledWorkspaceFactShape(record.Operation, fact) {
			return nil, ErrConflict
		}
		facts[index] = fact
	}
	return facts, nil
}

func evaluationControlledWorkspaceOwnerLedgerResult(
	namespaceID string,
	partition EvaluationPlanPartition,
	route evaluationControlledWorkspaceRoute,
	envelope evaluationControlledWorkspaceOwnerLedgerEnvelope,
	innerRequestDigest string,
	facts []json.RawMessage,
	innerResponse []byte,
) ([]byte, error) {
	inner, err := decodeCanonicalEvaluationObject(innerResponse, maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil || stringMember(inner, "requestDigest") != innerRequestDigest ||
		stringMember(inner, "operation") != route.Operation || !verificationEvidenceReceiptDigestMatches(inner) {
		return nil, ErrConflict
	}
	entries := make([]any, len(facts))
	for index, source := range facts {
		value, err := decodeCanonicalEvaluationObject(source, maximumEvaluationControlledAuthorityResponseBytes)
		if err != nil {
			return nil, err
		}
		entries[index] = value
	}
	var ownerImplementationDigest any
	var stageDigest any
	var dispatchAckDigest any
	if envelope.Mode != "read" {
		expectedAck, err := evaluationControlledWorkspaceDirectDispatchAckDigest(
			namespaceID, partition, route, innerRequestDigest,
			*envelope.OwnerImplementationDigest, *envelope.StageDigest, facts,
		)
		if err != nil || envelope.Mode == "reconcile" && *envelope.DispatchAckDigest != expectedAck {
			return nil, ErrConflict
		}
		ownerImplementationDigest = *envelope.OwnerImplementationDigest
		stageDigest = *envelope.StageDigest
		dispatchAckDigest = expectedAck
	} else {
		ownerImplementationDigest, stageDigest, dispatchAckDigest = nil, nil, nil
	}
	value := map[string]any{
		"format": evaluationControlledWorkspaceOwnerLedgerResultFormat, "version": int64(1),
		"purpose": evaluationControlledWorkspaceOwnerLedgerPurpose, "mode": envelope.Mode,
		"requestDigest": envelope.RequestDigest, "facts": entries,
		"receiptDigest":             stringMember(inner, "receiptDigest"),
		"ownerImplementationDigest": ownerImplementationDigest,
		"stageDigest":               stageDigest, "dispatchAckDigest": dispatchAckDigest,
	}
	if envelope.Mode == "reconcile" {
		value["reconciled"] = true
	}
	result, err := canonicaljson.Bytes(value)
	if err != nil || len(result) > maximumEvaluationControlledAuthorityResponseBytes {
		return nil, ErrInvalid
	}
	return result, nil
}

func evaluationControlledWorkspaceCanonicalRaw(value any) (json.RawMessage, error) {
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) == 0 || len(encoded) > maximumEvaluationControlledAuthorityResponseBytes {
		return nil, ErrInvalid
	}
	return json.RawMessage(encoded), nil
}

func evaluationControlledWorkspaceCanonicalEqual(left, right any) bool {
	leftBytes, leftErr := canonicaljson.Bytes(left)
	rightBytes, rightErr := canonicaljson.Bytes(right)
	return leftErr == nil && rightErr == nil && bytes.Equal(leftBytes, rightBytes)
}

func evaluationControlledWorkspaceSortedIdentities(value any, allowEmpty bool) ([]string, error) {
	identities, err := evaluationStringArray(value, maximumEvaluationControlledWorkspaceFacts, allowEmpty)
	if err != nil {
		return nil, err
	}
	sort.Strings(identities)
	for index, identity := range identities {
		if !validEvaluationAgentControlIdentity(identity) || index > 0 && identities[index-1] == identity {
			return nil, ErrInvalid
		}
	}
	return identities, nil
}

func evaluationControlledWorkspaceSortedDigests(value any, maximum int, allowEmpty bool) ([]string, error) {
	digests, err := evaluationStringArray(value, maximum, allowEmpty)
	if err != nil {
		return nil, err
	}
	sort.Strings(digests)
	for index, digest := range digests {
		if !evaluationDigestPattern.MatchString(digest) || index > 0 && digests[index-1] == digest {
			return nil, ErrInvalid
		}
	}
	return digests, nil
}

func evaluationControlledWorkspaceStringValues(values []string) []any {
	result := make([]any, len(values))
	for index := range values {
		result[index] = values[index]
	}
	return result
}

func evaluationControlledWorkspaceDigestValue(value map[string]any, digestKey string) error {
	if !controlledWorkspaceReceiptDigestMatches(value, digestKey) {
		return ErrConflict
	}
	return nil
}

func evaluationControlledWorkspaceOwnerLedgerFindFact(
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
	operation string,
	predicate func(map[string]any) bool,
) (map[string]any, bool, error) {
	var matched map[string]any
	for _, record := range records {
		if record.Operation != operation {
			continue
		}
		facts, err := evaluationControlledWorkspaceOwnerLedgerResponseFacts(record)
		if err != nil {
			return nil, false, err
		}
		for _, fact := range facts {
			if !predicate(fact) {
				continue
			}
			if matched != nil {
				return nil, false, ErrConflict
			}
			matched = fact
		}
	}
	return matched, matched != nil, nil
}

func evaluationControlledWorkspaceOwnerLedgerStoredSeals(
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
	attemptID, grantDigest string,
	generation int64,
) ([]map[string]any, error) {
	seals := make([]map[string]any, 0, 4)
	for _, record := range records {
		if !oneOfString(record.Operation, "operation.seal-rejected", "operation.seal-atomic") {
			continue
		}
		facts, err := evaluationControlledWorkspaceOwnerLedgerResponseFacts(record)
		if err != nil {
			return nil, err
		}
		for _, seal := range facts {
			sealGeneration, _ := integerMember(seal, "generation")
			if stringMember(seal, "attemptId") == attemptID && stringMember(seal, "grantDigest") == grantDigest &&
				sealGeneration == generation {
				seals = append(seals, seal)
			}
		}
	}
	return seals, nil
}

func evaluationControlledWorkspaceOwnerLedgerMutationFacts(
	partition EvaluationPlanPartition,
	route evaluationControlledWorkspaceRoute,
	requestDigest string,
	payload json.RawMessage,
	ownerResultFacts []json.RawMessage,
	claimedAt time.Time,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) ([]json.RawMessage, error) {
	payloadValue, err := decodeCanonicalEvaluationObject(payload, maximumEvaluationControlledWorkspaceRequestBytes)
	if err != nil {
		return nil, err
	}
	var facts []map[string]any
	switch route.Operation {
	case "grant.issue":
		fact, err := evaluationControlledWorkspaceOwnerLedgerGrant(payloadValue, requestDigest, claimedAt, records)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	case "session.orphan.destroy":
		if len(ownerResultFacts) != 1 {
			return nil, ErrInvalid
		}
		fact, err := decodeCanonicalEvaluationObject(ownerResultFacts[0], maximumEvaluationControlledAuthorityResponseBytes)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	case "operation.claim":
		fact, err := evaluationControlledWorkspaceOwnerLedgerClaim(
			partition, payloadValue, requestDigest, claimedAt, records,
		)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	case "operation.dispatch":
		fact, err := evaluationControlledWorkspaceOwnerLedgerDispatch(payloadValue, requestDigest, records)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	case "operation.seal-rejected", "operation.seal-atomic":
		fact, err := evaluationControlledWorkspaceOwnerLedgerSeal(route.Operation, payloadValue, records)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	case "operation.cleanup.claim":
		fact, err := evaluationControlledWorkspaceOwnerLedgerCleanupClaim(payloadValue, requestDigest, records)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	case "operation.cleanup.dispatch":
		fact, err := evaluationControlledWorkspaceOwnerLedgerCleanupDispatch(payloadValue, records)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	case "operation.cleanup.seal":
		fact, err := evaluationControlledWorkspaceOwnerLedgerCleanupSeal(payloadValue, records)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	default:
		return nil, ErrInvalid
	}
	result := make([]json.RawMessage, len(facts))
	for index, fact := range facts {
		result[index], err = evaluationControlledWorkspaceCanonicalRaw(fact)
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func evaluationControlledWorkspaceOwnerLedgerReadFacts(
	partition EvaluationPlanPartition,
	operation string,
	payload json.RawMessage,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) ([]json.RawMessage, error) {
	payloadValue, err := decodeCanonicalEvaluationObject(payload, maximumEvaluationControlledWorkspaceRequestBytes)
	if err != nil {
		return nil, err
	}
	var facts []map[string]any
	switch operation {
	case "operation.attempt-state.load":
		state, ok, err := evaluationControlledWorkspaceOwnerLedgerAttemptState(payloadValue, records)
		if err != nil {
			return nil, err
		}
		if ok {
			facts = []map[string]any{state}
		}
	case "operation.reconcile-dispatched":
		fact, err := evaluationControlledWorkspaceOwnerLedgerReconcile(payloadValue, records)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	case "operation.sealed.load":
		seal, ok, err := evaluationControlledWorkspaceOwnerLedgerLoadSeal(payloadValue, records)
		if err != nil {
			return nil, err
		}
		if ok {
			facts = []map[string]any{seal}
		}
	case "operation.sealed.list":
		facts, err = evaluationControlledWorkspaceOwnerLedgerListSeals(payloadValue, records)
		if err != nil {
			return nil, err
		}
	case "operation.cleanup.reconcile":
		fact, err := evaluationControlledWorkspaceOwnerLedgerCleanupReconcile(payloadValue, records)
		if err != nil {
			return nil, err
		}
		facts = []map[string]any{fact}
	default:
		return nil, ErrInvalid
	}
	result := make([]json.RawMessage, len(facts))
	for index, fact := range facts {
		result[index], err = evaluationControlledWorkspaceCanonicalRaw(fact)
		if err != nil {
			return nil, err
		}
	}
	return result, nil
}

func (handler *EvaluationServiceHandler) handleEvaluationControlledWorkspaceOwnerLedger(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if request.Method != http.MethodPost || !evaluationServiceQueryIsExact(request) ||
		request.Header.Get(evaluationControlledWorkspaceOwnerLedgerPurposeHeader) != evaluationControlledWorkspaceOwnerLedgerPurpose ||
		len(request.Header.Values(evaluationControlledWorkspaceOwnerLedgerPurposeHeader)) != 1 ||
		handler.controlledWorkspaceResponseScanner == nil {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		if handler.controlledWorkspaceResponseScanner == nil {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	route, err := evaluationControlledWorkspaceOwnerLedgerRouteFor(tail)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationControlledWorkspaceOwnerLedgerRequestBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	envelope, ownerResultFacts, ownerEnvelope, err := decodeEvaluationControlledWorkspaceOwnerLedgerEnvelope(
		source, partition, handler.authority.NamespaceID, route,
	)
	if err != nil || !exactEvaluationIdempotencyHeader(request, ownerEnvelope.RequestDigest) {
		if err == nil {
			err = ErrInvalid
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	binding, err := controlledWorkspaceRequestBinding(partition, route, envelope.RequestDigest, envelope.Payload)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if ownerEnvelope.Mode != "read" {
		binding.OwnerImplementationDigest = *ownerEnvelope.OwnerImplementationDigest
	}
	authorizer, authorizerOK := handler.repository.(evaluationControlledWorkspaceRequestAuthorizer)
	history, historyOK := handler.repository.(evaluationControlledWorkspaceOwnerLedgerHistoryReader)
	if !authorizerOK || !historyOK {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if err := authorizer.AuthorizeEvaluationControlledWorkspaceRequest(
		request.Context(), handler.authority, partition, binding,
	); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if route.Operation == "session.orphan.destroy" {
		if err := handler.validateEvaluationControlledWorkspaceOwnerOrphanResult(
			request.Context(), partition, binding, ownerResultFacts,
		); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
	}
	if route.Operation == "session.orphans.list" {
		handler.handleEvaluationControlledWorkspaceOwnerOrphanList(
			writer, request, partition, envelope, ownerEnvelope,
		)
		return
	}
	records, err := history.ListEvaluationControlledWorkspaceOwnerLedgerRecords(
		request.Context(), handler.authority, partition, binding.AttemptID,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if evaluationControlledWorkspaceOwnerLedgerReadOperation(route.Operation) {
		facts, err := evaluationControlledWorkspaceOwnerLedgerReadFacts(
			partition, route.Operation, envelope.Payload, records,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		handler.writeEvaluationControlledWorkspaceOwnerLedgerResult(
			writer, request, partition, route, envelope, ownerEnvelope, facts,
		)
		return
	}
	repository, ok := handler.repository.(evaluationControlledWorkspaceStatelessFenceRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	record, err := repository.GetEvaluationControlledWorkspaceStatelessRequest(
		request.Context(), handler.authority, partition, binding,
	)
	if err != nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if record.StageDigest != *ownerEnvelope.StageDigest ||
		record.OwnerImplementationDigest != *ownerEnvelope.OwnerImplementationDigest {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if ownerEnvelope.Mode == "reconcile" {
		if record.State != "sealed" || record.DispatchAckDigest != *ownerEnvelope.DispatchAckDigest {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		handler.writeEvaluationControlledWorkspaceOwnerLedgerSealedResult(
			writer, request, partition, route, envelope, ownerEnvelope, record,
		)
		return
	}
	if record.State == "sealed" {
		handler.writeEvaluationControlledWorkspaceOwnerLedgerSealedResult(
			writer, request, partition, route, envelope, ownerEnvelope, record,
		)
		return
	}
	if record.State != "dispatched" {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	facts, err := evaluationControlledWorkspaceOwnerLedgerMutationFacts(
		partition, route, envelope.RequestDigest, envelope.Payload, ownerResultFacts, record.ClaimedAt, records,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	response, err := controlledWorkspaceAcknowledgement(
		partition.PlanDigest, route.Operation, envelope.RequestDigest, envelope.Payload, facts,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
		request.Context(), route.Operation, envelope.RequestDigest, response,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	responseDigest, err := evaluationCanonicalByteDigest(response, maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	dispatchAckDigest, err := evaluationControlledWorkspaceDirectDispatchAckDigest(
		handler.authority.NamespaceID, partition, route, envelope.RequestDigest,
		*ownerEnvelope.OwnerImplementationDigest, *ownerEnvelope.StageDigest, facts,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	sealed, _, err := repository.SealEvaluationControlledWorkspaceStatelessResult(
		request.Context(), handler.authority, partition, binding, record.ClaimGeneration,
		*ownerEnvelope.StageDigest, dispatchAckDigest, responseDigest, response, handler.clock().UTC(),
	)
	if err != nil || !bytes.Equal(sealed.ResponseBytes, response) {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	handler.writeEvaluationControlledWorkspaceOwnerLedgerResult(
		writer, request, partition, route, envelope, ownerEnvelope, facts,
	)
}

func (handler *EvaluationServiceHandler) validateEvaluationControlledWorkspaceOwnerOrphanResult(
	ctx context.Context,
	partition EvaluationPlanPartition,
	binding EvaluationControlledAuthorityRequestBinding,
	ownerResultFacts []json.RawMessage,
) error {
	if len(ownerResultFacts) != 1 {
		return ErrInvalid
	}
	repository, ok := handler.repository.(evaluationOwnerStateReadRepository)
	if !ok {
		return errEvaluationServiceUnavailable
	}
	ownerStateID, err := evaluationOwnerStateIdentity(
		"controlled-workspace", handler.authority.NamespaceID, partition,
		binding.AttemptID, binding.DescriptorDigest, binding.GrantDigest, binding.Generation,
	)
	if err != nil {
		return err
	}
	record, err := repository.GetEvaluationOwnerState(
		ctx, handler.authority, partition, "controlled-workspace", ownerStateID,
	)
	if err != nil {
		return err
	}
	bundle, rootDigest, err := decodeEvaluationOwnerStateBundle(
		record.BundleBytes, "controlled-workspace", handler.authority.NamespaceID, partition,
		ownerStateID, record.Revision, evaluationOwnerStatePreviousRoot(record.BundleBytes),
	)
	if err != nil || rootDigest != record.RootDigest {
		return ErrConflict
	}
	snapshot, ok := objectMember(bundle, "snapshot")
	if !ok || stringMember(snapshot, "state") != "destroyed" {
		return ErrConflict
	}
	cleanupReceipt, err := decodeCanonicalEvaluationObject(
		ownerResultFacts[0], maximumEvaluationControlledAuthorityResponseBytes,
	)
	if err != nil || stringMember(cleanupReceipt, "cleanupReceiptDigest") == "" ||
		stringMember(snapshot, "cleanupReceiptDigest") != stringMember(cleanupReceipt, "cleanupReceiptDigest") ||
		stringMember(snapshot, "attemptId") != binding.AttemptID ||
		stringMember(snapshot, "descriptorDigest") != binding.DescriptorDigest ||
		stringMember(snapshot, "grantDigest") != binding.GrantDigest ||
		mustEvaluationInteger(snapshot, "generation") != binding.Generation {
		return ErrConflict
	}
	return nil
}

func (handler *EvaluationServiceHandler) writeEvaluationControlledWorkspaceOwnerLedgerResult(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	route evaluationControlledWorkspaceRoute,
	envelope evaluationControlledWorkspaceServiceEnvelope,
	ownerEnvelope evaluationControlledWorkspaceOwnerLedgerEnvelope,
	facts []json.RawMessage,
) {
	innerResponse, err := controlledWorkspaceAcknowledgement(
		partition.PlanDigest, route.Operation, envelope.RequestDigest, envelope.Payload, facts,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	response, err := evaluationControlledWorkspaceOwnerLedgerResult(
		handler.authority.NamespaceID, partition, route, ownerEnvelope,
		envelope.RequestDigest, facts, innerResponse,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.controlledWorkspaceResponseScanner.ScanControlledWorkspacePublicResponse(
		request.Context(), route.Operation, ownerEnvelope.RequestDigest, response,
	); err != nil {
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, response)
}

func (handler *EvaluationServiceHandler) writeEvaluationControlledWorkspaceOwnerLedgerSealedResult(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	route evaluationControlledWorkspaceRoute,
	envelope evaluationControlledWorkspaceServiceEnvelope,
	ownerEnvelope evaluationControlledWorkspaceOwnerLedgerEnvelope,
	record EvaluationControlledAuthorityRequestRecord,
) {
	if len(record.ResponseBytes) == 0 || len(record.ResponseBytes) > maximumEvaluationControlledAuthorityResponseBytes {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	storedFacts, err := evaluationControlledWorkspaceOwnerLedgerResponseFacts(
		EvaluationControlledWorkspaceOwnerLedgerRecord{
			Operation: record.Operation, RequestDigest: record.RequestDigest, ResponseBytes: record.ResponseBytes,
		},
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	facts := make([]json.RawMessage, len(storedFacts))
	for index, fact := range storedFacts {
		facts[index], err = evaluationControlledWorkspaceCanonicalRaw(fact)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
	}
	handler.writeEvaluationControlledWorkspaceOwnerLedgerResult(
		writer, request, partition, route, envelope, ownerEnvelope, facts,
	)
}

func (handler *EvaluationServiceHandler) handleEvaluationControlledWorkspaceOwnerOrphanList(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	envelope evaluationControlledWorkspaceServiceEnvelope,
	ownerEnvelope evaluationControlledWorkspaceOwnerLedgerEnvelope,
) {
	repository, ok := handler.repository.(evaluationOwnerStateReadRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	records, hasMore, err := repository.ListEvaluationOwnerStates(
		request.Context(), handler.authority, partition, "controlled-workspace", "",
		maximumEvaluationOwnerStateListRecords,
	)
	if err != nil || hasMore {
		if err == nil {
			err = ErrConflict
		}
		respondEvaluationServiceError(writer, err)
		return
	}
	facts := make([]json.RawMessage, 0, len(records))
	for _, record := range records {
		if record.SnapshotState != "active" {
			continue
		}
		current, err := repository.GetEvaluationOwnerState(
			request.Context(), handler.authority, partition, "controlled-workspace", record.OwnerStateID,
		)
		if err != nil || current.Revision != record.Revision || current.RootDigest != record.RootDigest {
			if err == nil {
				err = ErrConflict
			}
			respondEvaluationServiceError(writer, err)
			return
		}
		bundle, root, err := decodeEvaluationOwnerStateBundle(
			current.BundleBytes, "controlled-workspace", handler.authority.NamespaceID, partition,
			current.OwnerStateID, current.Revision, evaluationOwnerStatePreviousRoot(current.BundleBytes),
		)
		if err != nil || root != current.RootDigest {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		snapshot, _ := objectMember(bundle, "snapshot")
		checkpoint, ok := objectMember(snapshot, "currentCheckpoint")
		if !ok {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		orphan := map[string]any{
			"planDigest": partition.PlanDigest, "attemptId": snapshot["attemptId"],
			"modelDescriptorDigest": snapshot["descriptorDigest"], "caseId": snapshot["caseId"],
			"materialDigest": snapshot["materialDigest"], "grantDigest": snapshot["grantDigest"],
			"generation": snapshot["generation"], "sessionId": snapshot["sessionId"],
			"currentCheckpoint": checkpoint,
		}
		digest, err := canonicaljson.Digest(orphan)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		orphan["orphanReceiptDigest"] = digest
		raw, err := evaluationControlledWorkspaceCanonicalRaw(orphan)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts = append(facts, raw)
	}
	sort.Slice(facts, func(left, right int) bool { return bytes.Compare(facts[left], facts[right]) < 0 })
	handler.writeEvaluationControlledWorkspaceOwnerLedgerResult(
		writer, request, partition,
		evaluationControlledWorkspaceRoute{Operation: "session.orphans.list", RouteBinding: "sessions/orphans/list"},
		envelope, ownerEnvelope, facts,
	)
}

func (handler *EvaluationServiceHandler) evaluationControlledWorkspaceOwnerLedgerHealthRoute(request *http.Request) bool {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(segments) == 5 && segments[0] == "v1" && segments[1] == "evaluations" &&
		segments[2] == handler.authority.NamespaceID && segments[3] == "controlled-workspace-owner" &&
		segments[4] == "health"
}

func evaluationControlledWorkspaceOwnerLedgerImplementationDigest() (string, error) {
	return canonicaljson.Digest(map[string]any{
		"format":  "prodivix.agent-evaluation-controlled-workspace-owner-ledger-implementation",
		"version": int64(1), "purpose": evaluationControlledWorkspaceOwnerLedgerPurpose,
		"authorityId": evaluationControlledWorkspaceOwnerLedgerAuthorityID,
		"durability":  "postgresql-seal-before-response", "reconciliation": "sealed-read-zero-effect",
		"operations": []string{
			"grant.issue", "session.orphan.destroy", "session.orphans.list",
			"operation.attempt-state.load", "operation.claim", "operation.cleanup.claim",
			"operation.cleanup.dispatch", "operation.cleanup.reconcile", "operation.cleanup.seal",
			"operation.dispatch", "operation.reconcile-dispatched", "operation.seal-atomic",
			"operation.seal-rejected", "operation.sealed.list", "operation.sealed.load",
		},
	})
}

func (handler *EvaluationServiceHandler) handleEvaluationControlledWorkspaceOwnerLedgerHealth(
	writer http.ResponseWriter,
	request *http.Request,
) {
	if request.Method != http.MethodGet || !evaluationServiceQueryIsExact(request) ||
		request.ContentLength != 0 || len(request.TransferEncoding) != 0 ||
		request.Header.Get(evaluationControlledWorkspaceOwnerLedgerPurposeHeader) != evaluationControlledWorkspaceOwnerLedgerPurpose ||
		len(request.Header.Values(evaluationControlledWorkspaceOwnerLedgerPurposeHeader)) != 1 ||
		handler.controlledWorkspaceResponseScanner == nil {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		if handler.controlledWorkspaceResponseScanner == nil {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		respondEvaluationServiceError(writer, ErrUnauthorized)
		return
	}
	digest, err := evaluationControlledWorkspaceOwnerLedgerImplementationDigest()
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, map[string]any{
		"format": evaluationControlledWorkspaceOwnerLedgerHealthFormat, "version": int64(1),
		"purpose": evaluationControlledWorkspaceOwnerLedgerPurpose, "status": "ready",
		"authorityId": evaluationControlledWorkspaceOwnerLedgerAuthorityID, "implementationDigest": digest,
		"maximumRequestBytes":  int64(maximumEvaluationControlledWorkspaceOwnerLedgerRequestBytes),
		"maximumResponseBytes": int64(maximumEvaluationControlledAuthorityResponseBytes),
		"maximumFacts":         int64(maximumEvaluationControlledWorkspaceFacts),
	})
}
