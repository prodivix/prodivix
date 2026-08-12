package agent

import (
	"bytes"
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationNativeProviderStateVaultTestScanner struct {
	mu    sync.Mutex
	calls int
	err   error
}

func (scanner *evaluationNativeProviderStateVaultTestScanner) ScanAttemptAuthorityPublicResponse(
	_ context.Context,
	_, _ string,
	_ []byte,
) error {
	scanner.mu.Lock()
	defer scanner.mu.Unlock()
	scanner.calls++
	return scanner.err
}

type evaluationNativeProviderStateVaultTestRepository struct {
	mu                    sync.Mutex
	records               map[string]EvaluationNativeProviderStateVaultRecord
	retirements           map[string]string
	recoveries            map[string]evaluationNativeProviderStateVaultTestRecovery
	failRetirementAfter   bool
	failForcedExpiryAfter bool
	failRecoveryAfter     bool
}

type evaluationNativeProviderStateVaultTestRecovery struct {
	request evaluationNativeProviderStateVaultRecoveryRequest
	receipt evaluationNativeProviderStateVaultRecoveryReceipt
}

const evaluationNativeProviderStateVaultTestOwnerInstance = "g4-run.1.shard-1"

func newEvaluationNativeProviderStateVaultTestRepository() *evaluationNativeProviderStateVaultTestRepository {
	return &evaluationNativeProviderStateVaultTestRepository{
		records:     make(map[string]EvaluationNativeProviderStateVaultRecord),
		retirements: make(map[string]string),
		recoveries:  make(map[string]evaluationNativeProviderStateVaultTestRecovery),
	}
}

func (*evaluationNativeProviderStateVaultTestRepository) CheckEvaluationNativeProviderStateVaultAuthority(
	context.Context,
	EvaluationAuthority,
	EvaluationPlanPartition,
	EvaluationNativeProviderStateVaultAuthority,
) error {
	return nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) StoreEvaluationNativeProviderStateVaultSeal(
	_ context.Context,
	_ EvaluationAuthority,
	record EvaluationNativeProviderStateVaultRecord,
) (EvaluationNativeProviderStateVaultRecord, bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	for _, recovery := range repository.recoveries {
		if recovery.request.Partition == record.Partition && recovery.request.OwnerInstanceID == record.OwnerInstanceID {
			return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
		}
	}
	if existing, ok := repository.records[record.OpaqueProviderStateRef]; ok {
		if !bytes.Equal(existing.SealRequest.Bytes, record.SealRequest.Bytes) ||
			existing.OwnerInstanceID != record.OwnerInstanceID {
			return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
		}
		return existing, true, nil
	}
	if len(repository.records) >= maximumEvaluationNativeProviderStateVaultRecords {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
	}
	repository.records[record.OpaqueProviderStateRef] = record
	return record, false, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) LoadEvaluationNativeProviderStateVaultRecord(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	opaqueRef string,
) (EvaluationNativeProviderStateVaultRecord, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	record, ok := repository.records[opaqueRef]
	if !ok {
		return EvaluationNativeProviderStateVaultRecord{}, ErrNotFound
	}
	return record, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) StoreEvaluationNativeProviderStateVaultResolve(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	opaqueRef string,
	request evaluationNativeProviderStateVaultResolveRequest,
	receipt evaluationNativeProviderStateVaultResolveReceipt,
) (EvaluationNativeProviderStateVaultRecord, bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	record, ok := repository.records[opaqueRef]
	if !ok {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrNotFound
	}
	if record.ResolveRequest != nil {
		if !bytes.Equal(record.ResolveRequest.Bytes, request.Bytes) || record.ResolveReceipt == nil ||
			!bytes.Equal(record.ResolveReceipt.Bytes, receipt.Bytes) {
			return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
		}
		return record, true, nil
	}
	record.ResolveRequest, record.ResolveReceipt = &request, &receipt
	repository.records[opaqueRef] = record
	return record, false, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) StoreEvaluationNativeProviderStateVaultRetirement(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	opaqueRef string,
	request evaluationNativeProviderStateVaultRetireRequest,
	receipt evaluationNativeProviderStateVaultRetirementReceipt,
) (EvaluationNativeProviderStateVaultRecord, bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	record, ok := repository.records[opaqueRef]
	if !ok {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrNotFound
	}
	if record.RetireRequest != nil {
		if !bytes.Equal(record.RetireRequest.Bytes, request.Bytes) || record.RetirementReceipt == nil ||
			!bytes.Equal(record.RetirementReceipt.Bytes, receipt.Bytes) {
			return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
		}
		return record, true, nil
	}
	record.RetireRequest, record.RetirementReceipt = &request, &receipt
	record.Status, record.Disposition = "retired", request.Disposition
	record.CiphertextBytes, record.CiphertextNonce = nil, nil
	record.WrappedStateKeyBytes, record.WrappedStateKeyNonce = nil, nil
	repository.records[opaqueRef] = record
	repository.retirements[request.RetireRequestDigest] = opaqueRef
	if repository.failRetirementAfter {
		repository.failRetirementAfter = false
		return EvaluationNativeProviderStateVaultRecord{}, false, context.DeadlineExceeded
	}
	return record, false, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) StoreEvaluationNativeProviderStateVaultForcedExpiry(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	opaqueRef string,
	tombstone evaluationNativeProviderStateVaultForcedExpiryTombstone,
) (EvaluationNativeProviderStateVaultRecord, bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	record, ok := repository.records[opaqueRef]
	if !ok {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrNotFound
	}
	if record.ForcedExpiryTombstone != nil {
		if !bytes.Equal(record.ForcedExpiryTombstone.Bytes, tombstone.Bytes) {
			return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
		}
		return record, true, nil
	}
	if record.Status != "active" || record.RetireRequest != nil || record.RetirementReceipt != nil {
		return EvaluationNativeProviderStateVaultRecord{}, false, ErrConflict
	}
	record.ForcedExpiryTombstone = &tombstone
	record.Status = "expired-unqualified"
	record.CiphertextBytes, record.CiphertextNonce = nil, nil
	record.WrappedStateKeyBytes, record.WrappedStateKeyNonce = nil, nil
	repository.records[opaqueRef] = record
	if repository.failForcedExpiryAfter {
		repository.failForcedExpiryAfter = false
		return EvaluationNativeProviderStateVaultRecord{}, false, context.DeadlineExceeded
	}
	return record, false, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) LookupEvaluationNativeProviderStateVaultRetirement(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	requestDigest string,
) (EvaluationNativeProviderStateVaultRecord, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	opaqueRef, ok := repository.retirements[requestDigest]
	if !ok {
		return EvaluationNativeProviderStateVaultRecord{}, ErrNotFound
	}
	return repository.records[opaqueRef], nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) ListEvaluationNativeProviderStateVaultActive(
	_ context.Context,
	_ EvaluationAuthority,
	repositoryCommit string,
	ownerInstanceID string,
	now time.Time,
	expiredAcrossInstances bool,
	limit int,
) ([]EvaluationNativeProviderStateVaultRecord, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	records := make([]EvaluationNativeProviderStateVaultRecord, 0, len(repository.records))
	for _, record := range repository.records {
		if record.Partition.RepositoryCommit == repositoryCommit && record.Status == "active" &&
			((expiredAcrossInstances && !record.SealRequest.ExpiresAt.After(now)) ||
				(!expiredAcrossInstances && record.OwnerInstanceID == ownerInstanceID)) {
			records = append(records, record)
			if len(records) == limit {
				break
			}
		}
	}
	return records, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) EvaluationNativeProviderStateVaultSummary(
	_ context.Context,
	_ EvaluationAuthority,
	ownerInstanceID string,
	now time.Time,
) (EvaluationNativeProviderStateVaultSummary, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	var summary EvaluationNativeProviderStateVaultSummary
	for _, record := range repository.records {
		if record.OwnerInstanceID != ownerInstanceID {
			continue
		}
		summary.SealedRecordCount++
		if record.Status == "active" {
			summary.ActiveEncryptedRecordCount++
			if record.SealRequest.ExpiresAt.Before(now) {
				summary.OverdueActiveRecordCount++
			}
			continue
		}
		if record.Status == "expired-unqualified" {
			summary.ForcedExpiryTombstoneCount++
			continue
		}
		summary.RetiredRecordCount++
		switch record.Disposition {
		case "cancelled":
			summary.CancelledRetirementCount++
		case "consumed":
			summary.ConsumedRetirementCount++
		case "expired":
			summary.ExpiredRetirementCount++
		}
	}
	return summary, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) ListEvaluationNativeProviderStateVaultActiveForRecovery(
	_ context.Context,
	_ EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerInstanceID string,
	limit int,
) ([]EvaluationNativeProviderStateVaultRecord, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	records := make([]EvaluationNativeProviderStateVaultRecord, 0, len(repository.records))
	for _, record := range repository.records {
		if record.Partition == partition && record.OwnerInstanceID == ownerInstanceID && record.Status == "active" {
			records = append(records, record)
			if len(records) == limit {
				break
			}
		}
	}
	return records, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) StoreEvaluationNativeProviderStateVaultRecovery(
	_ context.Context,
	_ EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerInstanceID string,
	request evaluationNativeProviderStateVaultRecoveryRequest,
	dispositions []evaluationNativeProviderStateVaultRecoveryDisposition,
	receipt evaluationNativeProviderStateVaultRecoveryReceipt,
) (evaluationNativeProviderStateVaultRecoveryReceipt, bool, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	if stored, ok := repository.recoveries[request.RecoveryRequestDigest]; ok {
		if !bytes.Equal(stored.request.Bytes, request.Bytes) || !bytes.Equal(stored.receipt.Bytes, receipt.Bytes) {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
		return stored.receipt, true, nil
	}
	active := make(map[string]EvaluationNativeProviderStateVaultRecord)
	for opaqueRef, record := range repository.records {
		if record.Partition == partition && record.OwnerInstanceID == ownerInstanceID && record.Status == "active" {
			active[opaqueRef] = record
		}
	}
	if len(active) != len(dispositions) {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
	}
	for _, disposition := range dispositions {
		record, ok := active[disposition.OpaqueProviderStateRef]
		if !ok || disposition.SealRequestDigest != record.SealRequest.SealRequestDigest {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
		if disposition.ForcedExpiryTombstone != nil {
			record.ForcedExpiryTombstone = disposition.ForcedExpiryTombstone
			record.Status = "expired-unqualified"
		} else if disposition.RetireRequest != nil && disposition.RetirementReceipt != nil {
			record.RetireRequest = disposition.RetireRequest
			record.RetirementReceipt = disposition.RetirementReceipt
			record.Status, record.Disposition = "retired", disposition.RetireRequest.Disposition
			repository.retirements[disposition.RetireRequest.RetireRequestDigest] = record.OpaqueProviderStateRef
		} else {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
		record.CiphertextBytes, record.CiphertextNonce = nil, nil
		record.WrappedStateKeyBytes, record.WrappedStateKeyNonce = nil, nil
		record.RecoveryRequestDigest = request.RecoveryRequestDigest
		repository.records[record.OpaqueProviderStateRef] = record
	}
	repository.recoveries[request.RecoveryRequestDigest] = evaluationNativeProviderStateVaultTestRecovery{
		request: request, receipt: receipt,
	}
	if repository.failRecoveryAfter {
		repository.failRecoveryAfter = false
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, context.DeadlineExceeded
	}
	return receipt, false, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) LookupEvaluationNativeProviderStateVaultRecovery(
	_ context.Context,
	_ EvaluationAuthority,
	_ EvaluationPlanPartition,
	recoveryRequestDigest string,
) (evaluationNativeProviderStateVaultRecoveryRequest, evaluationNativeProviderStateVaultRecoveryReceipt, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	stored, ok := repository.recoveries[recoveryRequestDigest]
	if !ok {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrNotFound
	}
	return stored.request, stored.receipt, nil
}

func (repository *evaluationNativeProviderStateVaultTestRepository) CountEvaluationNativeProviderStateVaultActiveForRecovery(
	_ context.Context,
	_ EvaluationAuthority,
	partition EvaluationPlanPartition,
	ownerInstanceID string,
) (int64, error) {
	repository.mu.Lock()
	defer repository.mu.Unlock()
	var count int64
	for _, record := range repository.records {
		if record.Partition == partition && record.OwnerInstanceID == ownerInstanceID && record.Status == "active" {
			count++
		}
	}
	return count, nil
}

func evaluationNativeProviderStateVaultTestDigest(t *testing.T, value any) string {
	t.Helper()
	digest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	return digest
}

func evaluationNativeProviderStateVaultTestSealCommand(
	t *testing.T,
	authorityDigest, invocationID, handle string,
	observedAt time.Time,
) evaluationNativeProviderStateVaultSealCommand {
	t.Helper()
	kind := "response-id"
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultSealRequestFormat, "version": int64(1),
		"authorityDigest": authorityDigest, "purpose": "background-job-state", "attemptId": "attempt.state-vault.test",
		"protocolFamily": "openai-responses", "providerStateReferenceKind": kind,
		"providerStateReferenceDigest": evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"kind": kind, "value": handle}),
		"probeProgramDigest":           evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"fixture": "program"}),
		"capabilityProfileDigest":      evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"fixture": "profile"}),
		"invocationId":                 invocationID, "requestDigest": evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"fixture": "request", "invocation": invocationID}),
		"responseDigest":           evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"fixture": "response", "invocation": invocationID}),
		"responseBodyDigest":       evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"fixture": "body", "invocation": invocationID}),
		"sealedResponseJsonDigest": evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"fixture": "json", "invocation": invocationID}),
		"providerConfigurationId":  "provider.openai.test", "modelLineageDigest": evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"fixture": "model"}),
		"adapterDigest": evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"fixture": "adapter"}),
		"taskId":        "task.state-vault.test", "runId": "run.state-vault.test", "generation": int64(1),
		"observedAt": evaluationNativeProviderStateVaultInstant(observedAt),
		"expiresAt":  evaluationNativeProviderStateVaultInstant(observedAt.Add(evaluationNativeProviderStateVaultLifetime)),
	}
	request := cloneEvaluationObject(base)
	request["sealRequestDigest"] = evaluationNativeProviderStateVaultTestDigest(t, base)
	command := map[string]any{
		"format": evaluationNativeProviderStateVaultSealCommandFormat, "version": int64(1),
		"request": request, "callbackLocalProviderStateHandle": handle,
	}
	source, err := canonicaljson.Bytes(command)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeEvaluationNativeProviderStateVaultSealCommand(source)
	if err != nil {
		t.Fatal(err)
	}
	return decoded
}

