package agent

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestEvaluationLoopbackAuthorityUsesExactCanonicalServerOnlyWire(t *testing.T) {
	token := "owner-authority-service-token-0000000000000001"
	var paths []string
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		paths = append(paths, request.URL.Path)
		if request.Method == http.MethodGet && request.URL.Path == "/healthz" {
			healthBase := map[string]any{
				"format": "prodivix.agent-evaluation-owner-authority-health", "version": int64(1),
				"purpose": "full-attempt", "status": "ready",
				"controlledWorkspaceAuthorityDigest":  evaluationServiceTestDigest(t, "health-controlled"),
				"verificationEvidenceAuthorityDigest": evaluationServiceTestDigest(t, "health-verification"),
				"providerCapabilityAuthorityDigest":   evaluationServiceTestDigest(t, "health-capability"),
				"attemptGradingAuthorityDigest":       evaluationServiceTestDigest(t, "health-grading"),
				"replayJournalImplementationDigest":   evaluationServiceTestDigest(t, "health-journal"),
			}
			healthDigest, _ := canonicaljson.Digest(healthBase)
			healthBase["healthDigest"] = healthDigest
			encoded, _ := canonicaljson.Bytes(healthBase)
			writer.Header().Set("Content-Type", "application/json")
			_, _ = writer.Write(encoded)
			return
		}
		if request.Method != http.MethodPost || request.Header.Get("Authorization") != "Bearer "+token ||
			request.Header.Get("Idempotency-Key") == "" || request.URL.RawQuery != "" {
			t.Errorf("unexpected sidecar request method=%s path=%s headers=%v",
				request.Method, request.URL.String(), request.Header)
			writer.WriteHeader(http.StatusUnauthorized)
			return
		}
		source := new(bytes.Buffer)
		_, _ = source.ReadFrom(request.Body)
		value, err := decodeCanonicalEvaluationObject(source.Bytes(), maximumEvaluationLoopbackAuthorityBytes)
		if err != nil || stringMember(value, "format") != evaluationLoopbackAuthorityRequestFormat ||
			stringMember(value, "namespaceId") != "evaluation.namespace" ||
			stringMember(value, "planDigest") != evaluationServiceTestDigest(t, "loopback-plan") ||
			stringMember(value, "repositoryCommit") != "0123456789abcdef0123456789abcdef01234567" ||
			stringMember(value, "requestDigest") != request.Header.Get("Idempotency-Key") {
			t.Errorf("invalid canonical sidecar request: %s err=%v", source.String(), err)
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		mode := stringMember(value, "mode")
		serviceKind := stringMember(value, "serviceKind")
		if (serviceKind == "provider-capability" || serviceKind == "attempt-grading") &&
			(!evaluationDigestPattern.MatchString(stringMember(value, "providerCapabilityObservationReceiptSetDigest")) ||
				!evaluationDigestPattern.MatchString(stringMember(value, "ownerImplementationDigest"))) {
			t.Errorf("attempt authority fence is missing: %s", source.String())
			writer.WriteHeader(http.StatusBadRequest)
			return
		}
		response := map[string]any{
			"format":      evaluationLoopbackAuthorityResponseFormat,
			"version":     evaluationLoopbackAuthorityVersion,
			"serviceKind": serviceKind, "mode": mode,
			"requestDigest": stringMember(value, "requestDigest"),
		}
		if (serviceKind == "provider-capability" || serviceKind == "attempt-grading") && mode == "stage" {
			response["ownerImplementationDigest"] = value["ownerImplementationDigest"]
			response["stageDigest"], _ = canonicaljson.Digest(map[string]any{
				"format": "prodivix.agent-evaluation-attempt-authority-dispatch-stage", "version": int64(1),
				"serviceKind": serviceKind, "operation": value["operation"], "routeBinding": value["routeBinding"],
				"namespaceId": value["namespaceId"], "planDigest": value["planDigest"],
				"repositoryCommit": value["repositoryCommit"], "attemptId": value["attemptId"],
				"descriptorDigest": value["descriptorDigest"], "shardLeaseOwnerId": value["shardLeaseOwnerId"],
				"shardLeaseGeneration":                          value["shardLeaseGeneration"],
				"verificationGrantGeneration":                   value["verificationGrantGeneration"],
				"verificationAttemptGrantReceiptSetDigest":      value["verificationAttemptGrantReceiptSetDigest"],
				"requestDigest":                                 value["requestDigest"],
				"providerCapabilityObservationReceiptSetDigest": value["providerCapabilityObservationReceiptSetDigest"],
				"ownerImplementationDigest":                     value["ownerImplementationDigest"], "claimGeneration": int64(1),
			})
		} else if serviceKind == "controlled-workspace" {
			facts := []any{map[string]any{"status": "owner-ack"}}
			response["facts"] = facts
			response["ownerImplementationDigest"] = value["ownerImplementationDigest"]
			response["stageDigest"] = value["stageDigest"]
			fact, _ := canonicaljson.Bytes(facts[0])
			dispatchAckDigest, _ := evaluationControlledWorkspaceDirectDispatchAckDigest(
				stringMember(value, "namespaceId"),
				EvaluationPlanPartition{PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit")},
				evaluationControlledWorkspaceRoute{Operation: stringMember(value, "operation"), RouteBinding: stringMember(value, "routeBinding")},
				stringMember(value, "requestDigest"), stringMember(value, "ownerImplementationDigest"),
				stringMember(value, "stageDigest"), []json.RawMessage{fact},
			)
			response["dispatchAckDigest"] = dispatchAckDigest
			if mode == "reconcile" {
				response["reconciled"] = true
			}
		} else {
			ownerResponse := map[string]any{"kind": "owner-ack"}
			response["response"] = ownerResponse
			if serviceKind == "provider-capability" || serviceKind == "attempt-grading" {
				response["shardLeaseOwnerId"] = value["shardLeaseOwnerId"]
				response["shardLeaseGeneration"] = value["shardLeaseGeneration"]
				response["verificationGrantGeneration"] = value["verificationGrantGeneration"]
				response["verificationAttemptGrantReceiptSetDigest"] = value["verificationAttemptGrantReceiptSetDigest"]
				ownerImplementationDigest := evaluationServiceTestDigest(t, "health-capability")
				if serviceKind == "attempt-grading" {
					ownerImplementationDigest = evaluationServiceTestDigest(t, "health-grading")
				}
				response["ownerImplementationDigest"] = ownerImplementationDigest
				response["stageDigest"] = value["stageDigest"]
				responseDigest, _ := canonicaljson.Digest(ownerResponse)
				response["dispatchAckDigest"], _ = canonicaljson.Digest(map[string]any{
					"format":      "prodivix.agent-evaluation-attempt-authority-dispatch-ack",
					"version":     evaluationAttemptAuthorityVersion,
					"serviceKind": serviceKind, "operation": value["operation"],
					"namespaceId": value["namespaceId"], "planDigest": value["planDigest"],
					"repositoryCommit": value["repositoryCommit"], "attemptId": value["attemptId"],
					"descriptorDigest":                              value["descriptorDigest"],
					"shardLeaseOwnerId":                             value["shardLeaseOwnerId"],
					"shardLeaseGeneration":                          value["shardLeaseGeneration"],
					"verificationGrantGeneration":                   value["verificationGrantGeneration"],
					"verificationAttemptGrantReceiptSetDigest":      value["verificationAttemptGrantReceiptSetDigest"],
					"providerCapabilityObservationReceiptSetDigest": value["providerCapabilityObservationReceiptSetDigest"],
					"stageDigest":                                   value["stageDigest"], "requestDigest": value["requestDigest"],
					"responseDigest":            responseDigest,
					"ownerImplementationDigest": ownerImplementationDigest,
				})
			}
			if mode == "reconcile" {
				response["reconciled"] = true
			}
		}
		encoded, err := canonicaljson.Bytes(response)
		if err != nil {
			t.Error(err)
			writer.WriteHeader(http.StatusInternalServerError)
			return
		}
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write(encoded)
	}))
	defer server.Close()
	client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: token, Purpose: "full-attempt",
	})
	if err != nil {
		t.Fatal(err)
	}
	if err := client.VerifyReady(context.Background()); err != nil {
		t.Fatal(err)
	}
	digest := evaluationServiceTestDigest(t, "loopback-request")
	controlled := EvaluationControlledWorkspaceAuthorityRequest{
		NamespaceID: "evaluation.namespace", PlanDigest: evaluationServiceTestDigest(t, "loopback-plan"),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
		Operation:        "session.restore-checkpoint", RouteBinding: "sessions/{sessionId}/restore-checkpoint",
		SessionID: "session.loopback", RequestDigest: digest, Payload: json.RawMessage(`{}`), ClaimGeneration: 1,
	}
	controlled.OwnerImplementationDigest = evaluationServiceTestDigest(t, "health-controlled")
	controlled.StageDigest, err = evaluationControlledWorkspaceDirectStageDigest(
		controlled.NamespaceID,
		EvaluationPlanPartition{PlanDigest: controlled.PlanDigest, RepositoryCommit: controlled.RepositoryCommit},
		evaluationControlledWorkspaceRoute{Operation: controlled.Operation, RouteBinding: controlled.RouteBinding},
		controlled.RequestDigest, controlled.OwnerImplementationDigest,
	)
	if err != nil {
		t.Fatal(err)
	}
	if facts, err := client.ExecuteControlledWorkspace(context.Background(), controlled); err != nil || len(facts) != 1 {
		t.Fatalf("controlled execute facts=%s err=%v", facts, err)
	}
	controlledFact, _ := canonicaljson.Bytes(map[string]any{"status": "owner-ack"})
	controlled.DispatchAckDigest, err = evaluationControlledWorkspaceDirectDispatchAckDigest(
		controlled.NamespaceID,
		EvaluationPlanPartition{PlanDigest: controlled.PlanDigest, RepositoryCommit: controlled.RepositoryCommit},
		evaluationControlledWorkspaceRoute{Operation: controlled.Operation, RouteBinding: controlled.RouteBinding},
		controlled.RequestDigest, controlled.OwnerImplementationDigest, controlled.StageDigest,
		[]json.RawMessage{controlledFact},
	)
	if err != nil {
		t.Fatal(err)
	}
	if facts, reconciled, err := client.ReconcileControlledWorkspace(
		context.Background(), controlled,
	); err != nil || !reconciled || len(facts) != 1 {
		t.Fatalf("controlled reconcile facts=%s reconciled=%v err=%v", facts, reconciled, err)
	}
	verification := EvaluationVerificationEvidenceAuthorityRequest{
		NamespaceID: controlled.NamespaceID, PlanDigest: controlled.PlanDigest,
		RepositoryCommit: controlled.RepositoryCommit, Operation: "promotion.create",
		RouteBinding: "promotions", RequestDigest: digest,
		AttemptID: "evaluation-attempt.loopback", DescriptorDigest: evaluationServiceTestDigest(t, "loopback-descriptor"),
		Generation: 1, ControlledWorkspaceGrantDigest: evaluationServiceTestDigest(t, "loopback-grant"),
		AuthorityDigest:                  evaluationServiceTestDigest(t, "loopback-authority"),
		SandboxRegistrationReceiptDigest: evaluationServiceTestDigest(t, "loopback-registration"),
		Request:                          json.RawMessage(`{}`), ClaimGeneration: 1,
	}
	if response, err := client.ReadVerificationEvidence(context.Background(), verification); err != nil ||
		!bytes.Equal(response, []byte(`{"kind":"owner-ack"}`)) {
		t.Fatalf("verification read response=%s err=%v", response, err)
	}
	if response, err := client.ExecuteVerificationEvidence(context.Background(), verification); err != nil ||
		!bytes.Equal(response, []byte(`{"kind":"owner-ack"}`)) {
		t.Fatalf("verification execute response=%s err=%v", response, err)
	}
	if response, reconciled, err := client.ReconcileVerificationEvidence(
		context.Background(), verification,
	); err != nil || !reconciled || !bytes.Equal(response, []byte(`{"kind":"owner-ack"}`)) {
		t.Fatalf("verification reconcile response=%s reconciled=%v err=%v", response, reconciled, err)
	}
	attempt := EvaluationAttemptAuthorityRequest{
		NamespaceID: controlled.NamespaceID, PlanDigest: controlled.PlanDigest,
		RepositoryCommit: controlled.RepositoryCommit, ServiceKind: "provider-capability",
		Operation: "tool.execute", RouteBinding: "capability-runtime/execute-tool",
		AttemptID: "evaluation-attempt.loopback", DescriptorDigest: evaluationServiceTestDigest(t, "loopback-descriptor"),
		ShardLeaseOwnerID: "evaluation-worker.loopback", ShardLeaseGeneration: 7,
		VerificationGrantGeneration:              9,
		VerificationAttemptGrantReceiptSetDigest: evaluationServiceTestDigest(t, "loopback-grant-set"),
		ProviderCapabilityObservationReceiptSetDigest: func() string {
			digest, _ := evaluationProviderCapabilityObservationReceiptSetDigest(nil)
			return digest
		}(),
		OwnerImplementationDigest: evaluationServiceTestDigest(t, "health-capability"),
		RequestDigest:             digest, Payload: json.RawMessage(`{}`), ClaimGeneration: 1,
	}
	stageDigest, err := client.StageAttemptAuthority(context.Background(), attempt)
	if err != nil || !evaluationDigestPattern.MatchString(stageDigest) {
		t.Fatalf("attempt stage digest=%s err=%v", stageDigest, err)
	}
	attempt.StageDigest = stageDigest
	if result, err := client.ExecuteAttemptAuthority(context.Background(), attempt); err != nil ||
		!bytes.Equal(result.Response, []byte(`{"kind":"owner-ack"}`)) || !evaluationDigestPattern.MatchString(result.DispatchAckDigest) {
		t.Fatalf("attempt execute result=%#v err=%v", result, err)
	}
	executed, err := client.ExecuteAttemptAuthority(context.Background(), attempt)
	if err != nil {
		t.Fatal(err)
	}
	if result, reconciled, err := client.ReconcileAttemptAuthority(context.Background(), attempt); err != nil ||
		!reconciled || !bytes.Equal(result.Response, []byte(`{"kind":"owner-ack"}`)) ||
		!evaluationDigestPattern.MatchString(result.DispatchAckDigest) {
		t.Fatalf("attempt reconcile without prior ack result=%#v reconciled=%v err=%v", result, reconciled, err)
	}
	attempt.DispatchAckDigest = executed.DispatchAckDigest
	if result, reconciled, err := client.ReconcileAttemptAuthority(context.Background(), attempt); err != nil ||
		!reconciled || !bytes.Equal(result.Response, []byte(`{"kind":"owner-ack"}`)) {
		t.Fatalf("attempt reconcile result=%#v reconciled=%v err=%v", result, reconciled, err)
	}
	if implementationDigest, ok := client.AttemptAuthorityImplementationDigest("provider-capability"); !ok || implementationDigest != evaluationServiceTestDigest(t, "health-capability") {
		t.Fatalf("provider implementation digest=%s ok=%v", implementationDigest, ok)
	}
	wantPaths := []string{
		"/healthz",
		"/v1/controlled-workspace/execute", "/v1/controlled-workspace/reconcile",
		"/v1/verification-evidence/read",
		"/v1/verification-evidence/execute", "/v1/verification-evidence/reconcile",
		"/v1/capability-runtime/stage", "/v1/capability-runtime/execute",
		"/v1/capability-runtime/execute", "/v1/capability-runtime/reconcile", "/v1/capability-runtime/reconcile",
	}
	if len(paths) != len(wantPaths) {
		t.Fatalf("paths=%v", paths)
	}
	for index := range paths {
		if paths[index] != wantPaths[index] {
			t.Fatalf("paths=%v want=%v", paths, wantPaths)
		}
	}
}

