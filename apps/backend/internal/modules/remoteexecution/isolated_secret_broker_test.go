package remoteexecution

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/ecdh"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
	"github.com/gin-gonic/gin"
	"golang.org/x/crypto/hkdf"
)

type fakeIsolatedSecretStore struct {
	authority   *ExecutionAuthority
	document    []byte
	key         *IsolatedSecretResolutionKey
	envelope    json.RawMessage
	abandonment int
}

func (store *fakeIsolatedSecretStore) GetExecutionAuthorityForSecretBroker(_ context.Context, executionID string) (*ExecutionAuthority, error) {
	if store.authority == nil || store.authority.ExecutionID != executionID {
		return nil, ErrExecutionNotFound
	}
	copy := *store.authority
	return &copy, nil
}

func (store *fakeIsolatedSecretStore) GetCodeDocument(_ context.Context, authority ExecutionAuthority, documentID string) ([]byte, error) {
	if store.authority == nil || authority.ExecutionID != store.authority.ExecutionID || documentID != "code-secret" {
		return nil, ErrExecutionAuthorityConflict
	}
	return append([]byte(nil), store.document...), nil
}

func (store *fakeIsolatedSecretStore) ReserveIsolatedSecretResolution(_ context.Context, key IsolatedSecretResolutionKey) (*IsolatedSecretResolutionReservation, error) {
	if store.key == nil {
		copy := key
		store.key = &copy
		return &IsolatedSecretResolutionReservation{Kind: "reserved"}, nil
	}
	if key.WorkerAttempt > store.key.WorkerAttempt &&
		key.ExecutionID == store.key.ExecutionID &&
		key.ArtifactID == store.key.ArtifactID &&
		key.ExportName == store.key.ExportName &&
		key.InvocationID == store.key.InvocationID {
		copy := key
		store.key = &copy
		store.envelope = nil
		return &IsolatedSecretResolutionReservation{Kind: "reserved"}, nil
	}
	if *store.key != key {
		return nil, ErrIsolatedSecretResolutionConflict
	}
	if len(store.envelope) == 0 {
		return &IsolatedSecretResolutionReservation{Kind: "pending"}, nil
	}
	return &IsolatedSecretResolutionReservation{Kind: "existing", Envelope: append(json.RawMessage(nil), store.envelope...)}, nil
}

func (store *fakeIsolatedSecretStore) CompleteIsolatedSecretResolution(_ context.Context, key IsolatedSecretResolutionKey, envelope json.RawMessage) error {
	if store.key == nil || *store.key != key || len(store.envelope) != 0 {
		return ErrIsolatedSecretResolutionConflict
	}
	store.envelope = append(json.RawMessage(nil), envelope...)
	return nil
}

func (store *fakeIsolatedSecretStore) AbandonIsolatedSecretResolution(_ context.Context, key IsolatedSecretResolutionKey) error {
	if store.key != nil && *store.key == key && len(store.envelope) == 0 {
		store.key = nil
		store.abandonment++
	}
	return nil
}

func isolatedSecretCodeDocument() []byte {
	return []byte(`{"language":"ts","source":"export const useKey = () => undefined;","metadata":{"prodivix.serverRuntime":{"schemaVersion":"1.0","functionsByExport":{"useKey":{"kind":"function","runtimeZone":"server","adapterId":"prodivix.code-export","effect":"read","auth":{"kind":"public"},"inputSchema":true,"outputSchema":true,"environment":{"secretsByField":{"signingKey":{"bindingId":"webhook-signing-key"}}}}}}}}`)
}