func evaluationNativeProviderStateVaultTestResolveRequest(
	t *testing.T,
	record EvaluationNativeProviderStateVaultRecord,
	requestedAt time.Time,
) evaluationNativeProviderStateVaultResolveRequest {
	t.Helper()
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultResolveRequestFormat, "version": int64(1),
		"authorityDigest": record.AuthorityDigest, "opaqueProviderStateRef": record.OpaqueProviderStateRef,
		"sealRequestDigest": record.SealRequest.SealRequestDigest, "sealReceiptDigest": record.SealReceipt.ReceiptDigest,
		"purpose": record.Purpose, "providerStateReferenceKind": record.ProviderStateReferenceKind,
		"providerStateReferenceDigest": record.ProviderStateReferenceDigest,
		"sourceAttemptId":              record.AttemptID, "sourceInvocationId": record.InvocationID,
		"sourceGeneration": record.Generation, "consumerAttemptId": record.AttemptID,
		"consumerInvocationId": "invocation.state-vault.consumer", "consumerGeneration": record.Generation,
		"taskId": record.TaskID, "runId": record.RunID,
		"requestedAt": evaluationNativeProviderStateVaultInstant(requestedAt),
		"expiresAt":   evaluationNativeProviderStateVaultInstant(record.SealRequest.ExpiresAt),
	}
	value := cloneEvaluationObject(base)
	value["resolveRequestDigest"] = evaluationNativeProviderStateVaultTestDigest(t, base)
	source, _ := canonicaljson.Bytes(value)
	request, err := decodeEvaluationNativeProviderStateVaultResolveRequest(source)
	if err != nil {
		t.Fatal(err)
	}
	return request
}

