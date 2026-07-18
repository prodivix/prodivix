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
	"fmt"
	"io"
	"sort"
	"strings"
	"time"
	"unicode/utf8"

	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
	"golang.org/x/crypto/hkdf"
)

const (
	isolatedSecretResolutionRequestFormat = "prodivix.isolated-server-function-secret-resolution.v1"
	isolatedSecretEnvelopeFormat          = "prodivix.remote-execution-secret-envelope.v1"
	isolatedSecretEnvelopeAlgorithm       = "X25519-HKDF-SHA256-AES-256-GCM"
	isolatedSecretMaterialFormat          = "prodivix.isolated-server-function-secret-material.v1"
	isolatedSecretEnvironmentProviderID   = "prodivix.isolated-server-function-worker"
	isolatedCodeExportAdapterID           = "prodivix.code-export"
	maximumIsolatedSecretBrokerBodyBytes  = 64 * 1024
	maximumIsolatedSecretMaterialBytes    = 64 * 1024
	maximumIsolatedSecretCiphertextBytes  = 512 * 1024
	maximumIsolatedSecretEnvelopeBytes    = 768 * 1024
	isolatedSecretEnvelopeTTL             = 30 * time.Second
)

var (
	ErrIsolatedSecretDenied      = errors.New("isolated Secret resolution denied")
	ErrIsolatedSecretUnavailable = errors.New("isolated Secret resolution unavailable")
	isolatedSecretKeySalt        = []byte("prodivix.remote-execution-secret-envelope.key.v1")
)

type isolatedSecretResolutionRequest struct {
	Format             string                  `json:"format"`
	ExecutionID        string                  `json:"executionId"`
	WorkerID           string                  `json:"workerId"`
	WorkerAttempt      int64                   `json:"workerAttempt"`
	WorkspaceID        string                  `json:"workspaceId"`
	SnapshotID         string                  `json:"snapshotId"`
	FunctionRef        serverFunctionReference `json:"functionRef"`
	InvocationID       string                  `json:"invocationId"`
	RecipientPublicKey string                  `json:"recipientPublicKey"`
}

type isolatedSecretEnvelope struct {
	Format             string                  `json:"format"`
	Algorithm          string                  `json:"algorithm"`
	ExecutionID        string                  `json:"executionId"`
	WorkerID           string                  `json:"workerId"`
	WorkerAttempt      int64                   `json:"workerAttempt"`
	WorkspaceID        string                  `json:"workspaceId"`
	SnapshotID         string                  `json:"snapshotId"`
	FunctionRef        serverFunctionReference `json:"functionRef"`
	InvocationID       string                  `json:"invocationId"`
	RecipientPublicKey string                  `json:"recipientPublicKey"`
	EphemeralPublicKey string                  `json:"ephemeralPublicKey"`
	Nonce              string                  `json:"nonce"`
	Ciphertext         string                  `json:"ciphertext"`
	ExpiresAt          int64                   `json:"expiresAt"`
}

type IsolatedSecretBroker struct {
	store        IsolatedSecretBrokerStore
	environments DataGatewayEnvironmentStore
	now          func() time.Time
	random       io.Reader
}

func NewIsolatedSecretBroker(store IsolatedSecretBrokerStore, environments DataGatewayEnvironmentStore) *IsolatedSecretBroker {
	return &IsolatedSecretBroker{store: store, environments: environments, now: func() time.Time { return time.Now().UTC() }, random: rand.Reader}
}

func (broker *IsolatedSecretBroker) Available() bool {
	return broker != nil && broker.store != nil && broker.environments != nil && broker.environments.Available() && broker.now != nil && broker.random != nil
}

func decodeIsolatedSecretResolutionRequest(body []byte) (*isolatedSecretResolutionRequest, error) {
	fields, ok := exactJSONFields(body, []string{"format", "executionId", "workerId", "workerAttempt", "workspaceId", "snapshotId", "functionRef", "invocationId", "recipientPublicKey"})
	if !ok {
		return nil, ErrIsolatedSecretDenied
	}
	if _, ok := exactJSONFields(fields["functionRef"], []string{"artifactId", "exportName"}); !ok {
		return nil, ErrIsolatedSecretDenied
	}
	var request isolatedSecretResolutionRequest
	if json.Unmarshal(body, &request) != nil || request.Format != isolatedSecretResolutionRequestFormat {
		return nil, ErrIsolatedSecretDenied
	}
	workerID, workerOK := normalizedServerFunctionID(request.WorkerID, false)
	artifactID, artifactOK := normalizedServerFunctionID(request.FunctionRef.ArtifactID, false)
	exportName, exportOK := normalizedServerFunctionID(request.FunctionRef.ExportName, true)
	invocationID, invocationOK := normalizedDataGatewayID(request.InvocationID)
	executionID, executionOK := normalizedDataGatewayID(request.ExecutionID)
	workspaceID, workspaceOK := normalizedDataGatewayID(request.WorkspaceID)
	snapshotID, snapshotOK := normalizedDataGatewayID(request.SnapshotID)
	publicKey, keyErr := base64.RawURLEncoding.DecodeString(request.RecipientPublicKey)
	if !workerOK || !artifactOK || !exportOK || !invocationOK || !executionOK || !workspaceOK || !snapshotOK || request.WorkerAttempt < 1 || keyErr != nil || len(publicKey) != 32 || base64.RawURLEncoding.EncodeToString(publicKey) != request.RecipientPublicKey {
		return nil, ErrIsolatedSecretDenied
	}
	request.WorkerID = workerID
	request.FunctionRef = serverFunctionReference{ArtifactID: artifactID, ExportName: exportName}
	request.InvocationID = invocationID
	request.ExecutionID = executionID
	request.WorkspaceID = workspaceID
	request.SnapshotID = snapshotID
	return &request, nil
}

