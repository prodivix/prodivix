package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationVerificationGrantTestToken = "evaluation-verification-attempt-grant-test-token"

func evaluationVerificationGrantTestDigest(label string) string {
	digest, err := canonicaljson.Digest(map[string]any{"label": label})
	if err != nil {
		panic(err)
	}
	return digest
}

type evaluationVerificationGrantTestRepository struct {
	partition           EvaluationPlanPartition
	descriptorCanonical []byte
	authorization       evaluationAttemptDescriptorAuthorization
	requestBytes        []byte
	receiptBytes        []byte
	storeCalls          int
}

func (repository *evaluationVerificationGrantTestRepository) GetEvaluationPlan(
	_ context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) (EvaluationPlanRecord, error) {
	if authority.NamespaceID != "namespace.g4" || partition != repository.partition {
		return EvaluationPlanRecord{}, ErrNotFound
	}
	return EvaluationPlanRecord{
		EvaluationFactRecord: EvaluationFactRecord{
			NamespaceID: authority.NamespaceID,
			PlanDigest:  partition.PlanDigest,
		},
		RepositoryCommit: partition.RepositoryCommit,
	}, nil
}

func (repository *evaluationVerificationGrantTestRepository) AuthorizeEvaluationAttemptDescriptor(
	_ context.Context,
	_ EvaluationAuthority,
	partition EvaluationPlanPartition,
	descriptor []byte,
) (evaluationAttemptDescriptorAuthorization, error) {
	if partition != repository.partition || !bytes.Equal(descriptor, repository.descriptorCanonical) {
		return evaluationAttemptDescriptorAuthorization{}, ErrNotFound
	}
	return repository.authorization, nil
}

func (repository *evaluationVerificationGrantTestRepository) StoreEvaluationVerificationAttemptGrantReceipt(
	_ context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	issue evaluationVerificationAttemptGrantIssue,
	receipt evaluationVerificationAttemptGrantReceipt,
) (EvaluationVerificationAttemptGrantReceiptRecord, bool, error) {
	repository.storeCalls++
	requestBytes, receiptBytes, err := validateEvaluationVerificationAttemptGrantReceipt(partition, issue, receipt)
	if err != nil || authority.NamespaceID != "namespace.g4" || partition != repository.partition {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, ErrInvalid
	}
	replayed := len(repository.receiptBytes) > 0
	if replayed && (!bytes.Equal(repository.requestBytes, requestBytes) || !bytes.Equal(repository.receiptBytes, receiptBytes)) {
		return EvaluationVerificationAttemptGrantReceiptRecord{}, false, ErrConflict
	}
	if !replayed {
		repository.requestBytes = append([]byte(nil), requestBytes...)
		repository.receiptBytes = append([]byte(nil), receiptBytes...)
	}
	return evaluationVerificationAttemptGrantReceiptRecord(
		authority.NamespaceID, partition, issue, receipt, requestBytes, receiptBytes,
	), replayed, nil
}

type evaluationVerificationGrantTestIssuer struct {
	verificationPlanDigest string
	workspaceRevision      int64
	issuedAt               time.Time
	last                   backendverification.TrustedAttemptGrantIssue
	calls                  int
	driftWorkspaceRevision bool
}

