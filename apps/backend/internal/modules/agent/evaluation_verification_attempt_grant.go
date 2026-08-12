package agent

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationVerificationAttemptGrantIssueFormat   = "prodivix.agent-evaluation-verification-attempt-grant-issue"
	evaluationVerificationAttemptGrantReceiptFormat = "prodivix.agent-evaluation-verification-attempt-grant-receipt"
	evaluationVerificationAttemptGrantVersion       = 1
	maximumEvaluationVerificationPlanBytes          = 8_388_608
	maximumEvaluationVerificationGrantLifetime      = 15 * time.Minute
	evaluationVerificationAttemptGrantProducerID    = "prodivix.g4-evaluation-controlled-runtime"
)

type evaluationVerificationAttemptGrantIssue struct {
	Format                     string                          `json:"format"`
	Version                    int                             `json:"version"`
	NamespaceID                string                          `json:"namespaceId"`
	EvaluationPlanDigest       string                          `json:"evaluationPlanDigest"`
	RepositoryCommit           string                          `json:"repositoryCommit"`
	EvaluationAttemptID        string                          `json:"evaluationAttemptId"`
	DescriptorDigest           string                          `json:"descriptorDigest"`
	CapabilityDescriptorDigest string                          `json:"capabilityDescriptorDigest"`
	CaseID                     string                          `json:"caseId"`
	Descriptor                 json.RawMessage                 `json:"descriptor"`
	Generation                 int64                           `json:"generation"`
	WorkspaceID                string                          `json:"workspaceId"`
	WorkspaceRevision          int64                           `json:"workspaceRevision"`
	ProjectID                  string                          `json:"projectId"`
	VerificationPlanDigest     string                          `json:"verificationPlanDigest"`
	VerificationPlan           json.RawMessage                 `json:"verificationPlan"`
	CellID                     string                          `json:"cellId"`
	Run                        backendverification.RunIdentity `json:"run"`
	TrustCeiling               backendverification.TrustClass  `json:"trustCeiling"`
	ExpiresAt                  string                          `json:"expiresAt"`
	RequestDigest              string                          `json:"requestDigest"`
}

type evaluationVerificationAttemptGrantIssueBase struct {
	Format                     string                          `json:"format"`
	Version                    int                             `json:"version"`
	NamespaceID                string                          `json:"namespaceId"`
	EvaluationPlanDigest       string                          `json:"evaluationPlanDigest"`
	RepositoryCommit           string                          `json:"repositoryCommit"`
	EvaluationAttemptID        string                          `json:"evaluationAttemptId"`
	DescriptorDigest           string                          `json:"descriptorDigest"`
	CapabilityDescriptorDigest string                          `json:"capabilityDescriptorDigest"`
	CaseID                     string                          `json:"caseId"`
	Descriptor                 json.RawMessage                 `json:"descriptor"`
	Generation                 int64                           `json:"generation"`
	WorkspaceID                string                          `json:"workspaceId"`
	WorkspaceRevision          int64                           `json:"workspaceRevision"`
	ProjectID                  string                          `json:"projectId"`
	VerificationPlanDigest     string                          `json:"verificationPlanDigest"`
	VerificationPlan           json.RawMessage                 `json:"verificationPlan"`
	CellID                     string                          `json:"cellId"`
	Run                        backendverification.RunIdentity `json:"run"`
	TrustCeiling               backendverification.TrustClass  `json:"trustCeiling"`
	ExpiresAt                  string                          `json:"expiresAt"`
}

type evaluationVerificationAttemptGrantBinding struct {
	NamespaceID                string `json:"namespaceId"`
	EvaluationPlanDigest       string `json:"evaluationPlanDigest"`
	RepositoryCommit           string `json:"repositoryCommit"`
	EvaluationAttemptID        string `json:"evaluationAttemptId"`
	DescriptorDigest           string `json:"descriptorDigest"`
	CapabilityDescriptorDigest string `json:"capabilityDescriptorDigest"`
	CaseID                     string `json:"caseId"`
	Generation                 int64  `json:"generation"`
	WorkspaceID                string `json:"workspaceId"`
	WorkspaceRevision          int64  `json:"workspaceRevision"`
	ProjectID                  string `json:"projectId"`
	VerificationPlanDigest     string `json:"verificationPlanDigest"`
	CellID                     string `json:"cellId"`
}