func validIsolatedSecretPolicy(entry *serverFunctionProfileEntry) bool {
	if entry == nil || entry.AdapterID != isolatedCodeExportAdapterID || entry.RuntimeZone != "server" || entry.Effect != "read" || len(entry.Idempotency) != 0 || entry.Environment == nil || len(entry.Environment.SecretsByField) == 0 || len(entry.Environment.SecretsByField) > 32 {
		return false
	}
	if entry.Auth.Kind == "public" || entry.Auth.Kind == "authenticated" {
		return true
	}
	return entry.Auth.Kind == "permission" && entry.Auth.PermissionID == workspaceOwnerPermissionID
}

func isolatedSecretEnvelopeAAD(envelope isolatedSecretEnvelope) []byte {
	return []byte(strings.Join([]string{
		envelope.Format,
		envelope.Algorithm,
		envelope.ExecutionID,
		envelope.WorkerID,
		fmt.Sprintf("%d", envelope.WorkerAttempt),
		envelope.WorkspaceID,
		envelope.SnapshotID,
		envelope.FunctionRef.ArtifactID,
		envelope.FunctionRef.ExportName,
		envelope.InvocationID,
		envelope.RecipientPublicKey,
		envelope.EphemeralPublicKey,
		fmt.Sprintf("%d", envelope.ExpiresAt),
	}, "\n"))
}

func appendJSONSecretString(target *bytes.Buffer, material []byte) error {
	if len(material) == 0 || len(material) > maximumIsolatedSecretMaterialBytes || !utf8.Valid(material) {
		return ErrIsolatedSecretDenied
	}
	target.WriteByte('"')
	const hex = "0123456789abcdef"
	for _, current := range material {
		switch current {
		case '"', '\\':
			target.WriteByte('\\')
			target.WriteByte(current)
		case '\b':
			target.WriteString("\\b")
		case '\f':
			target.WriteString("\\f")
		case '\n':
			target.WriteString("\\n")
		case '\r':
			target.WriteString("\\r")
		case '\t':
			target.WriteString("\\t")
		default:
			if current < 0x20 {
				target.WriteString("\\u00")
				target.WriteByte(hex[current>>4])
				target.WriteByte(hex[current&0x0f])
			} else {
				target.WriteByte(current)
			}
		}
	}
	target.WriteByte('"')
	return nil
}

func sealIsolatedSecretMaterial(randomSource io.Reader, request isolatedSecretResolutionRequest, expiresAt time.Time, plaintext []byte) (json.RawMessage, error) {
	recipientBytes, err := base64.RawURLEncoding.DecodeString(request.RecipientPublicKey)
	if err != nil {
		return nil, err
	}
	curve := ecdh.X25519()
	recipient, err := curve.NewPublicKey(recipientBytes)
	if err != nil {
		return nil, err
	}
	ephemeral, err := curve.GenerateKey(randomSource)
	if err != nil {
		return nil, err
	}
	shared, err := ephemeral.ECDH(recipient)
	if err != nil {
		return nil, err
	}
	defer clear(shared)
	envelope := isolatedSecretEnvelope{
		Format:             isolatedSecretEnvelopeFormat,
		Algorithm:          isolatedSecretEnvelopeAlgorithm,
		ExecutionID:        request.ExecutionID,
		WorkerID:           request.WorkerID,
		WorkerAttempt:      request.WorkerAttempt,
		WorkspaceID:        request.WorkspaceID,
		SnapshotID:         request.SnapshotID,
		FunctionRef:        request.FunctionRef,
		InvocationID:       request.InvocationID,
		RecipientPublicKey: request.RecipientPublicKey,
		EphemeralPublicKey: base64.RawURLEncoding.EncodeToString(ephemeral.PublicKey().Bytes()),
		ExpiresAt:          expiresAt.UnixMilli(),
	}
	aad := isolatedSecretEnvelopeAAD(envelope)
	key := make([]byte, 32)
	if _, err := io.ReadFull(hkdf.New(sha256.New, shared, isolatedSecretKeySalt, aad), key); err != nil {
		return nil, err
	}
	defer clear(key)
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, err
	}
	if len(plaintext)+gcm.Overhead() > maximumIsolatedSecretCiphertextBytes {
		return nil, ErrIsolatedSecretDenied
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(randomSource, nonce); err != nil {
		return nil, err
	}
	envelope.Nonce = base64.RawURLEncoding.EncodeToString(nonce)
	envelope.Ciphertext = base64.RawURLEncoding.EncodeToString(gcm.Seal(nil, nonce, plaintext, aad))
	encoded, err := json.Marshal(envelope)
	if err != nil || len(encoded) > maximumIsolatedSecretEnvelopeBytes {
		return nil, ErrIsolatedSecretDenied
	}
	return encoded, nil
}

