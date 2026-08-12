package agent

import (
	"errors"
	"strings"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationCapabilityEffectProviderCitationResponseProjection(
	t *testing.T,
	operation string,
	citation any,
) map[string]any {
	t.Helper()
	digest := "sha256-" + strings.Repeat("a", 64)
	value := map[string]any{
		"format":                       "prodivix.agent-native-provider-capability-runtime-response",
		"version":                      int64(1),
		"requestDigest":                digest,
		"requestProjectionDigest":      digest,
		"protocolFamily":               "openai-responses",
		"operation":                    operation,
		"transportOutcome":             "received",
		"httpStatus":                   int64(200),
		"responseBodyDigest":           nil,
		"sealedResponseJsonDigest":     nil,
		"responseDigest":               digest,
		"normalizedEventSetDigest":     digest,
		"providerStateReferenceKind":   nil,
		"providerStateReferenceDigest": nil,
		"providerStatus":               "completed",
		"terminalEventType":            "response.completed",
		"usageVectorDigest":            nil,
		"cachedTokenCount":             int64(0),
		"outputTextDigest":             nil,
		"outputMarkerObserved":         true,
		"retrievalCitationResourceId":  citation,
		"denialKind":                   nil,
		"observedAt":                   evaluationExportInstant(time.Date(2026, 8, 12, 1, 2, 3, 0, time.UTC)),
	}
	projectionDigest, err := canonicaljson.Digest(value)
	if err != nil {
		t.Fatal(err)
	}
	value["projectionDigest"] = projectionDigest
	canonical, err := canonicaljson.Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	decoded, err := decodeCanonicalEvaluationObject(canonical, maximumEvaluationCapabilityEffectProviderJournalExecutionBytes)
	if err != nil {
		t.Fatal(err)
	}
	return decoded
}

func TestCapabilityEffectProviderJournalCitationResponseProjectionIsExactAndPurposeBound(t *testing.T) {
	tests := []struct {
		name      string
		operation string
		citation  any
		mutate    func(map[string]any)
		wantID    string
		wantError bool
	}{
		{name: "explicit null is accepted", operation: "continuation-resume", citation: nil},
		{name: "hosted resource identity is accepted", operation: "hosted-retrieval-query", citation: "file.provider-01", wantID: "file.provider-01"},
		{name: "non-hosted citation is rejected", operation: "continuation-resume", citation: "file.provider-01", wantError: true},
		{name: "credential-shaped citation is rejected", operation: "hosted-retrieval-query", citation: "sk-secretvalue1234", wantError: true},
		{name: "citation key is mandatory", operation: "hosted-retrieval-query", citation: nil, mutate: func(value map[string]any) {
			delete(value, "retrievalCitationResourceId")
		}, wantError: true},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			value := evaluationCapabilityEffectProviderCitationResponseProjection(t, test.operation, test.citation)
			if test.mutate != nil {
				test.mutate(value)
			}
			if test.mutate == nil && !evaluationCapabilityEffectProviderJournalSelfDigest(value, "projectionDigest") {
				t.Fatalf("citation projection helper produced an invalid self digest: %#v", value)
			}
			_, _, _, _, _, citationID, _, err := decodeEvaluationCapabilityEffectProviderResponseProjection(value)
			if test.wantError {
				if err == nil {
					t.Fatalf("invalid citation projection was accepted: %#v", value)
				}
				return
			}
			if err != nil || citationID != test.wantID {
				t.Fatalf("citation projection drifted: id=%q want=%q err=%v", citationID, test.wantID, err)
			}
		})
	}
}

