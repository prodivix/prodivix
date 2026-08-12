package agent

import (
	"bytes"
	"database/sql"
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestHostedRetrievalRuntimeResourceLifecycleDemandIsExactPerIntent(t *testing.T) {
	tests := []struct {
		name                  string
		uploadBytes           int64
		storageByteSeconds    string
		expectedUploadDecimal string
	}{
		{
			name: "core", uploadBytes: 84,
			storageByteSeconds: "58060800", expectedUploadDecimal: "84",
		},
		{
			name: "document", uploadBytes: 71,
			storageByteSeconds: "49075200", expectedUploadDecimal: "71",
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			demand, err := createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(test.uploadBytes)
			if err != nil {
				t.Fatal(err)
			}
			expected, err := createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(test.uploadBytes)
			if err != nil {
				t.Fatal(err)
			}
			if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(demand, expected); err != nil {
				t.Fatalf("exact lifecycle demand was rejected: %v", err)
			}
			value, canonical, err := decodeEvaluationJSONObject(demand.Canonical, maximumEvaluationBudgetFactBytes)
			if err != nil || !bytes.Equal(canonical, demand.Canonical) {
				t.Fatalf("canonical demand decode error=%v", err)
			}
			usage, usageOK := objectMember(value, "usage")
			amounts, amountsOK := arrayMember(usage, "amounts")
			if !usageOK || !amountsOK || len(amounts) != 3 {
				t.Fatalf("usage amounts=%v, want exact three", usage["amounts"])
			}
			wantUnits := []string{"hosted-tool-call", "provider-storage-byte-second", "provider-upload-byte"}
			wantConfidence := []string{"estimated", "estimated", "measured"}
			wantAmounts := []string{"3", test.storageByteSeconds, test.expectedUploadDecimal}
			for index, raw := range amounts {
				amount, ok := raw.(map[string]any)
				if !ok || !exactEvaluationKeys(amount, []string{
					"unit", "logicalAmount", "billableAmount", "confidence",
				}) || stringMember(amount, "unit") != wantUnits[index] ||
					stringMember(amount, "confidence") != wantConfidence[index] ||
					stringMember(amount, "logicalAmount") != wantAmounts[index] ||
					stringMember(amount, "billableAmount") != wantAmounts[index] {
					t.Fatalf("amount[%d]=%v, want unit=%s confidence=%s amount=%s", index, amount,
						wantUnits[index], wantConfidence[index], wantAmounts[index])
				}
			}
			vectorDigest, err := canonicaljson.Digest(amounts)
			if err != nil || stringMember(usage, "vectorDigest") != vectorDigest {
				t.Fatalf("vector digest=%s error=%v, want %s", stringMember(usage, "vectorDigest"), err, vectorDigest)
			}
			demandDigest, err := canonicaljson.Digest(value)
			if err != nil || demand.Digest != demandDigest {
				t.Fatalf("demand digest=%s error=%v, want %s", demand.Digest, err, demandDigest)
			}
			if demand.Unknown || len(demand.Cost) != 0 || demand.ModelInvocations != 0 || demand.ToolCalls != 0 ||
				demand.RepairRounds != 0 || demand.Transactions != 0 || demand.ArtifactBytes != 0 || demand.ElapsedMS != 0 {
				t.Fatalf("non-zero lifecycle demand scalars: %+v", demand)
			}
		})
	}
}