func (issuer *evaluationVerificationGrantTestIssuer) IssueTrustedAttemptGrant(
	_ context.Context,
	input backendverification.TrustedAttemptGrantIssue,
) (backendverification.AttemptGrantRecord, error) {
	issuer.calls++
	issuer.last = input
	workspaceRevision := issuer.workspaceRevision
	if issuer.driftWorkspaceRevision {
		workspaceRevision++
	}
	record := backendverification.AttemptGrantRecord{
		WorkspaceID:              input.WorkspaceID,
		ProjectID:                input.ProjectID,
		WorkspaceRevision:        workspaceRevision,
		PartitionRevisionsDigest: evaluationVerificationGrantTestDigest("partitions"),
		PolicyRevision:           1,
		PolicyDigest:             evaluationVerificationGrantTestDigest("policy"),
		PolicyEvaluationInstant:  issuer.issuedAt,
		ImpactDigest:             evaluationVerificationGrantTestDigest("impact"),
		PlanDigest:               issuer.verificationPlanDigest,
		CellID:                   input.CellID,
		CheckID:                  "check.g4",
		CheckKind:                "integration",
		TargetID:                 "target.g4",
		AttemptID:                input.AttemptID,
		RunID:                    input.Run.RunID,
		ProviderID:               input.Run.ProviderID,
		JobID:                    input.Run.JobID,
		SessionID:                input.Run.SessionID,
		ProducerID:               input.ProducerID,
		TrustCeiling:             input.TrustCeiling,
		RetentionRequest: backendverification.AuthoritativeRetentionRequest{
			Successful: backendverification.RetentionChange,
			Failed:     backendverification.RetentionSession,
		},
		MaximumClosureEvidenceRecords: 32,
		IssuedBy:                      input.IssuedBy,
		IssuedAt:                      issuer.issuedAt,
		ExpiresAt:                     input.ExpiresAt,
	}
	grantDigest, err := evaluationVerificationAttemptGrantDigest(
		evaluationVerificationAttemptGrantFromRecord(record),
	)
	if err != nil {
		return backendverification.AttemptGrantRecord{}, err
	}
	record.GrantDigest = grantDigest
	record.ID = "attempt-grant-" + strings.TrimPrefix(grantDigest, "sha256-")
	return record, nil
}

func evaluationVerificationGrantTestIssue(
	t *testing.T,
	partition EvaluationPlanPartition,
	verificationPlanDigest string,
	expiresAt time.Time,
) evaluationVerificationAttemptGrantIssue {
	t.Helper()
	capabilityDescriptorDigest := evaluationVerificationGrantTestDigest("capability-descriptor")
	targetDigest := evaluationVerificationGrantTestDigest("target")
	samplingBase := map[string]any{
		"planDigest": partition.PlanDigest, "caseId": "case.g4",
		"capabilityDescriptorDigest": capabilityDescriptorDigest,
		"targetId":                   "target.g4", "targetDigest": targetDigest,
		"riskClass": "ordinary", "repetitionIndex": 0,
	}
	samplingIdentityDigest, err := canonicaljson.Digest(samplingBase)
	if err != nil {
		t.Fatal(err)
	}
	shardDigest, err := canonicaljson.Digest(map[string]any{"targetId": "target.g4"})
	if err != nil {
		t.Fatal(err)
	}
	descriptorBase := map[string]any{
		"attemptId":  "evaluation-attempt:" + strings.TrimPrefix(samplingIdentityDigest, "sha256-"),
		"planDigest": partition.PlanDigest,
		"shardId":    "evaluation-shard:" + strings.TrimPrefix(shardDigest, "sha256-"),
		"caseId":     "case.g4", "capabilityDescriptorDigest": capabilityDescriptorDigest,
		"targetId": "target.g4", "targetDigest": targetDigest,
		"riskClass": "ordinary", "repetitionIndex": 0,
		"samplingIdentityDigest": samplingIdentityDigest,
	}
	descriptorDigest, err := canonicaljson.Digest(descriptorBase)
	if err != nil {
		t.Fatal(err)
	}
	descriptor := map[string]any{}
	for key, value := range descriptorBase {
		descriptor[key] = value
	}
	descriptor["descriptorDigest"] = descriptorDigest
	descriptorBytes, err := canonicaljson.Bytes(descriptor)
	if err != nil {
		t.Fatal(err)
	}
	attemptID := descriptorBase["attemptId"].(string)
	issue := evaluationVerificationAttemptGrantIssue{
		Format:                     evaluationVerificationAttemptGrantIssueFormat,
		Version:                    evaluationVerificationAttemptGrantVersion,
		NamespaceID:                "namespace.g4",
		EvaluationPlanDigest:       partition.PlanDigest,
		RepositoryCommit:           partition.RepositoryCommit,
		EvaluationAttemptID:        attemptID,
		DescriptorDigest:           descriptorDigest,
		CapabilityDescriptorDigest: capabilityDescriptorDigest,
		CaseID:                     "case.g4",
		Descriptor:                 json.RawMessage(descriptorBytes),
		Generation:                 3,
		WorkspaceID:                "workspace.g4",
		WorkspaceRevision:          7,
		ProjectID:                  "project.g4",
		VerificationPlanDigest:     verificationPlanDigest,
		VerificationPlan:           json.RawMessage(`{"format":"prodivix.verification-plan","planDigest":"` + verificationPlanDigest + `"}`),
		CellID:                     "cell.g4",
		Run: backendverification.RunIdentity{
			RunID: "run.g4", ProviderID: "provider.g4", JobID: "job.g4", SessionID: "session.g4",
			ParentAttemptID: attemptID, Surface: "preview", FrameworkTarget: "react-vite",
			RuntimeZone: "sandbox", Viewport: backendverification.ViewportIdentity{ID: "viewport.g4", Width: 1280, Height: 720},
			DevicePixelRatio: 1, ColorScheme: "light", Motion: "reduced", Locale: "en-US",
			Timezone: "UTC", FontSetDigest: evaluationVerificationGrantTestDigest("fonts"),
		},
		TrustCeiling: backendverification.TrustLocalUnattested,
		ExpiresAt:    evaluationVerificationGrantInstant(expiresAt),
	}
	requestDigest, err := canonicaljson.Digest(issue.base())
	if err != nil {
		t.Fatal(err)
	}
	issue.RequestDigest = requestDigest
	return issue
}

