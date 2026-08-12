package agent

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"crypto/subtle"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"mime"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationServiceAuthorityPrincipal        = "prodivix.g4-model-evaluation-ledger"
	maximumEvaluationServiceFactBytes          = 8_388_608
	maximumEvaluationServiceControlBytes       = 65_536
	maximumEvaluationServiceAttemptCommitBytes = 52_428_800
	maximumEvaluationServiceHumanReviewBytes   = 25_296_896
	maximumEvaluationServiceResponseBytes      = 536_870_912
	maximumEvaluationServiceExportPageBytes    = 32 * 1_024 * 1_024
)

var (
	evaluationServiceRouteIdentityPattern = regexp.MustCompile(`^[A-Za-z0-9][A-Za-z0-9._:@-]{0,255}$`)
	errEvaluationServiceUnavailable       = errors.New("evaluation ledger capability is unavailable")
	errEvaluationServiceRequestTooLarge   = errors.New("evaluation ledger request is too large")
	errEvaluationServiceResponseTooLarge  = errors.New("evaluation ledger response is too large")
)

// EvaluationServiceHandlerConfig fixes transport authority at process startup.
// Request bodies and paths can select only an exact plan/commit partition; they
// can never select another namespace or principal.
type EvaluationServiceHandlerConfig struct {
	NamespaceID                                     string
	ServiceToken                                    string
	AttestationVerifier                             EvaluationAuthorityAttestationVerifier
	VerificationAttemptGrantIssuer                  backendverification.AttemptGrantIssuer
	ControlledWorkspaceAuthority                    EvaluationControlledWorkspaceAuthority
	ControlledWorkspaceResponseScanner              EvaluationControlledWorkspacePublicResponseScanner
	VerificationEvidenceAuthority                   EvaluationVerificationEvidenceAuthority
	VerificationEvidenceResponseScanner             EvaluationVerificationEvidencePublicResponseScanner
	G3CellAdmissionAuthority                        EvaluationG3CellAdmissionAuthority
	CapabilityProbeAdmissionAuthority               EvaluationCapabilityProbeAdmissionAuthority
	CapabilityProbeProviderResourceAuthority        EvaluationCapabilityProbeProviderResourceAuthority
	CapabilityProbeProviderResourceCleanupAuthority EvaluationCapabilityProbeProviderResourceCleanupAuthority
	RuntimeFactSourceRegistrationAuthority          EvaluationRuntimeFactSourceRegistrationAuthority
	NativeProviderStateVault                        *EvaluationNativeProviderStateVault
	CapabilityEffectProviderJournal                 *EvaluationCapabilityEffectProviderJournal
	HostedRetrievalRuntimeResource                  *EvaluationHostedRetrievalRuntimeResource
	HostedRetrievalRuntimeResourceRole              string
	AttemptAuthority                                EvaluationAttemptAuthority
	AttemptAuthorityResponseScanner                 EvaluationAttemptAuthorityPublicResponseScanner
	HoldoutSealAuthority                            EvaluationHoldoutSealAuthority
	HumanReviewAuthority                            EvaluationHumanReviewAuthority
	OwnerAuthorityPurpose                           string
	OwnerActivationRequired                         bool
	Clock                                           func() time.Time
}

// EvaluationServiceHandler exposes the append-only evaluation repository to a
// loopback runner without composing it into the main product HTTP surface.
type EvaluationServiceHandler struct {
	repository                                      any
	authority                                       EvaluationAuthority
	serviceTokenDigest                              [sha256.Size]byte
	exportCursorKey                                 [sha256.Size]byte
	exportCursorKeyBindingDigest                    string
	attestationVerifier                             EvaluationAuthorityAttestationVerifier
	verificationAttemptGrantIssuer                  backendverification.AttemptGrantIssuer
	controlledWorkspaceAuthority                    EvaluationControlledWorkspaceAuthority
	controlledWorkspaceResponseScanner              EvaluationControlledWorkspacePublicResponseScanner
	verificationEvidenceAuthority                   EvaluationVerificationEvidenceAuthority
	verificationEvidenceResponseScanner             EvaluationVerificationEvidencePublicResponseScanner
	g3CellAdmissionAuthority                        EvaluationG3CellAdmissionAuthority
	capabilityProbeAdmissionAuthority               EvaluationCapabilityProbeAdmissionAuthority
	capabilityProbeProviderResourceAuthority        EvaluationCapabilityProbeProviderResourceAuthority
	capabilityProbeProviderResourceCleanupAuthority EvaluationCapabilityProbeProviderResourceCleanupAuthority
	runtimeFactSourceRegistrationAuthority          EvaluationRuntimeFactSourceRegistrationAuthority
	nativeProviderStateVault                        *EvaluationNativeProviderStateVault
	capabilityEffectProviderJournal                 *EvaluationCapabilityEffectProviderJournal
	hostedRetrievalRuntimeResource                  *EvaluationHostedRetrievalRuntimeResource
	hostedRetrievalRuntimeResourceRole              string
	attemptAuthority                                EvaluationAttemptAuthority
	attemptAuthorityResponseScanner                 EvaluationAttemptAuthorityPublicResponseScanner
	holdoutSealAuthority                            EvaluationHoldoutSealAuthority
	humanReviewAuthority                            EvaluationHumanReviewAuthority
	ownerActivationMu                               sync.RWMutex
	ownerAuthorityPurpose                           string
	ownerActivationRequired                         bool
	ownerAuthorityHealthDigest                      string
	ownerActivatedAt                                time.Time
	clock                                           func() time.Time
}

// NewEvaluationServiceHandler hashes the bearer credential immediately and
// freezes one service authority for the handler lifetime.
func NewEvaluationServiceHandler(repository any, config EvaluationServiceHandlerConfig) (*EvaluationServiceHandler, error) {
	recoveryOnly := config.NativeProviderStateVault != nil && config.NativeProviderStateVault.RecoveryOnly()
	if repository == nil || !validEvaluationServiceIdentity(config.NamespaceID) ||
		!validEvaluationServiceToken(config.ServiceToken) ||
		(recoveryOnly && (config.OwnerActivationRequired || config.OwnerAuthorityPurpose != "")) ||
		(config.OwnerActivationRequired && !oneOfString(config.OwnerAuthorityPurpose, "preplan", "full-attempt")) ||
		(!config.OwnerActivationRequired && config.OwnerAuthorityPurpose != "") {
		return nil, ErrInvalid
	}
	if !oneOfString(config.HostedRetrievalRuntimeResourceRole, "", "preplan", "full-attempt", "prepare", "cleanup", "recovery") ||
		(config.HostedRetrievalRuntimeResourceRole == "" && config.HostedRetrievalRuntimeResource != nil) ||
		(config.HostedRetrievalRuntimeResourceRole != "" && config.HostedRetrievalRuntimeResource == nil) {
		return nil, ErrInvalid
	}
	namespaceDigest, err := canonicaljson.Digest(map[string]any{"namespace": config.NamespaceID})
	if err != nil {
		return nil, err
	}
	exportCursorKey := sha256.Sum256(append(
		[]byte("prodivix.agent-evaluation-export-cursor-key.v1\x00"), []byte(config.ServiceToken)...,
	))
	exportCursorKeyBindingDigest, err := canonicaljson.Digest(map[string]any{
		"format": "prodivix.agent-evaluation-export-cursor-key-binding", "version": int64(1),
		"namespaceDigest":   namespaceDigest,
		"keyMaterialDigest": fmt.Sprintf("sha256-%x", sha256.Sum256(exportCursorKey[:])),
	})
	if err != nil {
		return nil, err
	}
	clock := config.Clock
	if clock == nil {
		clock = time.Now
	}
	return &EvaluationServiceHandler{
		repository: repository,
		authority: EvaluationAuthority{
			Kind:        "service",
			PrincipalID: evaluationServiceAuthorityPrincipal,
			NamespaceID: config.NamespaceID,
		},
		serviceTokenDigest:                              sha256.Sum256([]byte(config.ServiceToken)),
		exportCursorKey:                                 exportCursorKey,
		exportCursorKeyBindingDigest:                    exportCursorKeyBindingDigest,
		attestationVerifier:                             config.AttestationVerifier,
		verificationAttemptGrantIssuer:                  config.VerificationAttemptGrantIssuer,
		controlledWorkspaceAuthority:                    config.ControlledWorkspaceAuthority,
		controlledWorkspaceResponseScanner:              config.ControlledWorkspaceResponseScanner,
		verificationEvidenceAuthority:                   config.VerificationEvidenceAuthority,
		verificationEvidenceResponseScanner:             config.VerificationEvidenceResponseScanner,
		g3CellAdmissionAuthority:                        config.G3CellAdmissionAuthority,
		capabilityProbeAdmissionAuthority:               config.CapabilityProbeAdmissionAuthority,
		capabilityProbeProviderResourceAuthority:        config.CapabilityProbeProviderResourceAuthority,
		capabilityProbeProviderResourceCleanupAuthority: config.CapabilityProbeProviderResourceCleanupAuthority,
		runtimeFactSourceRegistrationAuthority:          config.RuntimeFactSourceRegistrationAuthority,
		nativeProviderStateVault:                        config.NativeProviderStateVault,
		capabilityEffectProviderJournal:                 config.CapabilityEffectProviderJournal,
		hostedRetrievalRuntimeResource:                  config.HostedRetrievalRuntimeResource,
		hostedRetrievalRuntimeResourceRole:              config.HostedRetrievalRuntimeResourceRole,
		attemptAuthority:                                config.AttemptAuthority,
		attemptAuthorityResponseScanner:                 config.AttemptAuthorityResponseScanner,
		holdoutSealAuthority:                            config.HoldoutSealAuthority,
		humanReviewAuthority:                            config.HumanReviewAuthority,
		ownerAuthorityPurpose:                           config.OwnerAuthorityPurpose,
		ownerActivationRequired:                         config.OwnerActivationRequired,
		clock:                                           clock,
	}, nil
}

func validEvaluationServiceIdentity(value string) bool {
	return evaluationServiceRouteIdentityPattern.MatchString(value) &&
		!evaluationAuthenticityCredentialPattern.MatchString(value)
}

func validEvaluationServiceToken(value string) bool {
	if len(value) < 32 || len(value) > 4_096 {
		return false
	}
	padding := 0
	for _, character := range []byte(value) {
		if character == '=' {
			padding++
			if padding > 2 {
				return false
			}
			continue
		}
		if padding != 0 || !((character >= 'a' && character <= 'z') ||
			(character >= 'A' && character <= 'Z') || (character >= '0' && character <= '9') ||
			character == '.' || character == '_' || character == '~' || character == '+' ||
			character == '/' || character == '-') {
			return false
		}
	}
	return len(value)-padding >= 1
}

