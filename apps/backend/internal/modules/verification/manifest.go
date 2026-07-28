package verification

import (
	"errors"
)

func projectEvidenceManifest(manifest VerificationEvidenceManifest) (VerificationEvidence, error) {
	if manifest.Format != "prodivix.verification-evidence-manifest" ||
		!digestPattern.MatchString(manifest.CandidateDigest) ||
		!digestPattern.MatchString(manifest.StatementDigest) ||
		!digestPattern.MatchString(manifest.ManifestDigest) ||
		manifest.Evidence.ManifestDigest != "" {
		return VerificationEvidence{}, ErrConflict
	}
	statementDigest, _, err := evidenceStatementDigest(manifest.Statement)
	if err != nil || statementDigest != manifest.StatementDigest {
		return VerificationEvidence{}, ErrConflict
	}
	outerDigest, _, err := digestWithoutField(manifest, "manifestDigest")
	if err != nil || outerDigest != manifest.ManifestDigest {
		return VerificationEvidence{}, ErrConflict
	}
	evidence := manifest.Evidence
	statement := manifest.Statement
	if validateEvidenceSourceTraces(evidence) != nil {
		return VerificationEvidence{}, ErrConflict
	}
	partitionDigest, _, err := canonicalDigest(evidence.PartitionRevisions)
	targetPolicyDigest, targetPolicyErr := artifactTargetPolicyDigest(evidence.TargetPolicy)
	normalizationDigest, _, normalizationErr := canonicalDigest(evidence.Normalization)
	executionDigest, _, executionErr := canonicalDigest(evidenceExecutionStatement(evidence.Run))
	statementExecutionDigest, _, statementExecutionErr := canonicalDigest(statement.Execution)
	producerDigest, _, producerErr := canonicalDigest(statement.Producer)
	artifactSetDigest, artifactSetErr := evidenceArtifactSetDigest(statement.Artifacts)
	expectedTrust, trustErr := trustForOrigin(statement.Producer.Origin)
	evidenceCoreDigest, evidenceCoreErr := createEvidenceCoreDigest(
		manifest.CandidateDigest,
		evidence,
	)
	if err != nil ||
		targetPolicyErr != nil ||
		normalizationErr != nil ||
		executionErr != nil ||
		statementExecutionErr != nil ||
		producerErr != nil ||
		artifactSetErr != nil ||
		evidenceCoreErr != nil ||
		trustErr != nil ||
		!validCheckKind(statement.CheckKind) ||
		validateIdentifier(statement.TargetID, "statement.targetId") != nil ||
		!digestPattern.MatchString(statement.TargetPolicyDigest) ||
		!digestPattern.MatchString(statement.NormalizationDigest) ||
		evidence.ID != statement.EvidenceID ||
		statement.CandidateDigest != manifest.CandidateDigest ||
		statement.EvidenceCoreDigest != evidenceCoreDigest ||
		evidence.ProjectID != statement.ProjectID ||
		evidence.WorkspaceID != statement.WorkspaceID ||
		evidence.WorkspaceRevision != statement.WorkspaceRevision ||
		partitionDigest != statement.PartitionRevisionsDigest ||
		evidence.ExecutableSnapshotDigest != statement.ExecutableSnapshotDigest ||
		evidence.PolicyDigest != statement.PolicyDigest ||
		evidence.PlanDigest != statement.PlanDigest ||
		evidence.CellID != statement.CellID ||
		evidence.CheckID != statement.CheckID ||
		evidence.CheckKind != statement.CheckKind ||
		evidence.TargetID != statement.TargetID ||
		validateArtifactTargetPolicy(
			evidence.TargetPolicy,
			evidence.PolicyDigest,
			evidence.TargetID,
		) != nil ||
		targetPolicyDigest != statement.TargetPolicyDigest ||
		evidence.AttemptID != statement.AttemptID ||
		evidence.Run.RunID != statement.Producer.RunID ||
		evidence.Run.ProviderID != statement.Producer.ProviderID ||
		evidence.Run.JobID != statement.Producer.JobID ||
		evidence.Run.SessionID != statement.Producer.SessionID ||
		evidence.Run.SandboxImageDigest != statement.Producer.SandboxImageDigest ||
		evidence.Provenance.ProducerID != statement.Producer.ProducerID ||
		evidence.Provenance.Trust != expectedTrust ||
		!sameCIIdentity(evidence.Provenance.CI, statement.Producer.CI) ||
		executionDigest != statementExecutionDigest ||
		evidence.Toolchain.ToolchainDigest != statement.ToolchainDigest ||
		normalizationDigest != statement.NormalizationDigest ||
		evidence.Controls.AppliedDigest != statement.ControlDigest ||
		evidence.Inputs.InputDigest != statement.InputDigest ||
		evidence.Result.NormalizedResultDigest != statement.ResultDigest ||
		evidence.SourceTraceDigest != statement.SourceTraceDigest ||
		evidence.CreatedAt != statement.CreatedAt ||
		evidence.Retention != statement.Retention {
		return VerificationEvidence{}, ErrConflict
	}
	if !statementProducerTrustIsValid(statement.Producer, expectedTrust) {
		return VerificationEvidence{}, ErrConflict
	}
	if len(evidence.Artifacts) != len(statement.Artifacts) {
		return VerificationEvidence{}, ErrConflict
	}
	for index := range evidence.Artifacts {
		artifact := evidence.Artifacts[index]
		expected := statement.Artifacts[index]
		if artifact.ID != expected.ID || artifact.Path != expected.Path ||
			artifact.Kind != expected.Kind ||
			artifact.Digest != expected.Digest ||
			artifact.SourceTraceDigest != expected.SourceTraceDigest ||
			artifact.Size != expected.Size ||
			artifact.MediaType != expected.MediaType {
			return VerificationEvidence{}, ErrConflict
		}
	}
	switch manifest.VerifiedProvenance.Kind {
	case "unattested":
		if manifest.VerifiedProvenance.Claims != nil ||
			(expectedTrust != TrustLocalUnattested && expectedTrust != TrustImported) ||
			manifest.VerifiedProvenance.Trust != expectedTrust ||
			evidence.Provenance.Trust != manifest.VerifiedProvenance.Trust ||
			evidence.Provenance.ProducerID != statement.Producer.ProducerID ||
			evidence.Provenance.ProducerID != manifest.VerifiedProvenance.ProducerID ||
			evidence.Provenance.IssuedAt != manifest.VerifiedProvenance.IssuedAt ||
			evidence.Provenance.ExpiresAt != manifest.VerifiedProvenance.ExpiresAt ||
			evidence.Provenance.AttestationDigest != "" ||
			evidence.Provenance.CI != nil {
			return VerificationEvidence{}, ErrConflict
		}
	case "attested":
		claims := manifest.VerifiedProvenance.Claims
		if claims == nil || manifest.VerifiedProvenance.Trust != "" ||
			manifest.VerifiedProvenance.ProducerID != "" ||
			(expectedTrust != TrustRemoteAttested && expectedTrust != TrustCIAttested) ||
			claims.Trust != expectedTrust ||
			evidence.Provenance.Trust != claims.Trust ||
			evidence.Provenance.ProducerID != statement.Producer.ProducerID ||
			evidence.Provenance.AttestationDigest != claims.AttestationDigest ||
			evidence.Provenance.IssuedAt != claims.IssuedAt ||
			evidence.Provenance.ExpiresAt != claims.ExpiresAt ||
			!sameCIIdentity(claims.CI, statement.Producer.CI) ||
			!sameCIIdentity(evidence.Provenance.CI, claims.CI) ||
			claims.StatementDigest != manifest.StatementDigest ||
			claims.CandidateDigest != statement.CandidateDigest ||
			claims.EvidenceCoreDigest != statement.EvidenceCoreDigest ||
			claims.ArtifactSetDigest != artifactSetDigest ||
			claims.ProjectID != statement.ProjectID ||
			claims.WorkspaceID != statement.WorkspaceID ||
			claims.WorkspaceRevision != statement.WorkspaceRevision ||
			claims.ExecutableSnapshotDigest != statement.ExecutableSnapshotDigest ||
			claims.PlanDigest != statement.PlanDigest ||
			claims.CellID != statement.CellID ||
			claims.CheckID != statement.CheckID ||
			claims.CheckKind != statement.CheckKind ||
			claims.TargetID != statement.TargetID ||
			claims.TargetPolicyDigest != statement.TargetPolicyDigest ||
			claims.AttemptID != statement.AttemptID ||
			claims.ProducerDigest != producerDigest ||
			claims.ExecutionDigest != executionDigest ||
			claims.ToolchainDigest != statement.ToolchainDigest ||
			claims.NormalizationDigest != statement.NormalizationDigest {
			return VerificationEvidence{}, ErrConflict
		}
	default:
		return VerificationEvidence{}, ErrConflict
	}
	evidence.ManifestDigest = manifest.ManifestDigest
	return evidence, nil
}