func evaluationNativeProviderStateVaultTestRetireRequest(
	t *testing.T,
	record EvaluationNativeProviderStateVaultRecord,
	requestedAt time.Time,
) evaluationNativeProviderStateVaultRetireRequest {
	t.Helper()
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultRetireRequestFormat, "version": int64(1),
		"authorityDigest": record.AuthorityDigest, "opaqueProviderStateRef": record.OpaqueProviderStateRef,
		"sealRequestDigest": record.SealRequest.SealRequestDigest, "sealReceiptDigest": record.SealReceipt.ReceiptDigest,
		"resolveReceiptDigest": record.ResolveReceipt.ReceiptDigest, "purpose": record.Purpose,
		"sourceAttemptId": record.AttemptID, "sourceInvocationId": record.InvocationID,
		"sourceGeneration": record.Generation, "consumerAttemptId": record.ResolveRequest.ConsumerAttemptID,
		"consumerInvocationId": record.ResolveRequest.ConsumerInvocationID,
		"consumerGeneration":   record.ResolveRequest.ConsumerGeneration, "disposition": "consumed",
		"requestedAt": evaluationNativeProviderStateVaultInstant(requestedAt),
		"expiresAt":   evaluationNativeProviderStateVaultInstant(record.SealRequest.ExpiresAt),
	}
	value := cloneEvaluationObject(base)
	value["retireRequestDigest"] = evaluationNativeProviderStateVaultTestDigest(t, base)
	source, _ := canonicaljson.Bytes(value)
	request, err := decodeEvaluationNativeProviderStateVaultRetireRequest(source)
	if err != nil {
		t.Fatal(err)
	}
	return request
}

func TestEvaluationNativeProviderStateVaultSealsResolvesRetiresAndReconciles(t *testing.T) {
	repository := newEvaluationNativeProviderStateVaultTestRepository()
	scanner := &evaluationNativeProviderStateVaultTestScanner{}
	now := time.Date(2026, 8, 9, 8, 0, 0, 0, time.UTC)
	clock := func() time.Time { return now }
	vault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: bytes.Repeat([]byte{0x31}, 32),
		OwnerInstanceID: evaluationNativeProviderStateVaultTestOwnerInstance, Scanner: scanner,
		Clock: clock, Random: bytes.NewReader(bytes.Repeat([]byte{0x42}, 2_048)),
	})
	if err != nil {
		t.Fatal(err)
	}
	authority, _ := vault.Authority()
	if authority.AuthorityImplementationDigest != "sha256-70a8bce30a4b87debb41cb0be08966110f40cfe6ecec009f0483063097cf43a6" ||
		authority.AuthorityDigest != "sha256-d00e2b445724baa7a611628b3861496c676dcdeff026f3405c221bbcea2debcf" {
		t.Fatalf("state vault authority vector drifted: %+v", authority)
	}
	serviceAuthority := EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.state-vault.test"}
	partition := EvaluationPlanPartition{PlanDigest: evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault"}), RepositoryCommit: "0123456789abcdef0123456789abcdef01234567"}
	command := evaluationNativeProviderStateVaultTestSealCommand(t, authority.AuthorityDigest, "invocation.state-vault.source", "resp_state_vault_1", now)
	sealReceipt, replayed, err := vault.Seal(context.Background(), serviceAuthority, partition, command)
	if err != nil || replayed || sealReceipt.Status != "sealed" {
		t.Fatalf("seal failed: replay=%v status=%s err=%v", replayed, sealReceipt.Status, err)
	}
	if replayReceipt, replay, err := vault.Seal(context.Background(), serviceAuthority, partition, command); err != nil || !replay ||
		!bytes.Equal(replayReceipt.Bytes, sealReceipt.Bytes) {
		t.Fatalf("seal replay drifted: replay=%v err=%v", replay, err)
	}
	record, _ := repository.LoadEvaluationNativeProviderStateVaultRecord(context.Background(), serviceAuthority, partition, sealReceipt.OpaqueProviderStateRef)
	if bytes.Contains(record.CiphertextBytes, []byte(command.CallbackLocalProviderStateHandle)) || len(record.WrappedStateKeyBytes) == 0 {
		t.Fatal("callback-local handle was not independently encrypted")
	}
	now = now.Add(time.Second)
	resolveRequest := evaluationNativeProviderStateVaultTestResolveRequest(t, record, now)
	resolveResult, replay, err := vault.Resolve(context.Background(), serviceAuthority, partition, resolveRequest)
	if err != nil || replay || resolveResult.Receipt.Status != "resolved" ||
		resolveResult.CallbackLocalProviderStateHandle != command.CallbackLocalProviderStateHandle {
		t.Fatalf("resolve failed: replay=%v status=%s err=%v", replay, resolveResult.Receipt.Status, err)
	}
	if replayResult, replayed, err := vault.Resolve(context.Background(), serviceAuthority, partition, resolveRequest); err != nil || !replayed ||
		!bytes.Equal(replayResult.Bytes, resolveResult.Bytes) {
		t.Fatalf("resolve replay drifted: replay=%v err=%v", replayed, err)
	}
	record, _ = repository.LoadEvaluationNativeProviderStateVaultRecord(context.Background(), serviceAuthority, partition, sealReceipt.OpaqueProviderStateRef)
	now = now.Add(time.Second)
	retireRequest := evaluationNativeProviderStateVaultTestRetireRequest(t, record, now)
	repository.failRetirementAfter = true
	retirementReceipt, replayed, err := vault.Retire(context.Background(), serviceAuthority, partition, retireRequest)
	if err != nil || !replayed || retirementReceipt.Disposition != "consumed" {
		t.Fatalf("retirement ACK-loss reconcile failed: replay=%v disposition=%s err=%v", replayed, retirementReceipt.Disposition, err)
	}
	stored, _ := repository.LoadEvaluationNativeProviderStateVaultRecord(context.Background(), serviceAuthority, partition, sealReceipt.OpaqueProviderStateRef)
	if stored.Status != "retired" || len(stored.CiphertextBytes) != 0 || len(stored.WrappedStateKeyBytes) != 0 {
		t.Fatal("retirement did not cryptographically expire the state")
	}
	lookup, err := vault.LookupRetirement(context.Background(), serviceAuthority, partition, retireRequest.RetireRequestDigest)
	if err != nil || !bytes.Equal(lookup.Bytes, retirementReceipt.Bytes) {
		t.Fatalf("retirement lookup drifted: %v", err)
	}
}