type evaluationVerificationAttemptGrant struct {
	GrantID                       string                                            `json:"grantId"`
	GrantDigest                   string                                            `json:"grantDigest"`
	WorkspaceID                   string                                            `json:"workspaceId"`
	ProjectID                     string                                            `json:"projectId"`
	WorkspaceRevision             int64                                             `json:"workspaceRevision"`
	PartitionRevisionsDigest      string                                            `json:"partitionRevisionsDigest"`
	PolicyRevision                int64                                             `json:"policyRevision"`
	PolicyDigest                  string                                            `json:"policyDigest"`
	PolicyEvaluationInstant       string                                            `json:"policyEvaluationInstant"`
	ImpactDigest                  string                                            `json:"impactDigest"`
	VerificationPlanDigest        string                                            `json:"verificationPlanDigest"`
	CellID                        string                                            `json:"cellId"`
	CheckID                       string                                            `json:"checkId"`
	CheckKind                     string                                            `json:"checkKind"`
	TargetID                      string                                            `json:"targetId"`
	AttemptID                     string                                            `json:"attemptId"`
	RunID                         string                                            `json:"runId"`
	ProviderID                    string                                            `json:"providerId"`
	JobID                         string                                            `json:"jobId,omitempty"`
	SessionID                     string                                            `json:"sessionId,omitempty"`
	ProducerID                    string                                            `json:"producerId"`
	TrustCeiling                  backendverification.TrustClass                    `json:"trustCeiling"`
	RetentionRequest              backendverification.AuthoritativeRetentionRequest `json:"retentionRequest"`
	MaximumClosureEvidenceRecords int                                               `json:"maximumClosureEvidenceRecords"`
	IssuedBy                      string                                            `json:"issuedBy"`
	IssuedAt                      string                                            `json:"issuedAt"`
	ExpiresAt                     string                                            `json:"expiresAt"`
}

type evaluationVerificationAttemptGrantReceiptBase struct {
	Format                     string                             `json:"format"`
	Version                    int                                `json:"version"`
	NamespaceID                string                             `json:"namespaceId"`
	EvaluationPlanDigest       string                             `json:"evaluationPlanDigest"`
	RepositoryCommit           string                             `json:"repositoryCommit"`
	EvaluationAttemptID        string                             `json:"evaluationAttemptId"`
	DescriptorDigest           string                             `json:"descriptorDigest"`
	CapabilityDescriptorDigest string                             `json:"capabilityDescriptorDigest"`
	CaseID                     string                             `json:"caseId"`
	Generation                 int64                              `json:"generation"`
	VerificationPlanDigest     string                             `json:"verificationPlanDigest"`
	CellID                     string                             `json:"cellId"`
	RequestDigest              string                             `json:"requestDigest"`
	IssuanceBindingDigest      string                             `json:"issuanceBindingDigest"`
	Grant                      evaluationVerificationAttemptGrant `json:"grant"`
}

type evaluationVerificationAttemptGrantReceipt struct {
	evaluationVerificationAttemptGrantReceiptBase
	ReceiptDigest string `json:"receiptDigest"`
}

type evaluationAttemptDescriptorAuthorization struct {
	AttemptID                  string
	DescriptorDigest           string
	CapabilityDescriptorDigest string
	ShardID                    string
	CaseID                     string
	TargetID                   string
}

type evaluationAttemptDescriptorAuthorizer interface {
	AuthorizeEvaluationAttemptDescriptor(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		[]byte,
	) (evaluationAttemptDescriptorAuthorization, error)
}

