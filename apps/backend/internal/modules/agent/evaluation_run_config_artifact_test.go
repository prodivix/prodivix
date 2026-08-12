package agent

import (
	"bytes"
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"sort"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationTestRunConfigArtifactBinding(
	t *testing.T,
	planDigest string,
	repositoryCommit string,
	sourceConfigDigest string,
	frozenRunDigest string,
) EvaluationProductionRunConfigArtifactBinding {
	t.Helper()
	binding := EvaluationProductionRunConfigArtifactBinding{
		Format:                        evaluationProductionRunConfigArtifactBindingFormat,
		Version:                       evaluationProductionRunConfigArtifactVersion,
		SourcePlanArtifactName:        "g4-plan-1234567-1",
		SourcePlanArtifactDigest:      "sha256:0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef",
		SourcePlanWorkflowRunID:       "1234567",
		SourcePlanWorkflowRunAttempt:  1,
		RunConfigFileName:             evaluationProductionRunConfigFileName,
		RunConfigByteLength:           1_024,
		RunConfigCanonicalBytesDigest: sourceConfigDigest,
		SourceConfigDigest:            sourceConfigDigest,
		FrozenRunDigest:               frozenRunDigest,
		PlanDigest:                    planDigest,
		RepositoryCommit:              repositoryCommit,
	}
	var err error
	binding.BindingDigest, err = canonicaljson.Digest(evaluationProductionRunConfigArtifactBindingBase(binding))
	if err != nil {
		t.Fatalf("digest run-config artifact binding: %v", err)
	}
	return binding
}

func evaluationTestProductionRunConfigArtifactIngress(
	t *testing.T,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
) evaluationProductionRunConfigArtifactIngress {
	t.Helper()
	digest := func(label string) string { return evaluationArchiveTestDigest(t, "run-config-"+label) }
	runConfig := map[string]any{
		"format":           "prodivix.g4-real-model-evaluation-run-config",
		"version":          int64(1),
		"repositoryCommit": plan.RepositoryCommit,
		"material": map[string]any{
			"catalogDigests": map[string]any{
				"caseSetDigest": digest("case-set"), "publicMaterialSetDigest": digest("public-material"),
				"restrictedMaterialManifestDigest": digest("restricted-material"), "catalogDigest": digest("catalog"),
			},
			"holdoutDirectoryEnvironmentName": evaluationHoldoutDirectoryEnvironment,
			"holdoutKeyEnvironmentName":       evaluationHoldoutKeyEnvironment,
			"holdoutKeyRef":                   evaluationHoldoutEnvelopeKeyRef,
			"restrictedEnvelopeLocators": []any{map[string]any{
				"caseId": "case.a", "resolverRef": "resolver.case.a", "relativePath": "case-a.json",
				"encryptedMaterialDigest": digest("encrypted-material"),
				"encryptionPolicyDigest":  digest("encryption-policy"),
			}},
		},
	}
	runConfigBytes, err := canonicaljson.Bytes(runConfig)
	if err != nil {
		t.Fatal(err)
	}
	sourceConfigDigest, err := canonicaljson.Digest(runConfig)
	if err != nil {
		t.Fatal(err)
	}
	binding := evaluationTestRunConfigArtifactBinding(
		t, plan.PlanDigest, plan.RepositoryCommit, sourceConfigDigest, digest("frozen-run"),
	)
	binding.RunConfigByteLength = int64(len(runConfigBytes))
	binding.BindingDigest, err = canonicaljson.Digest(evaluationProductionRunConfigArtifactBindingBase(binding))
	if err != nil {
		t.Fatal(err)
	}
	base := map[string]any{
		"format":                   evaluationProductionRunConfigArtifactIngressFormat,
		"version":                  evaluationProductionRunConfigArtifactVersion,
		"namespaceId":              authority.NamespaceID,
		"planDigest":               plan.PlanDigest,
		"repositoryCommit":         plan.RepositoryCommit,
		"runConfigArtifactBinding": binding,
		"runConfig":                runConfig,
	}
	ingressDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatal(err)
	}
	value := make(map[string]any, len(base)+1)
	for key, entry := range base {
		value[key] = entry
	}
	value["ingressDigest"] = ingressDigest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	ingress, err := decodeEvaluationProductionRunConfigArtifactIngress(canonical, authority)
	if err != nil {
		t.Fatalf("decode production run-config artifact ingress: %v", err)
	}
	return ingress
}