func TestEvaluationNativeProviderStateVaultSweepAndHTTPPurposeBoundary(t *testing.T) {
	repository := newEvaluationNativeProviderStateVaultTestRepository()
	scanner := &evaluationNativeProviderStateVaultTestScanner{}
	now := time.Date(2026, 8, 9, 9, 0, 0, 0, time.UTC)
	vault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: bytes.Repeat([]byte{0x51}, 32),
		OwnerInstanceID: evaluationNativeProviderStateVaultTestOwnerInstance, Scanner: scanner,
		Clock: func() time.Time { return now }, Random: bytes.NewReader(bytes.Repeat([]byte{0x62}, 2_048)),
	})
	if err != nil {
		t.Fatal(err)
	}
	authority, _ := vault.Authority()
	command := evaluationNativeProviderStateVaultTestSealCommand(t, authority.AuthorityDigest, "invocation.state-vault.sweep", "resp_state_vault_sweep", now)
	token := "ledger-token-state-vault-0123456789abcdef"
	handler, err := NewEvaluationServiceHandler(struct{}{}, EvaluationServiceHandlerConfig{
		NamespaceID: "namespace.state-vault.test", ServiceToken: token, NativeProviderStateVault: vault,
		Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	path := "/v1/evaluations/namespace.state-vault.test/" + evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault-http"}) +
		"/0123456789abcdef0123456789abcdef01234567/native-provider-state-vault/seal"
	request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(command.Bytes))
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", command.Request.SealRequestDigest)
	request.Header.Set(evaluationNativeProviderStateVaultPurposeHeader, "wrong-purpose")
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusForbidden || len(repository.records) != 0 {
		t.Fatalf("wrong purpose reached vault: status=%d records=%d", response.Code, len(repository.records))
	}
	request = httptest.NewRequest(http.MethodPost, path, bytes.NewReader(command.Bytes))
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", command.Request.SealRequestDigest)
	request.Header.Set(evaluationNativeProviderStateVaultPurposeHeader, evaluationNativeProviderStateVaultPurpose)
	response = httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || len(repository.records) != 1 {
		t.Fatalf("seal route failed: status=%d body=%s", response.Code, response.Body.String())
	}
	now = now.Add(evaluationNativeProviderStateVaultLifetime)
	summary, err := vault.SweepNamespace(context.Background(), "namespace.state-vault.test", "0123456789abcdef0123456789abcdef01234567", false)
	if err != nil || summary.ActiveEncryptedRecordCount != 0 || summary.ExpiredRetirementCount != 1 {
		t.Fatalf("expiry sweep failed: summary=%+v err=%v", summary, err)
	}
	healthRequest := httptest.NewRequest(http.MethodGet, "/v1/evaluations/namespace.state-vault.test/native-provider-state-vault/health", nil)
	healthRequest.Header.Set("Authorization", "Bearer "+token)
	healthRequest.Header.Set(evaluationNativeProviderStateVaultPurposeHeader, evaluationNativeProviderStateVaultPurpose)
	healthResponse := httptest.NewRecorder()
	handler.ServeHTTP(healthResponse, healthRequest)
	if healthResponse.Code != http.StatusOK || !bytes.Contains(healthResponse.Body.Bytes(), []byte(`"activeEncryptedRecordCount":0`)) ||
		!bytes.Contains(healthResponse.Body.Bytes(), []byte(`"expired":1`)) {
		t.Fatalf("health did not prove zero active state: status=%d body=%s", healthResponse.Code, healthResponse.Body.String())
	}
	scanner.err = ErrUnauthorized
	second := evaluationNativeProviderStateVaultTestSealCommand(t, authority.AuthorityDigest, "invocation.state-vault.rejected", "resp_state_vault_rejected", now)
	_, _, err = vault.Seal(context.Background(), EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.state-vault.test"},
		EvaluationPlanPartition{PlanDigest: evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault-http"}), RepositoryCommit: "0123456789abcdef0123456789abcdef01234567"}, second)
	if !errors.Is(err, ErrUnauthorized) || len(repository.records) != 1 {
		t.Fatalf("scanner rejection reached durable store: err=%v records=%d", err, len(repository.records))
	}
}

func TestEvaluationNativeProviderStateVaultOwnerInstancesIsolateShutdownAndAllowExpiredRecovery(t *testing.T) {
	repository := newEvaluationNativeProviderStateVaultTestRepository()
	now := time.Date(2026, 8, 9, 10, 0, 0, 0, time.UTC)
	newVault := func(ownerInstanceID string, randomByte byte) *EvaluationNativeProviderStateVault {
		t.Helper()
		vault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
			Repository: repository, MasterKey: bytes.Repeat([]byte{0x71}, 32), OwnerInstanceID: ownerInstanceID,
			Scanner: &evaluationNativeProviderStateVaultTestScanner{}, Clock: func() time.Time { return now },
			Random: bytes.NewReader(bytes.Repeat([]byte{randomByte}, 2_048)),
		})
		if err != nil {
			t.Fatal(err)
		}
		return vault
	}
	vaultA := newVault("g4-run.1.shard-a", 0x72)
	vaultB := newVault("g4-run.1.shard-b", 0x73)
	vaultC := newVault("g4-run.1.crashed-shard", 0x74)
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.state-vault.instances",
	}
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault-instances"}),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	stateAuthority, _ := vaultA.Authority()
	seal := func(vault *EvaluationNativeProviderStateVault, invocationID, handle string) evaluationNativeProviderStateVaultSealReceipt {
		t.Helper()
		receipt, replayed, err := vault.Seal(
			context.Background(), authority, partition,
			evaluationNativeProviderStateVaultTestSealCommand(t, stateAuthority.AuthorityDigest, invocationID, handle, now),
		)
		if err != nil || replayed {
			t.Fatalf("seal %s failed: replay=%v err=%v", invocationID, replayed, err)
		}
		return receipt
	}
	receiptA := seal(vaultA, "invocation.state-vault.instance-a", "resp_state_vault_instance_a")
	receiptB := seal(vaultB, "invocation.state-vault.instance-b", "resp_state_vault_instance_b")
	_ = seal(vaultC, "invocation.state-vault.instance-c", "resp_state_vault_instance_c")
	recordB, _ := repository.LoadEvaluationNativeProviderStateVaultRecord(
		context.Background(), authority, partition, receiptB.OpaqueProviderStateRef,
	)
	if _, _, err := vaultA.Resolve(
		context.Background(), authority, partition,
		evaluationNativeProviderStateVaultTestResolveRequest(t, recordB, now.Add(time.Second)),
	); !errors.Is(err, ErrUnauthorized) {
		t.Fatalf("foreign instance resolve was accepted: %v", err)
	}
	if err := vaultA.Close(context.Background(), authority, partition.RepositoryCommit); err != nil {
		t.Fatal(err)
	}
	recordA, _ := repository.LoadEvaluationNativeProviderStateVaultRecord(
		context.Background(), authority, partition, receiptA.OpaqueProviderStateRef,
	)
	recordB, _ = repository.LoadEvaluationNativeProviderStateVaultRecord(
		context.Background(), authority, partition, receiptB.OpaqueProviderStateRef,
	)
	if recordA.Status != "retired" || recordA.Disposition != "cancelled" || recordB.Status != "active" {
		t.Fatalf("instance shutdown crossed isolation: A=%s/%s B=%s", recordA.Status, recordA.Disposition, recordB.Status)
	}
	summaryA, _ := vaultA.Summary(context.Background(), authority)
	summaryB, _ := vaultB.Summary(context.Background(), authority)
	if summaryA.ActiveEncryptedRecordCount != 0 || summaryB.ActiveEncryptedRecordCount != 1 {
		t.Fatalf("instance summaries drifted: A=%+v B=%+v", summaryA, summaryB)
	}
	now = now.Add(evaluationNativeProviderStateVaultLifetime)
	globalSummary, err := vaultB.Sweep(context.Background(), authority, partition.RepositoryCommit, false)
	if err != nil || globalSummary.ActiveEncryptedRecordCount != 0 || globalSummary.ExpiredRetirementCount != 1 {
		t.Fatalf("global expiry recovery failed: summary=%+v err=%v", globalSummary, err)
	}
	for _, record := range repository.records {
		if record.Status == "active" {
			t.Fatalf("global expiry left active state owned by %s", record.OwnerInstanceID)
		}
	}
}