func readExistingIsolatedSecretEnvelope(raw json.RawMessage, request isolatedSecretResolutionRequest, now time.Time) (json.RawMessage, error) {
	fields, ok := exactJSONFields(raw, []string{"format", "algorithm", "executionId", "workerId", "workerAttempt", "workspaceId", "snapshotId", "functionRef", "invocationId", "recipientPublicKey", "ephemeralPublicKey", "nonce", "ciphertext", "expiresAt"})
	if !ok {
		return nil, ErrIsolatedSecretDenied
	}
	if _, ok := exactJSONFields(fields["functionRef"], []string{"artifactId", "exportName"}); !ok {
		return nil, ErrIsolatedSecretDenied
	}
	var envelope isolatedSecretEnvelope
	if json.Unmarshal(raw, &envelope) != nil || envelope.Format != isolatedSecretEnvelopeFormat || envelope.Algorithm != isolatedSecretEnvelopeAlgorithm || envelope.ExecutionID != request.ExecutionID || envelope.WorkerID != request.WorkerID || envelope.WorkerAttempt != request.WorkerAttempt || envelope.WorkspaceID != request.WorkspaceID || envelope.SnapshotID != request.SnapshotID || envelope.FunctionRef != request.FunctionRef || envelope.InvocationID != request.InvocationID || envelope.RecipientPublicKey != request.RecipientPublicKey || envelope.ExpiresAt <= now.UnixMilli() {
		return nil, ErrIsolatedSecretDenied
	}
	for value, expected := range map[string]int{envelope.EphemeralPublicKey: 32, envelope.Nonce: 12} {
		decoded, err := base64.RawURLEncoding.DecodeString(value)
		if err != nil || len(decoded) != expected || base64.RawURLEncoding.EncodeToString(decoded) != value {
			return nil, ErrIsolatedSecretDenied
		}
	}
	ciphertext, err := base64.RawURLEncoding.DecodeString(envelope.Ciphertext)
	if err != nil || len(ciphertext) <= 16 || len(ciphertext) > maximumIsolatedSecretCiphertextBytes || base64.RawURLEncoding.EncodeToString(ciphertext) != envelope.Ciphertext {
		return nil, ErrIsolatedSecretDenied
	}
	return append(json.RawMessage(nil), raw...), nil
}