func TestHostedRetrievalRuntimeResourceLifecycleDemandRejectsCanonicalDrift(t *testing.T) {
	type mutation func(map[string]any, map[string]any, []any)
	tests := []struct {
		name   string
		mutate mutation
	}{
		{name: "confidence", mutate: func(_ map[string]any, _ map[string]any, amounts []any) {
			amounts[0].(map[string]any)["confidence"] = "measured"
		}},
		{name: "missing billable amount", mutate: func(_ map[string]any, _ map[string]any, amounts []any) {
			delete(amounts[0].(map[string]any), "billableAmount")
		}},
		{name: "cached amount", mutate: func(_ map[string]any, _ map[string]any, amounts []any) {
			amounts[0].(map[string]any)["cachedAmount"] = "3"
		}},
		{name: "source digest", mutate: func(_ map[string]any, _ map[string]any, amounts []any) {
			amounts[0].(map[string]any)["sourceDigest"] = "sha256-" + strings.Repeat("a", 64)
		}},
		{name: "non canonical decimal 3.0", mutate: func(_ map[string]any, _ map[string]any, amounts []any) {
			amounts[0].(map[string]any)["logicalAmount"] = "3.0"
			amounts[0].(map[string]any)["billableAmount"] = "3.0"
		}},
		{name: "amount order", mutate: func(_ map[string]any, _ map[string]any, amounts []any) {
			amounts[1], amounts[2] = amounts[2], amounts[1]
		}},
		{name: "zero", mutate: func(_ map[string]any, _ map[string]any, amounts []any) {
			amounts[0].(map[string]any)["logicalAmount"] = "0"
			amounts[0].(map[string]any)["billableAmount"] = "0"
		}},
		{name: "cost", mutate: func(value map[string]any, _ map[string]any, _ []any) {
			value["cost"] = []any{map[string]any{"currency": "USD", "amount": "0", "confidence": "estimated"}}
		}},
		{name: "scalar", mutate: func(value map[string]any, _ map[string]any, _ []any) {
			value["toolCalls"] = int64(1)
		}},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			demand, err := createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(84)
			if err != nil {
				t.Fatal(err)
			}
			value, _, err := decodeEvaluationJSONObject(demand.Canonical, maximumEvaluationBudgetFactBytes)
			if err != nil {
				t.Fatal(err)
			}
			usage, _ := objectMember(value, "usage")
			amounts, _ := arrayMember(usage, "amounts")
			test.mutate(value, usage, amounts)
			vectorDigest, err := canonicaljson.Digest(amounts)
			if err != nil {
				t.Fatal(err)
			}
			usage["vectorDigest"] = vectorDigest
			canonical, err := canonicaljson.Bytes(value)
			if err != nil {
				t.Fatal(err)
			}
			mutated, err := decodeEvaluationBudgetDemand(canonical, true)
			if err == nil {
				expected, expectedErr := createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(84)
				if expectedErr != nil {
					t.Fatal(expectedErr)
				}
				err = validateEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(
					mutated, expected,
				)
			}
			if err == nil {
				t.Fatal("canonical lifecycle demand drift was accepted")
			}
		})
	}
}

func TestHostedRetrievalRuntimeResourceLifecycleDemandRejectsDigestAndProfileDrift(t *testing.T) {
	core, err := createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(84)
	if err != nil {
		t.Fatal(err)
	}
	document, err := createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(71)
	if err != nil {
		t.Fatal(err)
	}
	if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(
		core, document,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("cross-profile lifecycle demand error=%v, want conflict", err)
	}
	for _, uploadBytes := range []int64{0, 9_007_199_254_740_991/691_200 + 1} {
		if _, err := createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(uploadBytes); !errors.Is(err, ErrConflict) {
			t.Fatalf("upload bytes %d error=%v, want conflict", uploadBytes, err)
		}
	}
	value, _, err := decodeEvaluationJSONObject(core.Canonical, maximumEvaluationBudgetFactBytes)
	if err != nil {
		t.Fatal(err)
	}
	usage, _ := objectMember(value, "usage")
	usage["vectorDigest"] = "sha256-" + strings.Repeat("b", 64)
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	if _, err := decodeEvaluationBudgetDemand(canonical, true); err == nil {
		t.Fatal("non-canonical vector digest was accepted")
	}
	for name, mutate := range map[string]func(*evaluationBudgetDemand){
		"demand digest": func(demand *evaluationBudgetDemand) {
			demand.Digest = "sha256-" + strings.Repeat("b", 64)
		},
		"canonical bytes": func(demand *evaluationBudgetDemand) {
			demand.Canonical = append(append([]byte(nil), demand.Canonical...), ' ')
		},
	} {
		t.Run(name, func(t *testing.T) {
			demand := core
			mutate(&demand)
			if err := validateEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(
				demand, core,
			); !errors.Is(err, ErrConflict) {
				t.Fatalf("digest drift error=%v, want conflict", err)
			}
		})
	}
}