func authorizeEvaluationAttemptDescriptor(
	planSource []byte,
	partition EvaluationPlanPartition,
	descriptorSource []byte,
) (evaluationAttemptDescriptorAuthorization, error) {
	descriptor, err := decodeEvaluationAttemptDescriptor(descriptorSource)
	if err != nil {
		return evaluationAttemptDescriptorAuthorization{}, err
	}
	if descriptor.PlanDigest != partition.PlanDigest {
		return evaluationAttemptDescriptorAuthorization{}, conflict("evaluation descriptor is outside the frozen plan partition")
	}
	if err := validateEvaluationAttemptPlanBinding(planSource, evaluationAttemptFact{
		PlanDigest:       descriptor.PlanDigest,
		AttemptID:        descriptor.AttemptID,
		DescriptorDigest: descriptor.DescriptorDigest,
		ShardID:          descriptor.ShardID,
		CaseID:           descriptor.CaseID,
		TargetID:         descriptor.TargetID,
		Value:            map[string]any{"descriptor": descriptor.Value},
	}); err != nil {
		return evaluationAttemptDescriptorAuthorization{}, err
	}
	return evaluationAttemptDescriptorAuthorization{
		AttemptID: descriptor.AttemptID, DescriptorDigest: descriptor.DescriptorDigest,
		CapabilityDescriptorDigest: descriptor.CapabilityDescriptorDigest,
		ShardID:                    descriptor.ShardID, CaseID: descriptor.CaseID, TargetID: descriptor.TargetID,
	}, nil
}

func (repository *Repository) AuthorizeEvaluationAttemptDescriptor(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	descriptorSource []byte,
) (evaluationAttemptDescriptorAuthorization, error) {
	plan, err := repository.GetEvaluationPlan(ctx, authority, partition)
	if err != nil {
		return evaluationAttemptDescriptorAuthorization{}, err
	}
	if plan.NamespaceID != authority.NamespaceID || plan.PlanDigest != partition.PlanDigest ||
		plan.RepositoryCommit != partition.RepositoryCommit {
		return evaluationAttemptDescriptorAuthorization{}, conflict("evaluation plan partition drifted during descriptor authorization")
	}
	return authorizeEvaluationAttemptDescriptor(plan.FactBytes, partition, descriptorSource)
}

func (input evaluationVerificationAttemptGrantIssue) base() evaluationVerificationAttemptGrantIssueBase {
	return evaluationVerificationAttemptGrantIssueBase{
		Format: input.Format, Version: input.Version,
		NamespaceID: input.NamespaceID, EvaluationPlanDigest: input.EvaluationPlanDigest,
		RepositoryCommit: input.RepositoryCommit, EvaluationAttemptID: input.EvaluationAttemptID,
		DescriptorDigest: input.DescriptorDigest, CapabilityDescriptorDigest: input.CapabilityDescriptorDigest,
		CaseID: input.CaseID, Descriptor: append(json.RawMessage(nil), input.Descriptor...), Generation: input.Generation,
		WorkspaceID: input.WorkspaceID, WorkspaceRevision: input.WorkspaceRevision,
		ProjectID: input.ProjectID, VerificationPlanDigest: input.VerificationPlanDigest,
		VerificationPlan: input.VerificationPlan, CellID: input.CellID,
		Run: input.Run, TrustCeiling: input.TrustCeiling, ExpiresAt: input.ExpiresAt,
	}
}

func (input evaluationVerificationAttemptGrantIssue) binding() evaluationVerificationAttemptGrantBinding {
	return evaluationVerificationAttemptGrantBinding{
		NamespaceID: input.NamespaceID, EvaluationPlanDigest: input.EvaluationPlanDigest,
		RepositoryCommit: input.RepositoryCommit, EvaluationAttemptID: input.EvaluationAttemptID,
		DescriptorDigest: input.DescriptorDigest, CapabilityDescriptorDigest: input.CapabilityDescriptorDigest,
		CaseID: input.CaseID, Generation: input.Generation,
		WorkspaceID: input.WorkspaceID, WorkspaceRevision: input.WorkspaceRevision, ProjectID: input.ProjectID,
		VerificationPlanDigest: input.VerificationPlanDigest, CellID: input.CellID,
	}
}

func evaluationVerificationGrantInstant(value time.Time) string {
	return value.UTC().Format("2006-01-02T15:04:05.000Z")
}

func evaluationVerificationGrantError(err error) error {
	switch {
	case errors.Is(err, backendverification.ErrInvalid):
		return ErrInvalid
	case errors.Is(err, backendverification.ErrUnauthorized):
		return ErrUnauthorized
	case errors.Is(err, backendverification.ErrNotFound):
		return ErrNotFound
	case errors.Is(err, backendverification.ErrConflict), errors.Is(err, backendverification.ErrExpired):
		return ErrConflict
	default:
		return err
	}
}