func evidenceExecutionStatement(run EvidenceRunIdentity) EvidenceExecutionStatement {
	return EvidenceExecutionStatement{
		Surface: run.Surface, FrameworkTarget: run.FrameworkTarget,
		RuntimeZone: run.RuntimeZone, BrowserEngine: run.BrowserEngine,
		OperatingSystemIdentity: run.OperatingSystemIdentity,
		Viewport:                run.Viewport, DevicePixelRatio: run.DevicePixelRatio,
		ColorScheme: run.ColorScheme, Motion: run.Motion,
		Locale: run.Locale, Timezone: run.Timezone,
		FontSetDigest:      run.FontSetDigest,
		SandboxImageDigest: run.SandboxImageDigest,
	}
}

func statementProducerTrustIsValid(producer ProducerStatement, trust TrustClass) bool {
	switch trust {
	case TrustCIAttested:
		return producer.Origin == "ci" &&
			producer.CI != nil &&
			validateCIRepositoryIdentity(*producer.CI) == nil
	case TrustRemoteAttested:
		return producer.Origin == "remote" && producer.CI == nil
	case TrustLocalUnattested:
		return producer.Origin == "local" && producer.CI == nil
	case TrustImported:
		return producer.Origin == "import" && producer.CI == nil
	default:
		return false
	}
}

func sameCIIdentity(left *CIRepositoryIdentity, right *CIRepositoryIdentity) bool {
	if left == nil || right == nil {
		return left == nil && right == nil
	}
	return *left == *right
}

func materializedEvidenceDigest(evidence VerificationEvidence) (string, error) {
	if evidence.ManifestDigest == "" {
		return "", errors.New("materialized Evidence requires the final manifest digest")
	}
	digest, _, err := canonicalDigest(evidence)
	return digest, err
}
