package verification

import (
	"bytes"
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strconv"
	"testing"
	"time"

	"github.com/gin-gonic/gin"
)

const agentEvaluationOwnerTestToken = "verification-owner-token-0123456789abcdef"

type fakeAgentEvaluationOwnerService struct {
	calls       []string
	create      CreatePromotionResult
	upload      ArtifactDescriptor
	prepare     CreatePromotionResult
	manifest    VerificationEvidenceManifest
	exact       agentEvaluationExactVerifiedViewSnapshot
	uploadBytes []byte
}

func (service *fakeAgentEvaluationOwnerService) CreatePromotion(
	_ context.Context,
	_ string,
	_ string,
	_ EvidenceCandidate,
) (CreatePromotionResult, error) {
	service.calls = append(service.calls, "promotion.create")
	return service.create, nil
}

func (service *fakeAgentEvaluationOwnerService) UploadArtifact(
	_ context.Context,
	_ string,
	_ string,
	_ string,
	_ string,
	_ string,
	body io.Reader,
) (ArtifactDescriptor, error) {
	service.calls = append(service.calls, "artifact.upload")
	service.uploadBytes, _ = io.ReadAll(body)
	return service.upload, nil
}

func (service *fakeAgentEvaluationOwnerService) PreparePromotion(
	_ context.Context,
	_ string,
	_ string,
	_ string,
) (CreatePromotionResult, error) {
	service.calls = append(service.calls, "promotion.prepare")
	return service.prepare, nil
}

func (service *fakeAgentEvaluationOwnerService) FinalCommitPromotion(
	_ context.Context,
	_ string,
	_ string,
	_ string,
	_ AttestationPresentation,
) (VerificationEvidenceManifest, error) {
	service.calls = append(service.calls, "promotion.final-commit")
	return service.manifest, nil
}

func (service *fakeAgentEvaluationOwnerService) ResolveExactVerifiedView(
	_ context.Context,
	_ string,
	_ []string,
) (agentEvaluationExactVerifiedViewSnapshot, error) {
	service.calls = append(service.calls, "verified-view.resolve")
	return service.exact, nil
}

func TestAgentEvaluationOwnerAuthorityRequiresCredentialAndExactPurposeBeforeDecode(t *testing.T) {
	request := agentEvaluationOwnerCreateFixture(t)
	body := mustAgentEvaluationOwnerCanonicalBytes(t, request)
	for _, test := range []struct {
		name    string
		token   string
		purpose string
		status  int
	}{
		{name: "missing credential", purpose: AgentEvaluationOwnerAuthorityPurpose, status: http.StatusUnauthorized},
		{name: "wrong credential", token: agentEvaluationOwnerTestToken + "x", purpose: AgentEvaluationOwnerAuthorityPurpose, status: http.StatusUnauthorized},
		{name: "wrong purpose", token: agentEvaluationOwnerTestToken, purpose: "controlled-workspace-owner", status: http.StatusForbidden},
	} {
		t.Run(test.name, func(t *testing.T) {
			fake := agentEvaluationOwnerFake(t)
			router := agentEvaluationOwnerTestRouter(fake)
			recorder := httptest.NewRecorder()
			httpRequest := httptest.NewRequest(
				http.MethodPost,
				"/api/internal/verification/agent-evaluation-owner/v1/workspaces/workspace-vector/promotions",
				bytes.NewReader(body),
			)
			httpRequest.Header.Set("Content-Type", "application/json")
			httpRequest.Header.Set("Idempotency-Key", request.IdempotencyKey)
			if test.token != "" {
				httpRequest.Header.Set("Authorization", "Bearer "+test.token)
			}
			httpRequest.Header.Set(agentEvaluationOwnerPurposeHeader, test.purpose)
			router.ServeHTTP(recorder, httpRequest)
			if recorder.Code != test.status || len(fake.calls) != 0 {
				t.Fatalf("credential boundary failed: status=%d calls=%v body=%s", recorder.Code, fake.calls, recorder.Body.String())
			}
		})
	}
}