func TestEvaluationLoopbackAuthorityRejectsNonLoopbackAndNoncanonicalAcknowledgement(t *testing.T) {
	for _, baseURL := range []string{
		"https://127.0.0.1:8443", "http://example.com:8080", "http://127.0.0.1:8080/path",
		"http://127.0.0.1", "http://user@127.0.0.1:8080",
	} {
		if _, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
			BaseURL: baseURL, ServiceToken: "owner-authority-service-token-0000000000000001", Purpose: "full-attempt",
		}); !errors.Is(err, ErrInvalid) {
			t.Fatalf("baseURL=%s err=%v, want invalid", baseURL, err)
		}
	}
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		_, _ = writer.Write([]byte(`{"version":1,"format":"prodivix.agent-evaluation-owner-authority-response"}`))
	}))
	defer server.Close()
	client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: "owner-authority-service-token-0000000000000001", Purpose: "full-attempt",
	})
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.ReadControlledWorkspace(context.Background(), EvaluationControlledWorkspaceAuthorityRequest{
		NamespaceID: "evaluation.namespace", PlanDigest: evaluationServiceTestDigest(t, "loopback-plan"),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
		Operation:        "session.orphans.list", RouteBinding: "sessions/orphans/list",
		RequestDigest: evaluationServiceTestDigest(t, "loopback-request"), Payload: json.RawMessage(`{}`),
	})
	if !errors.Is(err, errEvaluationServiceUnavailable) {
		t.Fatalf("noncanonical acknowledgement err=%v", err)
	}
}

