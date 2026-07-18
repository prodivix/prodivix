package remoteexecution

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"math"
	"strings"
	"time"

	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

const remoteServerFunctionEnvironmentProviderID = "prodivix.remote.server-function-gateway"

func validServerFunctionHMACPolicy(entry serverFunctionProfileEntry) bool {
	if entry.Kind != "route-action" || entry.RuntimeZone != "server" || entry.Effect != "read" || entry.Auth.Kind != "authenticated" || len(entry.Idempotency) != 0 || entry.Environment == nil || len(entry.Environment.SecretsByField) != 1 {
		return false
	}
	reference, ok := entry.Environment.SecretsByField[serverFunctionHMACSecretField]
	if !ok {
		return false
	}
	_, valid := normalizedServerFunctionID(reference.BindingID, false)
	return valid
}

func validServerFunctionRouteString(value any, allowEmpty bool) bool {
	text, ok := value.(string)
	return ok && (allowEmpty || text != "") && len(text) <= 16*1024 && !strings.ContainsRune(text, '\x00')
}

func validServerFunctionRouteRecord(value any, arrays bool) bool {
	record, ok := value.(map[string]any)
	if !ok || len(record) > 256 {
		return false
	}
	for key, candidate := range record {
		if !validServerFunctionRouteString(key, false) {
			return false
		}
		if validServerFunctionRouteString(candidate, true) {
			continue
		}
		values, arrayOK := candidate.([]any)
		if !arrays || !arrayOK || len(values) > 256 {
			return false
		}
		for _, item := range values {
			if !validServerFunctionRouteString(item, true) {
				return false
			}
		}
	}
	return true
}

func decodeServerFunctionHMACPayload(value any) ([]byte, error) {
	root, ok := exactServerFunctionValueFields(value, []string{"format", "route", "submission"})
	if !ok || root["format"] != "prodivix.route-action-input.v1" {
		return nil, ErrServerFunctionInputInvalid
	}
	route, ok := exactServerFunctionValueFields(root["route"], []string{"routeNodeId", "currentPath", "matchedPath", "params", "searchParams"}, "hash")
	if !ok || !validServerFunctionRouteString(route["routeNodeId"], false) || !validServerFunctionRouteString(route["currentPath"], false) || !validServerFunctionRouteString(route["matchedPath"], false) || !validServerFunctionRouteRecord(route["params"], false) || !validServerFunctionRouteRecord(route["searchParams"], true) {
		return nil, ErrServerFunctionInputInvalid
	}
	if hash, exists := route["hash"]; exists && !validServerFunctionRouteString(hash, true) {
		return nil, ErrServerFunctionInputInvalid
	}
	submission, ok := exactServerFunctionValueFields(root["submission"], []string{"method", "encType", "value"})
	if !ok || submission["encType"] != "application/json" {
		return nil, ErrServerFunctionInputInvalid
	}
	method, methodOK := submission["method"].(string)
	if !methodOK || (method != "POST" && method != "PUT" && method != "PATCH" && method != "DELETE") {
		return nil, ErrServerFunctionInputInvalid
	}
	canonicalValue, err := normalizeServerFunctionHMACValue(submission["value"])
	if err != nil {
		return nil, ErrServerFunctionInputInvalid
	}
	encoded, err := json.Marshal(canonicalValue)
	if err != nil || len(encoded) == 0 || int64(len(encoded)) > maximumServerFunctionRequestBytes {
		return nil, ErrServerFunctionInputInvalid
	}
	return encoded, nil
}

func normalizeServerFunctionHMACValue(value any) (any, error) {
	switch current := value.(type) {
	case json.Number:
		integer, integerErr := current.Int64()
		if integerErr == nil {
			if integer < -9007199254740991 || integer > 9007199254740991 {
				return nil, ErrServerFunctionInputInvalid
			}
			return integer, nil
		}
		decimal, decimalErr := current.Float64()
		if decimalErr != nil || math.IsInf(decimal, 0) || math.IsNaN(decimal) {
			return nil, ErrServerFunctionInputInvalid
		}
		return decimal, nil
	case []any:
		result := make([]any, len(current))
		for index, entry := range current {
			normalized, err := normalizeServerFunctionHMACValue(entry)
			if err != nil {
				return nil, err
			}
			result[index] = normalized
		}
		return result, nil
	case map[string]any:
		result := make(map[string]any, len(current))
		for key, entry := range current {
			normalized, err := normalizeServerFunctionHMACValue(entry)
			if err != nil {
				return nil, err
			}
			result[key] = normalized
		}
		return result, nil
	default:
		return value, nil
	}
}

