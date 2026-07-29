package verification

import (
	"context"
	"fmt"
	"io"
	"sort"
	"strconv"
	"strings"
)

func (service *Service) ListEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	filter ListFilter,
) (EvidencePage, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return EvidencePage{}, err
	}
	return service.repository.ListEvidence(ctx, workspaceID, filter, service.now())
}

func (service *Service) GetEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	evidenceID string,
) (EvidenceRecord, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return EvidenceRecord{}, err
	}
	return service.repository.GetEvidenceRecord(ctx, workspaceID, evidenceID, service.now())
}

func (service *Service) ResolveArtifact(
	ctx context.Context,
	principalID string,
	workspaceID string,
	evidenceID string,
	artifactID string,
) (ArtifactContent, io.ReadCloser, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return ArtifactContent{}, nil, err
	}
	content, err := service.repository.ResolveArtifactContent(ctx, workspaceID, evidenceID, artifactID)
	if err != nil {
		return ArtifactContent{}, nil, err
	}
	reader, err := service.store.OpenDurable(ctx, content.Locator)
	if err != nil {
		return ArtifactContent{}, nil, err
	}
	return content, reader, nil
}

func (service *Service) CompareEvidence(
	ctx context.Context,
	principalID string,
	workspaceID string,
	leftID string,
	rightID string,
) (ComparisonDescriptor, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return ComparisonDescriptor{}, err
	}
	left, err := service.repository.GetEvidenceRecord(ctx, workspaceID, leftID, service.now())
	if err != nil {
		return ComparisonDescriptor{}, err
	}
	right, err := service.repository.GetEvidenceRecord(ctx, workspaceID, rightID, service.now())
	if err != nil {
		return ComparisonDescriptor{}, err
	}
	comparison, err := service.targetPolicies.ResolveComparisonPolicy(ctx, workspaceID)
	if err != nil {
		return ComparisonDescriptor{}, err
	}
	if err := validateTargetPolicyComparison(comparison); err != nil {
		return ComparisonDescriptor{}, err
	}
	policy := comparison.ComparisonPolicy()
	return compareEvidence(left.Evidence, right.Evidence, &policy)
}

func (service *Service) ClosureView(
	ctx context.Context,
	principalID string,
	workspaceID string,
	filter ListFilter,
) (ClosureView, error) {
	if err := service.requirePermission(ctx, principalID, workspaceID, "workspace.read"); err != nil {
		return ClosureView{}, err
	}
	observedAt := canonicalTime(service.now())
	return service.repository.ClosureView(ctx, workspaceID, filter, observedAt)
}