func TestEvaluationLoopbackAuthorityHealthRejectsMissingExtraAndSwappedSpecialOwnerDigests(t *testing.T) {
	health := func() map[string]any {
		return map[string]any{
			"format": "prodivix.agent-evaluation-owner-authority-health", "version": int64(1),
			"purpose": "preplan", "status": "ready",
			"capabilityProbeAuthorityDigest":                        evaluationServiceTestDigest(t, "health-exact-probe"),
			"capabilityProbeProviderResourceAuthorityDigest":        evaluationServiceTestDigest(t, "health-exact-resource"),
			"capabilityProbeProviderResourceCleanupAuthorityDigest": evaluationServiceTestDigest(t, "health-exact-resource-cleanup"),
			"runtimeFactSourceRegistrationAuthorityDigest":          evaluationServiceTestDigest(t, "health-exact-registration"),
			"replayJournalImplementationDigest":                     evaluationServiceTestDigest(t, "health-exact-journal"),
		}
	}
	for _, scenario := range []struct {
		name   string
		mutate func(map[string]any, int)
		second bool
	}{
		{name: "missing", mutate: func(value map[string]any, _ int) {
			delete(value, "capabilityProbeProviderResourceAuthorityDigest")
		}},
		{name: "extra", mutate: func(value map[string]any, _ int) {
			value["unexpectedOwnerDigest"] = evaluationServiceTestDigest(t, "extra")
		}},
		{name: "registration-swap-after-pin", second: true, mutate: func(value map[string]any, call int) {
			if call == 2 {
				value["runtimeFactSourceRegistrationAuthorityDigest"] = evaluationServiceTestDigest(t, "health-exact-registration-swap")
			}
		}},
		{name: "cleanup-swap-after-pin", second: true, mutate: func(value map[string]any, call int) {
			if call == 2 {
				value["capabilityProbeProviderResourceCleanupAuthorityDigest"] = evaluationServiceTestDigest(t, "health-exact-resource-cleanup-swap")
			}
		}},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			calls := 0
			server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
				calls++
				value := health()
				scenario.mutate(value, calls)
				value["healthDigest"], _ = canonicaljson.Digest(value)
				encoded, _ := canonicaljson.Bytes(value)
				writer.Header().Set("Content-Type", "application/json")
				_, _ = writer.Write(encoded)
			}))
			defer server.Close()
			client, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
				BaseURL: server.URL, ServiceToken: "owner-authority-service-token-0000000000000001", Purpose: "preplan",
			})
			if err != nil {
				t.Fatal(err)
			}
			if scenario.second {
				if err := client.VerifyReady(context.Background()); err != nil {
					t.Fatalf("pin exact health: %v", err)
				}
			}
			if err := client.VerifyReady(context.Background()); !errors.Is(err, errEvaluationServiceUnavailable) {
				t.Fatalf("health drift err=%v, want unavailable", err)
			}
		})
	}
}