func TestEvaluationNativeProviderStateVaultLateCrashRecoveryDestroysSecretsAndTombstonesUnqualifiedState(t *testing.T) {
	repository := newEvaluationNativeProviderStateVaultTestRepository()
	now := time.Date(2026, 8, 9, 10, 30, 0, 0, time.UTC)
	newVault := func(ownerInstanceID string, randomByte byte) *EvaluationNativeProviderStateVault {
		t.Helper()
		vault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
			Repository: repository, MasterKey: bytes.Repeat([]byte{0x75}, 32), OwnerInstanceID: ownerInstanceID,
			Scanner: &evaluationNativeProviderStateVaultTestScanner{}, Clock: func() time.Time { return now },
			Random: bytes.NewReader(bytes.Repeat([]byte{randomByte}, 2_048)),
		})
		if err != nil {
			t.Fatal(err)
		}
		return vault
	}
	crashedVault := newVault("g4-run.2.crashed-shard", 0x76)
	recoveryVault := newVault("g4-run.2.recovery-shard", 0x77)
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.state-vault.late-expiry",
	}
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault-late-expiry"}),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	stateAuthority, _ := crashedVault.Authority()
	receipt, replayed, err := crashedVault.Seal(
		context.Background(), authority, partition,
		evaluationNativeProviderStateVaultTestSealCommand(
			t, stateAuthority.AuthorityDigest, "invocation.state-vault.late-expiry", "resp_state_vault_late_expiry", now,
		),
	)
	if err != nil || replayed {
		t.Fatalf("late-expiry seed seal failed: replay=%v err=%v", replayed, err)
	}
	now = now.Add(evaluationNativeProviderStateVaultLifetime + evaluationNativeProviderStateVaultMaximumACKDelay + time.Millisecond)
	repository.failForcedExpiryAfter = true
	if _, err := recoveryVault.Sweep(context.Background(), authority, partition.RepositoryCommit, false); err != nil {
		t.Fatalf("late cross-instance sweep failed after committed ACK loss: %v", err)
	}
	record, err := repository.LoadEvaluationNativeProviderStateVaultRecord(
		context.Background(), authority, partition, receipt.OpaqueProviderStateRef,
	)
	if err != nil {
		t.Fatal(err)
	}
	if record.Status != "expired-unqualified" || record.RetireRequest != nil || record.RetirementReceipt != nil ||
		record.ForcedExpiryTombstone == nil || len(record.CiphertextBytes) != 0 || len(record.CiphertextNonce) != 0 ||
		len(record.WrappedStateKeyBytes) != 0 || len(record.WrappedStateKeyNonce) != 0 {
		t.Fatalf("late expiry retained recoverable state or synthesized release evidence: %+v", record)
	}
	tombstone, err := decodeEvaluationNativeProviderStateVaultForcedExpiryTombstone(record.ForcedExpiryTombstone.Bytes)
	if err != nil || tombstone.TombstoneDigest != record.ForcedExpiryTombstone.TombstoneDigest ||
		tombstone.OwnerInstanceID != "g4-run.2.crashed-shard" || tombstone.Reason != evaluationNativeProviderStateVaultForcedExpiryReason {
		t.Fatalf("late expiry tombstone drifted: tombstone=%+v err=%v", tombstone, err)
	}
	crashedSummary, err := crashedVault.Summary(context.Background(), authority)
	if err != nil || crashedSummary.ActiveEncryptedRecordCount != 0 || crashedSummary.ForcedExpiryTombstoneCount != 1 ||
		crashedSummary.RetiredRecordCount != 0 {
		t.Fatalf("late expiry summary drifted: summary=%+v err=%v", crashedSummary, err)
	}
}

func evaluationNativeProviderStateVaultTestRecoveryRequest(
	t *testing.T,
	namespaceID string,
	partition EvaluationPlanPartition,
	ownerInstanceID string,
	authorityDigest string,
	requestedAt time.Time,
) evaluationNativeProviderStateVaultRecoveryRequest {
	t.Helper()
	base := map[string]any{
		"format":      evaluationNativeProviderStateVaultRecoveryRequestFormat,
		"version":     evaluationNativeProviderStateVaultVersion,
		"namespaceId": namespaceID, "planDigest": partition.PlanDigest,
		"repositoryCommit": partition.RepositoryCommit, "vaultOwnerInstanceId": ownerInstanceID,
		"authorityDigest": authorityDigest, "reason": evaluationNativeProviderStateVaultRecoveryReason,
		"requestedAt": evaluationNativeProviderStateVaultInstant(requestedAt),
	}
	value := cloneEvaluationObject(base)
	value["recoveryRequestDigest"] = evaluationNativeProviderStateVaultTestDigest(t, base)
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationNativeProviderStateVaultRecoveryRequest(source)
	if err != nil {
		t.Fatal(err)
	}
	return request
}