func compareEvidence(
	left VerificationEvidence,
	right VerificationEvidence,
	policy *ComparisonPolicy,
) (ComparisonDescriptor, error) {
	mismatches := make([]string, 0)
	add := func(name string, leftValue any, rightValue any) {
		leftBytes, _ := canonicalBytes(leftValue)
		rightBytes, _ := canonicalBytes(rightValue)
		if string(leftBytes) != string(rightBytes) {
			mismatches = append(mismatches, name)
		}
	}
	add("project-id", left.ProjectID, right.ProjectID)
	add("workspace-id", left.WorkspaceID, right.WorkspaceID)
	add("workspace-revision", left.WorkspaceRevision, right.WorkspaceRevision)
	add("partition-revisions", left.PartitionRevisions, right.PartitionRevisions)
	add("executable-snapshot", left.ExecutableSnapshotDigest, right.ExecutableSnapshotDigest)
	add("scenario-id", scenarioField(left.Scenario, "id"), scenarioField(right.Scenario, "id"))
	add("scenario-revision", scenarioField(left.Scenario, "revision"), scenarioField(right.Scenario, "revision"))
	add("scenario-digest", scenarioField(left.Scenario, "digest"), scenarioField(right.Scenario, "digest"))
	add("scenario-program", scenarioField(left.Scenario, "program"), scenarioField(right.Scenario, "program"))
	add("policy-revision", left.PolicyRevision, right.PolicyRevision)
	add("policy-digest", left.PolicyDigest, right.PolicyDigest)
	add("impact-digest", left.ImpactDigest, right.ImpactDigest)
	add("plan-digest", left.PlanDigest, right.PlanDigest)
	add("cell-id", left.CellID, right.CellID)
	add("check-id", left.CheckID, right.CheckID)
	add("check-kind", left.CheckKind, right.CheckKind)
	add("target-id", left.TargetID, right.TargetID)
	add("surface", left.Run.Surface, right.Run.Surface)
	add("framework-target", left.Run.FrameworkTarget, right.Run.FrameworkTarget)
	add("runtime-zone", left.Run.RuntimeZone, right.Run.RuntimeZone)
	add("browser-engine", left.Run.BrowserEngine, right.Run.BrowserEngine)
	add("operating-system", left.Run.OperatingSystemIdentity, right.Run.OperatingSystemIdentity)
	add("viewport", left.Run.Viewport, right.Run.Viewport)
	add("device-pixel-ratio", left.Run.DevicePixelRatio, right.Run.DevicePixelRatio)
	add("color-scheme", left.Run.ColorScheme, right.Run.ColorScheme)
	add("motion", left.Run.Motion, right.Run.Motion)
	add("locale", left.Run.Locale, right.Run.Locale)
	add("timezone", left.Run.Timezone, right.Run.Timezone)
	add("font-set", left.Run.FontSetDigest, right.Run.FontSetDigest)
	add("sandbox-image", left.Run.SandboxImageDigest, right.Run.SandboxImageDigest)
	add("tool-package", left.Toolchain.PackageName, right.Toolchain.PackageName)
	add("tool-version", left.Toolchain.PackageVersion, right.Toolchain.PackageVersion)
	add("tool-major", packageMajor(left.Toolchain.PackageVersion), packageMajor(right.Toolchain.PackageVersion))
	add("tool-build", left.Toolchain.BuildDigest, right.Toolchain.BuildDigest)
	add("toolchain", left.Toolchain.ToolchainDigest, right.Toolchain.ToolchainDigest)
	add("adapter-schema", left.Toolchain.SchemaDigest, right.Toolchain.SchemaDigest)
	add("normalization-package", left.Normalization.PackageName, right.Normalization.PackageName)
	add("normalization-version", left.Normalization.PackageVersion, right.Normalization.PackageVersion)
	add("normalization-build", left.Normalization.BuildDigest, right.Normalization.BuildDigest)
	add("normalization-toolchain", left.Normalization.ToolchainDigest, right.Normalization.ToolchainDigest)
	add("normalization-schema", left.Normalization.SchemaDigest, right.Normalization.SchemaDigest)
	add("control-profile", left.Controls.ProfileDigest, right.Controls.ProfileDigest)
	add("applied-controls", left.Controls.AppliedDigest, right.Controls.AppliedDigest)
	add("fixture-set", left.Inputs.FixtureSetDigests, right.Inputs.FixtureSetDigests)
	add("baseline-set", left.Inputs.BaselineSetDigest, right.Inputs.BaselineSetDigest)
	add("input-digest", left.Inputs.InputDigest, right.Inputs.InputDigest)
	add("dependency-lock", left.DependencyLockDigest, right.DependencyLockDigest)
	add("redaction-policy", left.RedactionPolicyID, right.RedactionPolicyID)
	add("target-policy", left.TargetPolicy, right.TargetPolicy)
	sort.Strings(mismatches)
	incompatible := map[string]struct{}{
		"project-id": {}, "workspace-id": {}, "scenario-id": {},
		"scenario-digest": {}, "scenario-program": {}, "check-id": {},
		"check-kind": {}, "target-id": {},
	}
	allowed := map[string]struct{}{}
	var normalizedPolicy *ComparisonPolicy
	if policy != nil {
		if validateCanonicalText(policy.ID, "comparison policy id", 512) != nil ||
			!digestPattern.MatchString(policy.Digest) {
			return ComparisonDescriptor{}, ErrInvalid
		}
		fields, err := sortedUnique(policy.AllowedMismatchFields)
		if err != nil {
			return ComparisonDescriptor{}, ErrInvalid
		}
		validFields := map[string]struct{}{}
		for _, field := range comparisonFields() {
			validFields[field] = struct{}{}
		}
		for _, field := range fields {
			if _, valid := validFields[field]; !valid {
				return ComparisonDescriptor{}, ErrInvalid
			}
			if _, unsafe := incompatible[field]; unsafe {
				return ComparisonDescriptor{}, ErrInvalid
			}
			allowed[field] = struct{}{}
		}
		normalizedPolicy = &ComparisonPolicy{
			ID: policy.ID, Digest: policy.Digest, AllowedMismatchFields: fields,
		}
	}
	compatibility := "exact-compatible"
	if len(mismatches) > 0 {
		compatibility = "view-only"
	}
	for _, field := range mismatches {
		if _, hard := incompatible[field]; hard {
			compatibility = "incompatible"
			break
		}
	}
	if compatibility == "view-only" && normalizedPolicy != nil {
		accepted := true
		for _, field := range mismatches {
			if _, exists := allowed[field]; !exists {
				accepted = false
				break
			}
		}
		if accepted {
			compatibility = "policy-compatible"
		}
	}
	evidenceDigests := []string{left.ManifestDigest, right.ManifestDigest}
	sort.Strings(evidenceDigests)
	digestInput := struct {
		Compatibility         string    `json:"compatibility"`
		EvidenceDigests       []string  `json:"evidenceDigests"`
		MismatchFields        []string  `json:"mismatchFields"`
		PolicyID              string    `json:"policyId,omitempty"`
		PolicyDigest          string    `json:"policyDigest,omitempty"`
		AllowedMismatchFields *[]string `json:"allowedMismatchFields,omitempty"`
	}{
		Compatibility: compatibility, EvidenceDigests: evidenceDigests,
		MismatchFields: mismatches,
	}
	result := ComparisonDescriptor{
		Compatibility: compatibility, LeftEvidenceID: left.ID,
		RightEvidenceID: right.ID, MismatchFields: mismatches,
	}
	if normalizedPolicy != nil {
		result.PolicyID, result.PolicyDigest = normalizedPolicy.ID, normalizedPolicy.Digest
		digestInput.PolicyID, digestInput.PolicyDigest = normalizedPolicy.ID, normalizedPolicy.Digest
		digestInput.AllowedMismatchFields = &normalizedPolicy.AllowedMismatchFields
	}
	comparisonDigest, _, err := canonicalDigest(digestInput)
	if err != nil {
		return ComparisonDescriptor{}, err
	}
	result.ComparisonDigest = comparisonDigest
	return result, nil
}