func evaluationTestProductionRunConfigArtifactWithRunConfigMember(
	t *testing.T,
	authority EvaluationAuthority,
	ingress evaluationProductionRunConfigArtifactIngress,
	key string,
	member any,
) evaluationProductionRunConfigArtifactIngress {
	t.Helper()
	value := cloneEvaluationObject(ingress.Value)
	runConfig, ok := objectMember(value, "runConfig")
	if !ok {
		t.Fatal("run-config artifact fixture is missing runConfig")
	}
	runConfig = cloneEvaluationObject(runConfig)
	runConfig[key] = member
	runConfigBytes, err := canonicaljson.Bytes(runConfig)
	if err != nil {
		t.Fatal(err)
	}
	runConfigDigest, err := canonicaljson.Digest(runConfig)
	if err != nil {
		t.Fatal(err)
	}
	binding := ingress.Binding
	binding.RunConfigByteLength = int64(len(runConfigBytes))
	binding.RunConfigCanonicalBytesDigest = runConfigDigest
	binding.SourceConfigDigest = runConfigDigest
	binding.BindingDigest, err = canonicaljson.Digest(evaluationProductionRunConfigArtifactBindingBase(binding))
	if err != nil {
		t.Fatal(err)
	}
	value["runConfigArtifactBinding"] = binding
	value["runConfig"] = runConfig
	delete(value, "ingressDigest")
	value["ingressDigest"], err = canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	result, err := decodeEvaluationProductionRunConfigArtifactIngress(encoded, authority)
	if err != nil {
		t.Fatalf("decode mutated run-config artifact ingress: %v", err)
	}
	return result
}

func evaluationTestProductionRunConfigArtifactWithSourcePlanArtifactName(
	t *testing.T,
	authority EvaluationAuthority,
	ingress evaluationProductionRunConfigArtifactIngress,
	sourcePlanArtifactName string,
) evaluationProductionRunConfigArtifactIngress {
	t.Helper()
	value := cloneEvaluationObject(ingress.Value)
	binding := ingress.Binding
	binding.SourcePlanArtifactName = sourcePlanArtifactName
	var err error
	binding.BindingDigest, err = canonicaljson.Digest(evaluationProductionRunConfigArtifactBindingBase(binding))
	if err != nil {
		t.Fatal(err)
	}
	value["runConfigArtifactBinding"] = binding
	delete(value, "ingressDigest")
	value["ingressDigest"], err = canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	encoded, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	result, err := decodeEvaluationProductionRunConfigArtifactIngress(encoded, authority)
	if err != nil {
		t.Fatalf("decode binding-mutated run-config artifact ingress: %v", err)
	}
	return result
}

func TestEvaluationProductionRunConfigArtifactBindingRejectsRecomputedSourceSwap(t *testing.T) {
	digest := evaluationArchiveTestDigest(t, "run-config-binding")
	planDigest := evaluationArchiveTestDigest(t, "run-config-plan")
	binding := evaluationTestRunConfigArtifactBinding(t, planDigest,
		"0123456789abcdef0123456789abcdef01234567", digest, digest)
	if err := validateEvaluationProductionRunConfigArtifactBinding(binding); err != nil {
		t.Fatalf("validate binding: %v", err)
	}

	drifted := binding
	drifted.SourceConfigDigest = evaluationArchiveTestDigest(t, "run-config-swapped-source")
	drifted.BindingDigest, _ = canonicaljson.Digest(evaluationProductionRunConfigArtifactBindingBase(drifted))
	if err := validateEvaluationProductionRunConfigArtifactBinding(drifted); err == nil {
		t.Fatal("recomputed binding with a source/canonical-byte digest split was accepted")
	}
}

func evaluationExpectProductionRunConfigArtifactPlan(
	mock sqlmock.Sqlmock,
	plan evaluationPlanFact,
) {
	mock.ExpectQuery("SELECT evaluation_plan_id, plan_digest, repository_commit").
		WillReturnRows(sqlmock.NewRows([]string{
			"evaluation_plan_id", "plan_digest", "repository_commit", "planned_journey_count",
			"plan_bytes", "planned_at", "expires_at",
		}).AddRow(plan.PlanID, plan.PlanDigest, plan.RepositoryCommit, plan.PlannedJourneyCount,
			plan.Canonical, plan.PlannedAt, plan.ExpiresAt))
}