func TestCapabilityEffectProviderJournalCitationRequiresItsStoredHostedAuthority(t *testing.T) {
	digest := "sha256-" + strings.Repeat("b", 64)
	stage := EvaluationCapabilityEffectProviderJournalStageRecord{
		evaluationCapabilityEffectProviderJournalIdentity: evaluationCapabilityEffectProviderJournalIdentity{
			NamespaceID: "namespace.hosted-citation", PlanDigest: digest,
			RepositoryCommit: strings.Repeat("c", 40),
		},
		BindingKind: "hosted-retrieval-query", ProviderResourceAuthorityDigest: digest,
	}
	authorityBytes, err := canonicaljson.Bytes(map[string]any{
		"authorityDigest":      digest,
		"providerResourceId":   "file.primary-01",
		"auxiliaryResourceIds": []any{"file.auxiliary-01"},
	})
	if err != nil {
		t.Fatal(err)
	}
	for _, test := range []struct {
		name      string
		citation  string
		wantError bool
	}{
		{name: "primary resource", citation: "file.primary-01"},
		{name: "auxiliary resource", citation: "file.auxiliary-01"},
		{name: "foreign resource", citation: "file.foreign-01", wantError: true},
	} {
		t.Run(test.name, func(t *testing.T) {
			database, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer database.Close()
			mock.ExpectBegin()
			tx, err := database.BeginTx(t.Context(), nil)
			if err != nil {
				t.Fatal(err)
			}
			mock.ExpectQuery(`SELECT authority_bytes`).
				WithArgs(stage.NamespaceID, stage.PlanDigest, stage.RepositoryCommit, stage.ProviderResourceAuthorityDigest).
				WillReturnRows(sqlmock.NewRows([]string{"authority_bytes"}).AddRow(authorityBytes))
			actualErr := requireEvaluationCapabilityEffectProviderJournalCitationTx(
				t.Context(), tx, stage,
				EvaluationCapabilityEffectProviderJournalExecutionRecord{RetrievalCitationResourceID: test.citation},
			)
			if test.wantError {
				if !errors.Is(actualErr, ErrConflict) {
					t.Fatalf("foreign citation error=%v, want conflict", actualErr)
				}
			} else if actualErr != nil {
				t.Fatalf("stored citation authority was rejected: %v", actualErr)
			}
			mock.ExpectRollback()
			if err := tx.Rollback(); err != nil {
				t.Fatal(err)
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestCapabilityEffectProviderJournalCitationRejectsNonHostedExecution(t *testing.T) {
	err := requireEvaluationCapabilityEffectProviderJournalCitationTx(
		t.Context(), nil,
		EvaluationCapabilityEffectProviderJournalStageRecord{BindingKind: "provider-job"},
		EvaluationCapabilityEffectProviderJournalExecutionRecord{RetrievalCitationResourceID: "file.primary-01"},
	)
	if !errors.Is(err, ErrConflict) {
		t.Fatalf("non-hosted citation error=%v, want conflict", err)
	}
}

func TestCapabilityEffectProviderJournalHostedFactRebuildsCitationContext(t *testing.T) {
	profileID := "g4-provider-hosted-retrieval-core"
	profileDigest, err := canonicaljson.Digest(map[string]any{"profileId": profileID})
	if err != nil {
		t.Fatal(err)
	}
	program, err := expectedEvaluationCapabilityProbeProgram(profileID, profileDigest)
	if err != nil {
		t.Fatal(err)
	}
	digest := "sha256-" + strings.Repeat("d", 64)
	requestDigest := "sha256-" + strings.Repeat("e", 64)
	responseDigest := "sha256-" + strings.Repeat("f", 64)
	observedAt := "2026-08-12T02:03:04.000Z"
	startedAt := "2026-08-12T02:03:03.000Z"
	providerAuthority := map[string]any{
		"probeProgramDigest":             program.ProgramDigest,
		"publicResourceDescriptorDigest": stringMember(program.PublicProbeResource, "descriptorDigest"),
		"networkPolicyAuthorityDigest":   digest,
		"authorityDigest":                digest,
		"providerResourceId":             "file.primary-01",
		"auxiliaryResourceIds":           []any{"file.auxiliary-01"},
	}
	stage := EvaluationCapabilityEffectProviderJournalStageRecord{
		BindingKind: "hosted-retrieval-query",
		PreEffectIntent: map[string]any{
			"toolId": "provider.retrieval.search",
			"runtimeFactSourceAuthority": map[string]any{
				"capabilityProfileId": profileID, "capabilityProfileDigest": profileDigest, "authorityDigest": digest,
			},
		},
		StageRequest: map[string]any{
			"requestProjection":         map[string]any{"probeProgramDigest": program.ProgramDigest, "requestDigest": requestDigest},
			"providerResourceAuthority": providerAuthority,
		},
	}
	createFact := func(citationID string, networkPolicyDigest string) map[string]any {
		sourceRefs := []any{}
		sourceDigests := []any{}
		if citationID != "" {
			sourceIdentityDigest, digestErr := canonicaljson.Digest(map[string]any{
				"requestDigest": requestDigest, "responseDigest": responseDigest, "citationResourceId": citationID,
			})
			if digestErr != nil {
				t.Fatal(digestErr)
			}
			sourceResultID := "provider-citation." + sourceIdentityDigest[len("sha256-"):]
			sourceBase := map[string]any{
				"sourceResultId": sourceResultID, "retrievedAt": observedAt, "providerCitationRef": citationID,
				"authority": "external-untrusted", "instructionBoundary": "data-only", "availability": "unavailable",
			}
			sourceDigest, digestErr := canonicaljson.Digest(sourceBase)
			if digestErr != nil {
				t.Fatal(digestErr)
			}
			sourceRefs = append(sourceRefs, sourceResultID)
			sourceDigests = append(sourceDigests, sourceDigest)
		}
		toolDigest, digestErr := canonicaljson.Digest(map[string]any{
			"toolId": "provider.retrieval.search", "runtimeFactSourceAuthorityDigest": digest,
		})
		if digestErr != nil {
			t.Fatal(digestErr)
		}
		receiptBase := map[string]any{
			"queryId": "retrieval-query." + requestDigest[len("sha256-"):], "toolDescriptorDigest": toolDigest,
			"queryDigest": stringMember(program.PublicProbeResource, "queryDigest"), "purpose": "public-research",
			"networkPolicyDigest": networkPolicyDigest, "sourceResultRefs": sourceRefs, "sourceResultDigests": sourceDigests,
			"indexDigest": stringMember(program.PublicProbeResource, "indexDigest"), "usageRef": "usage." + digest[len("sha256-"):],
			"startedAt": startedAt, "completedAt": observedAt,
		}
		if citationID == "" {
			receiptBase["retrievalConfigurationDigest"] = digest
		}
		receiptDigest, digestErr := canonicaljson.Digest(receiptBase)
		if digestErr != nil {
			t.Fatal(digestErr)
		}
		receipt := cloneEvaluationObject(receiptBase)
		receipt["receiptDigest"] = receiptDigest
		return map[string]any{"factKind": "retrieval-query-receipt", "factDigest": receiptDigest, "value": receipt}
	}
	executionFor := func(citationID string) EvaluationCapabilityEffectProviderJournalExecutionRecord {
		return EvaluationCapabilityEffectProviderJournalExecutionRecord{
			RetrievalCitationResourceID: citationID,
			ExecutionReceipt: map[string]any{
				"responseProjection": map[string]any{
					"requestDigest": requestDigest, "responseDigest": responseDigest, "usageVectorDigest": digest,
					"outputMarkerObserved": true, "observedAt": observedAt,
				},
				"dispatchIntent": map[string]any{"createdAt": startedAt},
			},
		}
	}
	for _, citationID := range []string{"file.auxiliary-01", ""} {
		fact := createFact(citationID, digest)
		if _, err := evaluationCapabilityEffectProviderJournalFactDigest(fact); err != nil {
			t.Fatalf("canonical hosted fact was rejected before context matching: %v", err)
		}
		if !evaluationCapabilityEffectProviderJournalHostedFactMatches(stage, executionFor(citationID), fact) {
			t.Fatalf("canonical hosted citation context was rejected: citation=%q", citationID)
		}
	}
	foreignNetwork := "sha256-" + strings.Repeat("1", 64)
	if evaluationCapabilityEffectProviderJournalHostedFactMatches(
		stage, executionFor("file.auxiliary-01"), createFact("file.auxiliary-01", foreignNetwork),
	) {
		t.Fatal("fully recomputed hosted fact with a foreign network policy was accepted")
	}
	if evaluationCapabilityEffectProviderJournalHostedFactMatches(
		stage, executionFor("file.foreign-01"), createFact("file.foreign-01", digest),
	) {
		t.Fatal("fully recomputed hosted fact with a foreign citation resource was accepted")
	}
}