func (handler *EvaluationServiceHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	setEvaluationServiceHeaders(writer)
	recoveryOnly := handler.nativeProviderStateVault != nil && handler.nativeProviderStateVault.RecoveryOnly()
	if !recoveryOnly && request.URL != nil && request.URL.Path == "/healthz" {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		if !evaluationServiceQueryIsExact(request) || request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		if !handler.evaluationOwnerAuthorityActive() {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	if !handler.authorized(request) {
		writer.Header().Set("WWW-Authenticate", `Bearer realm="prodivix-g4-evaluation-ledger"`)
		writeEvaluationServiceError(writer, http.StatusUnauthorized, "EVAL-7001", "Evaluation ledger authorization failed.")
		return
	}
	if handler.hostedRetrievalRuntimeResource != nil &&
		handler.evaluationHostedRetrievalRuntimeResourceOwnerHealthRoute(request) {
		handler.handleEvaluationHostedRetrievalRuntimeResourceOwnerHealth(writer, request)
		return
	}
	if hostedRoute, ok := handler.evaluationHostedRetrievalRuntimeResourceRoute(request); ok &&
		handler.hostedRetrievalRuntimeResourceRole == "full-attempt" &&
		handler.evaluationHostedRetrievalRuntimeResourcePreactivationRoute(request) &&
		handler.evaluationHostedRetrievalRuntimeResourceRouteAllowed(hostedRoute, request) {
		handler.handleEvaluationHostedRetrievalRuntimeResource(writer, request, hostedRoute)
		return
	}
	if recoveryOnly {
		if hostedRoute, ok := handler.evaluationHostedRetrievalRuntimeResourceRoute(request); ok &&
			handler.evaluationHostedRetrievalRuntimeResourceRecoveryRouteAllowed(hostedRoute, request) {
			handler.handleEvaluationHostedRetrievalRuntimeResource(writer, request, hostedRoute)
			return
		}
		if handler.evaluationCapabilityEffectProviderJournalRecoveryRoute(request) {
			handler.handleEvaluationCapabilityEffectProviderJournal(writer, request)
			return
		}
		if handler.evaluationNativeProviderStateVaultRoute(request) {
			handler.handleEvaluationNativeProviderStateVault(writer, request)
			return
		}
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
		return
	}
	if hostedRoute, ok := handler.evaluationHostedRetrievalRuntimeResourceRoute(request); ok &&
		!handler.evaluationHostedRetrievalRuntimeResourceRouteAllowed(hostedRoute, request) {
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
		return
	}
	if handler.evaluationCapabilityEffectProviderJournalRoute(request) {
		if handler.ownerAuthorityPurpose == "preplan" &&
			!handler.evaluationCapabilityEffectProviderJournalHealthRoute(request) {
			writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
			return
		}
		handler.handleEvaluationCapabilityEffectProviderJournal(writer, request)
		return
	}
	if handler.evaluationOwnerActivationHealthRoute(request) {
		handler.handleEvaluationOwnerActivationHealth(writer, request)
		return
	}
	if !handler.evaluationOwnerAuthorityActive() && !handler.evaluationOwnerBootstrapDirectRoute(request) {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if hostedRoute, ok := handler.evaluationHostedRetrievalRuntimeResourceRoute(request); ok {
		if !handler.evaluationHostedRetrievalRuntimeResourceRouteAllowed(hostedRoute, request) {
			writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
			return
		}
		handler.handleEvaluationHostedRetrievalRuntimeResource(writer, request, hostedRoute)
		return
	}
	if handler.evaluationNativeProviderStateVaultRoute(request) {
		handler.handleEvaluationNativeProviderStateVault(writer, request)
		return
	}
	if handler.evaluationControlledWorkspaceOwnerLedgerHealthRoute(request) {
		handler.handleEvaluationControlledWorkspaceOwnerLedgerHealth(writer, request)
		return
	}
	if handler.evaluationProductionRunConfigArtifactRoute(request) {
		handler.handleEvaluationProductionRunConfigArtifact(writer, request)
		return
	}
	if cleanupRoute, repositoryCommit, ok := handler.evaluationCapabilityProbeProviderResourceCleanupRoute(request); ok {
		switch cleanupRoute {
		case "capability-probe-provider-resource-cleanups":
			handler.handleEvaluationCapabilityProbeProviderResourceCleanup(writer, request)
		case "capability-probe-provider-resource-cleanup-results":
			handler.handleEvaluationCapabilityProbeProviderResourceCleanupResultIngress(writer, request)
		default:
			handler.handleEvaluationCapabilityProbeProviderResourceCleanupList(writer, request, repositoryCommit)
		}
		return
	}
	if resourceRoute, ok := handler.evaluationCapabilityProbeProviderResourceRoute(request); ok {
		if resourceRoute == "capability-probe-provider-resource-registrations" {
			handler.handleEvaluationCapabilityProbeProviderResourceRegistration(writer, request)
		} else {
			handler.handleEvaluationCapabilityProbeProviderResourceResultIngress(writer, request)
		}
		return
	}
	if handler.evaluationCapabilityProbeResponseSpoolIngressRoute(request) {
		handler.handleEvaluationCapabilityProbeResponseSpoolIngress(writer, request)
		return
	}
	if handler.evaluationCapabilityProbeReferenceIngressRoute(request) {
		handler.handleEvaluationCapabilityProbeReferenceIngress(writer, request)
		return
	}
	if handler.evaluationRuntimeFactSourceOwnerRegistrationRoute(request) {
		handler.handleEvaluationRuntimeFactSourceOwnerRegistration(writer, request)
		return
	}
	if handler.evaluationCapabilityProbeAdmissionRoute(request) {
		handler.handleEvaluationCapabilityProbeAdmission(writer, request)
		return
	}
	partition, tail, err := handler.evaluationServiceRoute(request)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if len(tail) == 0 {
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
		return
	}
	switch tail[0] {
	case "plan":
		handler.handlePlan(writer, request, partition, tail)
	case "attempts":
		handler.handleAttempts(writer, request, partition, tail)
	case "attempt-commits":
		handler.handleAttemptCommits(writer, request, partition, tail)
	case "attempt-turns":
		handler.handleAttemptTurns(writer, request, partition, tail)
	case "verification-attempt-grants":
		handler.handleVerificationAttemptGrants(writer, request, partition, tail)
	case "checkpoints":
		handler.handleCheckpoints(writer, request, partition, tail)
	case "artifacts":
		handler.handleArtifacts(writer, request, partition, tail)
	case "review-candidates":
		handler.handleReviewCandidates(writer, request, partition, tail)
	case "blind-review-mappings":
		handler.handleBlindReviewMappings(writer, request, partition, tail)
	case "validated-human-review-artifact":
		handler.handleValidatedHumanReviewArtifact(writer, request, partition, tail)
	case "leases":
		handler.handleLeases(writer, request, partition, tail)
	case "budget":
		handler.handleBudget(writer, request, partition, tail)
	case "status":
		handler.handleStatus(writer, request, partition, tail)
	case "export-leases":
		handler.handleEvaluationExportLeases(writer, request, partition, tail)
	case "review-leases":
		handler.handleEvaluationReviewLeases(writer, request, partition, tail)
	case "controlled-workspace":
		handler.handleControlledWorkspace(writer, request, partition, tail)
	case "controlled-workspace-owner":
		handler.handleEvaluationControlledWorkspaceOwnerLedger(writer, request, partition, tail)
	case "verification-evidence":
		handler.handleVerificationEvidence(writer, request, partition, tail)
	case "owner-state-cas":
		handler.handleEvaluationOwnerStateCASIngress(writer, request, partition, tail)
	case "owner-state-results":
		handler.handleEvaluationOwnerStateResultIngress(writer, request, partition, tail)
	case "owner-states":
		handler.handleEvaluationOwnerStateRead(writer, request, partition, tail)
	case "attempt-authority-results":
		handler.handleEvaluationAttemptAuthorityResultIngress(writer, request, partition, tail)
	case "g3-cell-admission":
		handler.handleEvaluationG3CellAdmission(writer, request, partition, tail)
	case "optional-capability-fact-sources", "optional-capability-facts":
		handler.handleEvaluationOptionalFactAuthority(writer, request, partition, tail)
	case "capability-effect-request-ref-authorities", "capability-effect-current-turn-events", "capability-effect-input-authorities":
		handler.handleEvaluationCapabilityEffectInputAuthority(writer, request, partition, tail)
	case "capability-runtime", "attempt-grading":
		handler.handleEvaluationAttemptAuthority(writer, request, partition, tail)
	case "holdout-closure":
		handler.handleEvaluationHoldoutClosure(writer, request, partition, tail)
	case "finalization-intent":
		handler.handleEvaluationFinalizationIntent(writer, request, partition, tail)
	case "finalization-inspection":
		handler.handleEvaluationFinalizationInspection(writer, request, partition, tail)
	case "finalization":
		handler.handleEvaluationFinalization(writer, request, partition, tail)
	case "snapshot":
		handler.handleMonolithicSnapshotUnavailable(writer, request, tail, false)
	case "export":
		handler.handleMonolithicSnapshotUnavailable(writer, request, tail, true)
	case "receipts":
		handler.handleReceipts(writer, request, partition, tail)
	case "authority-attestation":
		handler.handleAuthorityAttestation(writer, request, partition, tail)
	case "evidence-root":
		handler.handleEvidenceRoot(writer, request, partition, tail)
	case "archive-closure":
		handler.handleArchiveClosure(writer, request, partition, tail)
	default:
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger route was not found.")
	}
}

func (handler *EvaluationServiceHandler) evaluationCapabilityProbeAdmissionRoute(request *http.Request) bool {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return false
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	return len(segments) == 4 && segments[0] == "v1" && segments[1] == "evaluations" &&
		segments[2] == handler.authority.NamespaceID && validEvaluationServiceIdentity(segments[2]) &&
		segments[3] == "capability-probe-admissions"
}

type evaluationValidatedHumanReviewWriter interface {
	StoreEvaluationValidatedHumanReviewArtifact(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		[]byte,
		[]byte,
		[]byte,
		string,
		EvaluationHumanReviewAuthority,
	) (EvaluationValidatedHumanReviewArtifactRecord, bool, error)
}

type evaluationValidatedHumanReviewReader interface {
	GetEvaluationValidatedHumanReviewArtifact(context.Context, EvaluationAuthority, EvaluationPlanPartition) (EvaluationValidatedHumanReviewArtifactRecord, error)
}

func writeEvaluationValidatedHumanReviewResponse(
	writer http.ResponseWriter,
	status int,
	record EvaluationValidatedHumanReviewArtifactRecord,
	replayed *bool,
) {
	writeEvaluationServiceJSON(writer, status, struct {
		ValidatedHumanReviewArtifact             json.RawMessage `json:"validatedHumanReviewArtifact"`
		HumanReviewReportFact                    json.RawMessage `json:"humanReviewReportFact"`
		ValidatedHumanMetricObservations         json.RawMessage `json:"validatedHumanMetricObservations"`
		ValidatedHumanMetricObservationSetDigest string          `json:"validatedHumanMetricObservationSetDigest"`
		Replayed                                 *bool           `json:"replayed,omitempty"`
	}{
		ValidatedHumanReviewArtifact:             json.RawMessage(record.ArtifactBytes),
		HumanReviewReportFact:                    json.RawMessage(record.HumanReviewReportFactBytes),
		ValidatedHumanMetricObservations:         json.RawMessage(record.ValidatedHumanMetricObservationBytes),
		ValidatedHumanMetricObservationSetDigest: record.ValidatedHumanMetricObservationSetDigest,
		Replayed:                                 replayed,
	})
}

func (handler *EvaluationServiceHandler) handleValidatedHumanReviewArtifact(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	switch request.Method {
	case http.MethodGet:
		if request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationValidatedHumanReviewReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationValidatedHumanReviewArtifact(
			request.Context(), handler.authority, partition,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationValidatedHumanReviewResponse(writer, http.StatusOK, record, nil)
	case http.MethodPut:
		if err := handler.requirePartition(request.Context(), partition); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		var body struct {
			ValidatedHumanReviewArtifact             json.RawMessage `json:"validatedHumanReviewArtifact"`
			HumanReviewReportFact                    json.RawMessage `json:"humanReviewReportFact"`
			ValidatedHumanMetricObservations         json.RawMessage `json:"validatedHumanMetricObservations"`
			ValidatedHumanMetricObservationSetDigest string          `json:"validatedHumanMetricObservationSetDigest"`
		}
		if err := decodeEvaluationServiceJSON(request, maximumEvaluationServiceHumanReviewBytes, &body); err != nil ||
			len(body.ValidatedHumanReviewArtifact) == 0 || len(body.HumanReviewReportFact) == 0 ||
			len(body.ValidatedHumanMetricObservations) == 0 ||
			!evaluationDigestPattern.MatchString(body.ValidatedHumanMetricObservationSetDigest) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationValidatedHumanReviewWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, replayed, err := repository.StoreEvaluationValidatedHumanReviewArtifact(
			request.Context(), handler.authority, partition,
			body.ValidatedHumanReviewArtifact, body.HumanReviewReportFact,
			body.ValidatedHumanMetricObservations, body.ValidatedHumanMetricObservationSetDigest,
			handler.humanReviewAuthority,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationValidatedHumanReviewResponse(writer, replayStatus(replayed), record, &replayed)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

type evaluationAttemptTurnWriter interface {
	StoreEvaluationTransportDispatchIntent(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte, int64, string, []byte) (EvaluationAttemptTurnRecord, bool, error)
	CloseEvaluationTransport(context.Context, EvaluationAuthority, EvaluationPlanPartition, string, int64, string, string, string, []byte, *EvaluationEncryptedResultSpool, []byte, time.Time) (EvaluationAttemptTurnRecord, bool, error)
}

type evaluationAttemptTurnReader interface {
	ListEvaluationAttemptTurns(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) ([]EvaluationAttemptTurnRecord, error)
	ReadEvaluationEncryptedResultSpool(context.Context, EvaluationAuthority, EvaluationPlanPartition, string, int64, string, string, int64, string) (EvaluationEncryptedResultSpoolRead, error)
}

type evaluationNativeOptionalBootstrapSourceReader interface {
	GetEvaluationNativeOptionalBootstrapSource(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		int64,
	) (EvaluationNativeOptionalBootstrapSourceReadRecord, error)
}

func evaluationAttemptTurnResponse(record EvaluationAttemptTurnRecord) (map[string]any, error) {
	value, err := canonicalEvaluationAttemptTurn(record)
	if err != nil {
		return nil, err
	}
	value["turnDigest"] = record.TurnDigest
	return value, nil
}

func (handler *EvaluationServiceHandler) scanEvaluationNativeOptionalBootstrapCloseIngress(
	ctx context.Context,
	source []byte,
) ([]byte, error) {
	if len(source) == 0 {
		return nil, nil
	}
	ingress, err := decodeEvaluationNativeOptionalBootstrapCloseIngress(source)
	if err != nil {
		return nil, err
	}
	if handler.attemptAuthorityResponseScanner == nil {
		return nil, errEvaluationServiceUnavailable
	}
	if err := handler.attemptAuthorityResponseScanner.ScanAttemptAuthorityPublicResponse(
		ctx,
		"native-optional-capability-bootstrap.close-ingress",
		ingress.IngressDigest,
		ingress.IngressBytes,
	); err != nil {
		return nil, ErrUnauthorized
	}
	return append([]byte(nil), ingress.IngressBytes...), nil
}

func (handler *EvaluationServiceHandler) handleAttemptTurns(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) < 2 || len(tail) > 4 || !validEvaluationServiceIdentity(tail[1]) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	attemptID := tail[1]
	if len(tail) == 4 && tail[3] == "native-optional-capability-bootstrap-source" {
		if request.Method != http.MethodGet || request.ContentLength != 0 || len(request.TransferEncoding) != 0 ||
			!evaluationServiceQueryIsExact(request) {
			if request.Method != http.MethodGet {
				methodNotAllowed(writer, http.MethodGet)
			} else {
				respondEvaluationServiceError(writer, ErrInvalid)
			}
			return
		}
		turnIndex, err := parseEvaluationServiceInt(tail[2], 0)
		if err != nil || turnIndex != 0 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationNativeOptionalBootstrapSourceReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		result, err := repository.GetEvaluationNativeOptionalBootstrapSource(
			request.Context(), handler.authority, partition, attemptID, turnIndex,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if len(result.ResponseBytes) == 0 || len(result.ResponseBytes) > maximumEvaluationNativeOptionalBootstrapReadBytes {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		writeEvaluationServiceRaw(writer, http.StatusOK, result.ResponseBytes)
		return
	}
	if len(tail) == 4 && tail[3] == "result-spool" {
		if request.Method != http.MethodGet || request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			if request.Method != http.MethodGet {
				methodNotAllowed(writer, http.MethodGet)
			} else {
				respondEvaluationServiceError(writer, ErrInvalid)
			}
			return
		}
		turnIndex, err := parseEvaluationServiceInt(tail[2], 0)
		if err != nil {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		query, err := evaluationServiceQuery(request, "shardId", "ownerId", "leaseGeneration", "expectedTurnDigest")
		if err != nil || !validEvaluationServiceIdentity(query.Get("shardId")) || !validEvaluationServiceIdentity(query.Get("ownerId")) ||
			!evaluationDigestPattern.MatchString(query.Get("expectedTurnDigest")) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		generation, err := parseEvaluationServiceInt(query.Get("leaseGeneration"), 1)
		if err != nil {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationAttemptTurnReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		result, err := repository.ReadEvaluationEncryptedResultSpool(
			request.Context(), handler.authority, partition, attemptID, turnIndex,
			query.Get("shardId"), query.Get("ownerId"), generation, query.Get("expectedTurnDigest"),
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, struct {
			EncryptedResultSpool struct {
				AAD                   json.RawMessage `json:"aad"`
				Envelope              json.RawMessage `json:"envelope"`
				ResponseDigest        string          `json:"responseDigest"`
				RetentionPolicyDigest string          `json:"retentionPolicyDigest"`
				ExpiresAt             string          `json:"expiresAt"`
			} `json:"encryptedResultSpool"`
			ResultSpoolReceipt json.RawMessage `json:"resultSpoolReceipt"`
			AccessReceipt      json.RawMessage `json:"accessReceipt"`
		}{
			EncryptedResultSpool: struct {
				AAD                   json.RawMessage `json:"aad"`
				Envelope              json.RawMessage `json:"envelope"`
				ResponseDigest        string          `json:"responseDigest"`
				RetentionPolicyDigest string          `json:"retentionPolicyDigest"`
				ExpiresAt             string          `json:"expiresAt"`
			}{
				AAD: json.RawMessage(result.AAD), Envelope: json.RawMessage(result.Envelope),
				ResponseDigest: result.ResponseDigest, RetentionPolicyDigest: result.RetentionPolicyDigest,
				ExpiresAt: evaluationExportInstant(result.ExpiresAt),
			},
			ResultSpoolReceipt: json.RawMessage(result.ResultSpoolReceipt.ReceiptBytes),
			AccessReceipt:      json.RawMessage(result.AccessReceipt),
		})
		return
	}
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if len(tail) == 2 {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		repository, ok := handler.repository.(evaluationAttemptTurnReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		turns, err := repository.ListEvaluationAttemptTurns(request.Context(), handler.authority, partition, attemptID)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		values := make([]map[string]any, len(turns))
		for index, turn := range turns {
			values[index], err = evaluationAttemptTurnResponse(turn)
			if err != nil {
				respondEvaluationServiceError(writer, err)
				return
			}
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, struct {
			Turns []map[string]any `json:"turns"`
		}{Turns: values})
		return
	}
	if len(tail) != 4 || !oneOfString(tail[3], "dispatch", "close") || request.Method != http.MethodPut {
		if len(tail) == 4 && request.Method != http.MethodPut {
			methodNotAllowed(writer, http.MethodPut)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	turnIndex, err := parseEvaluationServiceInt(tail[2], 0)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	repository, ok := handler.repository.(evaluationAttemptTurnWriter)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if tail[3] == "dispatch" {
		var body struct {
			Descriptor          json.RawMessage `json:"descriptor"`
			BudgetReservationID string          `json:"budgetReservationId"`
			DispatchIntent      json.RawMessage `json:"dispatchIntent"`
		}
		if err := decodeEvaluationServiceJSON(request, maximumEvaluationServiceAttemptCommitBytes, &body); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		descriptor, err := decodeEvaluationAttemptDescriptor(body.Descriptor)
		if err != nil || descriptor.AttemptID != attemptID {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		turn, replayed, err := repository.StoreEvaluationTransportDispatchIntent(
			request.Context(), handler.authority, partition, body.Descriptor, turnIndex,
			body.BudgetReservationID, body.DispatchIntent,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		value, err := evaluationAttemptTurnResponse(turn)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceJSON(writer, replayStatus(replayed), struct {
			Turn     map[string]any `json:"turn"`
			Replayed bool           `json:"replayed"`
		}{Turn: value, Replayed: replayed})
		return
	}
	var body struct {
		DescriptorDigest                         string          `json:"descriptorDigest"`
		BudgetReservationID                      string          `json:"budgetReservationId"`
		ExpectedIntentDigest                     string          `json:"expectedIntentDigest"`
		TransportReceipt                         json.RawMessage `json:"transportReceipt"`
		EncryptedResultSpool                     json.RawMessage `json:"encryptedResultSpool,omitempty"`
		NativeOptionalCapabilityBootstrapIngress json.RawMessage `json:"nativeOptionalCapabilityBootstrapIngress,omitempty"`
		ClosedAt                                 string          `json:"closedAt"`
	}
	if err := decodeEvaluationServiceJSON(request, maximumEvaluationServiceAttemptCommitBytes, &body); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	closedAt, err := parseEvaluationServiceInstant(body.ClosedAt)
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	body.NativeOptionalCapabilityBootstrapIngress, err = handler.scanEvaluationNativeOptionalBootstrapCloseIngress(
		request.Context(), body.NativeOptionalCapabilityBootstrapIngress,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	var spool *EvaluationEncryptedResultSpool
	if len(body.EncryptedResultSpool) != 0 {
		var raw struct {
			AAD                   json.RawMessage `json:"aad"`
			Envelope              json.RawMessage `json:"envelope"`
			ResponseDigest        string          `json:"responseDigest"`
			RetentionPolicyDigest string          `json:"retentionPolicyDigest"`
			ExpiresAt             string          `json:"expiresAt"`
		}
		if err := decodeEvaluationServiceRawJSON(body.EncryptedResultSpool, &raw); err != nil {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		expiresAt, err := parseEvaluationServiceInstant(raw.ExpiresAt)
		if err != nil {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		spool = &EvaluationEncryptedResultSpool{
			AAD: append([]byte(nil), raw.AAD...), Envelope: append([]byte(nil), raw.Envelope...),
			ResponseDigest: raw.ResponseDigest, RetentionPolicyDigest: raw.RetentionPolicyDigest, ExpiresAt: expiresAt,
		}
	}
	turn, replayed, err := repository.CloseEvaluationTransport(
		request.Context(), handler.authority, partition, attemptID, turnIndex, body.DescriptorDigest,
		body.BudgetReservationID, body.ExpectedIntentDigest, body.TransportReceipt, spool,
		body.NativeOptionalCapabilityBootstrapIngress, closedAt,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	value, err := evaluationAttemptTurnResponse(turn)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceJSON(writer, replayStatus(replayed), struct {
		Turn     map[string]any `json:"turn"`
		Replayed bool           `json:"replayed"`
	}{Turn: value, Replayed: replayed})
}

type evaluationBlindReviewMappingWriter interface {
	CreateEvaluationBlindReviewMapping(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationBlindReviewMappingRecord, bool, error)
}

type evaluationBlindReviewMappingReader interface {
	GetEvaluationBlindReviewMappingByCandidateID(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationBlindReviewMappingRecord, error)
	GetEvaluationBlindReviewMappingByPresentationID(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationBlindReviewMappingRecord, error)
	ListEvaluationBlindReviewMappings(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationBlindReviewMappingRecord, error)
}

// handleBlindReviewMappings keeps the authority mapping on the authenticated
// ledger surface. Reviewer-facing projection APIs consume only randomized
// presentation identifiers and never receive these mapping facts.
func (handler *EvaluationServiceHandler) handleBlindReviewMappings(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, readOK := handler.repository.(evaluationBlindReviewMappingReader)
	if len(tail) == 1 {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		if !readOK {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationBlindReviewMappings(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts := make([]json.RawMessage, len(records))
		for index := range records {
			facts[index] = json.RawMessage(records[index].MappingBytes)
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, struct {
			Facts []json.RawMessage `json:"facts"`
		}{Facts: facts})
		return
	}
	if len(tail) != 3 || !oneOfString(tail[1], "candidates", "presentations") {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	identity := tail[2]
	if tail[1] == "candidates" && !validEvaluationServiceIdentity(identity) ||
		tail[1] == "presentations" && !validEvaluationRandomizedPresentationID(identity) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method == http.MethodGet {
		if !readOK {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		var record EvaluationBlindReviewMappingRecord
		var err error
		if tail[1] == "candidates" {
			record, err = repository.GetEvaluationBlindReviewMappingByCandidateID(
				request.Context(), handler.authority, partition, identity,
			)
		} else {
			record, err = repository.GetEvaluationBlindReviewMappingByPresentationID(
				request.Context(), handler.authority, partition, identity,
			)
		}
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.MappingBytes, nil)
		return
	}
	if tail[1] != "candidates" {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	if request.Method != http.MethodPut {
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
		return
	}
	writeRepository, ok := handler.repository.(evaluationBlindReviewMappingWriter)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	record, replayed, err := writeRepository.CreateEvaluationBlindReviewMapping(
		request.Context(), handler.authority, partition, identity,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if record.CandidateID != identity || record.PlanDigest != partition.PlanDigest ||
		record.RepositoryCommit != partition.RepositoryCommit {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeEvaluationServiceFact(writer, replayStatus(replayed), record.MappingBytes, &replayed)
}

func setEvaluationServiceHeaders(writer http.ResponseWriter) {
	writer.Header().Set("Cache-Control", "no-store")
	writer.Header().Set("Content-Security-Policy", "default-src 'none'")
	writer.Header().Set("X-Content-Type-Options", "nosniff")
}

func (handler *EvaluationServiceHandler) authorized(request *http.Request) bool {
	values := request.Header.Values("Authorization")
	candidate := ""
	wellFormed := len(values) == 1 && strings.HasPrefix(values[0], "Bearer ") &&
		len(values[0]) > len("Bearer ") && strings.TrimSpace(values[0]) == values[0]
	if wellFormed {
		candidate = strings.TrimPrefix(values[0], "Bearer ")
		wellFormed = !strings.ContainsAny(candidate, " \t\r\n") && len(candidate) <= 4_096
	}
	candidateDigest := sha256.Sum256([]byte(candidate))
	matched := subtle.ConstantTimeCompare(candidateDigest[:], handler.serviceTokenDigest[:]) == 1
	return wellFormed && matched
}

func (handler *EvaluationServiceHandler) evaluationServiceRoute(request *http.Request) (EvaluationPlanPartition, []string, error) {
	if request.URL == nil || strings.Contains(strings.ToLower(request.URL.EscapedPath()), "%2f") ||
		strings.HasSuffix(request.URL.Path, "/") {
		return EvaluationPlanPartition{}, nil, ErrInvalid
	}
	segments := strings.Split(strings.TrimPrefix(request.URL.Path, "/"), "/")
	if len(segments) < 6 || segments[0] != "v1" || segments[1] != "evaluations" {
		return EvaluationPlanPartition{}, nil, ErrNotFound
	}
	if !validEvaluationServiceIdentity(segments[2]) || segments[2] != handler.authority.NamespaceID {
		return EvaluationPlanPartition{}, nil, ErrUnauthorized
	}
	partition := EvaluationPlanPartition{PlanDigest: segments[3], RepositoryCommit: segments[4]}
	if err := validateEvaluationPartition(partition); err != nil {
		return EvaluationPlanPartition{}, nil, err
	}
	for _, segment := range segments[5:] {
		if segment == "" || strings.Contains(segment, "/") {
			return EvaluationPlanPartition{}, nil, ErrInvalid
		}
	}
	return partition, segments[5:], nil
}

type evaluationPlanWriter interface {
	StoreEvaluationPlan(context.Context, EvaluationAuthority, []byte) (EvaluationFactRecord, bool, error)
}

type evaluationPlanReader interface {
	GetEvaluationPlan(context.Context, EvaluationAuthority, EvaluationPlanPartition) (EvaluationPlanRecord, error)
}

func (handler *EvaluationServiceHandler) handlePlan(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	switch request.Method {
	case http.MethodPut:
		repository, ok := handler.repository.(evaluationPlanWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		plan, err := decodeEvaluationPlan(source)
		if err != nil || plan.PlanDigest != partition.PlanDigest || plan.RepositoryCommit != partition.RepositoryCommit {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := repository.StoreEvaluationPlan(request.Context(), handler.authority, source)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if record.PlanDigest != partition.PlanDigest || record.FactID != plan.PlanID {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		writeEvaluationServiceFact(writer, replayStatus(replayed), record.FactBytes, &replayed)
	case http.MethodGet:
		repository, ok := handler.repository.(evaluationPlanReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationPlan(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.FactBytes, nil)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

type evaluationAttemptWriter interface {
	StoreEvaluationAttempt(context.Context, EvaluationAuthority, []byte) (EvaluationFactRecord, bool, error)
}

type evaluationAttemptReader interface {
	GetEvaluationAttempt(context.Context, EvaluationAuthority, EvaluationPlanPartition, EvaluationAttemptSelector) (EvaluationAttemptRecord, error)
	ListEvaluationAttempts(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationAttemptRecord, error)
}

func (handler *EvaluationServiceHandler) handleAttempts(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if len(tail) == 1 && request.Method == http.MethodGet {
		repository, ok := handler.repository.(evaluationAttemptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationAttempts(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts := make([]json.RawMessage, len(records))
		for index, record := range records {
			facts[index] = json.RawMessage(record.FactBytes)
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, struct {
			Facts []json.RawMessage `json:"facts"`
		}{Facts: facts})
		return
	}
	if len(tail) != 2 || !validEvaluationServiceIdentity(tail[1]) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	attemptID := tail[1]
	switch request.Method {
	case http.MethodPut:
		if err := handler.requirePartition(request.Context(), partition); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		repository, ok := handler.repository.(evaluationAttemptWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		attempt, err := decodeEvaluationAttempt(source)
		if err != nil || attempt.PlanDigest != partition.PlanDigest || attempt.AttemptID != attemptID {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := repository.StoreEvaluationAttempt(request.Context(), handler.authority, source)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if record.PlanDigest != partition.PlanDigest || record.FactID != attemptID {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		writeEvaluationServiceFact(writer, replayStatus(replayed), record.FactBytes, &replayed)
	case http.MethodGet:
		repository, ok := handler.repository.(evaluationAttemptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationAttempt(request.Context(), handler.authority, partition, EvaluationAttemptSelector{AttemptID: attemptID})
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.FactBytes, nil)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

type evaluationAttemptEvidenceCommitter interface {
	CommitEvaluationAttemptEvidenceV3(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationAttemptEvidenceCommitV3,
	) (EvaluationAttemptEvidenceCommitResultV3, bool, error)
}

type evaluationServiceAttemptCommitRequest struct {
	PreDispatchFailureReceipts             []json.RawMessage `json:"preDispatchFailureReceipts"`
	TransportDispatchIntents               []json.RawMessage `json:"transportDispatchIntents"`
	TransportReceipts                      []json.RawMessage `json:"transportReceipts"`
	ProviderResultSpoolReceipts            []json.RawMessage `json:"providerResultSpoolReceipts"`
	ProviderResultSpoolDispositionReceipts []json.RawMessage `json:"providerResultSpoolDispositionReceipts"`
	InvocationTurnReceipts                 []json.RawMessage `json:"invocationTurnReceipts"`
	InvocationTurnSetReceipt               json.RawMessage   `json:"invocationTurnSetReceipt"`
	CapabilityExecutionReceipts            []json.RawMessage `json:"capabilityExecutionReceipts"`
	CapabilitySpecificReceipts             []json.RawMessage `json:"capabilitySpecificReceipts"`
	AttemptAuthorityOwnerReceipts          []json.RawMessage `json:"attemptAuthorityOwnerReceipts"`
	VerificationAttemptGrantReceipts       []json.RawMessage `json:"verificationAttemptGrantReceipts"`
	SourceReceipts                         []json.RawMessage `json:"sourceReceipts"`
	ExecutionReceipt                       json.RawMessage   `json:"executionReceipt"`
	ResultSubmissionReceipt                json.RawMessage   `json:"resultSubmissionReceipt,omitempty"`
	ControlledRuntimeReceipt               json.RawMessage   `json:"controlledRuntimeReceipt,omitempty"`
	AttemptFact                            json.RawMessage   `json:"attemptFact"`
	BudgetSettlement                       struct {
		ReservationID    string          `json:"reservationId"`
		ExpectedRevision int64           `json:"expectedRevision"`
		Settlement       json.RawMessage `json:"settlement"`
	} `json:"budgetSettlement"`
}

func evaluationServiceRawMessages(values []json.RawMessage) [][]byte {
	result := make([][]byte, len(values))
	for index := range values {
		result[index] = append([]byte(nil), values[index]...)
	}
	return result
}

func (handler *EvaluationServiceHandler) handleAttemptCommits(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 2 || request.Method != http.MethodPut ||
		!validEvaluationServiceIdentity(tail[1]) || !evaluationServiceQueryIsExact(request) {
		if len(tail) == 2 && request.Method != http.MethodPut {
			methodNotAllowed(writer, http.MethodPut)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	repository, ok := handler.repository.(evaluationAttemptEvidenceCommitter)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	var body evaluationServiceAttemptCommitRequest
	if err := decodeEvaluationServiceJSON(request, maximumEvaluationServiceAttemptCommitBytes, &body); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	input := EvaluationAttemptEvidenceCommitV3{
		PreDispatchFailureReceipts:             evaluationServiceRawMessages(body.PreDispatchFailureReceipts),
		TransportDispatchIntents:               evaluationServiceRawMessages(body.TransportDispatchIntents),
		TransportReceipts:                      evaluationServiceRawMessages(body.TransportReceipts),
		ProviderResultSpoolReceipts:            evaluationServiceRawMessages(body.ProviderResultSpoolReceipts),
		ProviderResultSpoolDispositionReceipts: evaluationServiceRawMessages(body.ProviderResultSpoolDispositionReceipts),
		InvocationTurnReceipts:                 evaluationServiceRawMessages(body.InvocationTurnReceipts),
		InvocationTurnSetReceipt:               append([]byte(nil), body.InvocationTurnSetReceipt...),
		CapabilityExecutionReceipts:            evaluationServiceRawMessages(body.CapabilityExecutionReceipts),
		CapabilitySpecificReceipts:             evaluationServiceRawMessages(body.CapabilitySpecificReceipts),
		AttemptAuthorityOwnerReceipts:          evaluationServiceRawMessages(body.AttemptAuthorityOwnerReceipts),
		VerificationAttemptGrantReceipts:       evaluationServiceRawMessages(body.VerificationAttemptGrantReceipts),
		SourceReceipts:                         evaluationServiceRawMessages(body.SourceReceipts),
		ExecutionReceipt:                       append([]byte(nil), body.ExecutionReceipt...),
		ResultSubmissionReceipt:                append([]byte(nil), body.ResultSubmissionReceipt...),
		ControlledRuntimeReceipt:               append([]byte(nil), body.ControlledRuntimeReceipt...),
		AttemptFact:                            append([]byte(nil), body.AttemptFact...),
		BudgetSettlement: EvaluationAttemptBudgetSettlement{
			ReservationID:    body.BudgetSettlement.ReservationID,
			ExpectedRevision: body.BudgetSettlement.ExpectedRevision,
			SettlementBytes:  append([]byte(nil), body.BudgetSettlement.Settlement...),
		},
	}
	attempt, err := decodeEvaluationAttempt(input.AttemptFact)
	if err != nil || attempt.PlanDigest != partition.PlanDigest || attempt.AttemptID != tail[1] {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	result, replayed, err := repository.CommitEvaluationAttemptEvidenceV3(
		request.Context(), handler.authority, partition, input,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if result.Attempt.PlanDigest != partition.PlanDigest || result.Attempt.FactID != tail[1] {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	sourceReceipts := make([]json.RawMessage, len(result.SourceReceipts))
	for index, record := range result.SourceReceipts {
		sourceReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	transportDispatchIntents := make([]json.RawMessage, len(result.TransportDispatchIntents))
	for index, record := range result.TransportDispatchIntents {
		transportDispatchIntents[index] = json.RawMessage(record.IntentBytes)
	}
	transportReceipts := make([]json.RawMessage, len(result.TransportReceipts))
	for index, record := range result.TransportReceipts {
		transportReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	spoolReceipts := make([]json.RawMessage, len(result.ProviderResultSpoolReceipts))
	for index, record := range result.ProviderResultSpoolReceipts {
		spoolReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	dispositionReceipts := make([]json.RawMessage, len(result.ProviderResultSpoolDispositionReceipts))
	for index, record := range result.ProviderResultSpoolDispositionReceipts {
		dispositionReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	turnReceipts := make([]json.RawMessage, len(result.InvocationTurnReceipts))
	for index, record := range result.InvocationTurnReceipts {
		turnReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	preDispatchFailureReceipts := make([]json.RawMessage, len(result.PreDispatchFailureReceipts))
	for index, record := range result.PreDispatchFailureReceipts {
		preDispatchFailureReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	capabilityExecutionReceipts := make([]json.RawMessage, len(result.CapabilityExecutionReceipts))
	for index, record := range result.CapabilityExecutionReceipts {
		capabilityExecutionReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	capabilitySpecificReceipts := make([]json.RawMessage, len(result.CapabilitySpecificReceipts))
	for index, record := range result.CapabilitySpecificReceipts {
		capabilitySpecificReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	attemptAuthorityOwnerReceipts := make([]json.RawMessage, len(result.AttemptAuthorityOwnerReceipts))
	for index, record := range result.AttemptAuthorityOwnerReceipts {
		attemptAuthorityOwnerReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	verificationAttemptGrantReceipts := make([]json.RawMessage, len(result.VerificationAttemptGrantReceipts))
	for index, record := range result.VerificationAttemptGrantReceipts {
		verificationAttemptGrantReceipts[index] = json.RawMessage(record.ReceiptBytes)
	}
	writeEvaluationServiceJSON(writer, replayStatus(replayed), struct {
		PreDispatchFailureReceipts             []json.RawMessage                         `json:"preDispatchFailureReceipts"`
		TransportDispatchIntents               []json.RawMessage                         `json:"transportDispatchIntents"`
		TransportReceipts                      []json.RawMessage                         `json:"transportReceipts"`
		ProviderResultSpoolReceipts            []json.RawMessage                         `json:"providerResultSpoolReceipts"`
		ProviderResultSpoolDispositionReceipts []json.RawMessage                         `json:"providerResultSpoolDispositionReceipts"`
		InvocationTurnReceipts                 []json.RawMessage                         `json:"invocationTurnReceipts"`
		InvocationTurnSetReceipt               json.RawMessage                           `json:"invocationTurnSetReceipt"`
		CapabilityExecutionReceipts            []json.RawMessage                         `json:"capabilityExecutionReceipts"`
		CapabilitySpecificReceipts             []json.RawMessage                         `json:"capabilitySpecificReceipts"`
		AttemptAuthorityOwnerReceipts          []json.RawMessage                         `json:"attemptAuthorityOwnerReceipts"`
		VerificationAttemptGrantReceipts       []json.RawMessage                         `json:"verificationAttemptGrantReceipts"`
		SourceReceipts                         []json.RawMessage                         `json:"sourceReceipts"`
		ExecutionReceipt                       json.RawMessage                           `json:"executionReceipt"`
		ResultSubmissionReceipt                json.RawMessage                           `json:"resultSubmissionReceipt,omitempty"`
		ControlledRuntimeReceipt               json.RawMessage                           `json:"controlledRuntimeReceipt,omitempty"`
		AttemptFact                            json.RawMessage                           `json:"attemptFact"`
		BudgetSettlement                       evaluationServiceBudgetSettlementResponse `json:"budgetSettlement"`
		Replayed                               bool                                      `json:"replayed"`
	}{
		PreDispatchFailureReceipts: preDispatchFailureReceipts,
		TransportDispatchIntents:   transportDispatchIntents, TransportReceipts: transportReceipts,
		ProviderResultSpoolReceipts: spoolReceipts, ProviderResultSpoolDispositionReceipts: dispositionReceipts,
		InvocationTurnReceipts: turnReceipts, InvocationTurnSetReceipt: json.RawMessage(result.InvocationTurnSetReceipt.ReceiptBytes),
		CapabilityExecutionReceipts:      capabilityExecutionReceipts,
		CapabilitySpecificReceipts:       capabilitySpecificReceipts,
		AttemptAuthorityOwnerReceipts:    attemptAuthorityOwnerReceipts,
		VerificationAttemptGrantReceipts: verificationAttemptGrantReceipts,
		SourceReceipts:                   sourceReceipts, ExecutionReceipt: json.RawMessage(result.ExecutionReceipt.ReceiptBytes),
		ResultSubmissionReceipt: func() json.RawMessage {
			if result.ResultSubmissionReceipt == nil {
				return nil
			}
			return json.RawMessage(result.ResultSubmissionReceipt.ReceiptBytes)
		}(),
		ControlledRuntimeReceipt: func() json.RawMessage {
			if result.ControlledRuntimeReceipt == nil {
				return nil
			}
			return json.RawMessage(result.ControlledRuntimeReceipt.ReceiptBytes)
		}(),
		AttemptFact:      json.RawMessage(result.Attempt.FactBytes),
		BudgetSettlement: evaluationBudgetSettlementResponse(result.BudgetSettlement, nil),
		Replayed:         replayed,
	})
}

type evaluationCheckpointWriter interface {
	StoreEvaluationCheckpoint(context.Context, EvaluationAuthority, int64, []byte) (EvaluationFactRecord, bool, error)
}

type evaluationCheckpointReader interface {
	GetLatestEvaluationCheckpoint(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationCheckpointRecord, error)
	ListEvaluationCheckpoints(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationCheckpointRecord, error)
}

func (handler *EvaluationServiceHandler) handleCheckpoints(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) == 1 && request.Method == http.MethodGet && evaluationServiceQueryIsExact(request) {
		repository, ok := handler.repository.(evaluationCheckpointReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationCheckpoints(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts := make([]json.RawMessage, len(records))
		for index, record := range records {
			facts[index] = json.RawMessage(record.FactBytes)
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, struct {
			Facts []json.RawMessage `json:"facts"`
		}{Facts: facts})
		return
	}
	if len(tail) == 2 && request.Method == http.MethodGet && validEvaluationServiceIdentity(tail[1]) && evaluationServiceQueryIsExact(request) {
		repository, ok := handler.repository.(evaluationCheckpointReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetLatestEvaluationCheckpoint(request.Context(), handler.authority, partition, tail[1])
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.FactBytes, nil)
		return
	}
	if len(tail) != 3 || request.Method != http.MethodPut || !validEvaluationServiceIdentity(tail[1]) {
		if len(tail) == 3 && request.Method != http.MethodPut {
			methodNotAllowed(writer, http.MethodPut)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	revision, err := parseEvaluationServiceInt(tail[2], 0)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	query, err := evaluationServiceQuery(request, "expectedPreviousRevision")
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	expected, err := parseEvaluationServiceInt(query.Get("expectedPreviousRevision"), -1)
	if err != nil || revision != expected+1 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	repository, ok := handler.repository.(evaluationCheckpointWriter)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	checkpoint, err := decodeEvaluationCheckpoint(source)
	if err != nil || checkpoint.PlanDigest != partition.PlanDigest || checkpoint.ShardID != tail[1] || checkpoint.Revision != revision {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	record, replayed, err := repository.StoreEvaluationCheckpoint(request.Context(), handler.authority, expected, source)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if record.PlanDigest != partition.PlanDigest || record.FactID != fmt.Sprintf("%s@%d", tail[1], revision) {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeEvaluationServiceFact(writer, replayStatus(replayed), record.FactBytes, &replayed)
}

type evaluationArtifactWriter interface {
	StoreEvaluationArtifact(context.Context, EvaluationAuthority, string, []byte) (EvaluationFactRecord, bool, error)
}

type evaluationArtifactReader interface {
	GetEvaluationArtifact(context.Context, EvaluationAuthority, EvaluationPlanPartition, EvaluationArtifactSelector) (EvaluationArtifactRecord, error)
	ListEvaluationArtifacts(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) ([]EvaluationArtifactRecord, error)
}

type evaluationReviewCandidateWriter interface {
	StoreEvaluationReviewCandidate(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte) (EvaluationReviewCandidateRecord, bool, error)
}

type evaluationReviewCandidateReader interface {
	GetEvaluationReviewCandidate(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationReviewCandidateRecord, error)
	ListEvaluationReviewCandidateRefs(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationReviewCandidateRef, error)
}

func (handler *EvaluationServiceHandler) handleReviewCandidates(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	repository, ok := handler.repository.(evaluationReviewCandidateReader)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if len(tail) == 1 {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		if !evaluationServiceQueryIsExact(request) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		references, err := repository.ListEvaluationReviewCandidateRefs(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		values := make([]map[string]any, len(references))
		for index, reference := range references {
			values[index] = canonicalEvaluationReviewCandidateRef(reference)
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, struct {
			Candidates []map[string]any `json:"candidates"`
		}{Candidates: values})
		return
	}
	if len(tail) != 2 || !validEvaluationServiceIdentity(tail[1]) || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	attemptID := tail[1]
	switch request.Method {
	case http.MethodGet:
		record, err := repository.GetEvaluationReviewCandidate(request.Context(), handler.authority, partition, attemptID)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.CandidateBytes, nil)
	case http.MethodPut:
		if err := handler.requirePartition(request.Context(), partition); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writerRepository, ok := handler.repository.(evaluationReviewCandidateWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		candidate, err := decodeEvaluationArtifact(source, evaluationReviewCandidateFactType)
		if err != nil || candidate.PlanDigest != partition.PlanDigest ||
			candidate.RepositoryCommit != partition.RepositoryCommit || candidate.FactID != attemptID {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := writerRepository.StoreEvaluationReviewCandidate(
			request.Context(), handler.authority, partition, source,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if record.AttemptID != attemptID || record.PlanDigest != partition.PlanDigest ||
			record.RepositoryCommit != partition.RepositoryCommit {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		writeEvaluationServiceFact(writer, replayStatus(replayed), record.CandidateBytes, &replayed)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

func (handler *EvaluationServiceHandler) handleArtifacts(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) == 1 && request.Method == http.MethodGet {
		query, err := evaluationServiceOptionalQuery(request, "factType")
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		factType := query.Get("factType")
		repository, ok := handler.repository.(evaluationArtifactReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationArtifacts(request.Context(), handler.authority, partition, factType)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts := make([]json.RawMessage, len(records))
		for index, record := range records {
			facts[index] = json.RawMessage(record.FactBytes)
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, struct {
			Facts []json.RawMessage `json:"facts"`
		}{Facts: facts})
		return
	}
	if len(tail) != 3 || !validEvaluationServiceIdentity(tail[1]) || !validEvaluationServiceIdentity(tail[2]) || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	factType, factID := tail[1], tail[2]
	switch request.Method {
	case http.MethodPut:
		if err := handler.requirePartition(request.Context(), partition); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		repository, ok := handler.repository.(evaluationArtifactWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		artifact, err := decodeEvaluationArtifact(source, factType)
		if err != nil || artifact.PlanDigest != partition.PlanDigest || artifact.FactID != factID {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := repository.StoreEvaluationArtifact(request.Context(), handler.authority, factType, source)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if record.PlanDigest != partition.PlanDigest || record.FactType != factType || record.FactID != factID {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		writeEvaluationServiceFact(writer, replayStatus(replayed), record.FactBytes, &replayed)
	case http.MethodGet:
		repository, ok := handler.repository.(evaluationArtifactReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationArtifact(request.Context(), handler.authority, partition, EvaluationArtifactSelector{FactType: factType, FactID: factID})
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.FactBytes, nil)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

type evaluationLeaseClaimer interface {
	ClaimEvaluationShard(context.Context, EvaluationAuthority, string, string, string, time.Time, time.Time) (EvaluationShardLease, bool, error)
}

type evaluationLeaseRenewer interface {
	RenewEvaluationShard(context.Context, EvaluationAuthority, string, string, string, int64, time.Time, time.Time) (EvaluationShardLease, error)
}

func (handler *EvaluationServiceHandler) handleLeases(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) != 3 || request.Method != http.MethodPost || !validEvaluationServiceIdentity(tail[1]) ||
		(tail[2] != "claim" && tail[2] != "renew") || !evaluationServiceQueryIsExact(request) {
		if len(tail) == 3 && request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if tail[2] == "claim" {
		var body struct {
			OwnerID    string `json:"ownerId"`
			AcquiredAt string `json:"acquiredAt"`
			ExpiresAt  string `json:"expiresAt"`
		}
		if err := decodeEvaluationServiceControl(request, &body); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if !validEvaluationServiceIdentity(body.OwnerID) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		acquiredAt, acquiredErr := parseEvaluationServiceInstant(body.AcquiredAt)
		expiresAt, expiresErr := parseEvaluationServiceInstant(body.ExpiresAt)
		if acquiredErr != nil || expiresErr != nil {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationLeaseClaimer)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		lease, replayed, err := repository.ClaimEvaluationShard(request.Context(), handler.authority, partition.PlanDigest, tail[1], body.OwnerID, acquiredAt, expiresAt)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if lease.PlanDigest != partition.PlanDigest || lease.ShardID != tail[1] || lease.OwnerID != body.OwnerID {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		writeEvaluationServiceLease(writer, replayStatus(replayed), lease, &replayed)
		return
	}
	var body struct {
		OwnerID    string `json:"ownerId"`
		Generation int64  `json:"generation"`
		RenewedAt  string `json:"renewedAt"`
		ExpiresAt  string `json:"expiresAt"`
	}
	if err := decodeEvaluationServiceControl(request, &body); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if !validEvaluationServiceIdentity(body.OwnerID) || body.Generation < 1 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	renewedAt, renewedErr := parseEvaluationServiceInstant(body.RenewedAt)
	expiresAt, expiresErr := parseEvaluationServiceInstant(body.ExpiresAt)
	if renewedErr != nil || expiresErr != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationLeaseRenewer)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	lease, err := repository.RenewEvaluationShard(request.Context(), handler.authority, partition.PlanDigest, tail[1], body.OwnerID, body.Generation, renewedAt, expiresAt)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if lease.PlanDigest != partition.PlanDigest || lease.ShardID != tail[1] || lease.OwnerID != body.OwnerID || lease.Generation != body.Generation {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeEvaluationServiceLease(writer, http.StatusOK, lease, nil)
}

type evaluationBudgetWriter interface {
	ReserveEvaluationBudget(context.Context, EvaluationAuthority, string, string, int64, []byte, time.Time) (EvaluationBudgetReservationRecord, bool, error)
	SettleEvaluationBudget(context.Context, EvaluationAuthority, string, string, int64, []byte) (EvaluationBudgetSettlementRecord, bool, error)
}

type evaluationBudgetReader interface {
	GetEvaluationBudgetSnapshot(context.Context, EvaluationAuthority, EvaluationPlanPartition) (EvaluationBudgetSnapshot, error)
}

func (handler *EvaluationServiceHandler) handleBudget(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) == 1 && request.Method == http.MethodGet && evaluationServiceQueryIsExact(request) {
		repository, ok := handler.repository.(evaluationBudgetReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		snapshot, err := repository.GetEvaluationBudgetSnapshot(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceBudget(writer, snapshot)
		return
	}
	if len(tail) != 3 || request.Method != http.MethodPut || !validEvaluationServiceIdentity(tail[2]) ||
		!oneOfString(tail[1], "reservations", "settlements", "reconciliations") {
		if len(tail) == 3 && request.Method != http.MethodPut {
			methodNotAllowed(writer, http.MethodPut)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if tail[1] == "reconciliations" {
		handler.handleBudgetReconciliation(writer, request, partition, tail[2])
		return
	}
	allowedQuery := []string{"expectedRevision"}
	if tail[1] == "reservations" {
		allowedQuery = append(allowedQuery, "reservedAt")
	}
	query, err := evaluationServiceQuery(request, allowedQuery...)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	expected, err := parseEvaluationServiceInt(query.Get("expectedRevision"), 0)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	repository, ok := handler.repository.(evaluationBudgetWriter)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if tail[1] == "reservations" {
		reservedAt, err := parseEvaluationServiceInstant(query.Get("reservedAt"))
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		record, replayed, err := repository.ReserveEvaluationBudget(request.Context(), handler.authority, partition.PlanDigest, tail[2], expected, source, reservedAt)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if record.PlanDigest != partition.PlanDigest || record.ReservationID != tail[2] {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		writeEvaluationServiceJSON(writer, replayStatus(replayed), evaluationBudgetReservationResponse(record, &replayed))
		return
	}
	record, replayed, err := repository.SettleEvaluationBudget(request.Context(), handler.authority, partition.PlanDigest, tail[2], expected, source)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if record.PlanDigest != partition.PlanDigest || record.ReservationID != tail[2] {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeEvaluationServiceJSON(writer, replayStatus(replayed), evaluationBudgetSettlementResponse(record, &replayed))
}

func (handler *EvaluationServiceHandler) handleBudgetReconciliation(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	reservationID string,
) {
	if request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	query, err := evaluationServiceQuery(request, "expectedRevision", "reason", "settledAt")
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	expected, err := parseEvaluationServiceInt(query.Get("expectedRevision"), 0)
	if err != nil || !oneOfString(query.Get("reason"), "worker-loss", "timeout", "provider-disconnect", "ack-loss") {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	settledAt, err := parseEvaluationServiceInstant(query.Get("settledAt"))
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	reader, readOK := handler.repository.(evaluationBudgetReader)
	writerRepository, writeOK := handler.repository.(evaluationBudgetWriter)
	if !readOK || !writeOK {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	snapshot, err := reader.GetEvaluationBudgetSnapshot(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	var reservation *EvaluationBudgetReservationRecord
	for index := range snapshot.Reservations {
		if snapshot.Reservations[index].ReservationID == reservationID {
			if reservation != nil {
				respondEvaluationServiceError(writer, ErrConflict)
				return
			}
			reservation = &snapshot.Reservations[index]
		}
	}
	if reservation == nil {
		respondEvaluationServiceError(writer, ErrNotFound)
		return
	}
	demand, err := decodeCanonicalEvaluationJSON(reservation.DemandBytes)
	if err != nil {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	base := map[string]any{
		"actual": demand, "charged": demand, "requiresReconciliation": true,
		"reconciliationReason": query.Get("reason"), "settledAt": evaluationExportInstant(settledAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	settlement := make(map[string]any, len(base)+1)
	for key, value := range base {
		settlement[key] = value
	}
	settlement["settlementDigest"] = digest
	settlementBytes, err := canonicaljson.Bytes(settlement)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	record, replayed, err := writerRepository.SettleEvaluationBudget(
		request.Context(), handler.authority, partition.PlanDigest, reservationID, expected, settlementBytes,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if record.NamespaceID != handler.authority.NamespaceID || record.PlanDigest != partition.PlanDigest || record.ReservationID != reservationID {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeEvaluationServiceJSON(writer, replayStatus(replayed), evaluationBudgetSettlementResponse(record, &replayed))
}

type evaluationEvidenceExportLeaseRepository interface {
	OpenEvaluationEvidenceExportLease(context.Context, EvaluationAuthority, EvaluationPlanPartition, EvaluationEvidenceExportSourceBinding, time.Time, string) (EvaluationExportLease, bool, error)
	GetEvaluationEvidenceExportLease(context.Context, EvaluationAuthority, EvaluationPlanPartition, string, string) (EvaluationExportLease, error)
	ReadEvaluationEvidenceExportPage(context.Context, EvaluationAuthority, EvaluationPlanPartition, string, string, string, int64, int64, int64, time.Time) (EvaluationExportRecordPage, error)
}

type evaluationExportCursorPayload struct {
	Format             string `json:"format"`
	Version            int64  `json:"version"`
	LeaseID            string `json:"leaseId"`
	LeaseDigest        string `json:"leaseDigest"`
	Family             string `json:"family"`
	PageOrdinal        int64  `json:"pageOrdinal"`
	FirstRecordOrdinal int64  `json:"firstRecordOrdinal"`
	PreviousOrderKey   string `json:"previousOrderKey"`
	ExpiresAt          string `json:"expiresAt"`
}

type evaluationServiceExportLeaseResponse struct {
	Format           string                               `json:"format"`
	Version          int64                                `json:"version"`
	LeaseID          string                               `json:"leaseId"`
	LeaseDigest      string                               `json:"leaseDigest"`
	Commitments      EvaluationEvidenceArchiveCommitments `json:"commitments"`
	Families         []EvaluationExportFamilySummary      `json:"families"`
	TotalRecordCount int64                                `json:"totalRecordCount"`
	TotalRecordBytes int64                                `json:"totalRecordBytes"`
	CreatedAt        string                               `json:"createdAt"`
	ExpiresAt        string                               `json:"expiresAt"`
	Replayed         *bool                                `json:"replayed,omitempty"`
}

type evaluationServiceExportPageBase struct {
	LeaseID             string                         `json:"leaseId"`
	Family              string                         `json:"family"`
	PageOrdinal         int64                          `json:"pageOrdinal"`
	FirstRecordOrdinal  int64                          `json:"firstRecordOrdinal"`
	Records             []EvaluationExportSourceRecord `json:"records"`
	RecordCount         int64                          `json:"recordCount"`
	RecordBytes         int64                          `json:"recordBytes"`
	PageRecordSetDigest string                         `json:"pageRecordSetDigest"`
	NextCursor          *string                        `json:"nextCursor,omitempty"`
}

func makeEvaluationServiceExportLeaseResponse(lease EvaluationExportLease, replayed *bool) evaluationServiceExportLeaseResponse {
	return evaluationServiceExportLeaseResponse{
		Format: "prodivix.agent-evaluation-export-lease", Version: 1,
		LeaseID: lease.LeaseID, LeaseDigest: lease.LeaseDigest,
		Commitments: lease.Commitments, Families: lease.Families,
		TotalRecordCount: lease.TotalRecordCount, TotalRecordBytes: lease.TotalRecordBytes,
		CreatedAt: lease.CreatedAtText, ExpiresAt: lease.ExpiresAtText, Replayed: replayed,
	}
}

func (handler *EvaluationServiceHandler) encodeEvaluationExportCursor(payload evaluationExportCursorPayload) (string, error) {
	canonical, err := canonicaljson.Bytes(payload)
	if err != nil {
		return "", err
	}
	mac := hmac.New(sha256.New, handler.exportCursorKey[:])
	_, _ = mac.Write(canonical)
	return base64.RawURLEncoding.EncodeToString(canonical) + "." +
		base64.RawURLEncoding.EncodeToString(mac.Sum(nil)), nil
}

func (handler *EvaluationServiceHandler) decodeEvaluationExportCursor(source string) (evaluationExportCursorPayload, error) {
	if len(source) < 3 || len(source) > 8_192 || strings.TrimSpace(source) != source {
		return evaluationExportCursorPayload{}, ErrInvalid
	}
	parts := strings.Split(source, ".")
	if len(parts) != 2 || parts[0] == "" || parts[1] == "" {
		return evaluationExportCursorPayload{}, ErrInvalid
	}
	payloadBytes, err := base64.RawURLEncoding.DecodeString(parts[0])
	if err != nil || base64.RawURLEncoding.EncodeToString(payloadBytes) != parts[0] {
		return evaluationExportCursorPayload{}, ErrInvalid
	}
	signature, err := base64.RawURLEncoding.DecodeString(parts[1])
	if err != nil || len(signature) != sha256.Size || base64.RawURLEncoding.EncodeToString(signature) != parts[1] {
		return evaluationExportCursorPayload{}, ErrInvalid
	}
	mac := hmac.New(sha256.New, handler.exportCursorKey[:])
	_, _ = mac.Write(payloadBytes)
	if !hmac.Equal(signature, mac.Sum(nil)) || canonicaljson.ValidateRawEnvelope(payloadBytes, 8_192) != nil {
		return evaluationExportCursorPayload{}, ErrUnauthorized
	}
	var payload evaluationExportCursorPayload
	decoder := json.NewDecoder(bytes.NewReader(payloadBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&payload); err != nil {
		return evaluationExportCursorPayload{}, ErrInvalid
	}
	canonical, err := canonicaljson.Bytes(payload)
	if err != nil || !bytes.Equal(canonical, payloadBytes) || payload.Format != "prodivix.agent-evaluation-export-cursor" ||
		payload.Version != 1 || !validEvaluationServiceIdentity(payload.LeaseID) ||
		!evaluationDigestPattern.MatchString(payload.LeaseDigest) || payload.PageOrdinal < 1 ||
		payload.FirstRecordOrdinal < 1 || payload.FirstRecordOrdinal > maximumEvaluationExportRecords ||
		payload.PreviousOrderKey == "" || len(payload.PreviousOrderKey) > 8_192 {
		return evaluationExportCursorPayload{}, ErrInvalid
	}
	if _, ok := evaluationExportFamilySpecFor(payload.Family); !ok {
		return evaluationExportCursorPayload{}, ErrInvalid
	}
	if _, err := parseEvaluationServiceInstant(payload.ExpiresAt); err != nil {
		return evaluationExportCursorPayload{}, ErrInvalid
	}
	return payload, nil
}

func buildEvaluationServiceExportPage(
	handler *EvaluationServiceHandler,
	lease EvaluationExportLease,
	family string,
	pageOrdinal int64,
	firstRecordOrdinal int64,
	records []EvaluationExportSourceRecord,
	expectedRecordCount int64,
) ([]byte, error) {
	for len(records) > 0 {
		digests := make([]string, len(records))
		var recordBytes int64
		for index := range records {
			digests[index] = records[index].RecordDigest
			recordBytes += records[index].ByteLength
		}
		pageRecordSetDigest, err := canonicaljson.Digest(digests)
		if err != nil {
			return nil, err
		}
		var nextCursor *string
		if firstRecordOrdinal+int64(len(records)) < expectedRecordCount {
			cursor, err := handler.encodeEvaluationExportCursor(evaluationExportCursorPayload{
				Format: "prodivix.agent-evaluation-export-cursor", Version: 1,
				LeaseID: lease.LeaseID, LeaseDigest: lease.LeaseDigest, Family: family,
				PageOrdinal:        pageOrdinal + 1,
				FirstRecordOrdinal: firstRecordOrdinal + int64(len(records)),
				PreviousOrderKey:   records[len(records)-1].OrderKey, ExpiresAt: lease.ExpiresAtText,
			})
			if err != nil {
				return nil, err
			}
			nextCursor = &cursor
		}
		base := evaluationServiceExportPageBase{
			LeaseID: lease.LeaseID, Family: family, PageOrdinal: pageOrdinal,
			FirstRecordOrdinal: firstRecordOrdinal, Records: records,
			RecordCount: int64(len(records)), RecordBytes: recordBytes,
			PageRecordSetDigest: pageRecordSetDigest, NextCursor: nextCursor,
		}
		pageDigest, err := canonicaljson.Digest(base)
		if err != nil {
			return nil, err
		}
		page := struct {
			evaluationServiceExportPageBase
			PageDigest string `json:"pageDigest"`
		}{evaluationServiceExportPageBase: base, PageDigest: pageDigest}
		canonical, err := canonicaljson.Bytes(page)
		if err != nil {
			return nil, err
		}
		if len(canonical) <= maximumEvaluationServiceExportPageBytes {
			return canonical, nil
		}
		records = records[:len(records)-1]
	}
	return nil, errEvaluationServiceResponseTooLarge
}

func (handler *EvaluationServiceHandler) handleEvaluationExportLeases(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	repository, ok := handler.repository.(evaluationEvidenceExportLeaseRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if len(tail) == 1 {
		if request.Method != http.MethodPost || !evaluationServiceQueryIsExact(request) {
			if request.Method != http.MethodPost {
				methodNotAllowed(writer, http.MethodPost)
				return
			}
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		var sourceBinding EvaluationEvidenceExportSourceBinding
		if err := decodeEvaluationServiceControl(request, &sourceBinding); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if err := validateEvaluationEvidenceExportSourceBinding(sourceBinding); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		lease, replayed, err := repository.OpenEvaluationEvidenceExportLease(
			request.Context(), handler.authority, partition, sourceBinding, time.Now().UTC(), handler.exportCursorKeyBindingDigest,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceJSON(writer, replayStatus(replayed), makeEvaluationServiceExportLeaseResponse(lease, &replayed))
		return
	}
	if len(tail) != 2 && len(tail) != 4 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method != http.MethodGet || request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	leaseID := tail[1]
	if !validEvaluationServiceIdentity(leaseID) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	lease, err := repository.GetEvaluationEvidenceExportLease(
		request.Context(), handler.authority, partition, leaseID, handler.exportCursorKeyBindingDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if len(tail) == 2 {
		if !evaluationServiceQueryIsExact(request) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, makeEvaluationServiceExportLeaseResponse(lease, nil))
		return
	}
	if tail[2] != "families" {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	family := tail[3]
	spec, familyOK := evaluationExportFamilySpecFor(family)
	if !familyOK {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	query, err := evaluationServiceOptionalQuery(request, "cursor")
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	pageOrdinal, firstRecordOrdinal, previousOrderKey := int64(0), int64(0), ""
	if rawCursor := query.Get("cursor"); rawCursor != "" {
		cursor, err := handler.decodeEvaluationExportCursor(rawCursor)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if cursor.LeaseID != lease.LeaseID || cursor.LeaseDigest != lease.LeaseDigest || cursor.Family != family ||
			cursor.ExpiresAt != lease.ExpiresAtText {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		pageOrdinal, firstRecordOrdinal, previousOrderKey = cursor.PageOrdinal, cursor.FirstRecordOrdinal, cursor.PreviousOrderKey
	}
	summary := lease.Families[spec.Index]
	if summary.ExpectedRecordCount == 0 || firstRecordOrdinal == summary.ExpectedRecordCount {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	page, err := repository.ReadEvaluationEvidenceExportPage(
		request.Context(), handler.authority, partition, lease.LeaseID, handler.exportCursorKeyBindingDigest,
		family, firstRecordOrdinal, maximumEvaluationExportPageRecords, maximumEvaluationExportPageBytes, time.Now().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if len(page.Records) == 0 || (previousOrderKey != "" && previousOrderKey >= page.Records[0].OrderKey) {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	pageBytes, err := buildEvaluationServiceExportPage(handler, lease, family, pageOrdinal,
		firstRecordOrdinal, page.Records, summary.ExpectedRecordCount)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, pageBytes)
}

type evaluationReviewLeaseRepository interface {
	OpenEvaluationReviewLease(context.Context, EvaluationAuthority, EvaluationPlanPartition, time.Time, string) (EvaluationReviewLease, bool, error)
	GetEvaluationReviewLease(context.Context, EvaluationAuthority, EvaluationPlanPartition, string, string) (EvaluationReviewLease, error)
	ReadEvaluationReviewLeasePage(context.Context, EvaluationAuthority, EvaluationPlanPartition, string, string, string, int64, int64, int64, time.Time) (EvaluationExportRecordPage, error)
}

type evaluationServiceReviewLeaseResponse struct {
	EvaluationReviewLeaseCommitments
	LeaseID           string                          `json:"leaseId"`
	ReviewLeaseDigest string                          `json:"reviewLeaseDigest"`
	Families          []EvaluationExportFamilySummary `json:"families"`
	TotalRecordCount  int64                           `json:"totalRecordCount"`
	TotalRecordBytes  int64                           `json:"totalRecordBytes"`
	Replayed          *bool                           `json:"replayed,omitempty"`
}

func makeEvaluationServiceReviewLeaseResponse(
	lease EvaluationReviewLease,
	replayed *bool,
) evaluationServiceReviewLeaseResponse {
	return evaluationServiceReviewLeaseResponse{
		EvaluationReviewLeaseCommitments: lease.Commitments,
		LeaseID:                          lease.LeaseID, ReviewLeaseDigest: lease.ReviewLeaseDigest,
		Families: lease.Families, TotalRecordCount: lease.TotalRecordCount,
		TotalRecordBytes: lease.TotalRecordBytes, Replayed: replayed,
	}
}

func (handler *EvaluationServiceHandler) handleEvaluationReviewLeases(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	repository, ok := handler.repository.(evaluationReviewLeaseRepository)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	if len(tail) == 1 {
		if request.Method != http.MethodPost || !evaluationServiceQueryIsExact(request) ||
			request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			if request.Method != http.MethodPost {
				methodNotAllowed(writer, http.MethodPost)
				return
			}
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		if err := handler.requirePartition(request.Context(), partition); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		lease, replayed, err := repository.OpenEvaluationReviewLease(
			request.Context(), handler.authority, partition, time.Now().UTC(), handler.exportCursorKeyBindingDigest,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceJSON(writer, replayStatus(replayed), makeEvaluationServiceReviewLeaseResponse(lease, &replayed))
		return
	}
	if len(tail) != 2 && len(tail) != 4 {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method != http.MethodGet || request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	leaseID := tail[1]
	if !validEvaluationServiceIdentity(leaseID) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	lease, err := repository.GetEvaluationReviewLease(
		request.Context(), handler.authority, partition, leaseID, handler.exportCursorKeyBindingDigest,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if len(tail) == 2 {
		if !evaluationServiceQueryIsExact(request) {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, makeEvaluationServiceReviewLeaseResponse(lease, nil))
		return
	}
	if tail[2] != "families" {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	family := tail[3]
	spec, familyOK := evaluationReviewLeaseFamilySpecFor(family)
	if !familyOK {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	query, err := evaluationServiceOptionalQuery(request, "cursor")
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	pageOrdinal, firstRecordOrdinal, previousOrderKey := int64(0), int64(0), ""
	if rawCursor := query.Get("cursor"); rawCursor != "" {
		cursor, err := handler.decodeEvaluationExportCursor(rawCursor)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if cursor.LeaseID != lease.LeaseID || cursor.LeaseDigest != lease.ReviewLeaseDigest ||
			cursor.Family != family || cursor.ExpiresAt != lease.ExpiresAtText {
			respondEvaluationServiceError(writer, ErrConflict)
			return
		}
		pageOrdinal, firstRecordOrdinal, previousOrderKey = cursor.PageOrdinal, cursor.FirstRecordOrdinal, cursor.PreviousOrderKey
	}
	summary := lease.Families[spec.Index]
	if summary.ExpectedRecordCount == 0 || firstRecordOrdinal == summary.ExpectedRecordCount {
		writer.WriteHeader(http.StatusNoContent)
		return
	}
	page, err := repository.ReadEvaluationReviewLeasePage(
		request.Context(), handler.authority, partition, lease.LeaseID, handler.exportCursorKeyBindingDigest,
		family, firstRecordOrdinal, maximumEvaluationExportPageRecords, maximumEvaluationExportPageBytes, time.Now().UTC(),
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if len(page.Records) == 0 || (previousOrderKey != "" && previousOrderKey >= page.Records[0].OrderKey) {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	exportLease := EvaluationExportLease{
		LeaseID: lease.LeaseID, LeaseDigest: lease.ReviewLeaseDigest,
		Families: lease.Families, ExpiresAtText: lease.ExpiresAtText,
	}
	pageBytes, err := buildEvaluationServiceExportPage(
		handler, exportLease, family, pageOrdinal, firstRecordOrdinal, page.Records, summary.ExpectedRecordCount,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceRaw(writer, http.StatusOK, pageBytes)
}

type evaluationSnapshotExporter interface {
	ExportEvaluationSnapshot(context.Context, EvaluationAuthority, EvaluationPlanPartition, EvaluationSnapshotRequirements) (EvaluationSnapshotExport, error)
}

func (handler *EvaluationServiceHandler) handleMonolithicSnapshotUnavailable(
	writer http.ResponseWriter,
	request *http.Request,
	tail []string,
	qualified bool,
) {
	expectedMethod := http.MethodGet
	if qualified {
		expectedMethod = http.MethodPost
	}
	if len(tail) != 1 || request.Method != expectedMethod || !evaluationServiceQueryIsExact(request) {
		if request.Method != expectedMethod {
			methodNotAllowed(writer, expectedMethod)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
}

func (handler *EvaluationServiceHandler) handleSnapshot(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string, qualified bool) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	requirements := EvaluationSnapshotRequirements{}
	if qualified {
		if request.Method != http.MethodPost {
			methodNotAllowed(writer, http.MethodPost)
			return
		}
		var body struct {
			RequireCompleteAttemptSet         bool     `json:"requireCompleteAttemptSet"`
			RequireCompleteReviewCandidateSet bool     `json:"requireCompleteReviewCandidateSet"`
			RequireSettledBudget              bool     `json:"requireSettledBudget"`
			RequireAuthenticityEvidence       bool     `json:"requireAuthenticityEvidence"`
			RequiredArtifactTypes             []string `json:"requiredArtifactTypes"`
		}
		if err := decodeEvaluationServiceControl(request, &body); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		if len(body.RequiredArtifactTypes) > 32 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		requirements = EvaluationSnapshotRequirements{
			RequireCompleteAttemptSet:         body.RequireCompleteAttemptSet,
			RequireCompleteReviewCandidateSet: body.RequireCompleteReviewCandidateSet,
			RequireSettledBudget:              body.RequireSettledBudget,
			RequireAuthenticityEvidence:       body.RequireAuthenticityEvidence,
			RequiredArtifactTypes:             body.RequiredArtifactTypes,
		}
	} else if request.Method != http.MethodGet {
		methodNotAllowed(writer, http.MethodGet)
		return
	}
	repository, ok := handler.repository.(evaluationSnapshotExporter)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	export, err := repository.ExportEvaluationSnapshot(request.Context(), handler.authority, partition, requirements)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	if export.Snapshot.Partition != partition || export.Snapshot.NamespaceID != handler.authority.NamespaceID {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	if qualified {
		writer.Header().Set("Content-Disposition", `attachment; filename="g4-evaluation-snapshot.json"`)
	}
	writer.Header().Set("X-Prodivix-Evaluation-Snapshot-Digest", export.Digest)
	writeEvaluationServiceRaw(writer, http.StatusOK, export.Bytes)
}

type evaluationCoordinatorStatusReader interface {
	GetEvaluationCoordinatorStatus(context.Context, EvaluationAuthority, EvaluationPlanPartition, string, time.Time) (EvaluationCoordinatorStatus, error)
}

func (handler *EvaluationServiceHandler) handleStatus(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 1 || request.Method != http.MethodGet || request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	query, err := evaluationServiceOptionalQuery(request, "observedAt", "shardId")
	if err != nil || query.Get("observedAt") == "" ||
		(query.Get("shardId") != "" && !validEvaluationServiceIdentity(query.Get("shardId"))) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	observedAt, err := parseEvaluationServiceInstant(query.Get("observedAt"))
	if err != nil {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationCoordinatorStatusReader)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	status, err := repository.GetEvaluationCoordinatorStatus(
		request.Context(), handler.authority, partition, query.Get("shardId"), observedAt,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, status)
}

func (handler *EvaluationServiceHandler) handleLegacyStatusUnavailable(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) != 1 || request.Method != http.MethodGet || !evaluationServiceQueryIsExact(request) {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	planRepository, planOK := handler.repository.(evaluationPlanReader)
	attemptRepository, attemptOK := handler.repository.(evaluationAttemptReader)
	checkpointRepository, checkpointOK := handler.repository.(evaluationCheckpointReader)
	artifactRepository, artifactOK := handler.repository.(evaluationArtifactReader)
	reviewCandidateRepository, reviewCandidateOK := handler.repository.(evaluationReviewCandidateReader)
	budgetRepository, budgetOK := handler.repository.(evaluationBudgetReader)
	smokeRepository, smokeOK := handler.repository.(evaluationEndpointSmokeReceiptReader)
	invocationRepository, invocationOK := handler.repository.(evaluationInvocationReceiptReader)
	sourceRepository, sourceOK := handler.repository.(evaluationSourceReceiptReader)
	executionRepository, executionOK := handler.repository.(evaluationExecutionReceiptReader)
	attestationRepository, attestationOK := handler.repository.(evaluationAuthorityAttestationReader)
	rootRepository, rootOK := handler.repository.(evaluationEvidenceRootReader)
	if !planOK || !attemptOK || !checkpointOK || !artifactOK || !reviewCandidateOK || !budgetOK || !smokeOK ||
		!invocationOK || !sourceOK || !executionOK || !attestationOK || !rootOK {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	plan, err := planRepository.GetEvaluationPlan(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	attempts, err := attemptRepository.ListEvaluationAttempts(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	checkpoints, err := checkpointRepository.ListEvaluationCheckpoints(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	artifacts, err := artifactRepository.ListEvaluationArtifacts(request.Context(), handler.authority, partition, "")
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	reviewCandidateRefs, err := reviewCandidateRepository.ListEvaluationReviewCandidateRefs(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	budget, err := budgetRepository.GetEvaluationBudgetSnapshot(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	smokeReceipts, err := smokeRepository.ListEvaluationEndpointSmokeReceipts(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	invocationReceipts, err := invocationRepository.ListEvaluationInvocationReceipts(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	sourceReceipts, err := sourceRepository.ListEvaluationSourceReceipts(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	executionReceipts, err := executionRepository.ListEvaluationExecutionReceipts(request.Context(), handler.authority, partition)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	_, attestationErr := attestationRepository.GetEvaluationAuthorityAttestation(request.Context(), handler.authority, partition)
	if attestationErr != nil && !errors.Is(attestationErr, ErrNotFound) {
		respondEvaluationServiceError(writer, attestationErr)
		return
	}
	_, rootErr := rootRepository.GetEvaluationEvidenceRoot(request.Context(), handler.authority, partition)
	if rootErr != nil && !errors.Is(rootErr, ErrNotFound) {
		respondEvaluationServiceError(writer, rootErr)
		return
	}
	completed, terminal := int64(0), int64(0)
	for _, attempt := range attempts {
		if attempt.Status == "completed" {
			completed++
		} else {
			terminal++
		}
	}
	missing := plan.PlannedJourneyCount - int64(len(attempts))
	if missing < 0 {
		respondEvaluationServiceError(writer, ErrConflict)
		return
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, struct {
		PlanDigest                  string `json:"planDigest"`
		RepositoryCommit            string `json:"repositoryCommit"`
		PlannedJourneyCount         int64  `json:"plannedJourneyCount"`
		AttemptCount                int64  `json:"attemptCount"`
		CompletedAttemptCount       int64  `json:"completedAttemptCount"`
		TerminalFailureAttemptCount int64  `json:"terminalFailureAttemptCount"`
		MissingAttemptCount         int64  `json:"missingAttemptCount"`
		CheckpointCount             int64  `json:"checkpointCount"`
		ArtifactCount               int64  `json:"artifactCount"`
		ReviewCandidateCount        int64  `json:"reviewCandidateCount"`
		BudgetRevision              int64  `json:"budgetRevision"`
		UnsettledReservationCount   int64  `json:"unsettledReservationCount"`
		EndpointSmokeReceiptCount   int64  `json:"endpointSmokeReceiptCount"`
		InvocationReceiptCount      int64  `json:"invocationReceiptCount"`
		SourceReceiptCount          int64  `json:"sourceReceiptCount"`
		ExecutionReceiptCount       int64  `json:"executionReceiptCount"`
		HasAuthorityAttestation     bool   `json:"hasAuthorityAttestation"`
		HasEvidenceRoot             bool   `json:"hasEvidenceRoot"`
	}{
		PlanDigest: partition.PlanDigest, RepositoryCommit: partition.RepositoryCommit,
		PlannedJourneyCount: plan.PlannedJourneyCount, AttemptCount: int64(len(attempts)),
		CompletedAttemptCount: completed, TerminalFailureAttemptCount: terminal, MissingAttemptCount: missing,
		CheckpointCount: int64(len(checkpoints)), ArtifactCount: int64(len(artifacts)),
		ReviewCandidateCount: int64(len(reviewCandidateRefs)), BudgetRevision: budget.Revision,
		UnsettledReservationCount: int64(len(budget.UnsettledReservationIDs)),
		EndpointSmokeReceiptCount: int64(len(smokeReceipts)), InvocationReceiptCount: int64(len(invocationReceipts)),
		SourceReceiptCount: int64(len(sourceReceipts)), ExecutionReceiptCount: int64(len(executionReceipts)),
		HasAuthorityAttestation: attestationErr == nil, HasEvidenceRoot: rootErr == nil,
	})
}

type evaluationEndpointSmokeReceiptWriter interface {
	StoreEvaluationEndpointSmokeReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte) (EvaluationEndpointSmokeReceiptRecord, bool, error)
}

type evaluationEndpointSmokeReceiptReader interface {
	ListEvaluationEndpointSmokeReceipts(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationEndpointSmokeReceiptRecord, error)
	GetEvaluationEndpointSmokeReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationEndpointSmokeReceiptRecord, error)
}

type evaluationInvocationReceiptWriter interface {
	StoreEvaluationInvocationReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte) (EvaluationInvocationReceiptRecord, bool, error)
}

type evaluationInvocationReceiptReader interface {
	ListEvaluationInvocationReceipts(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationInvocationReceiptRecord, error)
	GetEvaluationInvocationReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationInvocationReceiptRecord, error)
}

type evaluationSourceReceiptWriter interface {
	StoreEvaluationSourceReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte) (EvaluationSourceReceiptRecord, bool, error)
}

type evaluationSourceReceiptReader interface {
	ListEvaluationSourceReceipts(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationSourceReceiptRecord, error)
	GetEvaluationSourceReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, EvaluationSourceReceiptSelector) (EvaluationSourceReceiptRecord, error)
}

type evaluationExecutionReceiptWriter interface {
	StoreEvaluationExecutionReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte) (EvaluationExecutionReceiptRecord, bool, error)
}

type evaluationExecutionReceiptReader interface {
	ListEvaluationExecutionReceipts(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationExecutionReceiptRecord, error)
	GetEvaluationExecutionReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationExecutionReceiptRecord, error)
}

type evaluationCapabilityExecutionReceiptWriter interface {
	StoreEvaluationCapabilityExecutionReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte) (EvaluationCapabilityExecutionReceiptRecord, bool, error)
}

type evaluationCapabilityExecutionReceiptReader interface {
	ListEvaluationCapabilityExecutionReceipts(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationCapabilityExecutionReceiptRecord, error)
	GetEvaluationCapabilityExecutionReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationCapabilityExecutionReceiptRecord, error)
}

type evaluationPreDispatchFailureReceiptWriter interface {
	StoreEvaluationPreDispatchFailureReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte) (EvaluationPreDispatchFailureReceiptRecord, bool, error)
}

type evaluationPreDispatchFailureReceiptReader interface {
	ListEvaluationPreDispatchFailureReceipts(context.Context, EvaluationAuthority, EvaluationPlanPartition) ([]EvaluationPreDispatchFailureReceiptRecord, error)
	GetEvaluationPreDispatchFailureReceipt(context.Context, EvaluationAuthority, EvaluationPlanPartition, string, int64) (EvaluationPreDispatchFailureReceiptRecord, error)
}

func (handler *EvaluationServiceHandler) handleReceipts(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) >= 2 && tail[1] == "pre-dispatch-failure" {
		handler.handlePreDispatchFailureReceipts(writer, request, partition, tail)
		return
	}
	if len(tail) < 2 || len(tail) > 3 || !oneOfString(tail[1], "endpoint-smoke", "invocation", "source", "execution", "capability-execution") {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if len(tail) == 3 && !validEvaluationServiceIdentity(tail[2]) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if len(tail) == 2 && request.Method == http.MethodGet {
		handler.listEvaluationReceipts(writer, request, partition, tail[1])
		return
	}
	if len(tail) != 3 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method == http.MethodGet {
		handler.getEvaluationReceipt(writer, request, partition, tail[1], tail[2])
		return
	}
	if request.Method != http.MethodPut {
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	handler.storeEvaluationReceipt(writer, request, partition, tail[1], tail[2], source)
}

func (handler *EvaluationServiceHandler) handlePreDispatchFailureReceipts(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) == 2 {
		if request.Method != http.MethodGet {
			methodNotAllowed(writer, http.MethodGet)
			return
		}
		if !evaluationServiceQueryIsExact(request) || request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationPreDispatchFailureReceiptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationPreDispatchFailureReceipts(request.Context(), handler.authority, partition)
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
	if len(tail) != 4 || !validEvaluationServiceIdentity(tail[2]) || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	turnIndex, err := parseEvaluationServiceInt(tail[3], 0)
	if err != nil || turnIndex > maximumEvaluationPreDispatchTurnIndex {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	if request.Method == http.MethodGet {
		if request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationPreDispatchFailureReceiptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationPreDispatchFailureReceipt(
			request.Context(), handler.authority, partition, tail[2], turnIndex,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.ReceiptBytes, nil)
		return
	}
	if request.Method != http.MethodPut {
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
		return
	}
	if err := handler.requirePartition(request.Context(), partition); err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	decoded, err := decodeEvaluationPreDispatchFailureReceipt(source)
	if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit ||
		decoded.AttemptID != tail[2] || decoded.TurnIndex != turnIndex {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	repository, ok := handler.repository.(evaluationPreDispatchFailureReceiptWriter)
	if !ok {
		respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
		return
	}
	record, replayed, err := repository.StoreEvaluationPreDispatchFailureReceipt(
		request.Context(), handler.authority, partition, source,
	)
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceFact(writer, replayStatus(replayed), record.ReceiptBytes, &replayed)
}

func (handler *EvaluationServiceHandler) listEvaluationReceipts(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, kind string) {
	if !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	var facts []json.RawMessage
	switch kind {
	case "endpoint-smoke":
		repository, ok := handler.repository.(evaluationEndpointSmokeReceiptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationEndpointSmokeReceipts(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts = make([]json.RawMessage, len(records))
		for index := range records {
			facts[index] = json.RawMessage(records[index].ReceiptBytes)
		}
	case "invocation":
		repository, ok := handler.repository.(evaluationInvocationReceiptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationInvocationReceipts(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts = make([]json.RawMessage, len(records))
		for index := range records {
			facts[index] = json.RawMessage(records[index].EvidenceBytes)
		}
	case "source":
		repository, ok := handler.repository.(evaluationSourceReceiptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationSourceReceipts(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts = make([]json.RawMessage, len(records))
		for index := range records {
			facts[index] = json.RawMessage(records[index].ReceiptBytes)
		}
	case "execution":
		repository, ok := handler.repository.(evaluationExecutionReceiptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationExecutionReceipts(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts = make([]json.RawMessage, len(records))
		for index := range records {
			facts[index] = json.RawMessage(records[index].ReceiptBytes)
		}
	case "capability-execution":
		repository, ok := handler.repository.(evaluationCapabilityExecutionReceiptReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		records, err := repository.ListEvaluationCapabilityExecutionReceipts(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		facts = make([]json.RawMessage, len(records))
		for index := range records {
			facts[index] = json.RawMessage(records[index].ReceiptBytes)
		}
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, struct {
		Facts []json.RawMessage `json:"facts"`
	}{Facts: facts})
}

func (handler *EvaluationServiceHandler) getEvaluationReceipt(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, kind, identity string) {
	var source []byte
	var err error
	switch kind {
	case "endpoint-smoke":
		repository, ok := handler.repository.(evaluationEndpointSmokeReceiptReader)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationEndpointSmokeReceiptRecord
		record, err = repository.GetEvaluationEndpointSmokeReceipt(request.Context(), handler.authority, partition, identity)
		source = record.ReceiptBytes
	case "invocation":
		repository, ok := handler.repository.(evaluationInvocationReceiptReader)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationInvocationReceiptRecord
		record, err = repository.GetEvaluationInvocationReceipt(request.Context(), handler.authority, partition, identity)
		source = record.EvidenceBytes
	case "source":
		repository, ok := handler.repository.(evaluationSourceReceiptReader)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationSourceReceiptRecord
		record, err = repository.GetEvaluationSourceReceipt(request.Context(), handler.authority, partition, EvaluationSourceReceiptSelector{SourceReceiptID: identity})
		source = record.ReceiptBytes
	case "execution":
		repository, ok := handler.repository.(evaluationExecutionReceiptReader)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationExecutionReceiptRecord
		record, err = repository.GetEvaluationExecutionReceipt(request.Context(), handler.authority, partition, identity)
		source = record.ReceiptBytes
	case "capability-execution":
		repository, ok := handler.repository.(evaluationCapabilityExecutionReceiptReader)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationCapabilityExecutionReceiptRecord
		record, err = repository.GetEvaluationCapabilityExecutionReceipt(request.Context(), handler.authority, partition, identity)
		source = record.ReceiptBytes
	}
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceFact(writer, http.StatusOK, source, nil)
}

func (handler *EvaluationServiceHandler) storeEvaluationReceipt(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, kind, identity string, source []byte) {
	var fact []byte
	var replayed bool
	var err error
	switch kind {
	case "endpoint-smoke":
		decoded, decodeErr := decodeEvaluationEndpointSmokeReceipt(source)
		if decodeErr != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit || decoded.SmokeTargetID != identity {
			err = ErrInvalid
			break
		}
		repository, ok := handler.repository.(evaluationEndpointSmokeReceiptWriter)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationEndpointSmokeReceiptRecord
		record, replayed, err = repository.StoreEvaluationEndpointSmokeReceipt(request.Context(), handler.authority, partition, source)
		fact = record.ReceiptBytes
	case "invocation":
		decoded, decodeErr := decodeEvaluationInvocationReceipt(source)
		if decodeErr != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit || decoded.AttemptID != identity {
			err = ErrInvalid
			break
		}
		repository, ok := handler.repository.(evaluationInvocationReceiptWriter)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationInvocationReceiptRecord
		record, replayed, err = repository.StoreEvaluationInvocationReceipt(request.Context(), handler.authority, partition, source)
		fact = record.EvidenceBytes
	case "source":
		decoded, decodeErr := decodeEvaluationSourceReceipt(source)
		if decodeErr != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit || decoded.SourceReceiptID != identity {
			err = ErrInvalid
			break
		}
		repository, ok := handler.repository.(evaluationSourceReceiptWriter)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationSourceReceiptRecord
		record, replayed, err = repository.StoreEvaluationSourceReceipt(request.Context(), handler.authority, partition, source)
		fact = record.ReceiptBytes
	case "execution":
		decoded, decodeErr := decodeEvaluationExecutionReceipt(source)
		if decodeErr != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit || decoded.AttemptID != identity {
			err = ErrInvalid
			break
		}
		repository, ok := handler.repository.(evaluationExecutionReceiptWriter)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationExecutionReceiptRecord
		record, replayed, err = repository.StoreEvaluationExecutionReceipt(request.Context(), handler.authority, partition, source)
		fact = record.ReceiptBytes
	case "capability-execution":
		decoded, decodeErr := decodeEvaluationCapabilityExecutionReceipt(source)
		if decodeErr != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit || decoded.CapabilityExecutionReceiptID != identity {
			err = ErrInvalid
			break
		}
		repository, ok := handler.repository.(evaluationCapabilityExecutionReceiptWriter)
		if !ok {
			err = errEvaluationServiceUnavailable
			break
		}
		var record EvaluationCapabilityExecutionReceiptRecord
		record, replayed, err = repository.StoreEvaluationCapabilityExecutionReceipt(request.Context(), handler.authority, partition, source)
		fact = record.ReceiptBytes
	}
	if err != nil {
		respondEvaluationServiceError(writer, err)
		return
	}
	writeEvaluationServiceFact(writer, replayStatus(replayed), fact, &replayed)
}

type evaluationAuthorityAttestationWriter interface {
	StoreEvaluationAuthorityAttestation(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte, EvaluationAuthorityAttestationVerifier) (EvaluationAuthorityAttestationRecord, bool, error)
}

type evaluationAuthorityAttestationReader interface {
	GetEvaluationAuthorityAttestation(context.Context, EvaluationAuthority, EvaluationPlanPartition) (EvaluationAuthorityAttestationRecord, error)
}

func (handler *EvaluationServiceHandler) handleAuthorityAttestation(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	switch request.Method {
	case http.MethodGet:
		repository, ok := handler.repository.(evaluationAuthorityAttestationReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationAuthorityAttestation(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.AttestationBytes, nil)
	case http.MethodPut:
		if handler.attestationVerifier == nil {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		if err := handler.requirePartition(request.Context(), partition); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		repository, ok := handler.repository.(evaluationAuthorityAttestationWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		decoded, err := decodeEvaluationAuthorityAttestation(source)
		if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := repository.StoreEvaluationAuthorityAttestation(request.Context(), handler.authority, partition, source, handler.attestationVerifier)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, replayStatus(replayed), record.AttestationBytes, &replayed)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

type evaluationEvidenceRootWriter interface {
	StoreEvaluationEvidenceRoot(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte) (EvaluationEvidenceRootRecord, bool, error)
}

type evaluationEvidenceRootReader interface {
	GetEvaluationEvidenceRoot(context.Context, EvaluationAuthority, EvaluationPlanPartition) (EvaluationEvidenceRootRecord, error)
}

func (handler *EvaluationServiceHandler) handleEvidenceRoot(writer http.ResponseWriter, request *http.Request, partition EvaluationPlanPartition, tail []string) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	switch request.Method {
	case http.MethodGet:
		repository, ok := handler.repository.(evaluationEvidenceRootReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationEvidenceRoot(request.Context(), handler.authority, partition)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, http.StatusOK, record.RootBytes, nil)
	case http.MethodPut:
		if err := handler.requirePartition(request.Context(), partition); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		repository, ok := handler.repository.(evaluationEvidenceRootWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		source, err := readEvaluationServiceJSON(request, maximumEvaluationServiceFactBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		decoded, err := decodeEvaluationEvidenceRoot(source)
		if err != nil || decoded.PlanDigest != partition.PlanDigest || decoded.RepositoryCommit != partition.RepositoryCommit {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := repository.StoreEvaluationEvidenceRoot(request.Context(), handler.authority, partition, source)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceFact(writer, replayStatus(replayed), record.RootBytes, &replayed)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

type evaluationArchiveClosureWriter interface {
	StoreEvaluationArchiveClosure(context.Context, EvaluationAuthority, EvaluationPlanPartition, []byte, string, EvaluationAuthorityAttestationVerifier) (EvaluationArchiveClosureRecord, bool, error)
}

type evaluationArchiveClosureReader interface {
	GetEvaluationArchiveClosure(context.Context, EvaluationAuthority, EvaluationPlanPartition, string) (EvaluationArchiveClosureRecord, error)
}

func evaluationArchiveClosureResponse(record EvaluationArchiveClosureRecord, replayed *bool) (any, error) {
	closure, err := decodeEvaluationArchiveClosure(record.ClosureBytes)
	if err != nil || !evaluationArchiveClosureRecordMatches(record, closure) {
		return nil, conflict("persisted evaluation archive closure response drifted")
	}
	return struct {
		ExportLeaseID      string          `json:"exportLeaseId"`
		ExportLeaseDigest  string          `json:"exportLeaseDigest"`
		EvidenceIndex      json.RawMessage `json:"evidenceIndex"`
		ArchiveAttestation json.RawMessage `json:"archiveAttestation"`
		EvidenceRoot       json.RawMessage `json:"evidenceRoot"`
		Replayed           *bool           `json:"replayed,omitempty"`
	}{
		ExportLeaseID: record.ExportLeaseID, ExportLeaseDigest: record.ExportLeaseDigest,
		EvidenceIndex:      json.RawMessage(closure.Index.Canonical),
		ArchiveAttestation: json.RawMessage(closure.Attestation.Canonical),
		EvidenceRoot:       json.RawMessage(closure.Root.Canonical), Replayed: replayed,
	}, nil
}

func (handler *EvaluationServiceHandler) handleArchiveClosure(
	writer http.ResponseWriter,
	request *http.Request,
	partition EvaluationPlanPartition,
	tail []string,
) {
	if len(tail) != 1 || !evaluationServiceQueryIsExact(request) {
		respondEvaluationServiceError(writer, ErrInvalid)
		return
	}
	switch request.Method {
	case http.MethodGet:
		if request.ContentLength != 0 || len(request.TransferEncoding) != 0 {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		repository, ok := handler.repository.(evaluationArchiveClosureReader)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		record, err := repository.GetEvaluationArchiveClosure(
			request.Context(), handler.authority, partition, handler.exportCursorKeyBindingDigest,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		response, err := evaluationArchiveClosureResponse(record, nil)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceJSON(writer, http.StatusOK, response)
	case http.MethodPut:
		if handler.attestationVerifier == nil {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		if err := handler.requirePartition(request.Context(), partition); err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		repository, ok := handler.repository.(evaluationArchiveClosureWriter)
		if !ok {
			respondEvaluationServiceError(writer, errEvaluationServiceUnavailable)
			return
		}
		source, err := readEvaluationServiceJSON(request, maximumEvaluationArchiveClosureBytes)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		decoded, err := decodeEvaluationArchiveClosure(source)
		if err != nil || decoded.Index.PlanDigest != partition.PlanDigest || decoded.Index.RepositoryCommit != partition.RepositoryCommit {
			respondEvaluationServiceError(writer, ErrInvalid)
			return
		}
		record, replayed, err := repository.StoreEvaluationArchiveClosure(
			request.Context(), handler.authority, partition, source,
			handler.exportCursorKeyBindingDigest, handler.attestationVerifier,
		)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		response, err := evaluationArchiveClosureResponse(record, &replayed)
		if err != nil {
			respondEvaluationServiceError(writer, err)
			return
		}
		writeEvaluationServiceJSON(writer, replayStatus(replayed), response)
	default:
		methodNotAllowed(writer, http.MethodGet, http.MethodPut)
	}
}

func (handler *EvaluationServiceHandler) requirePartition(ctx context.Context, partition EvaluationPlanPartition) error {
	repository, ok := handler.repository.(evaluationPlanReader)
	if !ok {
		return errEvaluationServiceUnavailable
	}
	record, err := repository.GetEvaluationPlan(ctx, handler.authority, partition)
	if err != nil {
		return err
	}
	if record.PlanDigest != partition.PlanDigest || record.RepositoryCommit != partition.RepositoryCommit || record.NamespaceID != handler.authority.NamespaceID {
		return ErrConflict
	}
	return nil
}

func readEvaluationServiceJSON(request *http.Request, maximum int64) ([]byte, error) {
	if request.Body == nil || request.ContentLength > maximum ||
		(request.Header.Get("Content-Encoding") != "" && request.Header.Get("Content-Encoding") != "identity") {
		if request.ContentLength > maximum {
			return nil, errEvaluationServiceRequestTooLarge
		}
		return nil, ErrInvalid
	}
	contentType := request.Header.Get("Content-Type")
	mediaType, _, err := mime.ParseMediaType(contentType)
	if err != nil || mediaType != "application/json" {
		return nil, ErrInvalid
	}
	source, err := io.ReadAll(io.LimitReader(request.Body, maximum+1))
	if err != nil {
		return nil, ErrInvalid
	}
	if int64(len(source)) > maximum {
		return nil, errEvaluationServiceRequestTooLarge
	}
	if len(source) == 0 {
		return nil, ErrInvalid
	}
	return source, nil
}

func decodeEvaluationServiceControl(request *http.Request, target any) error {
	return decodeEvaluationServiceJSON(request, maximumEvaluationServiceControlBytes, target)
}

func decodeEvaluationServiceJSON(request *http.Request, maximum int64, target any) error {
	source, err := readEvaluationServiceJSON(request, maximum)
	if err != nil {
		return err
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return ErrInvalid
	}
	return nil
}

func decodeEvaluationServiceRawJSON(source []byte, target any) error {
	if len(source) == 0 {
		return ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return ErrInvalid
	}
	return nil
}

func evaluationServiceQueryIsExact(request *http.Request) bool {
	query, err := url.ParseQuery(request.URL.RawQuery)
	return err == nil && len(query) == 0
}

func evaluationServiceQuery(request *http.Request, allowed ...string) (url.Values, error) {
	query, err := url.ParseQuery(request.URL.RawQuery)
	if err != nil {
		return nil, ErrInvalid
	}
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, key := range allowed {
		allowedSet[key] = struct{}{}
	}
	for key, values := range query {
		if _, ok := allowedSet[key]; !ok || len(values) != 1 || values[0] == "" {
			return nil, ErrInvalid
		}
	}
	for _, key := range allowed {
		if len(query[key]) != 1 {
			return nil, ErrInvalid
		}
	}
	return query, nil
}

func evaluationServiceOptionalQuery(request *http.Request, allowed ...string) (url.Values, error) {
	query, err := url.ParseQuery(request.URL.RawQuery)
	if err != nil {
		return nil, ErrInvalid
	}
	allowedSet := make(map[string]struct{}, len(allowed))
	for _, key := range allowed {
		allowedSet[key] = struct{}{}
	}
	for key, values := range query {
		if _, ok := allowedSet[key]; !ok || len(values) != 1 || values[0] == "" {
			return nil, ErrInvalid
		}
	}
	return query, nil
}

func parseEvaluationServiceInt(raw string, minimum int64) (int64, error) {
	value, err := strconv.ParseInt(raw, 10, 64)
	if err != nil || value < minimum || value > 9_007_199_254_740_991 || strconv.FormatInt(value, 10) != raw {
		return 0, ErrInvalid
	}
	return value, nil
}

func parseEvaluationServiceInstant(raw string) (time.Time, error) {
	value, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil || value.UTC().Format("2006-01-02T15:04:05.000Z") != raw {
		return time.Time{}, ErrInvalid
	}
	return value.UTC(), nil
}

func replayStatus(replayed bool) int {
	if replayed {
		return http.StatusOK
	}
	return http.StatusCreated
}

func methodNotAllowed(writer http.ResponseWriter, methods ...string) {
	writer.Header().Set("Allow", strings.Join(methods, ", "))
	writeEvaluationServiceError(writer, http.StatusMethodNotAllowed, "EVAL-9001", "Evaluation ledger method is not allowed.")
}

func respondEvaluationServiceError(writer http.ResponseWriter, err error) {
	switch {
	case errors.Is(err, errEvaluationServiceRequestTooLarge):
		writeEvaluationServiceError(writer, http.StatusRequestEntityTooLarge, "EVAL-9001", "Evaluation ledger request exceeds its byte limit.")
	case errors.Is(err, ErrInvalid):
		writeEvaluationServiceError(writer, http.StatusBadRequest, "EVAL-9001", "Evaluation ledger request is invalid.")
	case errors.Is(err, ErrUnauthorized):
		writeEvaluationServiceError(writer, http.StatusForbidden, "EVAL-7001", "Evaluation ledger authority was rejected.")
	case errors.Is(err, ErrNotFound):
		writeEvaluationServiceError(writer, http.StatusNotFound, "EVAL-6004", "Evaluation ledger record was not found.")
	case errors.Is(err, ErrConflict), errors.Is(err, ErrLeaseBusy), errors.Is(err, ErrTerminal):
		writeEvaluationServiceError(writer, http.StatusConflict, "EVAL-6004", "Evaluation ledger operation conflicts with durable state.")
	case errors.Is(err, errEvaluationServiceUnavailable), errors.Is(err, context.DeadlineExceeded), errors.Is(err, context.Canceled):
		writeEvaluationServiceError(writer, http.StatusServiceUnavailable, "EVAL-9001", "Evaluation ledger operation is unavailable.")
	default:
		writeEvaluationServiceError(writer, http.StatusInternalServerError, "EVAL-9001", "Evaluation ledger operation failed.")
	}
}

func writeEvaluationServiceError(writer http.ResponseWriter, status int, code, message string) {
	writeEvaluationServiceJSON(writer, status, struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	}{Code: code, Message: message})
}

func writeEvaluationServiceJSON(writer http.ResponseWriter, status int, value any) {
	source, err := json.Marshal(value)
	if err != nil || len(source) > maximumEvaluationServiceResponseBytes {
		if status < 400 {
			writeEvaluationServiceError(writer, http.StatusInternalServerError, "EVAL-9001", "Evaluation ledger response exceeds its byte limit.")
		}
		return
	}
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_, _ = writer.Write(source)
}

func writeEvaluationServiceRaw(writer http.ResponseWriter, status int, source []byte) {
	if len(source) == 0 || len(source) > maximumEvaluationServiceResponseBytes {
		respondEvaluationServiceError(writer, errEvaluationServiceResponseTooLarge)
		return
	}
	writer.Header().Set("Content-Type", "application/json; charset=utf-8")
	writer.WriteHeader(status)
	_, _ = writer.Write(source)
}

func writeEvaluationServiceFact(writer http.ResponseWriter, status int, source []byte, replayed *bool) {
	response := struct {
		Fact     json.RawMessage `json:"fact"`
		Replayed *bool           `json:"replayed,omitempty"`
	}{Fact: json.RawMessage(source), Replayed: replayed}
	writeEvaluationServiceJSON(writer, status, response)
}

func writeEvaluationServiceLease(writer http.ResponseWriter, status int, lease EvaluationShardLease, replayed *bool) {
	writeEvaluationServiceJSON(writer, status, struct {
		PlanDigest  string `json:"planDigest"`
		ShardID     string `json:"shardId"`
		OwnerID     string `json:"ownerId"`
		Generation  int64  `json:"generation"`
		LeaseDigest string `json:"leaseDigest"`
		AcquiredAt  string `json:"acquiredAt"`
		ExpiresAt   string `json:"expiresAt"`
		Replayed    *bool  `json:"replayed,omitempty"`
	}{
		PlanDigest: lease.PlanDigest, ShardID: lease.ShardID, OwnerID: lease.OwnerID,
		Generation: lease.Generation, LeaseDigest: lease.LeaseDigest,
		AcquiredAt: evaluationExportInstant(lease.AcquiredAt), ExpiresAt: evaluationExportInstant(lease.ExpiresAt), Replayed: replayed,
	})
}

type evaluationServiceBudgetReservationResponse struct {
	ReservationID  string          `json:"reservationId"`
	LedgerRevision int64           `json:"ledgerRevision"`
	DemandDigest   string          `json:"demandDigest"`
	Demand         json.RawMessage `json:"demand"`
	ReservedAt     string          `json:"reservedAt"`
	Replayed       *bool           `json:"replayed,omitempty"`
}

func evaluationBudgetReservationResponse(record EvaluationBudgetReservationRecord, replayed *bool) evaluationServiceBudgetReservationResponse {
	return evaluationServiceBudgetReservationResponse{
		ReservationID: record.ReservationID, LedgerRevision: record.LedgerRevision,
		DemandDigest: record.DemandDigest, Demand: json.RawMessage(record.DemandBytes),
		ReservedAt: evaluationExportInstant(record.ReservedAt), Replayed: replayed,
	}
}

type evaluationServiceBudgetSettlementResponse struct {
	ReservationID    string          `json:"reservationId"`
	LedgerRevision   int64           `json:"ledgerRevision"`
	SettlementDigest string          `json:"settlementDigest"`
	Settlement       json.RawMessage `json:"settlement"`
	SettledAt        string          `json:"settledAt"`
	Replayed         *bool           `json:"replayed,omitempty"`
}

func evaluationBudgetSettlementResponse(record EvaluationBudgetSettlementRecord, replayed *bool) evaluationServiceBudgetSettlementResponse {
	return evaluationServiceBudgetSettlementResponse{
		ReservationID: record.ReservationID, LedgerRevision: record.LedgerRevision,
		SettlementDigest: record.SettlementDigest, Settlement: json.RawMessage(record.SettlementBytes),
		SettledAt: evaluationExportInstant(record.SettledAt), Replayed: replayed,
	}
}

func writeEvaluationServiceBudget(writer http.ResponseWriter, snapshot EvaluationBudgetSnapshot) {
	reservations := make([]evaluationServiceBudgetReservationResponse, len(snapshot.Reservations))
	for index, record := range snapshot.Reservations {
		reservations[index] = evaluationBudgetReservationResponse(record, nil)
	}
	settlements := make([]evaluationServiceBudgetSettlementResponse, len(snapshot.Settlements))
	for index, record := range snapshot.Settlements {
		settlements[index] = evaluationBudgetSettlementResponse(record, nil)
	}
	writeEvaluationServiceJSON(writer, http.StatusOK, struct {
		PlanDigest              string                                       `json:"planDigest"`
		Revision                int64                                        `json:"revision"`
		UpdatedAt               string                                       `json:"updatedAt"`
		Reservations            []evaluationServiceBudgetReservationResponse `json:"reservations"`
		Settlements             []evaluationServiceBudgetSettlementResponse  `json:"settlements"`
		UnsettledReservationIDs []string                                     `json:"unsettledReservationIds"`
	}{
		PlanDigest: snapshot.PlanDigest, Revision: snapshot.Revision,
		UpdatedAt: evaluationExportInstant(snapshot.UpdatedAt), Reservations: reservations,
		Settlements: settlements, UnsettledReservationIDs: snapshot.UnsettledReservationIDs,
	})
}