func evaluationProductionRunConfigArtifactRow(
	ingress evaluationProductionRunConfigArtifactIngress,
	storedAt time.Time,
) *sqlmock.Rows {
	_, receiptBytes, receiptDigest, _ := evaluationProductionRunConfigArtifactReceipt(ingress, storedAt)
	return sqlmock.NewRows([]string{
		"binding_json", "binding_bytes", "run_config_json", "run_config_bytes", "ingress_digest",
		"receipt_digest", "receipt_bytes", "stored_at",
	}).AddRow(ingress.BindingBytes, ingress.BindingBytes, ingress.RunConfigBytes, ingress.RunConfigBytes,
		ingress.IngressDigest, receiptDigest, receiptBytes, storedAt)
}

func evaluationProductionRunConfigArtifactJSONBText(t *testing.T, source []byte) []byte {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.UseNumber()
	var value map[string]any
	if err := decoder.Decode(&value); err != nil {
		t.Fatalf("decode JSONB projection: %v", err)
	}
	keys := make([]string, 0, len(value))
	for key := range value {
		keys = append(keys, key)
	}
	sort.Sort(sort.Reverse(sort.StringSlice(keys)))
	var formatted bytes.Buffer
	formatted.WriteByte('{')
	for index, key := range keys {
		if index != 0 {
			formatted.WriteString(", ")
		}
		keyBytes, _ := json.Marshal(key)
		entryBytes, err := canonicaljson.Bytes(value[key])
		if err != nil {
			t.Fatalf("encode JSONB projection member: %v", err)
		}
		formatted.Write(keyBytes)
		formatted.WriteString(": ")
		formatted.Write(entryBytes)
	}
	formatted.WriteByte('}')
	return formatted.Bytes()
}