func TestAgentEvaluationOwnerAuthorityHealthPinsImplementationAndFailsClosedUnconfigured(t *testing.T) {
	fake := agentEvaluationOwnerFake(t)
	router := agentEvaluationOwnerTestRouter(fake)
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/internal/verification/agent-evaluation-owner/v1/health",
		nil,
	)
	agentEvaluationOwnerAuthorize(request)
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("health failed: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var response agentEvaluationOwnerHealthResponse
	mustDecodeAgentEvaluationOwnerResponse(t, recorder.Body.Bytes(), &response)
	digest, err := agentEvaluationOwnerImplementationDigest()
	if err != nil || response.ImplementationDigest != digest ||
		response.Purpose != AgentEvaluationOwnerAuthorityPurpose ||
		digest != "sha256-dd90cc626e7b1ea7d0ccc65a93ca01759654242a75579297db7cacda7a8a79e7" {
		t.Fatalf("health implementation drifted: response=%#v err=%v", response, err)
	}

	unconfigured := gin.New()
	handler := NewHandler(nil)
	handler.agentEvaluationOwner = fake
	RegisterRoutes(unconfigured.Group("/api"), handler.Routes(func(c *gin.Context) { c.Next() }))
	recorder = httptest.NewRecorder()
	request = httptest.NewRequest(
		http.MethodGet,
		"/api/internal/verification/agent-evaluation-owner/v1/health",
		nil,
	)
	router = unconfigured
	router.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusServiceUnavailable || len(fake.calls) != 0 {
		t.Fatalf("unconfigured authority did not fail closed: status=%d calls=%v", recorder.Code, fake.calls)
	}
}

func TestAgentEvaluationOwnerAuthoritySealsCanonicalCreateAndReplaysExact(t *testing.T) {
	fake := agentEvaluationOwnerFake(t)
	router := agentEvaluationOwnerTestRouter(fake)
	request := agentEvaluationOwnerCreateFixture(t)
	body := mustAgentEvaluationOwnerCanonicalBytes(t, request)
	var first []byte
	for attempt := 0; attempt < 2; attempt++ {
		recorder := httptest.NewRecorder()
		httpRequest := agentEvaluationOwnerJSONRequest(
			t,
			http.MethodPost,
			"/api/internal/verification/agent-evaluation-owner/v1/workspaces/workspace-vector/promotions",
			body,
			request.IdempotencyKey,
		)
		router.ServeHTTP(recorder, httpRequest)
		if recorder.Code != http.StatusOK || recorder.Header().Get("Cache-Control") != "no-store" {
			t.Fatalf("create failed: status=%d body=%s", recorder.Code, recorder.Body.String())
		}
		if attempt == 0 {
			first = append([]byte(nil), recorder.Body.Bytes()...)
		} else if !bytes.Equal(first, recorder.Body.Bytes()) {
			t.Fatalf("ACK-loss create replay drifted:\nfirst=%s\nsecond=%s", first, recorder.Body.Bytes())
		}
		var response agentEvaluationOwnerCreateResponse
		mustDecodeAgentEvaluationOwnerResponse(t, recorder.Body.Bytes(), &response)
		if response.RequestDigest != request.RequestDigest ||
			mustDigestWithoutField(t, response, "responseDigest") != response.ResponseDigest {
			t.Fatalf("create response digest drifted: %#v", response)
		}
	}
	if len(fake.calls) != 2 {
		t.Fatalf("expected exact replay to reach canonical owner twice, calls=%v", fake.calls)
	}
}

func TestAgentEvaluationOwnerAuthorityRejectsRecomputedPayloadSwapBeforeOwner(t *testing.T) {
	fake := agentEvaluationOwnerFake(t)
	router := agentEvaluationOwnerTestRouter(fake)
	request := agentEvaluationOwnerCreateFixture(t)
	request.Candidate.AttemptID = "attempt-swapped"
	body := mustAgentEvaluationOwnerCanonicalBytes(t, request)
	recorder := httptest.NewRecorder()
	httpRequest := agentEvaluationOwnerJSONRequest(
		t,
		http.MethodPost,
		"/api/internal/verification/agent-evaluation-owner/v1/workspaces/workspace-vector/promotions",
		body,
		request.IdempotencyKey,
	)
	router.ServeHTTP(recorder, httpRequest)
	if recorder.Code != http.StatusBadRequest || len(fake.calls) != 0 {
		t.Fatalf("payload swap reached owner: status=%d calls=%v body=%s", recorder.Code, fake.calls, recorder.Body.String())
	}
}