func (gateway *ServerFunctionGateway) executeHMACSHA256(ctx context.Context, principal ServerFunctionPrincipalSession, executionID string, authority ExecutionAuthority, entry serverFunctionProfileEntry, invocation ServerFunctionInvocation, input any) (serverFunctionOutcome, error) {
	if gateway.environments == nil || !gateway.environments.Available() {
		return serverFunctionOutcome{}, ErrServerFunctionUnavailable
	}
	if authority.Environment == nil || authority.Environment.Mode != "live" || authority.SessionID != principal.SessionID || !validServerFunctionHMACPolicy(entry) {
		return serverFunctionOutcome{}, ErrServerFunctionDenied
	}
	payload, err := decodeServerFunctionHMACPayload(input)
	if err != nil {
		return serverFunctionOutcome{}, err
	}
	backendPrincipal := backendenvironment.PrincipalSession{
		PrincipalID: principal.PrincipalID,
		SessionID:   principal.SessionID,
	}
	snapshot, err := gateway.environments.GetSnapshot(ctx, backendPrincipal, authority.WorkspaceID, authority.Environment.EnvironmentID, authority.Environment.Revision)
	if err != nil || snapshot == nil || snapshot.Mode != "live" || snapshot.WorkspaceID != authority.WorkspaceID || snapshot.EnvironmentID != authority.Environment.EnvironmentID || snapshot.Revision != authority.Environment.Revision {
		return serverFunctionOutcome{}, ErrServerFunctionDenied
	}
	reference := entry.Environment.SecretsByField[serverFunctionHMACSecretField]
	secretBindingAvailable := false
	for _, bindingID := range snapshot.SecretBindingIDs {
		if bindingID == reference.BindingID {
			secretBindingAvailable = true
			break
		}
	}
	if !secretBindingAvailable {
		return serverFunctionOutcome{}, ErrServerFunctionDenied
	}
	resourceID := strings.Join([]string{executionID, invocation.FunctionRef.ArtifactID, invocation.FunctionRef.ExportName, invocation.InvocationID}, ":")
	issuedAt := gateway.now()
	expiresAt := issuedAt.Add(30 * time.Second)
	principalExpiresAt := time.UnixMilli(principal.ExpiresAt)
	if principalExpiresAt.Before(expiresAt) {
		expiresAt = principalExpiresAt
	}
	if !expiresAt.After(issuedAt) {
		return serverFunctionOutcome{}, ErrServerFunctionDenied
	}
	grant, err := gateway.environments.IssueGrant(ctx, backendenvironment.IssueGrantInput{
		Principal:         backendPrincipal,
		WorkspaceID:       authority.WorkspaceID,
		EnvironmentID:     snapshot.EnvironmentID,
		Revision:          snapshot.Revision,
		ProviderID:        remoteServerFunctionEnvironmentProviderID,
		ProviderIsolation: "sandboxed",
		ExecutionClass:    "trusted-service",
		RuntimeZone:       "server",
		PurposeKind:       "process",
		ResourceID:        resourceID,
		SecretBindings: []backendenvironment.SecretBindingGrant{{
			BindingID: reference.BindingID,
			Field:     serverFunctionHMACSecretField,
		}},
		ExpiresAt: expiresAt,
	})
	if err != nil || grant == nil || grant.GrantID == "" {
		return serverFunctionOutcome{}, ErrServerFunctionDenied
	}
	defer func() {
		_ = gateway.environments.RevokeGrant(context.Background(), grant.GrantID, backendPrincipal)
	}()

	var outcome serverFunctionOutcome
	err = gateway.environments.UseSecret(ctx, backendenvironment.UseSecretInput{
		GrantID:       grant.GrantID,
		Principal:     backendPrincipal,
		WorkspaceID:   authority.WorkspaceID,
		EnvironmentID: snapshot.EnvironmentID,
		Revision:      snapshot.Revision,
		ProviderID:    remoteServerFunctionEnvironmentProviderID,
		PurposeKind:   "process",
		ResourceID:    resourceID,
		BindingID:     reference.BindingID,
		Field:         serverFunctionHMACSecretField,
	}, func(material []byte) error {
		if len(material) < 32 || len(material) > 4*1024 {
			return ErrServerFunctionDenied
		}
		mac := hmac.New(sha256.New, material)
		_, _ = mac.Write(payload)
		candidate := serverFunctionOutcome{
			Kind: "value",
			Value: map[string]any{
				"algorithm": "HMAC-SHA256",
				"digest":    hex.EncodeToString(mac.Sum(nil)),
			},
		}
		encoded, encodeErr := json.Marshal(candidate)
		if encodeErr != nil || bytes.Contains(encoded, material) {
			return ErrServerFunctionOutputInvalid
		}
		outcome = candidate
		return nil
	})
	if err != nil {
		if errors.Is(err, ErrServerFunctionOutputInvalid) {
			return serverFunctionOutcome{}, ErrServerFunctionOutputInvalid
		}
		return serverFunctionOutcome{}, ErrServerFunctionDenied
	}
	if outcome.Kind != "value" {
		return serverFunctionOutcome{}, ErrServerFunctionOutputInvalid
	}
	return outcome, nil
}