func TestEvaluationLoopbackAuthorityRejectsWrongPurposeBeforeTransport(t *testing.T) {
	transportCalls := 0
	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		transportCalls++
		writer.WriteHeader(http.StatusInternalServerError)
	}))
	defer server.Close()
	requestDigest := evaluationServiceTestDigest(t, "purpose-bound-loopback-request")
	base := evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: "controlled-workspace", Mode: "execute", NamespaceID: "evaluation.namespace",
		PlanDigest:       evaluationServiceTestDigest(t, "purpose-bound-loopback-plan"),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
		Operation:        "session.restore-checkpoint", RouteBinding: "sessions/{sessionId}/restore-checkpoint",
		RequestDigest: requestDigest, ClaimGeneration: 1, Payload: json.RawMessage(`{}`),
	}
	preplan, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: "owner-authority-service-token-0000000000000001", Purpose: "preplan",
	})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := preplan.invoke(context.Background(), "/v1/controlled-workspace/execute", requestDigest, base, 4096); !errors.Is(err, errEvaluationServiceUnavailable) {
		t.Fatalf("preplan accepted full-attempt operation: %v", err)
	}
	full, err := NewEvaluationLoopbackAuthorityClient(EvaluationLoopbackAuthorityConfig{
		BaseURL: server.URL, ServiceToken: "owner-authority-service-token-0000000000000001", Purpose: "full-attempt",
	})
	if err != nil {
		t.Fatal(err)
	}
	probe := base
	probe.ServiceKind = "provider-capability"
	probe.Operation = evaluationCapabilityProbeOperation
	probe.RouteBinding = evaluationCapabilityProbeRouteBinding
	if _, err := full.invoke(context.Background(), "/v1/capability-probe/execute", requestDigest, probe, 4096); !errors.Is(err, errEvaluationServiceUnavailable) {
		t.Fatalf("full-attempt accepted preplan operation: %v", err)
	}
	if transportCalls != 0 {
		t.Fatalf("wrong-purpose operation reached transport %d times", transportCalls)
	}
}