func TestEvaluationNativeProviderStateVaultRecoveryModeSealsAtomicZeroAndReconcilesACKLoss(t *testing.T) {
	repository := newEvaluationNativeProviderStateVaultTestRepository()
	now := time.Date(2026, 8, 9, 10, 45, 0, 0, time.UTC)
	ownerInstanceID := "g4-run.3.crashed-shard"
	masterKey := bytes.Repeat([]byte{0x91}, 32)
	normalVault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: masterKey, OwnerInstanceID: ownerInstanceID,
		Scanner: &evaluationNativeProviderStateVaultTestScanner{}, Clock: func() time.Time { return now },
		Random: bytes.NewReader(bytes.Repeat([]byte{0x92}, 4_096)),
	})
	if err != nil {
		t.Fatal(err)
	}
	stateAuthority, _ := normalVault.Authority()
	serviceAuthority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.state-vault.recovery",
	}
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault-recovery"}),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	for index := 0; index < 2; index++ {
		invocationID := "invocation.state-vault.recovery-a"
		handle := "resp_state_vault_recovery_a"
		if index == 1 {
			invocationID, handle = "invocation.state-vault.recovery-b", "resp_state_vault_recovery_b"
		}
		if _, replayed, err := normalVault.Seal(
			context.Background(), serviceAuthority, partition,
			evaluationNativeProviderStateVaultTestSealCommand(t, stateAuthority.AuthorityDigest, invocationID, handle, now),
		); err != nil || replayed {
			t.Fatalf("recovery seed %d failed: replay=%v err=%v", index, replayed, err)
		}
	}
	now = now.Add(time.Second)
	recoveryVault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: masterKey, OwnerInstanceID: ownerInstanceID,
		RecoveryOnly: true, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	if !recoveryVault.RecoveryOnly() {
		t.Fatal("recovery vault did not freeze recovery-only mode")
	}
	wrongKeyRecoveryVault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: bytes.Repeat([]byte{0x93}, 32), OwnerInstanceID: ownerInstanceID,
		RecoveryOnly: true, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	wrongKeyRequest := evaluationNativeProviderStateVaultTestRecoveryRequest(
		t, serviceAuthority.NamespaceID, partition, ownerInstanceID, stateAuthority.AuthorityDigest, now,
	)
	if _, _, err := wrongKeyRecoveryVault.Recover(
		context.Background(), serviceAuthority, partition, wrongKeyRequest,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("recovery accepted a different vault master key: %v", err)
	}
	token := "ledger-token-state-vault-recovery-0123456789abcdef"
	handler, err := NewEvaluationServiceHandler(struct{}{}, EvaluationServiceHandlerConfig{
		NamespaceID: serviceAuthority.NamespaceID, ServiceToken: token,
		NativeProviderStateVault: recoveryVault, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	healthPath := "/v1/evaluations/" + serviceAuthority.NamespaceID + "/native-provider-state-vault/health"
	healthRequest := httptest.NewRequest(http.MethodGet, healthPath, nil)
	healthRequest.Header.Set("Authorization", "Bearer "+token)
	healthRequest.Header.Set(evaluationNativeProviderStateVaultPurposeHeader, evaluationNativeProviderStateVaultRecoveryPurpose)
	healthResponse := httptest.NewRecorder()
	handler.ServeHTTP(healthResponse, healthRequest)
	if healthResponse.Code != http.StatusOK ||
		!bytes.Contains(healthResponse.Body.Bytes(), []byte(`"mode":"recovery-only"`)) ||
		!bytes.Contains(healthResponse.Body.Bytes(), []byte(`"recoveryRequired":true`)) {
		t.Fatalf("recovery health drifted: status=%d body=%s", healthResponse.Code, healthResponse.Body.String())
	}
	healthValue, healthErr := decodeCanonicalEvaluationObject(
		healthResponse.Body.Bytes(), maximumEvaluationNativeProviderStateVaultComponentBytes,
	)
	healthBase := cloneEvaluationObject(healthValue)
	delete(healthBase, "healthDigest")
	healthDigest, healthDigestErr := canonicaljson.Digest(healthBase)
	if healthErr != nil || healthDigestErr != nil || !exactEvaluationKeys(healthValue, []string{
		"format", "version", "authority", "vaultOwnerInstanceId", "mode", "status", "recoveryRequired",
		"activeEncryptedRecordCount", "overdueActiveRecordCount", "checkedAt", "expiresAt", "healthDigest",
	}) || stringMember(healthValue, "healthDigest") != healthDigest ||
		!sameEvaluationCanonicalValue(healthValue["authority"], stateAuthority) {
		t.Fatalf("recovery health canonical authority drifted: value=%#v err=%v digestErr=%v", healthValue, healthErr, healthDigestErr)
	}
	publicHealth := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	publicHealthResponse := httptest.NewRecorder()
	handler.ServeHTTP(publicHealthResponse, publicHealth)
	if publicHealthResponse.Code != http.StatusUnauthorized {
		t.Fatalf("recovery mode exposed public health: status=%d", publicHealthResponse.Code)
	}
	authorizedPublicHealth := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	authorizedPublicHealth.Header.Set("Authorization", "Bearer "+token)
	authorizedPublicHealthResponse := httptest.NewRecorder()
	handler.ServeHTTP(authorizedPublicHealthResponse, authorizedPublicHealth)
	if authorizedPublicHealthResponse.Code != http.StatusNotFound {
		t.Fatalf("recovery mode retained the normal public health route: status=%d", authorizedPublicHealthResponse.Code)
	}
	recoveryRequest := evaluationNativeProviderStateVaultTestRecoveryRequest(
		t, serviceAuthority.NamespaceID, partition, ownerInstanceID, stateAuthority.AuthorityDigest, now,
	)
	path := "/v1/evaluations/" + serviceAuthority.NamespaceID + "/" + partition.PlanDigest + "/" +
		partition.RepositoryCommit + "/native-provider-state-vault/recovery"
	post := func(purpose string) *httptest.ResponseRecorder {
		request := httptest.NewRequest(http.MethodPost, path, bytes.NewReader(recoveryRequest.Bytes))
		request.Header.Set("Authorization", "Bearer "+token)
		request.Header.Set("Content-Type", "application/json")
		request.Header.Set("Idempotency-Key", recoveryRequest.RecoveryRequestDigest)
		request.Header.Set(evaluationNativeProviderStateVaultPurposeHeader, purpose)
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, request)
		return response
	}
	if wrong := post(evaluationNativeProviderStateVaultPurpose); wrong.Code != http.StatusForbidden {
		t.Fatalf("normal vault purpose entered recovery: status=%d", wrong.Code)
	}
	repository.failRecoveryAfter = true
	response := post(evaluationNativeProviderStateVaultRecoveryPurpose)
	if response.Code != http.StatusOK {
		t.Fatalf("committed recovery ACK-loss did not reconcile: status=%d body=%s", response.Code, response.Body.String())
	}
	receipt, err := decodeEvaluationNativeProviderStateVaultRecoveryReceipt(response.Body.Bytes())
	if err != nil || receipt.RetiredRecordCount != 2 || receipt.CancelledRetirementCount != 2 ||
		receipt.ResidualActiveEncryptedRecordCount != 0 {
		t.Fatalf("recovery receipt drifted: receipt=%+v err=%v", receipt, err)
	}
	for _, record := range repository.records {
		if record.Status != "retired" || record.Disposition != "cancelled" ||
			len(record.CiphertextBytes) != 0 || len(record.CiphertextNonce) != 0 ||
			len(record.WrappedStateKeyBytes) != 0 || len(record.WrappedStateKeyNonce) != 0 {
			t.Fatalf("recovery retained active cryptographic material: %+v", record)
		}
	}
	replay := post(evaluationNativeProviderStateVaultRecoveryPurpose)
	if replay.Code != http.StatusOK || !bytes.Equal(replay.Body.Bytes(), response.Body.Bytes()) {
		t.Fatalf("recovery replay drifted: status=%d body=%s", replay.Code, replay.Body.String())
	}
	lookupPath := "/v1/evaluations/" + serviceAuthority.NamespaceID + "/" + partition.PlanDigest + "/" +
		partition.RepositoryCommit + "/native-provider-state-vault/recoveries/" + recoveryRequest.RecoveryRequestDigest
	lookupRequest := httptest.NewRequest(http.MethodGet, lookupPath, nil)
	lookupRequest.Header.Set("Authorization", "Bearer "+token)
	lookupRequest.Header.Set(evaluationNativeProviderStateVaultPurposeHeader, evaluationNativeProviderStateVaultRecoveryPurpose)
	lookupResponse := httptest.NewRecorder()
	handler.ServeHTTP(lookupResponse, lookupRequest)
	if lookupResponse.Code != http.StatusOK || !bytes.Equal(lookupResponse.Body.Bytes(), receipt.Bytes) {
		t.Fatalf("recovery lookup drifted: status=%d body=%s", lookupResponse.Code, lookupResponse.Body.String())
	}
	zeroRequest := httptest.NewRequest(http.MethodGet, lookupPath+"/zero-residual", nil)
	zeroRequest.Header.Set("Authorization", "Bearer "+token)
	zeroRequest.Header.Set(evaluationNativeProviderStateVaultPurposeHeader, evaluationNativeProviderStateVaultRecoveryPurpose)
	zeroResponse := httptest.NewRecorder()
	handler.ServeHTTP(zeroResponse, zeroRequest)
	if zeroResponse.Code != http.StatusOK ||
		!bytes.Contains(zeroResponse.Body.Bytes(), []byte(`"activeEncryptedRecordCount":0`)) ||
		!bytes.Contains(zeroResponse.Body.Bytes(), []byte(`"recoveryReceiptDigest":"`+receipt.ReceiptDigest+`"`)) {
		t.Fatalf("recovery zero receipt drifted: status=%d body=%s", zeroResponse.Code, zeroResponse.Body.String())
	}
	zeroValue, zeroErr := decodeCanonicalEvaluationObject(
		zeroResponse.Body.Bytes(), maximumEvaluationNativeProviderStateVaultComponentBytes,
	)
	zeroBase := cloneEvaluationObject(zeroValue)
	delete(zeroBase, "zeroResidualReceiptDigest")
	zeroDigest, zeroDigestErr := canonicaljson.Digest(zeroBase)
	if zeroErr != nil || zeroDigestErr != nil || !exactEvaluationKeys(zeroValue, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "vaultOwnerInstanceId",
		"authorityDigest", "recoveryRequestDigest", "recoveryReceiptDigest", "activeEncryptedRecordCount",
		"checkedAt", "expiresAt", "zeroResidualReceiptDigest",
	}) || stringMember(zeroValue, "zeroResidualReceiptDigest") != zeroDigest {
		t.Fatalf("recovery zero canonical receipt drifted: value=%#v err=%v digestErr=%v", zeroValue, zeroErr, zeroDigestErr)
	}
	normalSealPath := "/v1/evaluations/" + serviceAuthority.NamespaceID + "/" + partition.PlanDigest + "/" +
		partition.RepositoryCommit + "/native-provider-state-vault/seal"
	normalSealRequest := httptest.NewRequest(http.MethodPost, normalSealPath, bytes.NewReader([]byte(`{}`)))
	normalSealRequest.Header.Set("Authorization", "Bearer "+token)
	normalSealRequest.Header.Set(evaluationNativeProviderStateVaultPurposeHeader, evaluationNativeProviderStateVaultPurpose)
	normalSealResponse := httptest.NewRecorder()
	handler.ServeHTTP(normalSealResponse, normalSealRequest)
	if normalSealResponse.Code != http.StatusNotFound {
		t.Fatalf("recovery mode exposed normal seal route: status=%d", normalSealResponse.Code)
	}
	reviveCommand := evaluationNativeProviderStateVaultTestSealCommand(
		t, stateAuthority.AuthorityDigest, "invocation.state-vault.recovery-revive", "resp_state_vault_recovery_revive", now,
	)
	if _, _, err := normalVault.Seal(context.Background(), serviceAuthority, partition, reviveCommand); !errors.Is(err, ErrConflict) {
		t.Fatalf("terminal recovery fence allowed the crashed owner to seal new state: %v", err)
	}
	if err := recoveryVault.CloseNamespace(context.Background(), serviceAuthority.NamespaceID, partition.RepositoryCommit); err != nil {
		t.Fatalf("recovery vault did not close after zero proof: %v", err)
	}
}

