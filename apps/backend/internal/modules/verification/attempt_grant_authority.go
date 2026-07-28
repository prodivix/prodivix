package verification

import (
	"context"
	"database/sql"
	"encoding/json"
	"time"
)

// TrustedAttemptGrantIssue is accepted only from an in-process planner or
// scheduler owner. It is deliberately not an HTTP request model.
type TrustedAttemptGrantIssue struct {
	WorkspaceID  string
	ProjectID    string
	Plan         json.RawMessage
	CellID       string
	AttemptID    string
	Run          RunIdentity
	ProducerID   string
	TrustCeiling TrustClass
	IssuedBy     string
	ExpiresAt    time.Time
}

type AttemptGrantRecord struct {
	ID                            string
	WorkspaceID                   string
	ProjectID                     string
	WorkspaceRevision             int64
	PartitionRevisionsDigest      string
	PolicyRevision                int64
	PolicyDigest                  string
	PolicyEvaluationInstant       time.Time
	ImpactDigest                  string
	PlanDigest                    string
	Plan                          VerificationPlanGrant
	PlanBytes                     []byte
	CellID                        string
	CheckID                       string
	CheckKind                     string
	TargetID                      string
	AttemptID                     string
	RunID                         string
	ProviderID                    string
	JobID                         string
	SessionID                     string
	ProducerID                    string
	TrustCeiling                  TrustClass
	RetentionRequest              AuthoritativeRetentionRequest
	MaximumClosureEvidenceRecords int
	GrantDigest                   string
	IssuedBy                      string
	IssuedAt                      time.Time
	ExpiresAt                     time.Time
}

// AttemptGrantAuthorityResolution is loaded from an immutable, preissued
// server grant. The promotion upload capability is only a continuation token
// after Repository.CreatePromotion atomically claims this grant.
type AttemptGrantAuthorityResolution struct {
	Authority                     string
	GrantID                       string
	GrantDigest                   string
	PlanDigest                    string
	CanonicalPlanBytes            []byte
	Retention                     RetentionClass
	ProtectReleaseEvidence        bool
	MaximumClosureEvidenceRecords int
	TargetPolicy                  TargetPolicyAuthorityResolution
}

type AttemptGrantAuthority interface {
	ResolvePromotionAttempt(
		ctx context.Context,
		workspaceID string,
		candidate EvidenceCandidate,
		trust TrustClass,
	) (AttemptGrantAuthorityResolution, error)
	RevalidatePromotionAttempt(
		ctx context.Context,
		promotion Promotion,
	) (AttemptGrantAuthorityResolution, error)
}

// AttemptGrantIssuer is intentionally kept out of Service composition. Only a
// trusted in-process planner/scheduler receives this capability.
type AttemptGrantIssuer interface {
	IssueTrustedAttemptGrant(
		ctx context.Context,
		input TrustedAttemptGrantIssue,
	) (AttemptGrantRecord, error)
}

type PostgreSQLAttemptGrantAuthority struct {
	db             *sql.DB
	targetPolicies TargetPolicyAuthority
	now            func() time.Time
}

func NewPostgreSQLAttemptGrantAuthority(
	db *sql.DB,
) *PostgreSQLAttemptGrantAuthority {
	return &PostgreSQLAttemptGrantAuthority{
		db:             db,
		targetPolicies: NewPostgreSQLTargetPolicyAuthority(db),
		now:            func() time.Time { return time.Now().UTC() },
	}
}

func newPostgreSQLAttemptGrantAuthority(
	db *sql.DB,
	targetPolicies TargetPolicyAuthority,
) *PostgreSQLAttemptGrantAuthority {
	return &PostgreSQLAttemptGrantAuthority{
		db: db, targetPolicies: targetPolicies,
		now: func() time.Time { return time.Now().UTC() },
	}
}

func attemptGrantFailure(message string) error {
	return coded("VER-5001", message, ErrInvalid)
}