func TestEvaluationProductionRunConfigArtifactStoreReplaysACKLossAndRejectsLateMutation(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{Kind: "service", PrincipalID: "authority.test", NamespaceID: "namespace.test"}
	ingress := evaluationTestProductionRunConfigArtifactIngress(t, authority, plan)
	storedAt := plan.PlannedAt.Add(time.Minute).UTC().Truncate(time.Millisecond)

	for _, scenario := range []struct {
		name       string
		inserted   int64
		calledAt   time.Time
		mutate     func(*evaluationProductionRunConfigArtifactIngress)
		row        func(evaluationProductionRunConfigArtifactIngress) *sqlmock.Rows
		wantReplay bool
		wantError  bool
	}{
		{
			name: "first-seal", inserted: 1, calledAt: storedAt,
			row: func(value evaluationProductionRunConfigArtifactIngress) *sqlmock.Rows {
				return evaluationProductionRunConfigArtifactRow(value, storedAt)
			},
		},
		{
			name: "ack-loss-replay", inserted: 0, calledAt: storedAt.Add(time.Minute), wantReplay: true,
			row: func(value evaluationProductionRunConfigArtifactIngress) *sqlmock.Rows {
				_, receiptBytes, receiptDigest, _ := evaluationProductionRunConfigArtifactReceipt(value, storedAt)
				return sqlmock.NewRows([]string{
					"binding_json", "binding_bytes", "run_config_json", "run_config_bytes", "ingress_digest",
					"receipt_digest", "receipt_bytes", "stored_at",
				}).AddRow(
					evaluationProductionRunConfigArtifactJSONBText(t, value.BindingBytes), value.BindingBytes,
					evaluationProductionRunConfigArtifactJSONBText(t, value.RunConfigBytes), value.RunConfigBytes,
					value.IngressDigest, receiptDigest, receiptBytes, storedAt,
				)
			},
		},
		{
			name: "late-binding-mutation", inserted: 0, calledAt: storedAt.Add(time.Minute), wantError: true,
			mutate: func(value *evaluationProductionRunConfigArtifactIngress) {
				value.Binding.SourcePlanArtifactName = "g4-plan-1234567-swapped"
				value.Binding.BindingDigest, _ = canonicaljson.Digest(evaluationProductionRunConfigArtifactBindingBase(value.Binding))
				value.BindingBytes = evaluationProductionRunConfigArtifactBindingBytes(value.Binding)
				value.Value["runConfigArtifactBinding"] = value.Binding
				base := cloneEvaluationObject(value.Value)
				delete(base, "ingressDigest")
				value.IngressDigest, _ = canonicaljson.Digest(base)
				value.Value["ingressDigest"] = value.IngressDigest
				value.Bytes, _ = canonicaljson.Bytes(value.Value)
			},
			row: func(evaluationProductionRunConfigArtifactIngress) *sqlmock.Rows {
				return sqlmock.NewRows([]string{
					"binding_json", "binding_bytes", "run_config_json", "run_config_bytes", "ingress_digest",
					"receipt_digest", "receipt_bytes", "stored_at",
				})
			},
		},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			repository := NewRepository(database)
			candidate := ingress
			if scenario.mutate != nil {
				scenario.mutate(&candidate)
			}
			mock.ExpectBegin()
			evaluationExpectProductionRunConfigArtifactPlan(mock, plan)
			mock.ExpectExec("INSERT INTO agent_evaluation_production_run_config_artifacts").
				WillReturnResult(sqlmock.NewResult(0, scenario.inserted))
			mock.ExpectQuery("SELECT binding_json,binding_bytes,run_config_json,run_config_bytes").
				WillReturnRows(scenario.row(candidate))
			if scenario.wantError {
				mock.ExpectRollback()
			} else {
				mock.ExpectCommit()
			}
			record, replayed, err := repository.StoreEvaluationProductionRunConfigArtifact(
				context.Background(), authority, candidate, scenario.calledAt,
			)
			if scenario.wantError {
				if err == nil {
					t.Fatal("late artifact mutation was accepted")
				}
			} else if err != nil || replayed != scenario.wantReplay ||
				record.Binding.BindingDigest != ingress.Binding.BindingDigest {
				t.Fatalf("store result replayed=%v record=%#v err=%v", replayed, record, err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestEvaluationProductionRunConfigArtifactRejectsTimestampOutsidePlanWindow(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{Kind: "service", PrincipalID: "authority.test", NamespaceID: "namespace.test"}
	ingress := evaluationTestProductionRunConfigArtifactIngress(t, authority, plan)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectBegin()
	evaluationExpectProductionRunConfigArtifactPlan(mock, plan)
	mock.ExpectRollback()
	if _, _, err := NewRepository(database).StoreEvaluationProductionRunConfigArtifact(
		context.Background(), authority, ingress, plan.PlannedAt.Add(-time.Millisecond),
	); err == nil {
		t.Fatal("run-config artifact timestamp before the plan authority window was accepted")
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

type evaluationProductionRunConfigArtifactFakeRepository struct {
	*evaluationServiceFakeRepository
	received evaluationProductionRunConfigArtifactIngress
}

func (repository *evaluationProductionRunConfigArtifactFakeRepository) StoreEvaluationProductionRunConfigArtifact(
	_ context.Context,
	_ EvaluationAuthority,
	ingress evaluationProductionRunConfigArtifactIngress,
	storedAt time.Time,
) (EvaluationProductionRunConfigArtifactRecord, bool, error) {
	repository.received = ingress
	_, receiptBytes, receiptDigest, err := evaluationProductionRunConfigArtifactReceipt(ingress, storedAt)
	return EvaluationProductionRunConfigArtifactRecord{
		NamespaceID: ingress.NamespaceID, Partition: ingress.Partition, Binding: ingress.Binding,
		BindingBytes: ingress.BindingBytes, RunConfigBytes: ingress.RunConfigBytes,
		IngressDigest: ingress.IngressDigest, ReceiptDigest: receiptDigest, ReceiptBytes: receiptBytes, StoredAt: storedAt,
	}, false, err
}

func TestEvaluationServiceProductionRunConfigArtifactIngressIsExactAndIdempotent(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: evaluationServiceTestNamespace}
	ingress := evaluationTestProductionRunConfigArtifactIngress(t, authority, plan)
	repository := &evaluationProductionRunConfigArtifactFakeRepository{evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan}}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	scanner := &evaluationAttemptAuthorityTestScanner{}
	handler.attemptAuthorityResponseScanner = scanner
	request := authorizedEvaluationServiceRequest(http.MethodPost,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/production-run-config-artifacts", bytes.NewReader(ingress.Bytes))
	request.Header.Set("Idempotency-Key", ingress.Binding.BindingDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusCreated || repository.received.IngressDigest != ingress.IngressDigest || scanner.calls != 1 {
		t.Fatalf("artifact ingress status=%d body=%s", response.Code, response.Body.String())
	}
	receipt, err := decodeEvaluationProductionRunConfigArtifactReceipt(response.Body.Bytes())
	if err != nil || stringMember(receipt, "bindingDigest") != ingress.Binding.BindingDigest {
		t.Fatalf("artifact ingress receipt=%#v err=%v", receipt, err)
	}

	wrongKey := authorizedEvaluationServiceRequest(http.MethodPost, request.URL.String(), bytes.NewReader(ingress.Bytes))
	wrongKey.Header.Set("Idempotency-Key", ingress.IngressDigest)
	rejected := httptest.NewRecorder()
	handler.ServeHTTP(rejected, wrongKey)
	if rejected.Code != http.StatusBadRequest {
		t.Fatalf("wrong artifact idempotency key status=%d body=%s", rejected.Code, rejected.Body.String())
	}
}

func TestEvaluationServiceProductionRunConfigArtifactIngressRequiresConfiguredScanner(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: evaluationServiceTestNamespace}
	ingress := evaluationTestProductionRunConfigArtifactIngress(t, authority, plan)
	repository := &evaluationProductionRunConfigArtifactFakeRepository{
		evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
	}
	handler := newEvaluationServiceTestHandler(t, repository, nil)
	request := authorizedEvaluationServiceRequest(http.MethodPost,
		"/v1/evaluations/"+evaluationServiceTestNamespace+"/production-run-config-artifacts", bytes.NewReader(ingress.Bytes))
	request.Header.Set("Idempotency-Key", ingress.Binding.BindingDigest)
	response := httptest.NewRecorder()
	handler.ServeHTTP(response, request)
	if response.Code != http.StatusServiceUnavailable || repository.received.IngressDigest != "" {
		t.Fatalf("missing-scanner status=%d stored=%s body=%s", response.Code, repository.received.IngressDigest, response.Body.String())
	}
}

func TestEvaluationServiceProductionRunConfigArtifactIngressRejectsDynamicCanary(t *testing.T) {
	vector := readEvaluationRepositoryVector(t)
	plan, err := decodeEvaluationPlan(vector.Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	authority := EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: evaluationServiceTestNamespace}
	secretCanary := "secret-canary-run-config-artifact-0001"
	base := evaluationTestProductionRunConfigArtifactIngress(t, authority, plan)
	for _, scenario := range []struct {
		name    string
		ingress evaluationProductionRunConfigArtifactIngress
	}{
		{
			name: "run-config-member",
			ingress: evaluationTestProductionRunConfigArtifactWithRunConfigMember(
				t, authority, base, "diagnosticLabel", secretCanary,
			),
		},
		{
			name: "binding-member",
			ingress: evaluationTestProductionRunConfigArtifactWithSourcePlanArtifactName(
				t, authority, base, secretCanary,
			),
		},
	} {
		t.Run(scenario.name, func(t *testing.T) {
			repository := &evaluationProductionRunConfigArtifactFakeRepository{
				evaluationServiceFakeRepository: &evaluationServiceFakeRepository{plan: plan},
			}
			handler := newEvaluationServiceTestHandler(t, repository, nil)
			handler.attemptAuthorityResponseScanner, err = NewEvaluationPublicResponseScanner(EvaluationPublicResponseScannerConfig{
				CredentialCanaries:        [][]byte{[]byte("artifact-service-credential-canary-0001")},
				SecretCanaries:            [][]byte{[]byte(secretCanary)},
				ProtectedMaterialCanaries: [][]byte{[]byte("protected-run-config-canary-000001")},
			})
			if err != nil {
				t.Fatal(err)
			}
			request := authorizedEvaluationServiceRequest(http.MethodPost,
				"/v1/evaluations/"+evaluationServiceTestNamespace+"/production-run-config-artifacts", bytes.NewReader(scenario.ingress.Bytes))
			request.Header.Set("Idempotency-Key", scenario.ingress.Binding.BindingDigest)
			response := httptest.NewRecorder()
			handler.ServeHTTP(response, request)
			if response.Code != http.StatusForbidden || repository.received.IngressDigest != "" {
				t.Fatalf("dynamic canary status=%d stored=%s body=%s", response.Code, repository.received.IngressDigest, response.Body.String())
			}
		})
	}
}