func TestEvaluationNativeProviderStateVaultRecoveryRequestRejectsShapeAndOwnerDrift(t *testing.T) {
	now := time.Date(2026, 8, 9, 10, 50, 0, 0, time.UTC)
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault-recovery-invalid"}),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	repository := newEvaluationNativeProviderStateVaultTestRepository()
	recoveryVault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: bytes.Repeat([]byte{0xa1}, 32),
		OwnerInstanceID: "g4-run.4.crashed-shard", RecoveryOnly: true, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	authority, _ := recoveryVault.Authority()
	request := evaluationNativeProviderStateVaultTestRecoveryRequest(
		t, "namespace.state-vault.recovery-invalid", partition, "g4-run.4.other-shard", authority.AuthorityDigest, now,
	)
	serviceAuthority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.state-vault.recovery-invalid",
	}
	if _, _, err := recoveryVault.Recover(context.Background(), serviceAuthority, partition, request); !errors.Is(err, ErrInvalid) {
		t.Fatalf("recovery accepted a caller-selected owner: %v", err)
	}
	extra := cloneEvaluationObject(request.Value)
	extra["extra"] = true
	extraBytes, _ := canonicaljson.Bytes(extra)
	if _, err := decodeEvaluationNativeProviderStateVaultRecoveryRequest(extraBytes); !errors.Is(err, ErrInvalid) {
		t.Fatalf("recovery request accepted an extra field: %v", err)
	}
}

func TestEvaluationNativeProviderStateVaultRecoveryModePersistsLateForcedExpiryWithoutReleaseReceipt(t *testing.T) {
	repository := newEvaluationNativeProviderStateVaultTestRepository()
	now := time.Date(2026, 8, 9, 10, 55, 0, 0, time.UTC)
	ownerInstanceID := "g4-run.5.crashed-shard"
	masterKey := bytes.Repeat([]byte{0xb1}, 32)
	normalVault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: masterKey, OwnerInstanceID: ownerInstanceID,
		Scanner: &evaluationNativeProviderStateVaultTestScanner{}, Clock: func() time.Time { return now },
		Random: bytes.NewReader(bytes.Repeat([]byte{0xb2}, 2_048)),
	})
	if err != nil {
		t.Fatal(err)
	}
	authority, _ := normalVault.Authority()
	serviceAuthority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.state-vault.recovery-late",
	}
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault-recovery-late"}),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	sealReceipt, replayed, err := normalVault.Seal(
		context.Background(), serviceAuthority, partition,
		evaluationNativeProviderStateVaultTestSealCommand(
			t, authority.AuthorityDigest, "invocation.state-vault.recovery-late", "resp_state_vault_recovery_late", now,
		),
	)
	if err != nil || replayed {
		t.Fatalf("late recovery seed failed: replay=%v err=%v", replayed, err)
	}
	now = now.Add(evaluationNativeProviderStateVaultLifetime + evaluationNativeProviderStateVaultMaximumACKDelay + time.Millisecond)
	recoveryVault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: masterKey, OwnerInstanceID: ownerInstanceID,
		RecoveryOnly: true, Clock: func() time.Time { return now },
	})
	if err != nil {
		t.Fatal(err)
	}
	request := evaluationNativeProviderStateVaultTestRecoveryRequest(
		t, serviceAuthority.NamespaceID, partition, ownerInstanceID, authority.AuthorityDigest, now,
	)
	receipt, replayed, err := recoveryVault.Recover(context.Background(), serviceAuthority, partition, request)
	if err != nil || replayed || receipt.RetiredRecordCount != 0 || receipt.ForcedExpiryTombstoneCount != 1 {
		t.Fatalf("late recovery receipt drifted: receipt=%+v replay=%v err=%v", receipt, replayed, err)
	}
	record, err := repository.LoadEvaluationNativeProviderStateVaultRecord(
		context.Background(), serviceAuthority, partition, sealReceipt.OpaqueProviderStateRef,
	)
	if err != nil || record.Status != "expired-unqualified" || record.ForcedExpiryTombstone == nil ||
		record.RetireRequest != nil || record.RetirementReceipt != nil || len(record.CiphertextBytes) != 0 ||
		len(record.WrappedStateKeyBytes) != 0 {
		t.Fatalf("late recovery synthesized release evidence or retained secrets: record=%+v err=%v", record, err)
	}
}

