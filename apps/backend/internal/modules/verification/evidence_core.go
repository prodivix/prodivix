package verification

import (
	"encoding/json"
	"time"
)

const (
	evidenceCoreFormat  = "prodivix.verification-evidence-core"
	evidenceCoreVersion = 1
)

func createEvidenceCoreDigest(
	candidateDigest string,
	evidence VerificationEvidence,
) (string, error) {
	if !digestPattern.MatchString(candidateDigest) {
		return "", ErrInvalid
	}
	encoded, err := canonicalBytes(evidence)
	if err != nil {
		return "", err
	}
	var core map[string]any
	if err := json.Unmarshal(encoded, &core); err != nil {
		return "", err
	}
	delete(core, "manifestDigest")
	delete(core, "provenance")
	digest, _, err := canonicalDigest(struct {
		Format          string         `json:"format"`
		Version         int            `json:"version"`
		CandidateDigest string         `json:"candidateDigest"`
		Evidence        map[string]any `json:"evidence"`
	}{
		Format:          evidenceCoreFormat,
		Version:         evidenceCoreVersion,
		CandidateDigest: candidateDigest,
		Evidence:        core,
	})
	return digest, err
}

func materializeEvidenceBody(
	candidate EvidenceCandidate,
	evidenceID string,
	createdAt time.Time,
	retention RetentionClass,
	artifacts []ArtifactManifest,
	provenance EvidenceProvenance,
) VerificationEvidence {
	return VerificationEvidence{
		ID:                       evidenceID,
		ProjectID:                candidate.ProjectID,
		WorkspaceID:              candidate.WorkspaceID,
		WorkspaceRevision:        candidate.WorkspaceRevision,
		PartitionRevisions:       candidate.PartitionRevisions,
		ExecutableSnapshotDigest: candidate.ExecutableSnapshotDigest,
		Scenario:                 candidate.Scenario,
		PolicyRevision:           candidate.PolicyRevision,
		PolicyDigest:             candidate.PolicyDigest,
		ImpactDigest:             candidate.ImpactDigest,
		PlanDigest:               candidate.PlanDigest,
		PolicyEvaluationInstant:  candidate.PolicyEvaluationInstant,
		CellID:                   candidate.CellID,
		CheckID:                  candidate.CheckID,
		CheckKind:                candidate.CheckKind,
		TargetID:                 candidate.TargetID,
		AttemptID:                candidate.AttemptID,
		Run: EvidenceRunIdentity{
			RunID:                   candidate.Run.RunID,
			ProviderID:              candidate.Run.ProviderID,
			JobID:                   candidate.Run.JobID,
			SessionID:               candidate.Run.SessionID,
			ParentAttemptID:         candidate.Run.ParentAttemptID,
			Surface:                 candidate.Run.Surface,
			FrameworkTarget:         candidate.Run.FrameworkTarget,
			RuntimeZone:             candidate.Run.RuntimeZone,
			BrowserEngine:           candidate.Run.BrowserEngine,
			OperatingSystemIdentity: candidate.Run.OperatingSystemIdentity,
			Viewport:                candidate.Run.Viewport,
			DevicePixelRatio:        candidate.Run.DevicePixelRatio,
			ColorScheme:             candidate.Run.ColorScheme,
			Motion:                  candidate.Run.Motion,
			Locale:                  candidate.Run.Locale,
			Timezone:                candidate.Run.Timezone,
			FontSetDigest:           candidate.Run.FontSetDigest,
			SandboxImageDigest:      candidate.Run.SandboxImageDigest,
		},
		Timing:        candidate.Timing,
		Result:        candidate.Result,
		Provenance:    provenance,
		Toolchain:     candidate.Toolchain,
		Normalization: candidate.Normalization,
		Controls:      candidate.Controls,
		Inputs:        candidate.Inputs,
		Artifacts: append(
			[]ArtifactManifest(nil),
			artifacts...,
		),
		SourceTraces: append(
			[]VerificationEvidenceSourceTrace(nil),
			candidate.SourceTraces...,
		),
		SourceTraceDigest:    candidate.SourceTraceDigest,
		DependencyLockDigest: candidate.DependencyLockDigest,
		RedactionPolicyID:    candidate.Redaction.PolicyID,
		TargetPolicy:         candidate.Redaction.TargetPolicy,
		CreatedAt:            formatInstant(createdAt),
		Retention:            retention,
	}
}