type evaluationHostedLifecycleBudgetTestFixture struct {
	plan       evaluationPlanFact
	request    evaluationHostedRetrievalRuntimeResourceRegistrationRequest
	demand     evaluationBudgetDemand
	reservedAt time.Time
	stagedAt   time.Time
}

func evaluationHostedLifecycleBudgetFixture(
	t *testing.T,
	profileID string,
	reservedOffset time.Duration,
	stagedOffset time.Duration,
) evaluationHostedLifecycleBudgetTestFixture {
	t.Helper()
	plan, err := decodeEvaluationPlan(readEvaluationRepositoryVector(t).Facts.Plan)
	if err != nil {
		t.Fatal(err)
	}
	var target map[string]any
	for _, candidate := range evaluationHostedArchiveTestHostedTargets(t, plan) {
		if stringMember(candidate, "capabilityProfileId") == profileID &&
			stringMember(candidate, "protocolFamily") == "openai-responses" {
			target = candidate
			break
		}
	}
	if target == nil {
		t.Fatalf("hosted target for profile %q is absent", profileID)
	}
	registration := evaluationHostedArchiveTestRegistrationForTarget(
		t, plan, target, evaluationServiceTestNamespace,
		evaluationHostedArchiveTestDigest(t, "budget-frozen-run"),
		evaluationHostedArchiveTestDigest(t, "budget-run-config"),
		"hosted-runtime-set.budget-test",
	)
	program, err := expectedEvaluationCapabilityProbeProgram(
		profileID, stringMember(target, "capabilityProfileDigest"),
	)
	if err != nil {
		t.Fatal(err)
	}
	content, err := evaluationCapabilityProbePublicResourceContent(
		stringMember(program.PublicProbeResource, "resourceKind"),
	)
	if err != nil {
		t.Fatal(err)
	}
	demand, err := createEvaluationHostedRetrievalRuntimeResourceLifecycleDemand(int64(len([]byte(content))))
	if err != nil {
		t.Fatal(err)
	}
	reservedAt := plan.PlannedAt.Add(reservedOffset).UTC().Truncate(time.Millisecond)
	budget, _ := objectMember(registration.request, "budgetReservationAuthority")
	budget["demandDigest"] = demand.Digest
	budget["demandBytesDigest"] = demand.Digest
	budget["reservedAt"] = evaluationExportInstant(reservedAt)
	evaluationHostedArchiveTestRecomputeSelfDigest(t, budget, "authorityDigest")
	registration.request["budgetReservationAuthorityDigest"] = stringMember(budget, "authorityDigest")
	evaluationHostedArchiveTestRecomputeSelfDigest(t, registration.request, "requestDigest")
	requestBytes, err := canonicaljson.Bytes(registration.request)
	if err != nil {
		t.Fatal(err)
	}
	request, err := decodeEvaluationHostedRetrievalRuntimeResourceRegistrationRequest(requestBytes)
	if err != nil {
		t.Fatal(err)
	}
	return evaluationHostedLifecycleBudgetTestFixture{
		plan: plan, request: request, demand: demand, reservedAt: reservedAt,
		stagedAt: plan.PlannedAt.Add(stagedOffset).UTC().Truncate(time.Millisecond),
	}
}

func evaluationHostedLifecycleBudgetRedecodeRequest(
	t *testing.T,
	fixture *evaluationHostedLifecycleBudgetTestFixture,
) {
	t.Helper()
	evaluationHostedArchiveTestRecomputeSelfDigest(t, fixture.request.Value, "requestDigest")
	requestBytes, err := canonicaljson.Bytes(fixture.request.Value)
	if err != nil {
		t.Fatal(err)
	}
	fixture.request, err = decodeEvaluationHostedRetrievalRuntimeResourceRegistrationRequest(requestBytes)
	if err != nil {
		t.Fatal(err)
	}
}

