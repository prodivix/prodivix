package agent

import (
	"context"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationHumanReviewFrozenAuthority struct {
	RunConfigArtifactBinding EvaluationProductionRunConfigArtifactBinding
	SourceConfigDigest       string
	FrozenRunDigest          string
	ConfigCommitmentDigest   string
	PublicRubrics            []map[string]any
	TrustRegistry            map[string]any
	AdjudicationPolicy       map[string]any
}

// EvaluationHumanReviewAuthority resolves human trust only from the exact
// canonical run-config artifact already sealed by the server-owned holdout closure.
type EvaluationHumanReviewAuthority interface {
	ResolveHumanReviewAuthority(
		context.Context,
		EvaluationPlanRecord,
		EvaluationHoldoutClosureRecord,
	) (EvaluationHumanReviewFrozenAuthority, error)
}

type EvaluationTrackedHumanReviewAuthorityConfig struct {
	ExpectedRepositoryCommit string
	Verifier                 EvaluationAuthorityAttestationVerifier
	RunConfigArtifactSource  EvaluationProductionRunConfigArtifactSource
}

type trackedEvaluationHumanReviewAuthority struct {
	expectedCommit string
	verifier       EvaluationAuthorityAttestationVerifier
	artifactSource EvaluationProductionRunConfigArtifactSource
}

func NewTrackedEvaluationHumanReviewAuthority(
	config EvaluationTrackedHumanReviewAuthorityConfig,
) (EvaluationHumanReviewAuthority, error) {
	if !evaluationRepositoryCommitPattern.MatchString(config.ExpectedRepositoryCommit) ||
		config.Verifier == nil || config.RunConfigArtifactSource == nil {
		return nil, ErrInvalid
	}
	return &trackedEvaluationHumanReviewAuthority{
		expectedCommit: config.ExpectedRepositoryCommit,
		verifier:       config.Verifier, artifactSource: config.RunConfigArtifactSource,
	}, nil
}

func evaluationHumanReviewPlanAuthority(
	plan evaluationPlanFact,
	humanReview map[string]any,
	publicRubrics []map[string]any,
	trustRegistry map[string]any,
	adjudicationPolicy map[string]any,
) error {
	minimum, minimumOK := integerMember(humanReview, "minimumIndependentRatings")
	artifactMaximum, maximumOK := integerMember(humanReview, "artifactMaximumBytes")
	reviewerIDs, reviewerErr := evaluationHumanReviewCanonicalStringSet(
		humanReview["reviewerAuthorityIds"], false, "tracked reviewer authorities",
	)
	if !minimumOK || minimum < 2 || minimum > 8 || !maximumOK || artifactMaximum != maximumEvaluationHumanReviewArtifactBytes ||
		reviewerErr != nil || int64(len(reviewerIDs)) < minimum ||
		humanReview["reviewerTrustRegistryDigest"] != trustRegistry["registryDigest"] ||
		humanReview["randomizedPresentationPolicyDigest"] == nil || len(publicRubrics) != 1 {
		return conflict("evaluation tracked human review settings are invalid")
	}
	if _, err := evaluationHumanReviewIdentity(humanReview["adjudicationAuthorityId"], "tracked adjudicator authority"); err != nil {
		return err
	}
	if humanReview["adjudicationAuthorityId"] != adjudicationPolicy["adjudicationAuthorityId"] ||
		humanReview["minimumIndependentRatings"] != adjudicationPolicy["minimumIndependentRatings"] {
		return conflict("evaluation tracked human review policy drifted")
	}
	trackedReviewerIDs, _ := canonicaljson.Digest(humanReview["reviewerAuthorityIds"])
	policyReviewerIDs, _ := canonicaljson.Digest(adjudicationPolicy["reviewerAuthorityIds"])
	if trackedReviewerIDs != policyReviewerIDs {
		return conflict("evaluation tracked reviewer authority set drifted")
	}
	graderPlan, ok := objectMember(plan.Value, "graderPlan")
	if !ok || graderPlan["randomizedPresentationPolicyDigest"] != humanReview["randomizedPresentationPolicyDigest"] {
		return conflict("evaluation tracked human review presentation policy drifted from plan")
	}
	planMinimum, planMinimumOK := integerMember(graderPlan, "minimumIndependentVisualRatings")
	if !planMinimumOK || planMinimum != minimum || graderPlan["disagreementPolicyDigest"] != adjudicationPolicy["policyDigest"] {
		return conflict("evaluation tracked human review plan policy drifted")
	}
	blindIDs, blindOK := graderPlan["blindHumanGraderIds"].([]any)
	graders, gradersOK := graderPlan["graders"].([]any)
	if !blindOK || !gradersOK || len(blindIDs) != 1 {
		return conflict("evaluation tracked human grader authority is invalid")
	}
	blindID, ok := blindIDs[0].(string)
	if !ok {
		return conflict("evaluation tracked human grader identity is invalid")
	}
	matched := 0
	for _, raw := range graders {
		grader, ok := raw.(map[string]any)
		if ok && stringMember(grader, "graderId") == blindID && stringMember(grader, "kind") == "blind-human-rubric" &&
			stringMember(grader, "authority") == "human" &&
			stringMember(grader, "configurationDigest") == stringMember(publicRubrics[0], "rubricDigest") {
			matched++
		}
	}
	if matched != 1 {
		return conflict("evaluation tracked public rubric drifted from plan grader")
	}
	return nil
}

func (authority *trackedEvaluationHumanReviewAuthority) ResolveHumanReviewAuthority(
	ctx context.Context,
	planRecord EvaluationPlanRecord,
	holdout EvaluationHoldoutClosureRecord,
) (EvaluationHumanReviewFrozenAuthority, error) {
	partition := EvaluationPlanPartition{PlanDigest: planRecord.PlanDigest, RepositoryCommit: planRecord.RepositoryCommit}
	commitment, err := decodeEvaluationFrozenConfigCommitment(holdout.ConfigCommitmentBytes)
	if err != nil || holdout.Partition != partition || commitment.PlanDigest != partition.PlanDigest ||
		commitment.RepositoryCommit != partition.RepositoryCommit || commitment.RepositoryCommit != authority.expectedCommit ||
		!sameEvaluationProductionRunConfigArtifactBinding(commitment.RunConfigArtifactBinding, holdout.RunConfigArtifactBinding) ||
		commitment.SourceConfigDigest != holdout.SourceConfigDigest || commitment.FrozenRunDigest != holdout.FrozenRunDigest ||
		commitment.CommitmentDigest != holdout.ConfigCommitmentDigest {
		return EvaluationHumanReviewFrozenAuthority{}, conflict("evaluation human review config commitment drifted")
	}
	plan, err := decodeEvaluationPlan(planRecord.FactBytes)
	if err != nil || plan.PlanDigest != commitment.PlanDigest || plan.RepositoryCommit != commitment.RepositoryCommit ||
		commitment.CommittedAt != evaluationExportInstant(plan.PlannedAt) {
		return EvaluationHumanReviewFrozenAuthority{}, conflict("evaluation human review plan commitment drifted")
	}
	if err := verifyEvaluationFrozenConfigCommitment(ctx, authority.verifier, commitment); err != nil {
		return EvaluationHumanReviewFrozenAuthority{}, err
	}
	source, err := authority.artifactSource.ResolveEvaluationProductionRunConfigArtifact(
		ctx, partition, commitment.RunConfigArtifactBinding,
	)
	if err != nil {
		return EvaluationHumanReviewFrozenAuthority{}, err
	}
	defer clear(source)
	tracked, _, err := decodeEvaluationTrackedConfig(source)
	if err != nil {
		return EvaluationHumanReviewFrozenAuthority{}, err
	}
	sourceDigest, err := canonicaljson.Digest(tracked)
	version, versionOK := integerMember(tracked, "version")
	if err != nil || sourceDigest != commitment.SourceConfigDigest || stringMember(tracked, "format") != "prodivix.g4-real-model-evaluation-run-config" ||
		!versionOK || version != 1 || stringMember(tracked, "purpose") != "production" ||
		stringMember(tracked, "repositoryCommit") != commitment.RepositoryCommit || !evaluationTrackedAttestationMatches(tracked, commitment) {
		return EvaluationHumanReviewFrozenAuthority{}, conflict("evaluation tracked human review config identity drifted")
	}
	frozenRunDigest, err := evaluationTrackedFrozenRunDigest(tracked, plan.PlanDigest, sourceDigest)
	if err != nil || frozenRunDigest != commitment.FrozenRunDigest {
		return EvaluationHumanReviewFrozenAuthority{}, conflict("evaluation tracked human review frozen run digest drifted")
	}
	execution, executionOK := objectMember(tracked, "execution")
	humanReview, humanReviewOK := objectMember(execution, "humanReview")
	if !executionOK || !humanReviewOK || !exactKeys(humanReview,
		"minimumIndependentRatings", "reviewerAuthorityIds", "adjudicationAuthorityId", "artifactMaximumBytes",
		"reviewerTrustRegistryDigest", "randomizedPresentationPolicyDigest", "publicRubrics", "trustRegistry", "adjudicationPolicy") {
		return EvaluationHumanReviewFrozenAuthority{}, conflict("evaluation tracked human review authority is incomplete")
	}
	publicRubrics, err := validateEvaluationHumanReviewPublicRubrics(humanReview["publicRubrics"])
	if err != nil {
		return EvaluationHumanReviewFrozenAuthority{}, err
	}
	trustRegistry, err := validateEvaluationHumanReviewTrustRegistry(humanReview["trustRegistry"])
	if err != nil {
		return EvaluationHumanReviewFrozenAuthority{}, err
	}
	adjudicationPolicy, err := validateEvaluationHumanReviewAdjudicationPolicy(humanReview["adjudicationPolicy"], trustRegistry)
	if err != nil {
		return EvaluationHumanReviewFrozenAuthority{}, err
	}
	if err := evaluationHumanReviewPlanAuthority(plan, humanReview, publicRubrics, trustRegistry, adjudicationPolicy); err != nil {
		return EvaluationHumanReviewFrozenAuthority{}, err
	}
	return EvaluationHumanReviewFrozenAuthority{
		RunConfigArtifactBinding: commitment.RunConfigArtifactBinding, SourceConfigDigest: sourceDigest,
		FrozenRunDigest: frozenRunDigest, ConfigCommitmentDigest: commitment.CommitmentDigest,
		PublicRubrics: publicRubrics, TrustRegistry: trustRegistry, AdjudicationPolicy: adjudicationPolicy,
	}, nil
}