func decryptIsolatedSecretEnvelope(t *testing.T, privateKey *ecdh.PrivateKey, raw json.RawMessage) map[string]string {
	t.Helper()
	var envelope isolatedSecretEnvelope
	if err := json.Unmarshal(raw, &envelope); err != nil {
		t.Fatal(err)
	}
	ephemeralBytes, err := base64.RawURLEncoding.DecodeString(envelope.EphemeralPublicKey)
	if err != nil {
		t.Fatal(err)
	}
	ephemeral, err := ecdh.X25519().NewPublicKey(ephemeralBytes)
	if err != nil {
		t.Fatal(err)
	}
	shared, err := privateKey.ECDH(ephemeral)
	if err != nil {
		t.Fatal(err)
	}
	key := make([]byte, 32)
	if _, err := io.ReadFull(hkdf.New(sha256.New, shared, isolatedSecretKeySalt, isolatedSecretEnvelopeAAD(envelope)), key); err != nil {
		t.Fatal(err)
	}
	block, err := aes.NewCipher(key)
	if err != nil {
		t.Fatal(err)
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		t.Fatal(err)
	}
	nonce, _ := base64.RawURLEncoding.DecodeString(envelope.Nonce)
	sealed, _ := base64.RawURLEncoding.DecodeString(envelope.Ciphertext)
	plaintext, err := gcm.Open(nil, nonce, sealed, isolatedSecretEnvelopeAAD(envelope))
	if err != nil {
		t.Fatal(err)
	}
	var material struct {
		Format string            `json:"format"`
		Fields map[string]string `json:"fields"`
	}
	if json.Unmarshal(plaintext, &material) != nil || material.Format != isolatedSecretMaterialFormat {
		t.Fatal("isolated Secret plaintext is invalid")
	}
	return material.Fields
}

func TestIsolatedSecretBrokerSealsExactRevisionMaterialAndRotatesCiphertextAcrossWorkerAttempts(t *testing.T) {
	now := time.Unix(10, 0).UTC()
	store := &fakeIsolatedSecretStore{
		authority: &ExecutionAuthority{
			ExecutionID: "execution-secret",
			WorkspaceID: "workspace-1",
			OwnerID:     "user-1",
			SessionID:   "session-server-only",
			SnapshotID:  "snapshot-1",
			PartitionRevisions: map[string]string{
				"workspace":                    "2",
				"document:code-secret:content": "7",
			},
			Environment: &EnvironmentReference{EnvironmentID: "environment-production", Revision: "environment-revision-1", Mode: "live"},
		},
		document: isolatedSecretCodeDocument(),
	}
	environment := serverFunctionEnvironmentFixture()
	secretCanary := "isolated-secret-material-canary"
	environment.material = []byte(secretCanary)
	broker := NewIsolatedSecretBroker(store, environment)
	broker.now = func() time.Time { return now }
	broker.random = bytes.NewReader(bytes.Repeat([]byte{0x42}, 128))
	recipient, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	request := isolatedSecretResolutionRequest{
		Format:             isolatedSecretResolutionRequestFormat,
		ExecutionID:        "execution-secret",
		WorkerID:           "worker-1",
		WorkerAttempt:      3,
		WorkspaceID:        "workspace-1",
		SnapshotID:         "snapshot-1",
		FunctionRef:        serverFunctionReference{ArtifactID: "code-secret", ExportName: "useKey"},
		InvocationID:       "invocation-secret",
		RecipientPublicKey: base64.RawURLEncoding.EncodeToString(recipient.PublicKey().Bytes()),
	}
	envelope, err := broker.Resolve(t.Context(), request)
	if err != nil {
		t.Fatal(err)
	}
	if bytes.Contains(envelope, []byte(secretCanary)) {
		t.Fatal("Secret material entered the durable envelope")
	}
	fields := decryptIsolatedSecretEnvelope(t, recipient, envelope)
	if fields["signingKey"] != secretCanary || len(fields) != 1 {
		t.Fatalf("unexpected Secret fields: %#v", fields)
	}
	if environment.grant.ProviderID != isolatedSecretEnvironmentProviderID || environment.grant.ProviderIsolation != "remote-isolated" || environment.grant.ExecutionClass != "isolated-runner" || environment.grant.RuntimeZone != "server" || environment.grant.ResourceID != "execution-secret:code-secret:useKey:invocation-secret:3" || len(environment.grant.SecretBindings) != 1 || environment.grant.SecretBindings[0] != (backendenvironment.SecretBindingGrant{BindingID: "webhook-signing-key", Field: "signingKey"}) {
		t.Fatalf("unexpected environment grant: %#v", environment.grant)
	}
	if environment.revokedGrant != "server-function-grant-1" {
		t.Fatal("environment grant was not revoked")
	}
	replayed, err := broker.Resolve(t.Context(), request)
	if err != nil || !bytes.Equal(replayed, envelope) {
		t.Fatal("exact retry did not replay the sealed envelope")
	}
	recoveryRecipient, err := ecdh.X25519().GenerateKey(rand.Reader)
	if err != nil {
		t.Fatal(err)
	}
	recovered := request
	recovered.WorkerID = "worker-2"
	recovered.WorkerAttempt++
	recovered.RecipientPublicKey = base64.RawURLEncoding.EncodeToString(recoveryRecipient.PublicKey().Bytes())
	recoveryEnvelope, err := broker.Resolve(t.Context(), recovered)
	if err != nil {
		t.Fatalf("resolve recovered attempt: %v", err)
	}
	if bytes.Equal(recoveryEnvelope, envelope) {
		t.Fatal("recovered attempt reused the old ciphertext envelope")
	}
	if fields := decryptIsolatedSecretEnvelope(t, recoveryRecipient, recoveryEnvelope); fields["signingKey"] != secretCanary || len(fields) != 1 {
		t.Fatalf("unexpected recovered Secret fields: %#v", fields)
	}
	if environment.grant.ResourceID != "execution-secret:code-secret:useKey:invocation-secret:4" {
		t.Fatalf("recovery grant did not bind the new attempt: %#v", environment.grant)
	}
	if replayed, err := broker.Resolve(t.Context(), recovered); err != nil || !bytes.Equal(replayed, recoveryEnvelope) {
		t.Fatal("recovered exact retry did not replay its own sealed envelope")
	}
	if _, err := broker.Resolve(t.Context(), request); !errors.Is(err, ErrIsolatedSecretDenied) {
		t.Fatalf("superseded worker attempt was not denied: %v", err)
	}
	drifted := recovered
	drifted.WorkerAttempt++
	drifted.InvocationID = "drifted-invocation"
	if _, err := broker.Resolve(t.Context(), drifted); !errors.Is(err, ErrIsolatedSecretDenied) {
		t.Fatalf("recovered invocation drift was not denied: %v", err)
	}
}