func (broker *IsolatedSecretBroker) Resolve(ctx context.Context, request isolatedSecretResolutionRequest) (json.RawMessage, error) {
	if !broker.Available() {
		return nil, ErrIsolatedSecretUnavailable
	}
	authority, err := broker.store.GetExecutionAuthorityForSecretBroker(ctx, request.ExecutionID)
	if err != nil || authority == nil || authority.ExecutionID != request.ExecutionID || authority.WorkspaceID != request.WorkspaceID || authority.SnapshotID != request.SnapshotID || authority.SessionID == "" || authority.Environment == nil || authority.Environment.Mode != "live" {
		return nil, ErrIsolatedSecretDenied
	}
	contents, err := broker.store.GetCodeDocument(ctx, *authority, request.FunctionRef.ArtifactID)
	if err != nil || len(contents) == 0 || len(contents) > maximumServerFunctionCodeDocumentBytes {
		return nil, ErrIsolatedSecretDenied
	}
	entry, _, _, err := decodeServerFunctionProfile(contents, request.FunctionRef.ArtifactID, request.FunctionRef.ExportName)
	if err != nil || !validIsolatedSecretPolicy(entry) {
		return nil, ErrIsolatedSecretDenied
	}
	key := IsolatedSecretResolutionKey{ExecutionID: request.ExecutionID, WorkerID: request.WorkerID, WorkerAttempt: request.WorkerAttempt, ArtifactID: request.FunctionRef.ArtifactID, ExportName: request.FunctionRef.ExportName, InvocationID: request.InvocationID, RecipientPublicKey: request.RecipientPublicKey}
	reservation, err := broker.store.ReserveIsolatedSecretResolution(ctx, key)
	if err != nil {
		return nil, ErrIsolatedSecretDenied
	}
	if reservation.Kind == "existing" {
		return readExistingIsolatedSecretEnvelope(reservation.Envelope, request, broker.now())
	}
	if reservation.Kind != "reserved" {
		return nil, ErrIsolatedSecretDenied
	}
	completed := false
	defer func() {
		if !completed {
			_ = broker.store.AbandonIsolatedSecretResolution(context.Background(), key)
		}
	}()
	principal := backendenvironment.PrincipalSession{PrincipalID: authority.OwnerID, SessionID: authority.SessionID}
	snapshot, err := broker.environments.GetSnapshot(ctx, principal, authority.WorkspaceID, authority.Environment.EnvironmentID, authority.Environment.Revision)
	if err != nil || snapshot == nil || snapshot.WorkspaceID != authority.WorkspaceID || snapshot.EnvironmentID != authority.Environment.EnvironmentID || snapshot.Revision != authority.Environment.Revision || snapshot.Mode != "live" {
		return nil, ErrIsolatedSecretDenied
	}
	available := make(map[string]struct{}, len(snapshot.SecretBindingIDs))
	for _, bindingID := range snapshot.SecretBindingIDs {
		available[bindingID] = struct{}{}
	}
	fields := make([]string, 0, len(entry.Environment.SecretsByField))
	bindings := make([]backendenvironment.SecretBindingGrant, 0, len(entry.Environment.SecretsByField))
	for field, reference := range entry.Environment.SecretsByField {
		if _, ok := available[reference.BindingID]; !ok {
			return nil, ErrIsolatedSecretDenied
		}
		fields = append(fields, field)
		bindings = append(bindings, backendenvironment.SecretBindingGrant{BindingID: reference.BindingID, Field: field})
	}
	sort.Strings(fields)
	sort.Slice(bindings, func(left, right int) bool { return bindings[left].Field < bindings[right].Field })
	issuedAt := broker.now()
	expiresAt := issuedAt.Add(isolatedSecretEnvelopeTTL)
	resourceID := strings.Join([]string{request.ExecutionID, request.FunctionRef.ArtifactID, request.FunctionRef.ExportName, request.InvocationID, fmt.Sprintf("%d", request.WorkerAttempt)}, ":")
	grant, err := broker.environments.IssueGrant(ctx, backendenvironment.IssueGrantInput{Principal: principal, WorkspaceID: authority.WorkspaceID, EnvironmentID: snapshot.EnvironmentID, Revision: snapshot.Revision, ProviderID: isolatedSecretEnvironmentProviderID, ProviderIsolation: "remote-isolated", ExecutionClass: "isolated-runner", RuntimeZone: "server", PurposeKind: "process", ResourceID: resourceID, SecretBindings: bindings, ExpiresAt: expiresAt})
	if err != nil || grant == nil || grant.GrantID == "" {
		return nil, ErrIsolatedSecretDenied
	}
	defer func() { _ = broker.environments.RevokeGrant(context.Background(), grant.GrantID, principal) }()
	plaintext := bytes.NewBuffer(make([]byte, 0, 1024))
	plaintext.WriteString(`{"format":"` + isolatedSecretMaterialFormat + `","fields":{`)
	for index, field := range fields {
		if index > 0 {
			plaintext.WriteByte(',')
		}
		encodedField, _ := json.Marshal(field)
		plaintext.Write(encodedField)
		plaintext.WriteByte(':')
		reference := entry.Environment.SecretsByField[field]
		err = broker.environments.UseSecret(ctx, backendenvironment.UseSecretInput{GrantID: grant.GrantID, Principal: principal, WorkspaceID: authority.WorkspaceID, EnvironmentID: snapshot.EnvironmentID, Revision: snapshot.Revision, ProviderID: isolatedSecretEnvironmentProviderID, PurposeKind: "process", ResourceID: resourceID, BindingID: reference.BindingID, Field: field}, func(material []byte) error {
			return appendJSONSecretString(plaintext, material)
		})
		if err != nil || plaintext.Len() > maximumIsolatedSecretEnvelopeBytes {
			clear(plaintext.Bytes())
			return nil, ErrIsolatedSecretDenied
		}
	}
	plaintext.WriteString("}}")
	materialBytes := plaintext.Bytes()
	defer clear(materialBytes)
	envelope, err := sealIsolatedSecretMaterial(broker.random, request, expiresAt, materialBytes)
	if err != nil {
		return nil, ErrIsolatedSecretDenied
	}
	if err := broker.store.CompleteIsolatedSecretResolution(ctx, key, envelope); err != nil {
		return nil, ErrIsolatedSecretDenied
	}
	completed = true
	return envelope, nil
}