func comparisonFields() []string {
	return []string{
		"adapter-schema", "applied-controls", "baseline-set", "browser-engine",
		"cell-id", "check-id", "check-kind", "color-scheme", "control-profile",
		"dependency-lock", "device-pixel-ratio", "executable-snapshot", "fixture-set",
		"font-set", "framework-target", "impact-digest", "input-digest", "locale",
		"motion", "normalization-build", "normalization-package", "normalization-schema",
		"normalization-toolchain", "normalization-version", "operating-system",
		"partition-revisions", "plan-digest", "policy-digest", "policy-revision",
		"project-id", "redaction-policy", "runtime-zone", "sandbox-image",
		"scenario-digest", "scenario-id", "scenario-program", "scenario-revision",
		"surface", "target-id", "target-policy", "timezone", "tool-build",
		"tool-major", "tool-package", "tool-version", "toolchain", "viewport",
		"workspace-id", "workspace-revision",
	}
}

func scenarioField(scenario *ScenarioIdentity, field string) any {
	if scenario == nil {
		return nil
	}
	switch field {
	case "id":
		return scenario.ID
	case "revision":
		return scenario.Revision
	case "digest":
		return scenario.Digest
	default:
		return scenario.ProgramDigest
	}
}

func packageMajor(value string) string {
	value = strings.TrimPrefix(strings.TrimSpace(value), "v")
	major := strings.SplitN(value, ".", 2)[0]
	if _, err := strconv.ParseUint(major, 10, 64); err != nil {
		return ""
	}
	return major
}

func parsePositiveInt64(value string) (int64, error) {
	parsed, err := strconv.ParseInt(value, 10, 64)
	if err != nil || !validRevision(parsed) {
		return 0, fmt.Errorf("invalid revision")
	}
	return parsed, nil
}
