package agent

import (
	"encoding/json"
	"testing"

	g3 "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
)

func TestRuntimeRollbackPlanRetainsEveryApprovedRequiredCheck(t *testing.T) {
	vector := readProposalRepositoryVector(t)
	source := runtimeDriverPlan(t, &vector)
	approved, _, err := g3.DecodeVerificationPlanWire(source)
	if err != nil {
		t.Fatal(err)
	}
	clone := func() g3.VerificationPlanGrant {
		bytes, err := json.Marshal(approved)
		if err != nil {
			t.Fatal(err)
		}
		var result g3.VerificationPlanGrant
		if err := json.Unmarshal(bytes, &result); err != nil {
			t.Fatal(err)
		}
		return result
	}
	actual := clone()
	actual.TargetRevision++
	actual.TargetPartitionRevisions.WorkspaceRev++
	actual.ImpactDigest = runtimeTestDigest(t, map[string]any{"rollback": "impact"}, "unused")
	actual.PlanDigest = runtimeTestDigest(t, actual, "planDigest")
	if !retainsRuntimeRollbackPlan(approved, actual) {
		t.Fatal("revision-bound rollback Plan lost an unchanged required check")
	}
	cases := map[string]func(*g3.VerificationPlanGrant){
		"missing required check":   func(plan *g3.VerificationPlanGrant) { plan.Cells = nil },
		"optional downgrade":       func(plan *g3.VerificationPlanGrant) { plan.Cells[0].Requirement = "optional" },
		"different target":         func(plan *g3.VerificationPlanGrant) { plan.Cells[0].TargetID = "target.unapproved" },
		"different adapter":        func(plan *g3.VerificationPlanGrant) { plan.Cells[0].Adapter.ToolchainDigest = actual.ImpactDigest },
		"different surface":        func(plan *g3.VerificationPlanGrant) { plan.Cells[0].Surface = "export" },
		"different input controls": func(plan *g3.VerificationPlanGrant) { plan.Cells[0].ControlProfileRef.Digest = actual.ImpactDigest },
		"weaker evidence age":      func(plan *g3.VerificationPlanGrant) { plan.Cells[0].EvidenceRequirements.MaximumAgeMS++ },
		"different registry":       func(plan *g3.VerificationPlanGrant) { plan.AdapterRegistryDigest = actual.ImpactDigest },
		"different policy":         func(plan *g3.VerificationPlanGrant) { plan.PolicyDigest = actual.ImpactDigest },
		"different retention":      func(plan *g3.VerificationPlanGrant) { plan.RetentionRequest.Failed = g3.RetentionRelease },
	}
	for name, mutate := range cases {
		t.Run(name, func(t *testing.T) {
			changed := clone()
			mutate(&changed)
			if retainsRuntimeRollbackPlan(approved, changed) {
				t.Fatal("unapproved or weakened rollback Plan was retained")
			}
		})
	}
	noRequired := clone()
	noRequired.Cells[0].Requirement = "optional"
	if retainsRuntimeRollbackPlan(noRequired, noRequired) {
		t.Fatal("empty required verification accepted as a rollback authority")
	}
}