func evaluationHostedLifecycleBudgetValidateWithMock(
	t *testing.T,
	fixture evaluationHostedLifecycleBudgetTestFixture,
	planMode string,
	reservationMode string,
) error {
	t.Helper()
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	mock.ExpectBegin()
	tx, err := database.BeginTx(t.Context(), &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		t.Fatal(err)
	}
	planQuery := mock.ExpectQuery(`SELECT plan_bytes,planned_at,expires_at`).
		WithArgs(fixture.request.NamespaceID, fixture.request.PlanDigest, fixture.request.RepositoryCommit)
	if planMode == "missing" {
		planQuery.WillReturnError(sql.ErrNoRows)
	} else {
		planQuery.WillReturnRows(sqlmock.NewRows([]string{"plan_bytes", "planned_at", "expires_at"}).
			AddRow(fixture.plan.Canonical, fixture.plan.PlannedAt, fixture.plan.ExpiresAt))
	}
	if reservationMode != "" {
		reservationID := stringMember(fixture.request.Value["budgetReservationAuthority"].(map[string]any), "reservationId")
		reservationQuery := mock.ExpectQuery(`SELECT reservation.ledger_revision,reservation.demand_digest`).
			WithArgs(fixture.request.NamespaceID, fixture.request.PlanDigest, reservationID)
		if reservationMode == "missing" {
			reservationQuery.WillReturnError(sql.ErrNoRows)
		} else {
			revision := int64(7)
			unsettled := true
			if reservationMode == "stale" {
				revision++
			}
			if reservationMode == "settled" {
				unsettled = false
			}
			reservationQuery.WillReturnRows(sqlmock.NewRows([]string{
				"ledger_revision", "demand_digest", "demand_bytes", "reserved_at", "unsettled",
			}).AddRow(revision, fixture.demand.Digest, fixture.demand.Canonical, fixture.reservedAt, unsettled))
		}
	}
	validationErr := validateEvaluationHostedRetrievalRuntimeResourceBudgetReservationTx(
		t.Context(), tx, fixture.request, fixture.stagedAt,
	)
	mock.ExpectRollback()
	if err := tx.Rollback(); err != nil {
		t.Fatal(err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
	return validationErr
}

func TestHostedRetrievalRuntimeResourceBudgetReservationJoinsPlanMaterial(t *testing.T) {
	for _, test := range []struct {
		name            string
		profileID       string
		wantUploadBytes int
	}{
		{name: "core", profileID: "g4-provider-hosted-retrieval-core", wantUploadBytes: 84},
		{name: "document", profileID: "g4-provider-hosted-retrieval-document", wantUploadBytes: 71},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := evaluationHostedLifecycleBudgetFixture(t, test.profileID, 0, time.Minute)
			expected, err := expectedEvaluationHostedRetrievalRuntimeResourceLifecycleDemandFromPlan(
				fixture.plan, fixture.request,
			)
			if err != nil || !bytes.Equal(expected.Canonical, fixture.demand.Canonical) {
				t.Fatalf("plan material demand error=%v bytesMatch=%v", err, bytes.Equal(expected.Canonical, fixture.demand.Canonical))
			}
			program, err := expectedEvaluationCapabilityProbeProgram(
				test.profileID, stringMember(fixture.request.Value, "capabilityProfileDigest"),
			)
			if err != nil {
				t.Fatal(err)
			}
			content, err := evaluationCapabilityProbePublicResourceContent(
				stringMember(program.PublicProbeResource, "resourceKind"),
			)
			if err != nil || len([]byte(content)) != test.wantUploadBytes {
				t.Fatalf("public material bytes=%d error=%v, want %d", len([]byte(content)), err, test.wantUploadBytes)
			}
			if err := evaluationHostedLifecycleBudgetValidateWithMock(t, fixture, "found", "valid"); err != nil {
				t.Fatalf("valid plan/material reservation was rejected: %v", err)
			}
		})
	}
}