func TestInternalIsolatedSecretBrokerRejectsServiceTokenWithoutCachingOrEcho(t *testing.T) {
	gin.SetMode(gin.TestMode)
	serviceToken := "isolated-secret-broker-service-token-canary"
	handler := &Handler{
		secretBroker:      &IsolatedSecretBroker{},
		secretBrokerToken: serviceToken,
	}

	for _, testCase := range []struct {
		name          string
		authorization string
		status        int
	}{
		{name: "missing bearer", status: http.StatusUnauthorized},
		{name: "wrong bearer", authorization: "Bearer wrong-service-token", status: http.StatusForbidden},
	} {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/internal/remote-execution-secrets", strings.NewReader(`{"format":"ignored"}`))
			if testCase.authorization != "" {
				request.Header.Set("Authorization", testCase.authorization)
			}
			response := httptest.NewRecorder()
			context, _ := gin.CreateTestContext(response)
			context.Request = request

			handler.HandleInternalSecrets(context)

			if response.Code != testCase.status {
				t.Fatalf("unexpected status: got %d, want %d", response.Code, testCase.status)
			}
			if response.Header().Get("Cache-Control") != "no-store" || response.Header().Get("X-Content-Type-Options") != "nosniff" {
				t.Fatalf("missing hardened response headers: %#v", response.Header())
			}
			if strings.Contains(response.Body.String(), serviceToken) || strings.Contains(response.Body.String(), "wrong-service-token") {
				t.Fatalf("service token entered the response: %s", response.Body.String())
			}
			if !strings.Contains(response.Body.String(), "EXE-5004") {
				t.Fatalf("sanitized failure code is missing: %s", response.Body.String())
			}
		})
	}
}