func evaluationVerificationAttemptGrantFromRecord(
	record backendverification.AttemptGrantRecord,
) evaluationVerificationAttemptGrant {
	return evaluationVerificationAttemptGrant{
		GrantID: record.ID, GrantDigest: record.GrantDigest,
		WorkspaceID: record.WorkspaceID, ProjectID: record.ProjectID,
		WorkspaceRevision: record.WorkspaceRevision, PartitionRevisionsDigest: record.PartitionRevisionsDigest,
		PolicyRevision: record.PolicyRevision, PolicyDigest: record.PolicyDigest,
		PolicyEvaluationInstant: evaluationVerificationGrantInstant(record.PolicyEvaluationInstant),
		ImpactDigest:            record.ImpactDigest, VerificationPlanDigest: record.PlanDigest,
		CellID: record.CellID, CheckID: record.CheckID, CheckKind: record.CheckKind,
		TargetID: record.TargetID, AttemptID: record.AttemptID,
		RunID: record.RunID, ProviderID: record.ProviderID, JobID: record.JobID,
		SessionID: record.SessionID, ProducerID: record.ProducerID,
		TrustCeiling: record.TrustCeiling, RetentionRequest: record.RetentionRequest,
		MaximumClosureEvidenceRecords: record.MaximumClosureEvidenceRecords,
		IssuedBy:                      record.IssuedBy, IssuedAt: evaluationVerificationGrantInstant(record.IssuedAt),
		ExpiresAt: evaluationVerificationGrantInstant(record.ExpiresAt),
	}
}