func validateCandidateAgainstVerificationPlan(
	candidate EvidenceCandidate,
	trust TrustClass,
	plan VerificationPlanGrant,
	targetPolicy TargetPolicyAuthorityResolution,
) error {
	if candidate.WorkspaceID != plan.WorkspaceID ||
		candidate.WorkspaceRevision != plan.TargetRevision ||
		!samePartitionRevisions(candidate.PartitionRevisions, plan.TargetPartitionRevisions) ||
		candidate.PolicyRevision != plan.PolicyRevision ||
		candidate.PolicyDigest != plan.PolicyDigest ||
		candidate.PolicyEvaluationInstant != plan.PolicyEvaluationInstant ||
		candidate.ImpactDigest != plan.ImpactDigest ||
		candidate.PlanDigest != plan.PlanDigest ||
		plan.PolicyRevision != targetPolicy.PolicyRevision ||
		plan.PolicyDigest != targetPolicy.PolicyDigest ||
		plan.RetentionRequest != targetPolicy.RetentionRequest ||
		plan.Budget.ClosureEvidenceRecords >
			int64(targetPolicy.MaximumClosureEvidenceRecords) {
		return attemptGrantFailure(
			"Candidate does not match the exact revision-bound VerificationPlan.",
		)
	}
	var selected *VerificationPlanCell
	for index := range plan.Cells {
		if plan.Cells[index].ID != candidate.CellID {
			continue
		}
		if selected != nil {
			return attemptGrantFailure("Candidate Plan cell is not unique.")
		}
		selected = &plan.Cells[index]
	}
	if selected == nil || selected.Preflight.Status != "supported" {
		return attemptGrantFailure(
			"Candidate does not identify one supported VerificationPlan cell.",
		)
	}
	cell := *selected
	if candidate.CheckID != cell.CheckID ||
		candidate.CheckKind != cell.CheckKind ||
		candidate.TargetID != cell.TargetID ||
		candidate.Redaction.TargetPolicy != cell.TargetPolicy ||
		cell.TargetPolicy != targetPolicy.TargetPolicy ||
		candidate.Run.Surface != cell.Surface ||
		candidate.Run.FrameworkTarget != cell.FrameworkTarget ||
		candidate.Run.BrowserEngine != cell.BrowserEngine ||
		candidate.Run.Viewport != cell.Viewport ||
		candidate.Run.ColorScheme != cell.ColorScheme ||
		candidate.Run.Motion != cell.Motion ||
		candidate.Run.Locale != cell.Locale {
		return attemptGrantFailure(
			"Candidate check, target, or matrix coordinate drifted from the Plan cell.",
		)
	}
	if err := validateCandidateScenarioAgainstPlan(candidate, cell); err != nil {
		return err
	}
	if candidate.Toolchain.ToolchainDigest != cell.Adapter.ToolchainDigest ||
		candidate.Inputs.InputDigest != cell.InputDigest ||
		!sameStrings(candidate.Result.AppliedExemptionIDs, cell.AppliedExemptionIDs) {
		return attemptGrantFailure(
			"Candidate adapter, input, or exemption identity drifted from the Plan cell.",
		)
	}
	if cell.ControlProfileRef.Digest == "" ||
		candidate.Controls.ProfileDigest != cell.ControlProfileRef.Digest {
		return attemptGrantFailure(
			"Candidate control profile is not digest-bound to the Plan cell.",
		)
	}
	if !candidateDigestRefMatches(
		candidate.Inputs.FixtureSetDigests,
		cell.FixtureSetRef,
	) {
		return attemptGrantFailure(
			"Candidate fixture set identity drifted from the Plan cell.",
		)
	}
	if !candidateBaselineRefMatches(
		candidate.Inputs.BaselineSetDigest,
		cell.BaselineSetRef,
	) {
		return attemptGrantFailure(
			"Candidate baseline identity drifted from the Plan cell.",
		)
	}
	if !trustAllowedByPlanCell(trust, cell.EvidenceRequirements) {
		return attemptGrantFailure(
			"Candidate trust is not authorized by the Plan cell.",
		)
	}
	if err := validateCandidateArtifactsAgainstPlan(candidate, cell); err != nil {
		return err
	}
	return nil
}

func samePartitionRevisions(left PartitionRevisions, right PartitionRevisions) bool {
	return left.WorkspaceRev == right.WorkspaceRev &&
		left.RouteRev == right.RouteRev &&
		left.OpSeq == right.OpSeq &&
		sameDocumentRevisionSet(left.DocumentRevisions, right.DocumentRevisions)
}

func validateCandidateScenarioAgainstPlan(
	candidate EvidenceCandidate,
	cell VerificationPlanCell,
) error {
	if cell.ScenarioID == "" {
		if candidate.Scenario != nil || candidate.Inputs.ScenarioProgramDigest != "" {
			return attemptGrantFailure("Candidate unexpectedly carries Scenario identity.")
		}
		return nil
	}
	if candidate.Scenario == nil ||
		candidate.Scenario.ID != cell.ScenarioID ||
		candidate.Inputs.ScenarioProgramDigest == "" ||
		candidate.Scenario.ProgramDigest != candidate.Inputs.ScenarioProgramDigest {
		return attemptGrantFailure(
			"Candidate Scenario identity drifted from the Plan cell.",
		)
	}
	return nil
}

func candidateDigestRefMatches(
	candidateDigests []string,
	reference *VerificationPlanDocumentDigestRef,
) bool {
	if reference == nil {
		return len(candidateDigests) == 0
	}
	return reference.Digest != "" &&
		len(candidateDigests) == 1 &&
		candidateDigests[0] == reference.Digest
}

func candidateBaselineRefMatches(
	candidateDigest string,
	reference *VerificationPlanDocumentDigestRef,
) bool {
	if reference == nil {
		return candidateDigest == ""
	}
	return reference.Digest != "" && candidateDigest == reference.Digest
}

func trustAllowedByPlanCell(
	trust TrustClass,
	requirements VerificationPlanEvidenceRequirements,
) bool {
	allowed := false
	for _, accepted := range requirements.AcceptedTrust {
		if accepted == trust {
			allowed = true
			break
		}
	}
	if !allowed {
		return false
	}
	if requirements.RequireAttestation {
		return trust == TrustRemoteAttested || trust == TrustCIAttested
	}
	return true
}

func validateCandidateArtifactsAgainstPlan(
	candidate EvidenceCandidate,
	cell VerificationPlanCell,
) error {
	declared := make(map[ArtifactKind]struct{}, len(cell.ArtifactKinds))
	for _, kind := range cell.ArtifactKinds {
		declared[kind] = struct{}{}
	}
	present := make(map[ArtifactKind]struct{}, len(candidate.Artifacts))
	for _, artifact := range candidate.Artifacts {
		if _, ok := declared[artifact.Kind]; !ok {
			return attemptGrantFailure(
				"Candidate carries an artifact kind not declared by the Plan cell.",
			)
		}
		present[artifact.Kind] = struct{}{}
	}
	for _, required := range cell.EvidenceRequirements.RequiredArtifactKinds {
		if _, ok := present[required]; !ok {
			return attemptGrantFailure(
				"Candidate is missing an artifact kind required by the Plan cell.",
			)
		}
	}
	return nil
}

func sameStrings(left []string, right []string) bool {
	if len(left) != len(right) {
		return false
	}
	for index := range left {
		if left[index] != right[index] {
			return false
		}
	}
	return true
}