func TestHostedRetrievalRuntimeResourceBudgetReservationFailsClosed(t *testing.T) {
	base := func(t *testing.T) evaluationHostedLifecycleBudgetTestFixture {
		return evaluationHostedLifecycleBudgetFixture(t, "g4-provider-hosted-retrieval-core", 0, time.Minute)
	}
	for _, test := range []struct {
		name            string
		planMode        string
		reservationMode string
		want            error
	}{
		{name: "plan missing", planMode: "missing", want: ErrNotFound},
		{name: "reservation missing", planMode: "found", reservationMode: "missing", want: ErrNotFound},
		{name: "stale revision", planMode: "found", reservationMode: "stale", want: ErrConflict},
		{name: "settled reservation", planMode: "found", reservationMode: "settled", want: ErrConflict},
	} {
		t.Run(test.name, func(t *testing.T) {
			if err := evaluationHostedLifecycleBudgetValidateWithMock(
				t, base(t), test.planMode, test.reservationMode,
			); !errors.Is(err, test.want) {
				t.Fatalf("validation error=%v, want %v", err, test.want)
			}
		})
	}
	for _, test := range []struct {
		name           string
		reservedOffset time.Duration
		stagedOffset   time.Duration
	}{
		{name: "reserved before plan", reservedOffset: -time.Millisecond, stagedOffset: time.Minute},
		{name: "reserved after stage", reservedOffset: 2 * time.Minute, stagedOffset: time.Minute},
	} {
		t.Run(test.name, func(t *testing.T) {
			fixture := evaluationHostedLifecycleBudgetFixture(
				t, "g4-provider-hosted-retrieval-core", test.reservedOffset, test.stagedOffset,
			)
			if err := evaluationHostedLifecycleBudgetValidateWithMock(t, fixture, "found", ""); !errors.Is(err, ErrConflict) {
				t.Fatalf("plan window error=%v, want conflict", err)
			}
		})
	}
	t.Run("stage at plan expiry", func(t *testing.T) {
		fixture := base(t)
		fixture.stagedAt = fixture.plan.ExpiresAt
		if err := evaluationHostedLifecycleBudgetValidateWithMock(t, fixture, "found", ""); !errors.Is(err, ErrConflict) {
			t.Fatalf("plan expiry error=%v, want conflict", err)
		}
	})
	t.Run("foreign registration intent", func(t *testing.T) {
		fixture := base(t)
		intent, _ := objectMember(fixture.request.Value, "registrationIntent")
		intent["modelId"] = "model.foreign-hosted-owner"
		evaluationHostedArchiveTestRecomputeSelfDigest(t, intent, "intentDigest")
		fixture.request.Value["registrationIntentDigest"] = stringMember(intent, "intentDigest")
		evaluationHostedLifecycleBudgetRedecodeRequest(t, &fixture)
		if err := evaluationHostedLifecycleBudgetValidateWithMock(t, fixture, "found", ""); !errors.Is(err, ErrConflict) {
			t.Fatalf("foreign intent error=%v, want conflict", err)
		}
	})
	t.Run("foreign public descriptor", func(t *testing.T) {
		fixture := base(t)
		fixture.request.Value["publicResourceDescriptorDigest"] = "sha256-" + strings.Repeat("f", 64)
		evaluationHostedLifecycleBudgetRedecodeRequest(t, &fixture)
		if err := evaluationHostedLifecycleBudgetValidateWithMock(t, fixture, "found", ""); !errors.Is(err, ErrConflict) {
			t.Fatalf("foreign descriptor error=%v, want conflict", err)
		}
	})
}