func (handler *EvaluationServiceHandler) handleVerificationAttemptGrants(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if !evaluationServiceQueryIsExact(request) || len(tail) < 1 || len(tail) > 2 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method == http.MethodGet {
		if request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		reader, ok := handler.repository.(evaluationVerificationAttemptGrantReceiptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		if len(tail) == 1 {
			records, err := reader.ListEvaluationVerificationAttemptGrantReceipts(
				request.Context(), handler.authority, partition,
			)
			if err != nil {
				respondEvaluationServiceError(writer, err)
				return
			}
			facts := make([]json.RawMessage, len(records))
			for index := range records {
				facts[index] = json.RawMessage(records[index].ReceiptBytes)
			}
			writeEvaluationServiceJSON(writer, http.StatusOK, struct {
				Facts []json.RawMessage `json:"facts"`
			}{Facts: facts})
			return
		}
		if !evaluationDigestPattern.MatchString(tail[1]) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, err := reader.GetEvaluationVerificationAttemptGrantReceipt(
			request.Context(), handler.authority, partition, tail[1],
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.ReceiptBytes, nil)
		return
	}
	if len(tail) != 1 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method != http.MethodPost {
		methodNotAllowed(writer, http.MethodGet, http.MethodPost)
		return
	}
	if handler.verificationAttemptGrantIssuer == nil {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	receiptStore, ok := handler.repository.(evaluationVerificationAttemptGrantReceiptStore)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationVerificationPlanBytes)
	if err != nil || canonicaljson.ValidateRawEnvelope(source, maximumEvaluationVerificationPlanBytes) != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	var input evaluationVerificationAttemptGrantIssue
	if err := decodeEvaluationServiceRawJSON(source, &input); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	expiresAt, expiresErr := parseEvaluationServiceInstant(input.ExpiresAt)
	requestDigest, digestErr := canonicaljson.Digest(input.base())
	bindingDigest, bindingErr := canonicaljson.Digest(input.binding())
	now := time.Now().UTC()
	if input.Format != evaluationVerificationAttemptGrantIssueFormat ||
		input.Version != evaluationVerificationAttemptGrantVersion ||
		input.NamespaceID != handler.authority.NamespaceID ||
		input.EvaluationPlanDigest != partition.PlanDigest ||
		input.RepositoryCommit != partition.RepositoryCommit ||
		!validEvaluationServiceIdentity(input.EvaluationAttemptID) ||
		!evaluationDigestPattern.MatchString(input.DescriptorDigest) ||
		!evaluationDigestPattern.MatchString(input.CapabilityDescriptorDigest) ||
		!validEvaluationServiceIdentity(input.CaseID) ||
		len(input.Descriptor) == 0 ||
		input.Generation < 1 || input.Generation > 9_007_199_254_740_991 ||
		!validEvaluationServiceIdentity(input.WorkspaceID) ||
		input.WorkspaceRevision < 1 || input.WorkspaceRevision > 9_007_199_254_740_991 ||
		!validEvaluationServiceIdentity(input.ProjectID) ||
		!evaluationDigestPattern.MatchString(input.VerificationPlanDigest) ||
		!validEvaluationServiceIdentity(input.CellID) ||
		expiresErr != nil || !expiresAt.After(now) || expiresAt.After(now.Add(maximumEvaluationVerificationGrantLifetime)) ||
		digestErr != nil || input.RequestDigest != requestDigest ||
		bindingErr != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationAttemptDescriptorAuthorizer)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	authorization, err := repository.AuthorizeEvaluationAttemptDescriptor(
		request.Context(), handler.authority, partition, append([]byte(nil), input.Descriptor...),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if authorization.AttemptID != input.EvaluationAttemptID ||
		authorization.DescriptorDigest != input.DescriptorDigest ||
		authorization.CapabilityDescriptorDigest != input.CapabilityDescriptorDigest ||
		authorization.CaseID != input.CaseID {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	issuedBy := "g4-evaluation." + strings.TrimPrefix(bindingDigest, "sha256-")
	record, err := handler.verificationAttemptGrantIssuer.IssueTrustedAttemptGrant(
		request.Context(),
		backendverification.TrustedAttemptGrantIssue{
			WorkspaceID: input.WorkspaceID, ProjectID: input.ProjectID,
			Plan: append(json.RawMessage(nil), input.VerificationPlan...), CellID: input.CellID,
			AttemptID: input.EvaluationAttemptID, Run: input.Run,
			ProducerID:   evaluationVerificationAttemptGrantProducerID,
			TrustCeiling: input.TrustCeiling, IssuedBy: issuedBy, ExpiresAt: expiresAt,
		},
	)
	if err != nil {
		respondEvaluationServiceError(writer, evaluationVerificationGrantError(err))
		return
	}
	if record.WorkspaceID != input.WorkspaceID || record.ProjectID != input.ProjectID ||
		record.WorkspaceRevision != input.WorkspaceRevision || record.PlanDigest != input.VerificationPlanDigest ||
		record.CellID != input.CellID || record.AttemptID != input.EvaluationAttemptID ||
		record.RunID != input.Run.RunID || record.ProviderID != input.Run.ProviderID ||
		record.JobID != input.Run.JobID || record.SessionID != input.Run.SessionID ||
		record.ProducerID != evaluationVerificationAttemptGrantProducerID ||
		record.TrustCeiling != input.TrustCeiling || record.IssuedBy != issuedBy ||
		record.ExpiresAt.UTC() != expiresAt.UTC() ||
		!evaluationDigestPattern.MatchString(record.GrantDigest) ||
		!validEvaluationServiceIdentity(record.ID) {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	grant := evaluationVerificationAttemptGrantFromRecord(record)
	receiptBase := evaluationVerificationAttemptGrantReceiptBase{
		Format: evaluationVerificationAttemptGrantReceiptFormat, Version: evaluationVerificationAttemptGrantVersion,
		NamespaceID:          input.NamespaceID,
		EvaluationPlanDigest: input.EvaluationPlanDigest, RepositoryCommit: input.RepositoryCommit,
		EvaluationAttemptID: input.EvaluationAttemptID, DescriptorDigest: input.DescriptorDigest,
		CapabilityDescriptorDigest: input.CapabilityDescriptorDigest, CaseID: input.CaseID,
		Generation: input.Generation, VerificationPlanDigest: input.VerificationPlanDigest, CellID: input.CellID,
		RequestDigest: requestDigest, IssuanceBindingDigest: bindingDigest, Grant: grant,
	}
	receiptDigest, err := canonicaljson.Digest(receiptBase)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	receipt := evaluationVerificationAttemptGrantReceipt{
		evaluationVerificationAttemptGrantReceiptBase: receiptBase,
		ReceiptDigest: receiptDigest,
	}
	durableReceipt, _, err := receiptStore.StoreEvaluationVerificationAttemptGrantReceipt(
		request.Context(), handler.authority, partition, input, receipt,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if durableReceipt.ReceiptDigest != receipt.ReceiptDigest ||
		durableReceipt.RequestDigest != receipt.RequestDigest ||
		durableReceipt.VerificationAttemptGrantDigest != receipt.Grant.GrantDigest {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, receipt)
}