func evaluationVerificationGrantRequest(
	t *testing.T,
	partition EvaluationPlanPartition,
	issue evaluationVerificationAttemptGrantIssue,
	token string,
) *http.Request {
	t.Helper()
	body, err := json.Marshal(issue)
	if err != nil {
		t.Fatal(err)
	}
	request := httptest.NewRequest(
		http.MethodPost,
		"/v1/evaluations/namespace.g4/"+partition.PlanDigest+"/"+partition.RepositoryCommit+"/verification-attempt-grants",
		bytes.NewReader(body),
	)
	request.Header.Set("Authorization", "Bearer "+token)
	request.Header.Set("Content-Type", "application/json")
	return request
}

func TestAuthorizeEvaluationAttemptDescriptorBindsFrozenSchedule(t *testing.T) {
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationVerificationGrantTestDigest("descriptor-plan"),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	issue := evaluationVerificationGrantTestIssue(
		t,
		partition,
		evaluationVerificationGrantTestDigest("descriptor-verification-plan"),
		time.Now().UTC().Add(5*time.Minute),
	)
	plan := map[string]any{
		"planDigest": partition.PlanDigest,
		"concreteCases": []any{map[string]any{
			"caseId":                     issue.DescriptorDigest,
			"capabilityProfileId":        "capability-profile.g4",
			"capabilityDescriptorDigest": issue.CapabilityDescriptorDigest,
			"capabilityDescriptor": map[string]any{
				"capabilityId": "capability.g4", "descriptorDigest": issue.CapabilityDescriptorDigest,
			},
			"riskClass":       "ordinary",
			"contextSentinel": false,
			"mediaSentinel":   false,
		}},
		"capabilityQualificationTargets": []any{map[string]any{
			"targetId":            "target.g4",
			"targetDigest":        evaluationVerificationGrantTestDigest("target"),
			"capabilityProfileId": "capability-profile.g4",
		}},
		"repetitionPolicy": map[string]any{"rules": []any{map[string]any{
			"riskClass": "ordinary", "minimumIndependentAttempts": 1,
		}}},
	}
	// The helper's descriptor uses the stable case id frozen below.
	plan["concreteCases"].([]any)[0].(map[string]any)["caseId"] = "case.g4"
	planSource, err := canonicaljson.Bytes(map[string]any{"value": plan})
	if err != nil {
		t.Fatal(err)
	}
	authorization, err := authorizeEvaluationAttemptDescriptor(planSource, partition, issue.Descriptor)
	if err != nil {
		t.Fatal(err)
	}
	if authorization.AttemptID != issue.EvaluationAttemptID ||
		authorization.DescriptorDigest != issue.DescriptorDigest ||
		authorization.CapabilityDescriptorDigest != issue.CapabilityDescriptorDigest {
		t.Fatalf("descriptor authorization = %#v", authorization)
	}
	plan["concreteCases"].([]any)[0].(map[string]any)["capabilityDescriptorDigest"] =
		evaluationVerificationGrantTestDigest("unauthorized-capability")
	planSource, err = canonicaljson.Bytes(map[string]any{"value": plan})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := authorizeEvaluationAttemptDescriptor(planSource, partition, issue.Descriptor); !errors.Is(err, ErrConflict) {
		t.Fatalf("capability schedule drift error = %v", err)
	}
}