func TestAgentEvaluationOwnerAuthorityBindsRawArtifactPrepareFinalAndExactView(t *testing.T) {
	fake := agentEvaluationOwnerFake(t)
	router := agentEvaluationOwnerTestRouter(fake)

	artifactBody := []byte(`{"format":"prodivix.verification-artifact","kind":"replay-record","version":1}`)
	artifactDigest := digestBytes(artifactBody)
	capability := fake.create.UploadCapability
	projection := agentEvaluationOwnerArtifactRequestProjection{
		Format: agentEvaluationOwnerRequestFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: "artifact.upload",
		WorkspaceID: "workspace-vector", PromotionID: fake.create.PromotionID,
		ArtifactID: fake.upload.ID, UploadCapabilityDigest: digestBytes([]byte(capability)),
		ArtifactDigest: artifactDigest, ArtifactSize: int64(len(artifactBody)), MediaType: "application/json",
	}
	artifactRequestDigest := mustCanonicalDigest(t, projection)
	fake.upload.Digest = artifactDigest
	fake.upload.Size = int64(len(artifactBody))
	recorder := httptest.NewRecorder()
	httpRequest := httptest.NewRequest(
		http.MethodPut,
		"/api/internal/verification/agent-evaluation-owner/v1/workspaces/workspace-vector/promotions/"+fake.create.PromotionID+"/artifacts/"+fake.upload.ID,
		bytes.NewReader(artifactBody),
	)
	agentEvaluationOwnerAuthorize(httpRequest)
	httpRequest.Header.Set("Content-Type", "application/json")
	httpRequest.Header.Set("Idempotency-Key", artifactRequestDigest)
	httpRequest.Header.Set(agentEvaluationOwnerRequestDigestHeader, artifactRequestDigest)
	httpRequest.Header.Set(agentEvaluationOwnerCapabilityHeader, capability)
	httpRequest.Header.Set(agentEvaluationOwnerArtifactDigestHeader, artifactDigest)
	httpRequest.Header.Set(agentEvaluationOwnerArtifactSizeHeader, strconv.FormatInt(int64(len(artifactBody)), 10))
	router.ServeHTTP(recorder, httpRequest)
	if recorder.Code != http.StatusOK || !bytes.Equal(fake.uploadBytes, artifactBody) {
		t.Fatalf("artifact upload failed: status=%d body=%s", recorder.Code, recorder.Body.String())
	}

	prepareRequest := agentEvaluationOwnerPromotionRequest{
		Format: agentEvaluationOwnerRequestFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: "promotion.prepare",
		WorkspaceID: "workspace-vector", PromotionID: fake.create.PromotionID,
		UploadCapability: capability, Attestation: nil,
	}
	prepareRequest.RequestDigest = mustDigestWithoutField(t, prepareRequest, "requestDigest")
	recorder = httptest.NewRecorder()
	httpRequest = agentEvaluationOwnerJSONRequest(
		t,
		http.MethodPost,
		"/api/internal/verification/agent-evaluation-owner/v1/workspaces/workspace-vector/promotions/"+fake.create.PromotionID+"/prepare",
		mustAgentEvaluationOwnerCanonicalBytes(t, prepareRequest),
		prepareRequest.RequestDigest,
	)
	router.ServeHTTP(recorder, httpRequest)
	if recorder.Code != http.StatusOK {
		t.Fatalf("prepare failed: status=%d body=%s", recorder.Code, recorder.Body.String())
	}

	attestation := AttestationPresentation{Format: "prodivix.verification-attestation-presentation", Version: 1}
	finalRequest := agentEvaluationOwnerPromotionRequest{
		Format: agentEvaluationOwnerRequestFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: "promotion.final-commit",
		WorkspaceID: "workspace-vector", PromotionID: fake.create.PromotionID,
		UploadCapability: capability, Attestation: &attestation,
	}
	finalRequest.RequestDigest = mustDigestWithoutField(t, finalRequest, "requestDigest")
	recorder = httptest.NewRecorder()
	httpRequest = agentEvaluationOwnerJSONRequest(
		t,
		http.MethodPost,
		"/api/internal/verification/agent-evaluation-owner/v1/workspaces/workspace-vector/promotions/"+fake.create.PromotionID+"/final-commit",
		mustAgentEvaluationOwnerCanonicalBytes(t, finalRequest),
		finalRequest.RequestDigest,
	)
	router.ServeHTTP(recorder, httpRequest)
	if recorder.Code != http.StatusOK {
		t.Fatalf("final commit failed: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var finalResponse agentEvaluationOwnerFinalCommitResponse
	mustDecodeAgentEvaluationOwnerResponse(t, recorder.Body.Bytes(), &finalResponse)
	if finalResponse.Manifest.WireVersion != agentEvaluationOwnerWireVersion ||
		finalResponse.Manifest.ManifestDigest != fake.manifest.ManifestDigest ||
		mustDigestWithoutField(t, finalResponse, "responseDigest") != finalResponse.ResponseDigest {
		t.Fatalf("final manifest wire projection drifted: %#v", finalResponse)
	}

	viewRequest := agentEvaluationOwnerVerifiedViewRequest{
		Format: agentEvaluationOwnerRequestFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: "verified-view.resolve",
		WorkspaceID: "workspace-vector", EvidenceIDs: []string{fake.manifest.Evidence.ID},
	}
	viewRequest.RequestDigest = mustDigestWithoutField(t, viewRequest, "requestDigest")
	recorder = httptest.NewRecorder()
	httpRequest = agentEvaluationOwnerJSONRequest(
		t,
		http.MethodPost,
		"/api/internal/verification/agent-evaluation-owner/v1/workspaces/workspace-vector/verified-view/resolve",
		mustAgentEvaluationOwnerCanonicalBytes(t, viewRequest),
		"",
	)
	router.ServeHTTP(recorder, httpRequest)
	if recorder.Code != http.StatusOK {
		t.Fatalf("exact view failed: status=%d body=%s", recorder.Code, recorder.Body.String())
	}
	var viewResponse agentEvaluationOwnerVerifiedViewResponse
	mustDecodeAgentEvaluationOwnerResponse(t, recorder.Body.Bytes(), &viewResponse)
	if viewResponse.View.WireVersion != agentEvaluationOwnerWireVersion ||
		len(viewResponse.Manifests) != 1 ||
		viewResponse.Manifests[0].WireVersion != agentEvaluationOwnerWireVersion ||
		viewResponse.View.ViewDigest != fake.exact.View.ViewDigest ||
		viewResponse.Manifests[0].ManifestDigest != fake.manifest.ManifestDigest ||
		mustDigestWithoutField(t, viewResponse, "responseDigest") != viewResponse.ResponseDigest {
		t.Fatalf("exact view wire projection drifted: %#v", viewResponse)
	}

	legacy := httptest.NewRecorder()
	legacyRequest := agentEvaluationOwnerJSONRequest(
		t,
		http.MethodPost,
		"/api/internal/verification/agent-evaluation-owner/v1/workspaces/workspace-vector/promotions/"+fake.create.PromotionID+"/finalize",
		mustAgentEvaluationOwnerCanonicalBytes(t, finalRequest),
		finalRequest.RequestDigest,
	)
	router.ServeHTTP(legacy, legacyRequest)
	if legacy.Code != http.StatusNotFound {
		t.Fatalf("legacy single-finalize route remains reachable: %d", legacy.Code)
	}
}

func agentEvaluationOwnerFake(t *testing.T) *fakeAgentEvaluationOwnerService {
	t.Helper()
	manifest := agentEvaluationOwnerTestManifest(t)
	record := VerifiedViewRecord{
		EvidenceID: manifest.Evidence.ID, ManifestDigest: manifest.ManifestDigest,
		MaterializedEvidenceDigest: repeatedDigest('e'), EffectiveTrust: TrustLocalUnattested,
		TrustStatus: "verified", RetentionState: "active",
		RevocationRecordDigests: []string{}, Artifacts: []VerifiedArtifactAvailability{},
	}
	record.RecordDigest = mustDigestWithoutField(t, record, "recordDigest")
	view := ClosureView{
		Format:                   "prodivix.verification-evidence-view.v1",
		ClosureEvaluationInstant: vectorNowText,
		Records:                  []VerifiedViewRecord{record}, RevocationRecordDigest: repeatedDigest('f'),
	}
	view.ViewDigest = mustDigestWithoutField(t, view, "viewDigest")
	statement := manifest.Statement
	return &fakeAgentEvaluationOwnerService{
		create: CreatePromotionResult{
			PromotionID: "promotion-owner-vector", EvidenceID: manifest.Evidence.ID,
			UploadCapability: "upload-capability-0123456789abcdef0123456789",
		},
		upload: ArtifactDescriptor{
			ID: "artifact-owner-vector", Path: "reports/owner.json", Kind: ArtifactReplayRecord,
			MediaType: "application/json", Availability: "available",
		},
		prepare: CreatePromotionResult{
			PromotionID: "promotion-owner-vector", EvidenceID: manifest.Evidence.ID,
			State: "verification-pending", AttestationNonce: "attestation-nonce-0123456789abcdef",
			AttestationStatement: &statement, AttestationStatementDigest: manifest.StatementDigest,
		},
		manifest: manifest,
		exact: agentEvaluationExactVerifiedViewSnapshot{
			View: view, Manifests: []VerificationEvidenceManifest{manifest},
		},
	}
}

func agentEvaluationOwnerTestManifest(t *testing.T) VerificationEvidenceManifest {
	t.Helper()
	candidate := verificationVectorCandidate(t, nil, "owner-direct")
	createdAt := mustVectorTime(t, vectorNowText)
	evidenceID := "evidence-owner-direct"
	statementEvidence := materializeEvidenceBody(
		candidate, evidenceID, createdAt, RetentionSession, nil, EvidenceProvenance{},
	)
	statement, statementDigest, statementBytes, err := buildEvidenceStatementForEvidence(
		candidate, statementEvidence,
	)
	if err != nil {
		t.Fatal(err)
	}
	service := &Service{config: ServiceConfig{SessionRetention: time.Hour}}
	_, manifestBytes, _, err := service.buildEvidence(Promotion{
		Candidate: candidate, CandidateDigest: candidate.CandidateDigest,
		EvidenceID: evidenceID, EvidenceCreatedAt: createdAt,
		Trust: TrustLocalUnattested, Retention: RetentionSession,
		Statement: statement, StatementDigest: statementDigest, StatementBytes: statementBytes,
	}, nil, nil)
	if err != nil {
		t.Fatal(err)
	}
	var manifest VerificationEvidenceManifest
	if err := jsonUnmarshalStrictStored(manifestBytes, &manifest); err != nil {
		t.Fatal(err)
	}
	return manifest
}

func agentEvaluationOwnerCreateFixture(t *testing.T) agentEvaluationOwnerCreateRequest {
	t.Helper()
	candidate := verificationVectorCandidate(t, nil, "owner-direct-create")
	request := agentEvaluationOwnerCreateRequest{
		Format: agentEvaluationOwnerRequestFormat, Version: agentEvaluationOwnerWireVersion,
		Purpose: AgentEvaluationOwnerAuthorityPurpose, Operation: "promotion.create",
		WorkspaceID: candidate.WorkspaceID, IdempotencyKey: candidate.Promotion.IdempotencyKey,
		Candidate: candidate,
	}
	request.RequestDigest = mustDigestWithoutField(t, request, "requestDigest")
	return request
}

func agentEvaluationOwnerTestRouter(service agentEvaluationOwnerService) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	handler := NewHandler(nil, AgentEvaluationOwnerAuthorityConfig{Token: agentEvaluationOwnerTestToken})
	handler.agentEvaluationOwner = service
	RegisterRoutes(router.Group("/api"), handler.Routes(func(c *gin.Context) { c.Next() }))
	return router
}

func agentEvaluationOwnerAuthorize(request *http.Request) {
	request.Header.Set("Authorization", "Bearer "+agentEvaluationOwnerTestToken)
	request.Header.Set(agentEvaluationOwnerPurposeHeader, AgentEvaluationOwnerAuthorityPurpose)
}

func agentEvaluationOwnerJSONRequest(
	t *testing.T,
	method string,
	path string,
	body []byte,
	idempotencyKey string,
) *http.Request {
	t.Helper()
	request := httptest.NewRequest(method, path, bytes.NewReader(body))
	agentEvaluationOwnerAuthorize(request)
	request.Header.Set("Content-Type", "application/json")
	if idempotencyKey != "" {
		request.Header.Set("Idempotency-Key", idempotencyKey)
	}
	return request
}

func mustAgentEvaluationOwnerCanonicalBytes(t *testing.T, value any) []byte {
	t.Helper()
	encoded, err := canonicalBytes(value)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func mustDecodeAgentEvaluationOwnerResponse(t *testing.T, body []byte, target any) {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		t.Fatal(err)
	}
}