func TestHostedRetrievalRuntimeResourceReadFailsClosedWhenActiveStateCASIsLost(t *testing.T) {
	checkedAt := time.Date(2026, 8, 12, 2, 3, 4, 0, time.UTC)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database), Clock: func() time.Time { return checkedAt },
	})
	if err != nil {
		t.Fatal(err)
	}
	digest := "sha256-" + strings.Repeat("a", 64)
	request := evaluationHostedRetrievalRuntimeResourceReadRequest{
		NamespaceID:                    evaluationServiceTestNamespace,
		RepositoryCommit:               strings.Repeat("b", 40),
		PlanDigest:                     digest,
		RunConfigArtifactBindingDigest: digest,
		RuntimeResourceSetID:           "hosted-resource-set-01",
		AuthorityDigest:                digest,
		ResourceSetCommitmentDigest:    digest,
		ReaderOwnerInstanceID:          "hosted-reader-owner-01",
		ReadLeaseID:                    "hosted-read-lease-01",
		MinimumExpiresAt:               checkedAt.Add(155 * time.Second),
		RequestDigest:                  digest,
		Canonical:                      []byte("{}"),
	}
	currentUpdatedAt := checkedAt.Add(-time.Second)
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT request_bytes,receipt_bytes`).
		WithArgs(request.NamespaceID, request.RequestDigest).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT runtime_resource_set_id,resource_set_commitment_digest`).
		WithArgs(request.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.AuthorityDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"runtime_resource_set_id", "resource_set_commitment_digest", "active_owner_instance_id",
			"claim_generation", "lifecycle", "resource_expires_at", "current_state_updated_at", "read_ledger_open",
		}).AddRow(request.RuntimeResourceSetID, request.ResourceSetCommitmentDigest, "prior-reader-owner", int64(1),
			"active", checkedAt.Add(8*24*time.Hour), currentUpdatedAt, true))
	mock.ExpectExec(`UPDATE agent_evaluation_hosted_retrieval_runtime_resources SET`).
		WillReturnResult(sqlmock.NewResult(0, 0))
	mock.ExpectRollback()
	_, err = owner.ReadActiveResource(t.Context(), EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID,
	}, request)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("lost active-state CAS error=%v, want conflict", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestHostedRetrievalRuntimeResourceReadRejectsASealedReadLedger(t *testing.T) {
	checkedAt := time.Date(2026, 8, 12, 2, 3, 4, 0, time.UTC)
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	owner, err := NewEvaluationHostedRetrievalRuntimeResource(EvaluationHostedRetrievalRuntimeResourceConfig{
		Repository: NewRepository(database), Clock: func() time.Time { return checkedAt },
	})
	if err != nil {
		t.Fatal(err)
	}
	digest := "sha256-" + strings.Repeat("a", 64)
	request := evaluationHostedRetrievalRuntimeResourceReadRequest{
		NamespaceID:                    evaluationServiceTestNamespace,
		RepositoryCommit:               strings.Repeat("b", 40),
		PlanDigest:                     digest,
		RunConfigArtifactBindingDigest: digest,
		RuntimeResourceSetID:           "hosted-resource-set-01",
		AuthorityDigest:                digest,
		ResourceSetCommitmentDigest:    digest,
		ReaderOwnerInstanceID:          "hosted-reader-owner-01",
		ReadLeaseID:                    "hosted-read-lease-after-root",
		MinimumExpiresAt:               checkedAt.Add(155 * time.Second),
		RequestDigest:                  digest,
		Canonical:                      []byte("{}"),
	}
	mock.ExpectBegin()
	mock.ExpectQuery(`SELECT request_bytes,receipt_bytes`).
		WithArgs(request.NamespaceID, request.RequestDigest).
		WillReturnError(sql.ErrNoRows)
	mock.ExpectQuery(`SELECT runtime_resource_set_id,resource_set_commitment_digest`).
		WithArgs(request.NamespaceID, request.PlanDigest, request.RepositoryCommit, request.AuthorityDigest).
		WillReturnRows(sqlmock.NewRows([]string{
			"runtime_resource_set_id", "resource_set_commitment_digest", "active_owner_instance_id",
			"claim_generation", "lifecycle", "resource_expires_at", "current_state_updated_at", "read_ledger_open",
		}).AddRow(request.RuntimeResourceSetID, request.ResourceSetCommitmentDigest, request.ReaderOwnerInstanceID, int64(1),
			"active", checkedAt.Add(8*24*time.Hour), checkedAt.Add(-time.Second), false))
	mock.ExpectRollback()
	_, err = owner.ReadActiveResource(t.Context(), EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID,
	}, request)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("read after ledger root seal error=%v, want conflict", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