func TestEvaluationVerificationAttemptGrantEndpointBindsAndReplaysExactAuthority(t *testing.T) {
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationVerificationGrantTestDigest("evaluation-plan"),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	verificationPlanDigest := evaluationVerificationGrantTestDigest("verification-plan")
	issuedAt := time.Now().UTC().Truncate(time.Millisecond)
	expiresAt := issuedAt.Add(5 * time.Minute)
	issue := evaluationVerificationGrantTestIssue(
		t, partition, verificationPlanDigest, expiresAt,
	)
	repository := &evaluationVerificationGrantTestRepository{
		partition: partition, descriptorCanonical: append([]byte(nil), issue.Descriptor...),
		authorization: evaluationAttemptDescriptorAuthorization{
			AttemptID: issue.EvaluationAttemptID, DescriptorDigest: issue.DescriptorDigest,
			CapabilityDescriptorDigest: issue.CapabilityDescriptorDigest,
			ShardID:                    "evaluation-shard.g4", CaseID: "case.g4", TargetID: "target.g4",
		},
	}
	issuer := &evaluationVerificationGrantTestIssuer{
		verificationPlanDigest: verificationPlanDigest,
		workspaceRevision:      7,
		issuedAt:               issuedAt,
	}
	handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
		NamespaceID: "namespace.g4", ServiceToken: evaluationVerificationGrantTestToken,
		VerificationAttemptGrantIssuer: issuer,
	})
	if err != nil {
		t.Fatal(err)
	}
	var firstBody []byte
	for invocation := 0; invocation < 2; invocation++ {
		response := httptest.NewRecorder()
		handler.ServeHTTP(response, evaluationVerificationGrantRequest(
			t, partition, issue, evaluationVerificationGrantTestToken,
		))
		if response.Code != http.StatusOK {
			t.Fatalf("status = %d body = %s", response.Code, response.Body.String())
		}
		var receipt evaluationVerificationAttemptGrantReceipt
		if err := json.Unmarshal(response.Body.Bytes(), &receipt); err != nil {
			t.Fatal(err)
		}
		expectedReceiptDigest, err := canonicaljson.Digest(receipt.evaluationVerificationAttemptGrantReceiptBase)
		if err != nil {
			t.Fatal(err)
		}
		if receipt.ReceiptDigest != expectedReceiptDigest ||
			receipt.RequestDigest != issue.RequestDigest ||
			receipt.EvaluationPlanDigest != issue.EvaluationPlanDigest ||
			receipt.DescriptorDigest != issue.DescriptorDigest ||
			receipt.CapabilityDescriptorDigest != issue.CapabilityDescriptorDigest ||
			receipt.CaseID != issue.CaseID ||
			receipt.Grant.VerificationPlanDigest != verificationPlanDigest ||
			receipt.Grant.WorkspaceRevision != issue.WorkspaceRevision {
			t.Fatalf("receipt is not exact: %#v", receipt)
		}
		if invocation == 0 {
			firstBody = append([]byte(nil), response.Body.Bytes()...)
		} else if !bytes.Equal(firstBody, response.Body.Bytes()) {
			t.Fatal("exact retry did not replay the same receipt")
		}
	}
	if issuer.calls != 2 || issuer.last.IssuedBy == "" || issuer.last.ProducerID != evaluationVerificationAttemptGrantProducerID {
		t.Fatalf("issuer binding = %#v calls = %d", issuer.last, issuer.calls)
	}
	if repository.storeCalls != 2 || len(repository.receiptBytes) == 0 {
		t.Fatalf("durable receipt calls = %d bytes = %d", repository.storeCalls, len(repository.receiptBytes))
	}
}