func TestEvaluationNativeProviderStateVaultArchiveLifecycleRequiresFullDurablePreimages(t *testing.T) {
	repository := newEvaluationNativeProviderStateVaultTestRepository()
	now := time.Date(2026, 8, 9, 11, 0, 0, 0, time.UTC)
	vault, err := NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: repository, MasterKey: bytes.Repeat([]byte{0x81}, 32),
		OwnerInstanceID: "g4-run.1.archive", Scanner: &evaluationNativeProviderStateVaultTestScanner{},
		Clock: func() time.Time { return now }, Random: bytes.NewReader(bytes.Repeat([]byte{0x82}, 2_048)),
	})
	if err != nil {
		t.Fatal(err)
	}
	stateAuthority, _ := vault.Authority()
	authority := EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: "namespace.state-vault.archive",
	}
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"plan": "vault-archive"}),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	command := evaluationNativeProviderStateVaultTestSealCommand(
		t, stateAuthority.AuthorityDigest, "invocation.state-vault.archive", "resp_state_vault_archive", now,
	)
	sealReceipt, _, err := vault.Seal(context.Background(), authority, partition, command)
	if err != nil {
		t.Fatal(err)
	}
	record, _ := repository.LoadEvaluationNativeProviderStateVaultRecord(
		context.Background(), authority, partition, sealReceipt.OpaqueProviderStateRef,
	)
	now = now.Add(time.Second)
	resolveRequest := evaluationNativeProviderStateVaultTestResolveRequest(t, record, now)
	if _, _, err := vault.Resolve(context.Background(), authority, partition, resolveRequest); err != nil {
		t.Fatal(err)
	}
	record, _ = repository.LoadEvaluationNativeProviderStateVaultRecord(
		context.Background(), authority, partition, sealReceipt.OpaqueProviderStateRef,
	)
	now = now.Add(time.Second)
	retireRequest := evaluationNativeProviderStateVaultTestRetireRequest(t, record, now)
	if _, _, err := vault.Retire(context.Background(), authority, partition, retireRequest); err != nil {
		t.Fatal(err)
	}
	record, _ = repository.LoadEvaluationNativeProviderStateVaultRecord(
		context.Background(), authority, partition, sealReceipt.OpaqueProviderStateRef,
	)
	nativeReceipt := map[string]any{"source": map[string]any{
		"sourceKind":                   "provider-job-terminal-status",
		"providerStateReferenceDigest": record.ProviderStateReferenceDigest,
		"opaqueProviderStateRef":       record.OpaqueProviderStateRef,
		"stateVaultAuthorityDigest":    record.AuthorityDigest,
		"stateVaultSealRequestDigest":  record.SealRequest.SealRequestDigest,
		"stateVaultSealReceiptDigest":  record.SealReceipt.ReceiptDigest,
		"taskId":                       record.TaskID, "runId": record.RunID,
		"generation":     evaluationNativeProviderStateVaultJSONNumber(record.Generation),
		"providerStatus": "completed",
	}}
	outerReceipt := map[string]any{
		"invocationId": record.InvocationID, "providerRequestDigest": record.SealRequest.RequestDigest,
		"responseDigest": record.SealRequest.ResponseDigest, "protocolFamily": record.SealRequest.ProtocolFamily,
		"providerConfigurationId": record.SealRequest.ProviderConfigurationID,
		"modelLineageDigest":      record.SealRequest.ModelLineageDigest,
		"adapterDigest":           record.SealRequest.AdapterDigest,
		"capabilityProfileDigest": record.SealRequest.CapabilityProfileDigest,
	}
	archive := &EvaluationOptionalFactSourceArchiveRecord{
		AttemptID: record.AttemptID, StateVaultStatus: record.Status,
		StateVaultSealRequestBytes: record.SealRequest.Bytes, StateVaultSealReceiptBytes: record.SealReceipt.Bytes,
		StateVaultResolveRequestBytes: record.ResolveRequest.Bytes, StateVaultResolveReceiptBytes: record.ResolveReceipt.Bytes,
		StateVaultRetireRequestBytes:     record.RetireRequest.Bytes,
		StateVaultRetirementReceiptBytes: record.RetirementReceipt.Bytes,
	}
	if _, err := decodeEvaluationNativeProviderStateVaultSealRequest(archive.StateVaultSealRequestBytes); err != nil {
		t.Fatalf("archive seal request preimage drifted: %v", err)
	}
	if _, err := decodeEvaluationNativeProviderStateVaultSealReceipt(
		archive.StateVaultSealReceiptBytes, record.SealRequest,
	); err != nil {
		t.Fatalf("archive seal receipt preimage drifted: %v", err)
	}
	if _, err := decodeEvaluationNativeProviderStateVaultResolveRequest(archive.StateVaultResolveRequestBytes); err != nil {
		t.Fatalf("archive resolve request preimage drifted: %v", err)
	}
	if _, err := decodeEvaluationNativeProviderStateVaultResolveReceipt(
		archive.StateVaultResolveReceiptBytes, *record.ResolveRequest,
	); err != nil {
		t.Fatalf("archive resolve receipt preimage drifted: %v", err)
	}
	if _, err := decodeEvaluationNativeProviderStateVaultRetireRequest(archive.StateVaultRetireRequestBytes); err != nil {
		t.Fatalf("archive retire request preimage drifted: %v", err)
	}
	if _, err := decodeEvaluationNativeProviderStateVaultRetirementReceipt(
		archive.StateVaultRetirementReceiptBytes, *record.RetireRequest, record.SealReceipt,
	); err != nil {
		t.Fatalf("archive retirement receipt preimage drifted: %v", err)
	}
	lifecycle, err := evaluationOptionalFactNativeStateVaultArchive(archive, nativeReceipt, outerReceipt)
	if err != nil || lifecycle.sealRequest == nil || lifecycle.sealReceipt == nil ||
		lifecycle.resolveRequest == nil || lifecycle.resolveReceipt == nil ||
		lifecycle.retireRequest == nil || lifecycle.retirementReceipt == nil {
		t.Fatalf("full state-vault archive lifecycle was rejected: %+v err=%v", lifecycle, err)
	}
	missingRetirement := *archive
	missingRetirement.StateVaultRetirementReceiptBytes = nil
	if _, err := evaluationOptionalFactNativeStateVaultArchive(&missingRetirement, nativeReceipt, outerReceipt); !errors.Is(err, ErrConflict) {
		t.Fatalf("archive without retirement preimage was accepted: %v", err)
	}
	swappedOuter := cloneEvaluationObject(outerReceipt)
	swappedOuter["responseDigest"] = evaluationNativeProviderStateVaultTestDigest(t, map[string]any{"swap": "response"})
	if _, err := evaluationOptionalFactNativeStateVaultArchive(archive, nativeReceipt, swappedOuter); !errors.Is(err, ErrConflict) {
		t.Fatalf("recommitted foreign response lifecycle was accepted: %v", err)
	}
}