func TestEvaluationPublicResponseScannerDetectsEncodedCanaryAtAnyDepth(t *testing.T) {
	credential := []byte("credential-canary-loopback-00001")
	protected := []byte("protected-canary-loopback-0002")
	scanner, err := NewEvaluationPublicResponseScanner(EvaluationPublicResponseScannerConfig{
		CredentialCanaries:        [][]byte{credential},
		SecretCanaries:            [][]byte{[]byte("secret-canary-loopback-0003")},
		ProtectedMaterialCanaries: [][]byte{protected},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, source := range [][]byte{
		[]byte(`{"facts":[{"result":{"nested":"` + string(protected) + `"}}]}`),
		[]byte(`{"facts":[{"artifact":{"bytesBase64":"` + base64.StdEncoding.EncodeToString(credential) + `"}}]}`),
	} {
		if err := scanner.ScanControlledWorkspacePublicResponse(
			context.Background(), "session.execute", evaluationServiceTestDigest(t, "scan"), source,
		); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("source=%s err=%v, want unauthorized", source, err)
		}
	}
	if err := scanner.ScanVerificationEvidencePublicResponse(
		context.Background(), "verified-view.resolve", evaluationServiceTestDigest(t, "scan-safe"),
		[]byte(`{"kind":"verified-view-resolved"}`),
	); err != nil {
		t.Fatalf("safe response err=%v", err)
	}
}

func TestEvaluationPublicResponseScannerAcceptsBothCompleteMaximumCanarySets(t *testing.T) {
	secretValues := make([]string, 256)
	protectedValues := make([]string, 256)
	for index := 0; index < 256; index++ {
		secretValues[index] = fmt.Sprintf("secret-canary-%04d", index)
		protectedValues[index] = fmt.Sprintf("protected-canary-%04d", index)
	}
	secretSource, err := json.Marshal(secretValues)
	if err != nil {
		t.Fatal(err)
	}
	protectedSource, err := json.Marshal(protectedValues)
	if err != nil {
		t.Fatal(err)
	}
	secretCanaries, err := DecodeEvaluationProductionCanarySet(secretSource)
	if err != nil || len(secretCanaries) != 256 {
		t.Fatalf("secret count=%d err=%v", len(secretCanaries), err)
	}
	protectedCanaries, err := DecodeEvaluationProductionCanarySet(protectedSource)
	if err != nil || len(protectedCanaries) != 256 {
		t.Fatalf("protected count=%d err=%v", len(protectedCanaries), err)
	}
	defer evaluationClearByteSlices(secretCanaries)
	defer evaluationClearByteSlices(protectedCanaries)
	scanner, err := NewEvaluationPublicResponseScanner(EvaluationPublicResponseScannerConfig{
		CredentialCanaries: [][]byte{
			[]byte("ledger-service-token-0000000000000000000001"),
			[]byte("owner-service-token-00000000000000000000002"),
		},
		SecretCanaries: secretCanaries, ProtectedMaterialCanaries: protectedCanaries,
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, source := range [][]byte{
		[]byte(`{"nested":"` + secretValues[255] + `"}`),
		[]byte(`{"nested":"` + protectedValues[255] + `"}`),
	} {
		if err := scanner.ScanControlledWorkspacePublicResponse(
			context.Background(), "session.execute", evaluationServiceTestDigest(t, "max-scan"), source,
		); !errors.Is(err, ErrUnauthorized) {
			t.Fatalf("maximum-set tail canary was missed: %s err=%v", source, err)
		}
	}
	tooMany := append(append([]string(nil), secretValues...), "secret-canary-0256")
	tooManySource, err := json.Marshal(tooMany)
	if err != nil {
		t.Fatal(err)
	}
	if decoded, err := DecodeEvaluationProductionCanarySet(tooManySource); !errors.Is(err, ErrInvalid) || decoded != nil {
		t.Fatalf("257 canaries decoded=%d err=%v", len(decoded), err)
	}
	duplicates, err := json.Marshal([]string{"secret-canary-duplicate", "secret-canary-duplicate"})
	if err != nil {
		t.Fatal(err)
	}
	if decoded, err := DecodeEvaluationProductionCanarySet(duplicates); !errors.Is(err, ErrInvalid) || decoded != nil {
		t.Fatalf("duplicate canaries decoded=%d err=%v", len(decoded), err)
	}
}
