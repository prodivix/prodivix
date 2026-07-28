package verification

import (
	"bytes"
	"testing"
)

func TestMutationLedgerRequestIsCanonicalAndBindsPrincipalOperationAndPayload(t *testing.T) {
	const key = "mutation-ledger-key-0001"
	payload := tombstoneMutationPayload{
		EvidenceID: "evidence-1", Reason: "cleanup", ExpectedState: "active",
	}
	first, err := prepareMutationLedgerRequest(
		"workspace-1", "actor-1", key, mutationTombstone, payload,
	)
	if err != nil {
		t.Fatal(err)
	}
	second, err := prepareMutationLedgerRequest(
		"workspace-1", "actor-1", key, mutationTombstone, payload,
	)
	if err != nil {
		t.Fatal(err)
	}
	if first.IdempotencyKeyHash != second.IdempotencyKeyHash ||
		first.RequestDigest != second.RequestDigest ||
		!bytes.Equal(first.RequestBytes, second.RequestBytes) {
		t.Fatal("identical mutation request did not canonicalize identically")
	}
	if bytes.Contains(first.RequestBytes, []byte(key)) {
		t.Fatal("raw Idempotency-Key entered durable canonical request bytes")
	}
	changedPayload, err := prepareMutationLedgerRequest(
		"workspace-1", "actor-1", key, mutationTombstone,
		tombstoneMutationPayload{
			EvidenceID: "evidence-1", Reason: "different", ExpectedState: "active",
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if changedPayload.IdempotencyKeyHash != first.IdempotencyKeyHash ||
		changedPayload.RequestDigest == first.RequestDigest {
		t.Fatal("same key with different payload did not preserve key identity and change request digest")
	}
	changedActor, err := prepareMutationLedgerRequest(
		"workspace-1", "actor-2", key, mutationTombstone, payload,
	)
	if err != nil {
		t.Fatal(err)
	}
	if changedActor.RequestDigest == first.RequestDigest {
		t.Fatal("mutation request digest does not bind the authenticated principal")
	}
}
