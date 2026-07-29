package verification

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"
	"time"
)

func verificationPlanForCandidate(
	t *testing.T,
	candidate *EvidenceCandidate,
	trust TrustClass,
	retention AuthoritativeRetentionRequest,
) json.RawMessage {
	t.Helper()
	artifactKinds := []ArtifactKind{}
	requiredKinds := []ArtifactKind{}
	var artifactBytes int64
	for _, artifact := range candidate.Artifacts {
		artifactKinds = append(artifactKinds, artifact.Kind)
		requiredKinds = append(requiredKinds, artifact.Kind)
		artifactBytes += artifact.ExpectedSize
	}
	plan := VerificationPlanGrant{
		Status:                   "ready",
		WorkspaceID:              candidate.WorkspaceID,
		TargetRevision:           candidate.WorkspaceRevision,
		TargetPartitionRevisions: candidate.PartitionRevisions,
		ScenarioRegistryDigest:   repeatedDigest('0'),
		PolicyRevision:           candidate.PolicyRevision,
		PolicyDigest:             candidate.PolicyDigest,
		RetentionRequest:         retention,
		PolicyEvaluationInstant:  candidate.PolicyEvaluationInstant,
		ImpactDigest:             candidate.ImpactDigest,
		SemanticSchemaDigest:     repeatedDigest('6'),
		ProviderSetDigest:        repeatedDigest('7'),
		CompilerDigest:           repeatedDigest('8'),
		PlannerDigest:            repeatedDigest('9'),
		AdapterRegistryDigest:    repeatedDigest('a'),
		Cells: []VerificationPlanCell{{
			ID:              candidate.CellID,
			CheckID:         candidate.CheckID,
			CheckKind:       candidate.CheckKind,
			TargetID:        candidate.TargetID,
			TargetPolicy:    candidate.Redaction.TargetPolicy,
			FrameworkTarget: candidate.Run.FrameworkTarget,
			Surface:         candidate.Run.Surface,
			BrowserEngine:   candidate.Run.BrowserEngine,
			Viewport:        candidate.Run.Viewport,
			ColorScheme:     candidate.Run.ColorScheme,
			Motion:          candidate.Run.Motion,
			Locale:          candidate.Run.Locale,
			ControlProfileRef: VerificationPlanControlProfileRef{
				Kind: "preset", PresetID: "control-vector",
				Digest: candidate.Controls.ProfileDigest,
			},
			Adapter: VerificationPlanAdapterIdentity{
				AdapterID:        "adapter-vector",
				DescriptorDigest: repeatedDigest('e'),
				ToolchainDigest:  candidate.Toolchain.ToolchainDigest,
				CapabilityDigest: repeatedDigest('f'),
			},
			Requirement:         "required",
			PolicyRuleIDs:       []string{},
			AppliedExemptionIDs: append([]string{}, candidate.Result.AppliedExemptionIDs...),
			RetryPolicy: VerificationPlanRetryPolicy{
				ID: "retry-vector", MaximumAttempts: 1,
				RetryableOutcomes: []string{}, StabilitySamples: 1,
				FreshFixtureNamespace: true,
			},
			EvidenceRequirements: VerificationPlanEvidenceRequirements{
				AcceptedTrust: []TrustClass{trust}, MaximumAgeMS: 86_400_000,
				RequireAttestation:        trust == TrustRemoteAttested || trust == TrustCIAttested,
				RequireCompatibleIdentity: true,
				RequiredArtifactKinds:     requiredKinds,
			},
			Resources:         []VerificationPlanResource{},
			InputKinds:        []string{},
			ArtifactKinds:     artifactKinds,
			EstimatedCost:     VerificationPlanCost{DurationMS: 1, ArtifactBytes: artifactBytes, ComputeUnits: 1},
			Preflight:         VerificationPlanPreflight{Status: "supported"},
			DependencyCellIDs: []string{},
			InputDigest:       candidate.Inputs.InputDigest,
		}},
		Issues: []VerificationPlanIssue{},
		Explanations: []VerificationPlanExplanation{{
			CellID: candidate.CellID, CheckID: candidate.CheckID,
			TargetID: candidate.TargetID, Status: "selected",
			ImpactPathIDs: []string{}, PolicyRuleIDs: []string{}, Messages: []string{},
		}},
		Budget: VerificationPlanBudgetSummary{
			Cells: 1,
			CellsByCheckKind: VerificationPlanCheckKindCounts{
				Unit: 1,
			},
			TargetExpansions: 1, BrowserExpansions: 0,
			ClosureEvidenceRecords: 1, TotalMS: 1, ArtifactBytes: artifactBytes,
			EstimatedComputeUnits: 1, MaximumParallelism: 1,
			OverBudgetDimensions: []string{},
		},
	}
	if candidate.Run.BrowserEngine != "" {
		plan.Budget.BrowserExpansions = 1
	}
	if candidate.Scenario != nil {
		plan.Cells[0].ScenarioID = candidate.Scenario.ID
	}
	if len(candidate.Inputs.FixtureSetDigests) == 1 {
		plan.Cells[0].FixtureSetRef = &VerificationPlanDocumentDigestRef{
			DocumentID: "fixture-vector",
			Digest:     candidate.Inputs.FixtureSetDigests[0],
		}
	}
	if candidate.Inputs.BaselineSetDigest != "" {
		plan.Cells[0].BaselineSetRef = &VerificationPlanDocumentDigestRef{
			DocumentID: "baseline-vector",
			Digest:     candidate.Inputs.BaselineSetDigest,
		}
	}
	plan.PlanDigest = mustDigestWithoutField(t, plan, "planDigest")
	candidate.PlanDigest = plan.PlanDigest
	for index := range candidate.SourceTraces {
		if candidate.SourceTraces[index].SourceRef.Kind == "verification-plan-cell" {
			candidate.SourceTraces[index].SourceRef.PlanDigest = plan.PlanDigest
		}
	}
	candidate.SourceTraceDigest = mustCanonicalDigest(t, candidate.SourceTraces)
	for index := range candidate.Artifacts {
		if candidate.Artifacts[index].SourceTraceDigest != "" {
			candidate.Artifacts[index].SourceTraceDigest =
				mustCanonicalDigest(t, candidate.SourceTraces[0])
		}
	}
	candidate.CandidateDigest = mustDigestWithoutField(t, *candidate, "candidateDigest")
	encoded, err := canonicalBytes(plan)
	if err != nil {
		t.Fatal(err)
	}
	var wire map[string]any
	if err := json.Unmarshal(encoded, &wire); err != nil {
		t.Fatal(err)
	}
	wire["wireVersion"] = 1
	encoded, err = canonicalBytes(wire)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func attemptGrantTargetPolicy(
	candidate EvidenceCandidate,
	retention AuthoritativeRetentionRequest,
) TargetPolicyAuthorityResolution {
	return TargetPolicyAuthorityResolution{
		Authority:                     "verification-policy",
		PolicyID:                      "policy-vector",
		PolicyRevision:                candidate.PolicyRevision,
		PolicyDigest:                  candidate.PolicyDigest,
		TargetPolicy:                  candidate.Redaction.TargetPolicy,
		RetentionRequest:              retention,
		MaximumClosureEvidenceRecords: 1000,
		Comparison: TargetPolicyComparison{
			Authority:    "verification-policy",
			PolicyID:     "policy-vector",
			PolicyDigest: candidate.PolicyDigest,
		},
	}
}

func TestVerificationPlanGrantBindsCompleteCandidate(t *testing.T) {
	candidate := verificationVectorCandidate(t, nil, "attempt-grant")
	retention := AuthoritativeRetentionRequest{
		Successful: RetentionSession,
		Failed:     RetentionChange,
	}
	planWire := verificationPlanForCandidate(
		t,
		&candidate,
		TrustLocalUnattested,
		retention,
	)
	plan, canonicalPlan, err := decodeVerificationPlanWire(planWire)
	if err != nil {
		t.Fatal(err)
	}
	if string(canonicalPlan) == string(planWire) {
		t.Fatal("canonical persisted Plan unexpectedly retained wireVersion")
	}
	if err := validateCandidateAgainstVerificationPlan(
		candidate,
		TrustLocalUnattested,
		plan,
		attemptGrantTargetPolicy(candidate, retention),
	); err != nil {
		t.Fatal(err)
	}
	descriptorDrift := plan
	descriptorDrift.Cells = append([]VerificationPlanCell{}, plan.Cells...)
	descriptorDrift.Cells[0].Adapter.DescriptorDigest = ""
	if err := validateVerificationPlanGrant(descriptorDrift); err == nil {
		t.Fatal("Plan without an adapter descriptor digest was accepted")
	}
}

func TestVerificationPlanGrantRejectsCandidateSelfReportDrift(t *testing.T) {
	base := verificationVectorCandidate(t, nil, "attempt-drift")
	retention := AuthoritativeRetentionRequest{
		Successful: RetentionSession,
		Failed:     RetentionChange,
	}
	planWire := verificationPlanForCandidate(
		t,
		&base,
		TrustLocalUnattested,
		retention,
	)
	plan, _, err := decodeVerificationPlanWire(planWire)
	if err != nil {
		t.Fatal(err)
	}
	policy := attemptGrantTargetPolicy(base, retention)
	tests := map[string]func(*EvidenceCandidate){
		"check": func(candidate *EvidenceCandidate) {
			candidate.CheckID = "check-attacker"
		},
		"target": func(candidate *EvidenceCandidate) {
			candidate.TargetID = "target-attacker"
		},
		"matrix": func(candidate *EvidenceCandidate) {
			candidate.Run.Surface = "ci"
		},
		"toolchain": func(candidate *EvidenceCandidate) {
			candidate.Toolchain.ToolchainDigest = repeatedDigest('c')
		},
		"control": func(candidate *EvidenceCandidate) {
			candidate.Controls.ProfileDigest = repeatedDigest('d')
		},
	}
	for name, mutate := range tests {
		t.Run(name, func(t *testing.T) {
			candidate := base
			mutate(&candidate)
			candidate.CandidateDigest = mustDigestWithoutField(t, candidate, "candidateDigest")
			if err := validateCandidateAgainstVerificationPlan(
				candidate,
				TrustLocalUnattested,
				plan,
				policy,
			); err == nil || diagnosticCode(err, "") != "VER-5001" ||
				!errors.Is(err, ErrInvalid) {
				t.Fatalf("self-reported %s drift did not fail closed: %v", name, err)
			}
		})
	}

	var raw map[string]any
	if err := json.Unmarshal(planWire, &raw); err != nil {
		t.Fatal(err)
	}
	raw["unknown"] = true
	unknown, err := json.Marshal(raw)
	if err != nil {
		t.Fatal(err)
	}
	if _, _, err := decodeVerificationPlanWire(unknown); err == nil ||
		diagnosticCode(err, "") != "VER-5001" {
		t.Fatalf("unknown Plan field did not fail closed: %v", err)
	}
}

func TestVerificationPlanGrantAcceptsCurrentInputKinds(t *testing.T) {
	kinds := []string{
		"baseline-set",
		"diagnostic-snapshot",
		"executable-snapshot",
		"scenario-program",
		"security-observation-set",
		"test-report",
		"verification-profile",
	}
	if err := validatePlanInputKinds(kinds); err != nil {
		t.Fatalf("validate current input kinds: %v", err)
	}

	for _, invalid := range [][]string{
		nil,
		{"verification-profile", "security-observation-set"},
		{"vendor-private-payload"},
	} {
		if err := validatePlanInputKinds(invalid); err == nil {
			t.Fatalf("validatePlanInputKinds(%v) unexpectedly succeeded", invalid)
		}
	}
}

func TestAuthoritativeRetentionMapsOutcomeWithoutBindingGrantToOutcome(t *testing.T) {
	request := AuthoritativeRetentionRequest{
		Successful:             RetentionRelease,
		Failed:                 RetentionChange,
		ProtectReleaseEvidence: true,
	}
	passed, ok := authoritativeRetentionForOutcome(request, "passed")
	if !ok || passed != RetentionRelease {
		t.Fatalf("passed retention = %q, %v", passed, ok)
	}
	for _, outcome := range []string{
		"failed",
		"blocked",
		"cancelled",
		"infrastructure-error",
	} {
		failed, ok := authoritativeRetentionForOutcome(request, outcome)
		if !ok || failed != RetentionChange {
			t.Fatalf("%s retention = %q, %v", outcome, failed, ok)
		}
	}
}

func TestVerificationPlanStructuralBudgets(t *testing.T) {
	t.Run("near-node-limit", func(t *testing.T) {
		const values = maximumVerificationPlanNodes - 2
		body := `{"x":[` + strings.Repeat("0,", values-1) + `0]}`
		if err := validateVerificationPlanJSONObject([]byte(body)); err != nil {
			t.Fatal(err)
		}
	})
	t.Run("node-overflow", func(t *testing.T) {
		const values = maximumVerificationPlanNodes - 1
		body := `{"x":[` + strings.Repeat("0,", values-1) + `0]}`
		if err := validateVerificationPlanJSONObject([]byte(body)); err == nil {
			t.Fatal("Plan above the node limit was accepted")
		}
	})
	t.Run("depth-overflow", func(t *testing.T) {
		body := `{"x":` + strings.Repeat("[", maximumVerificationPlanDepth) +
			`0` + strings.Repeat("]", maximumVerificationPlanDepth) + `}`
		if err := validateVerificationPlanJSONObject([]byte(body)); err == nil {
			t.Fatal("Plan above the depth limit was accepted")
		}
	})
	t.Run("string-limit", func(t *testing.T) {
		accepted := `{"x":"` +
			strings.Repeat("a", maximumVerificationPlanString) +
			`"}`
		if err := validateVerificationPlanJSONObject([]byte(accepted)); err != nil {
			t.Fatalf("Plan string at the limit was rejected: %v", err)
		}
		rejected := `{"x":"` +
			strings.Repeat("a", maximumVerificationPlanString+1) +
			`"}`
		if err := validateVerificationPlanJSONObject([]byte(rejected)); err == nil {
			t.Fatal("Plan string above the limit was accepted")
		}
	})
	t.Run("byte-overflow", func(t *testing.T) {
		body := make([]byte, maximumVerificationPlanWireBytes+1)
		for index := range body {
			body[index] = ' '
		}
		if err := validateVerificationPlanJSONObject(body); err == nil {
			t.Fatal("Plan above the byte limit was accepted")
		}
	})
	t.Run("cell-overflow", func(t *testing.T) {
		candidate := verificationVectorCandidate(t, nil, "cell-budget")
		wire := verificationPlanForCandidate(
			t,
			&candidate,
			TrustLocalUnattested,
			AuthoritativeRetentionRequest{
				Successful: RetentionSession,
				Failed:     RetentionChange,
			},
		)
		plan, _, err := decodeVerificationPlanWire(wire)
		if err != nil {
			t.Fatal(err)
		}
		cell := plan.Cells[0]
		plan.Cells = make([]VerificationPlanCell, maximumClosureEvidenceRecords+1)
		for index := range plan.Cells {
			plan.Cells[index] = cell
		}
		if err := validateVerificationPlanGrant(plan); err == nil {
			t.Fatal("Plan above the cell limit was accepted")
		}
	})
}

func TestPostgreSQLAttemptGrantAuthorityClaimsExactlyOnceAndDoesNotBlockProjectDeletion(
	t *testing.T,
) {
	database, _ := openVerificationPostgreSQL(t)
	seedVerificationPostgreSQLWorkspace(t, database)

	candidate := verificationPostgreSQLCandidate(t, nil, "durable-grant")
	candidate.RequestedRetention = RetentionChange
	retention := AuthoritativeRetentionRequest{
		Successful:             RetentionChange,
		Failed:                 RetentionRelease,
		ProtectReleaseEvidence: true,
	}
	planWire := verificationPlanForCandidate(
		t,
		&candidate,
		TrustLocalUnattested,
		retention,
	)
	issueTime := mustVectorTime(t, "2026-07-27T23:59:59.000Z")
	expiresAt := mustVectorTime(t, "2026-07-28T00:10:30.000Z")
	authority := NewPostgreSQLAttemptGrantAuthority(database)
	currentTime := issueTime
	authority.now = func() time.Time { return currentTime }
	grant, err := authority.IssueTrustedAttemptGrant(
		context.Background(),
		TrustedAttemptGrantIssue{
			WorkspaceID:  candidate.WorkspaceID,
			ProjectID:    candidate.ProjectID,
			Plan:         planWire,
			CellID:       candidate.CellID,
			AttemptID:    candidate.AttemptID,
			Run:          candidate.Run,
			ProducerID:   candidate.Provenance.ProducerID,
			TrustCeiling: TrustLocalUnattested,
			IssuedBy:     "planner-integration",
			ExpiresAt:    expiresAt,
		},
	)
	if err != nil {
		t.Fatal(err)
	}
	if grant.IssuedAt != issueTime ||
		grant.ExpiresAt != expiresAt ||
		!digestPattern.MatchString(grant.GrantDigest) {
		t.Fatalf("unexpected durable grant: %+v", grant)
	}

	currentTime = mustVectorTime(t, vectorNowText)
	resolution, err := authority.ResolvePromotionAttempt(
		context.Background(),
		candidate.WorkspaceID,
		candidate,
		TrustLocalUnattested,
	)
	if err != nil {
		t.Fatal(err)
	}
	if resolution.GrantID != grant.ID ||
		resolution.GrantDigest != grant.GrantDigest ||
		resolution.Retention != RetentionChange ||
		resolution.ProtectReleaseEvidence {
		t.Fatalf("unexpected grant resolution: %+v", resolution)
	}

	candidateBytes, err := canonicalBytes(candidate)
	if err != nil {
		t.Fatal(err)
	}
	deadline := mustVectorTime(t, candidate.Promotion.Deadline)
	promotion := Promotion{
		ID:                            "promotion-durable-grant",
		WorkspaceID:                   candidate.WorkspaceID,
		ProjectID:                     candidate.ProjectID,
		Candidate:                     candidate,
		CandidateBytes:                candidateBytes,
		CandidateDigest:               candidate.CandidateDigest,
		VerificationPlan:              grant.Plan,
		VerificationPlanBytes:         append([]byte(nil), grant.PlanBytes...),
		AttemptGrantID:                grant.ID,
		AttemptGrantDigest:            grant.GrantDigest,
		ProtectReleaseEvidence:        resolution.ProtectReleaseEvidence,
		ActorID:                       "owner-vector",
		State:                         "staging",
		Trust:                         TrustLocalUnattested,
		Retention:                     resolution.Retention,
		EvidenceID:                    "evidence-durable-grant",
		EvidenceCreatedAt:             currentTime,
		CapabilityHash:                secretHash("durable-grant-capability"),
		Deadline:                      deadline,
		MaximumClosureEvidenceRecords: resolution.MaximumClosureEvidenceRecords,
		Version:                       1,
	}
	repository := NewRepository(database)
	input := createPromotionInput{
		Promotion:          promotion,
		IdempotencyKeyHash: secretHash(candidate.Promotion.IdempotencyKey),
	}
	if _, replay, err := repository.CreatePromotion(
		context.Background(),
		input,
	); err != nil || replay {
		t.Fatalf("claim attempt grant: replay=%v err=%v", replay, err)
	}
	if _, replay, err := repository.CreatePromotion(
		context.Background(),
		input,
	); err != nil || !replay {
		t.Fatalf("exact claim replay: replay=%v err=%v", replay, err)
	}
	differentIdempotency := input
	differentIdempotency.IdempotencyKeyHash = secretHash(
		"idempotency-durable-grant-conflict",
	)
	if _, _, err := repository.CreatePromotion(
		context.Background(),
		differentIdempotency,
	); !errors.Is(err, ErrConflict) {
		t.Fatalf("same Candidate with a different idempotency key = %v, want conflict", err)
	}

	differentCandidate := candidate
	differentCandidate.CandidateID = "candidate-different-claim"
	differentCandidate.Promotion.IdempotencyKey = "idempotency-different-claim"
	differentCandidate.CandidateDigest = mustDigestWithoutField(
		t,
		differentCandidate,
		"candidateDigest",
	)
	if _, err := authority.ResolvePromotionAttempt(
		context.Background(),
		differentCandidate.WorkspaceID,
		differentCandidate,
		TrustLocalUnattested,
	); err != nil {
		t.Fatalf("grant unexpectedly bound an outcome-independent candidate id: %v", err)
	}
	differentBytes, err := canonicalBytes(differentCandidate)
	if err != nil {
		t.Fatal(err)
	}
	differentPromotion := promotion
	differentPromotion.ID = "promotion-different-claim"
	differentPromotion.Candidate = differentCandidate
	differentPromotion.CandidateBytes = differentBytes
	differentPromotion.CandidateDigest = differentCandidate.CandidateDigest
	differentPromotion.EvidenceID = "evidence-different-claim"
	if _, _, err := repository.CreatePromotion(
		context.Background(),
		createPromotionInput{
			Promotion: differentPromotion,
			IdempotencyKeyHash: secretHash(
				differentCandidate.Promotion.IdempotencyKey,
			),
		},
	); err == nil || !errors.Is(err, ErrConflict) {
		t.Fatalf("attempt grant was claimed twice: %v", err)
	}
	var promotions, claims int
	if err := database.QueryRow(
		`SELECT COUNT(*) FROM verification_promotions WHERE attempt_grant_id = $1`,
		grant.ID,
	).Scan(&promotions); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRow(
		`SELECT COUNT(*) FROM verification_attempt_grant_claims WHERE grant_id = $1`,
		grant.ID,
	).Scan(&claims); err != nil {
		t.Fatal(err)
	}
	if promotions != 1 || claims != 1 {
		t.Fatalf("durable claim rows = promotions:%d claims:%d", promotions, claims)
	}

	if _, err := database.Exec(
		`DELETE FROM projects WHERE id = $1`,
		candidate.ProjectID,
	); err != nil {
		t.Fatalf("attempt grant blocked project deletion: %v", err)
	}
	var retainedGrant int
	if err := database.QueryRow(
		`SELECT COUNT(*) FROM verification_attempt_grants WHERE id = $1`,
		grant.ID,
	).Scan(&retainedGrant); err != nil {
		t.Fatal(err)
	}
	if retainedGrant != 1 {
		t.Fatalf("immutable grant audit row count = %d, want 1", retainedGrant)
	}
}
