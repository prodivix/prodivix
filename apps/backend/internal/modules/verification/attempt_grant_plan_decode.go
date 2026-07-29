package verification

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
)

func decodeVerificationPlanWire(
	payload json.RawMessage,
) (VerificationPlanGrant, []byte, error) {
	if validateVerificationPlanJSONObject(payload) != nil ||
		verificationcontract.ValidateEvidenceTransport("verification-plan", payload) != nil {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan wire value is not strict bounded JSON.",
		)
	}
	var wire verificationPlanWireGrant
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan does not match the complete wire model.",
		)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan wire value contains trailing JSON.",
		)
	}
	if wire.WireVersion != 1 {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan wire version is unsupported.",
		)
	}
	original, err := canonicalBytes(wire.VerificationPlanGrant)
	if err != nil {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan wire value is not canonical JSON.",
		)
	}
	plan, canonical, err := canonicalizeVerificationPlan(wire.VerificationPlanGrant)
	if err != nil {
		return VerificationPlanGrant{}, nil, err
	}
	if !bytes.Equal(original, canonical) {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan wire arrays are not in canonical order.",
		)
	}
	return plan, canonical, nil
}

func decodeCanonicalVerificationPlan(
	payload json.RawMessage,
) (VerificationPlanGrant, []byte, error) {
	if validateVerificationPlanJSONObject(payload) != nil {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan is not strict bounded JSON.",
		)
	}
	var plan VerificationPlanGrant
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&plan); err != nil {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan does not match the complete current model.",
		)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan contains trailing JSON.",
		)
	}
	original, err := canonicalBytes(plan)
	if err != nil {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan is not canonical JSON.",
		)
	}
	plan, canonical, err := canonicalizeVerificationPlan(plan)
	if err != nil {
		return VerificationPlanGrant{}, nil, err
	}
	if !bytes.Equal(original, canonical) {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan arrays are not in canonical order.",
		)
	}
	return plan, canonical, nil
}

func canonicalizeVerificationPlan(
	plan VerificationPlanGrant,
) (VerificationPlanGrant, []byte, error) {
	normalizeVerificationPlanGrant(&plan)
	if err := validateVerificationPlanGrant(plan); err != nil {
		return VerificationPlanGrant{}, nil, err
	}
	planDigest, _, err := digestWithoutField(plan, "planDigest")
	if err != nil || planDigest != plan.PlanDigest {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan digest does not match its canonical content.",
		)
	}
	canonical, err := canonicalBytes(plan)
	if err != nil {
		return VerificationPlanGrant{}, nil, attemptGrantFailure(
			"VerificationPlan cannot be canonicalized.",
		)
	}
	return plan, canonical, nil
}

func normalizeVerificationPlanGrant(plan *VerificationPlanGrant) {
	for index := range plan.Cells {
		cell := &plan.Cells[index]
		sort.Strings(cell.PolicyRuleIDs)
		sort.Strings(cell.AppliedExemptionIDs)
		sort.Strings(cell.RetryPolicy.RetryableOutcomes)
		sort.Slice(cell.EvidenceRequirements.AcceptedTrust, func(left int, right int) bool {
			return cell.EvidenceRequirements.AcceptedTrust[left] <
				cell.EvidenceRequirements.AcceptedTrust[right]
		})
		sort.Slice(cell.EvidenceRequirements.RequiredArtifactKinds, func(left int, right int) bool {
			return cell.EvidenceRequirements.RequiredArtifactKinds[left] <
				cell.EvidenceRequirements.RequiredArtifactKinds[right]
		})
		sort.Slice(cell.Resources, func(left int, right int) bool {
			if cell.Resources[left].Key != cell.Resources[right].Key {
				return cell.Resources[left].Key < cell.Resources[right].Key
			}
			return cell.Resources[left].Mode < cell.Resources[right].Mode
		})
		sort.Strings(cell.InputKinds)
		sort.Slice(cell.ArtifactKinds, func(left int, right int) bool {
			return cell.ArtifactKinds[left] < cell.ArtifactKinds[right]
		})
		sort.Strings(cell.DependencyCellIDs)
	}
	sort.Slice(plan.Cells, func(left int, right int) bool {
		return compareVerificationPlanCells(plan.Cells[left], plan.Cells[right]) < 0
	})
	for index := range plan.Issues {
		sort.Strings(plan.Issues[index].RelatedIDs)
	}
	sort.Slice(plan.Issues, func(left int, right int) bool {
		a, b := plan.Issues[left], plan.Issues[right]
		if a.Code != b.Code {
			return a.Code < b.Code
		}
		if a.CellID != b.CellID {
			return a.CellID < b.CellID
		}
		if a.CheckID != b.CheckID {
			return a.CheckID < b.CheckID
		}
		return a.Message < b.Message
	})
	for index := range plan.Explanations {
		sort.Strings(plan.Explanations[index].ImpactPathIDs)
		sort.Strings(plan.Explanations[index].PolicyRuleIDs)
	}
	sort.Slice(plan.Explanations, func(left int, right int) bool {
		a, b := plan.Explanations[left], plan.Explanations[right]
		if a.CellID != b.CellID {
			return a.CellID < b.CellID
		}
		if a.CheckID != b.CheckID {
			return a.CheckID < b.CheckID
		}
		if a.ScenarioID != b.ScenarioID {
			return a.ScenarioID < b.ScenarioID
		}
		if a.TargetID != b.TargetID {
			return a.TargetID < b.TargetID
		}
		return a.Status < b.Status
	})
	sort.Strings(plan.Budget.OverBudgetDimensions)
}

func compareVerificationPlanCells(left VerificationPlanCell, right VerificationPlanCell) int {
	for _, pair := range [][2]string{
		{left.CheckID, right.CheckID},
		{left.ScenarioID, right.ScenarioID},
		{left.TargetID, right.TargetID},
		{left.FrameworkTarget, right.FrameworkTarget},
		{left.Surface, right.Surface},
		{left.BrowserEngine, right.BrowserEngine},
		{left.Viewport.ID, right.Viewport.ID},
		{left.ColorScheme, right.ColorScheme},
		{left.Motion, right.Motion},
		{left.Locale, right.Locale},
		{left.ID, right.ID},
	} {
		if pair[0] < pair[1] {
			return -1
		}
		if pair[0] > pair[1] {
			return 1
		}
	}
	return 0
}