func TestEvaluationVerificationAttemptGrantEndpointFailsClosed(t *testing.T) {
	partition := EvaluationPlanPartition{
		PlanDigest:       evaluationVerificationGrantTestDigest("evaluation-plan-negative"),
		RepositoryCommit: "0123456789abcdef0123456789abcdef01234567",
	}
	verificationPlanDigest := evaluationVerificationGrantTestDigest("verification-plan-negative")
	issuedAt := time.Now().UTC().Truncate(time.Millisecond)
	validIssue := evaluationVerificationGrantTestIssue(
		t, partition, verificationPlanDigest, issuedAt.Add(5*time.Minute),
	)
	repository := &evaluationVerificationGrantTestRepository{
		partition: partition, descriptorCanonical: append([]byte(nil), validIssue.Descriptor...),
		authorization: evaluationAttemptDescriptorAuthorization{
			AttemptID: validIssue.EvaluationAttemptID, DescriptorDigest: validIssue.DescriptorDigest,
			CapabilityDescriptorDigest: validIssue.CapabilityDescriptorDigest,
			ShardID:                    "evaluation-shard.g4", CaseID: "case.g4", TargetID: "target.g4",
		},
	}
	baseIssuer := func() *evaluationVerificationGrantTestIssuer {
		return &evaluationVerificationGrantTestIssuer{
			verificationPlanDigest: verificationPlanDigest,
			workspaceRevision:      7,
			issuedAt:               issuedAt,
		}
	}
	tests := []struct {
		name   string
		token  string
		issuer backendverification.AttemptGrantIssuer
		mutate func(*evaluationVerificationAttemptGrantIssue)
		want   int
	}{
		{name: "missing issuer", token: evaluationVerificationGrantTestToken, want: http.StatusServiceUnavailable},
		{name: "invalid service credential", token: "wrong-evaluation-verification-token", issuer: baseIssuer(), want: http.StatusUnauthorized},
		{name: "stale request digest", token: evaluationVerificationGrantTestToken, issuer: baseIssuer(), mutate: func(issue *evaluationVerificationAttemptGrantIssue) { issue.Generation++ }, want: http.StatusBadRequest},
		{name: "unknown descriptor", token: evaluationVerificationGrantTestToken, issuer: baseIssuer(), mutate: func(issue *evaluationVerificationAttemptGrantIssue) {
			issue.Descriptor = json.RawMessage(`{"attemptId":"unknown"}`)
			issue.RequestDigest, _ = canonicaljson.Digest(issue.base())
		}, want: http.StatusNotFound},
		{name: "issuer workspace drift", token: evaluationVerificationGrantTestToken, issuer: &evaluationVerificationGrantTestIssuer{
			verificationPlanDigest: verificationPlanDigest, workspaceRevision: 7,
			issuedAt: issuedAt, driftWorkspaceRevision: true,
		}, want: http.StatusConflict},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			handler, err := NewEvaluationServiceHandler(repository, EvaluationServiceHandlerConfig{
				NamespaceID: "namespace.g4", ServiceToken: evaluationVerificationGrantTestToken,
				VerificationAttemptGrantIssuer: test.issuer,
			})
			if err != nil {
				t.Fatal(err)
			}
			issue := validIssue
			if test.mutate != nil {
				test.mutate(&issue)
			}
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, evaluationVerificationGrantRequest(t, partition, issue, test.token))
			if response.Code != test.want {
				t.Fatalf("status = %d want %d body = %s", response.Code, test.want, response.Body.String())
			}
		})
	}
}
