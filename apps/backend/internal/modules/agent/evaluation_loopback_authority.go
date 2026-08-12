package agent

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"io"
	"mime"
	"net"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"
	"unicode/utf8"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationLoopbackAuthorityRequestFormat  = "prodivix.agent-evaluation-owner-authority-request"
	evaluationLoopbackAuthorityResponseFormat = "prodivix.agent-evaluation-owner-authority-response"
	evaluationLoopbackAuthorityVersion        = int64(1)
	maximumEvaluationLoopbackAuthorityBytes   = maximumEvaluationControlledAuthorityResponseBytes + 65_536
	maximumEvaluationProductionCanarySetBytes = 2_900_000
)

// EvaluationLoopbackAuthorityConfig binds the ledger to one server-only owner
// sidecar. The sidecar is the composition point for the existing TypeScript
// Workspace/G3 and Verification owners; it is never exposed to a browser or a
// user session.
type EvaluationLoopbackAuthorityConfig struct {
	BaseURL      string
	ServiceToken string
	Purpose      string
	HTTPClient   *http.Client
}

// EvaluationLoopbackAuthorityClient implements only the narrow owner bridge.
// It deliberately has no Workspace or Verification business logic.
type EvaluationLoopbackAuthorityClient struct {
	baseURL                                            string
	serviceToken                                       string
	purpose                                            string
	httpClient                                         *http.Client
	readyMu                                            sync.RWMutex
	attemptImplementationDigests                       map[string]string
	g3CellAdmissionImplementationDigest                string
	capabilityProbeImplementationDigest                string
	capabilityProbeResourceImplementationDigest        string
	capabilityProbeResourceCleanupImplementationDigest string
	runtimeFactSourceRegistrationImplementationDigest  string
	controlledWorkspaceImplementationDigest            string
	verificationEvidenceImplementationDigest           string
	ownerAuthorityHealthDigest                         string
}

func NewEvaluationLoopbackAuthorityClient(
	config EvaluationLoopbackAuthorityConfig,
) (*EvaluationLoopbackAuthorityClient, error) {
	parsed, err := url.Parse(config.BaseURL)
	if err != nil || parsed.Scheme != "http" || parsed.User != nil || parsed.RawQuery != "" ||
		parsed.Fragment != "" || parsed.Path != "" || parsed.RawPath != "" || parsed.Host == "" ||
		!validEvaluationServiceToken(config.ServiceToken) ||
		!oneOfString(config.Purpose, "preplan", "full-attempt") {
		return nil, ErrInvalid
	}
	host := parsed.Hostname()
	port, portErr := strconv.Atoi(parsed.Port())
	ip := net.ParseIP(host)
	if portErr != nil || port < 1 || port > 65_535 || ip == nil || !ip.IsLoopback() {
		return nil, ErrInvalid
	}
	client := config.HTTPClient
	if client == nil {
		client = &http.Client{
			Timeout: 179 * time.Second,
			Transport: &http.Transport{
				Proxy:                 nil,
				DialContext:           (&net.Dialer{Timeout: 5 * time.Second, KeepAlive: 30 * time.Second}).DialContext,
				ForceAttemptHTTP2:     false,
				MaxIdleConns:          16,
				MaxIdleConnsPerHost:   16,
				IdleConnTimeout:       30 * time.Second,
				ResponseHeaderTimeout: 30 * time.Second,
			},
			CheckRedirect: func(*http.Request, []*http.Request) error {
				return errors.New("evaluation owner authority redirect denied")
			},
		}
	}
	return &EvaluationLoopbackAuthorityClient{
		baseURL: strings.TrimSuffix(config.BaseURL, "/"), serviceToken: config.ServiceToken,
		purpose: config.Purpose, httpClient: client,
	}, nil
}

// VerifyReady pins every independently implemented owner family before the
// ledger starts serving. Each routed request carries its selected family
// implementation digest, so a swapped sidecar cannot reconcile under a
// different implementation.
func (client *EvaluationLoopbackAuthorityClient) VerifyReady(ctx context.Context) error {
	request, err := http.NewRequestWithContext(ctx, http.MethodGet, client.baseURL+"/healthz", nil)
	if err != nil {
		return errEvaluationServiceUnavailable
	}
	request.Header.Set("Accept", "application/json")
	response, err := client.httpClient.Do(request)
	if err != nil {
		return errEvaluationServiceUnavailable
	}
	defer response.Body.Close()
	mediaType, _, mediaErr := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if response.StatusCode != http.StatusOK || mediaErr != nil || mediaType != "application/json" ||
		response.Header.Get("Content-Encoding") != "" && response.Header.Get("Content-Encoding") != "identity" ||
		response.ContentLength > 65_536 {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 8_192))
		return errEvaluationServiceUnavailable
	}
	source, err := io.ReadAll(io.LimitReader(response.Body, 65_537))
	if err != nil || len(source) > 65_536 {
		return errEvaluationServiceUnavailable
	}
	value, err := decodeCanonicalEvaluationObject(source, 65_536)
	if err != nil || stringMember(value, "format") != "prodivix.agent-evaluation-owner-authority-health" ||
		stringMember(value, "purpose") != client.purpose || stringMember(value, "status") != "ready" {
		return errEvaluationServiceUnavailable
	}
	healthKeys := []string{
		"format", "version", "purpose", "status", "replayJournalImplementationDigest", "healthDigest",
	}
	digestFields := []string{"replayJournalImplementationDigest", "healthDigest"}
	if client.purpose == "preplan" {
		ownerFields := []string{
			"capabilityProbeAuthorityDigest", "capabilityProbeProviderResourceAuthorityDigest",
			"capabilityProbeProviderResourceCleanupAuthorityDigest", "runtimeFactSourceRegistrationAuthorityDigest",
		}
		healthKeys = append(healthKeys, ownerFields...)
		digestFields = append(digestFields, ownerFields...)
	} else {
		ownerFields := []string{
			"controlledWorkspaceAuthorityDigest", "verificationEvidenceAuthorityDigest",
			"providerCapabilityAuthorityDigest", "attemptGradingAuthorityDigest",
		}
		healthKeys = append(healthKeys, ownerFields...)
		digestFields = append(digestFields, ownerFields...)
	}
	if !exactEvaluationKeys(value, healthKeys) {
		return errEvaluationServiceUnavailable
	}
	version, versionOK := integerMember(value, "version")
	if !versionOK || version != evaluationLoopbackAuthorityVersion {
		return errEvaluationServiceUnavailable
	}
	for _, field := range digestFields {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return errEvaluationServiceUnavailable
		}
	}
	base := cloneEvaluationObject(value)
	delete(base, "healthDigest")
	healthDigest, err := canonicaljson.Digest(base)
	if err != nil || healthDigest != stringMember(value, "healthDigest") {
		return errEvaluationServiceUnavailable
	}
	client.readyMu.Lock()
	defer client.readyMu.Unlock()
	if client.ownerAuthorityHealthDigest != "" && client.ownerAuthorityHealthDigest != healthDigest {
		return errEvaluationServiceUnavailable
	}
	if client.purpose == "preplan" {
		capabilityProbeDigest := stringMember(value, "capabilityProbeAuthorityDigest")
		capabilityProbeResourceDigest := stringMember(value, "capabilityProbeProviderResourceAuthorityDigest")
		capabilityProbeResourceCleanupDigest := stringMember(value, "capabilityProbeProviderResourceCleanupAuthorityDigest")
		runtimeFactSourceRegistrationDigest := stringMember(value, "runtimeFactSourceRegistrationAuthorityDigest")
		if client.capabilityProbeImplementationDigest != "" && client.capabilityProbeImplementationDigest != capabilityProbeDigest ||
			client.capabilityProbeResourceImplementationDigest != "" &&
				client.capabilityProbeResourceImplementationDigest != capabilityProbeResourceDigest ||
			client.capabilityProbeResourceCleanupImplementationDigest != "" &&
				client.capabilityProbeResourceCleanupImplementationDigest != capabilityProbeResourceCleanupDigest ||
			client.runtimeFactSourceRegistrationImplementationDigest != "" &&
				client.runtimeFactSourceRegistrationImplementationDigest != runtimeFactSourceRegistrationDigest {
			return errEvaluationServiceUnavailable
		}
		client.capabilityProbeImplementationDigest = capabilityProbeDigest
		client.capabilityProbeResourceImplementationDigest = capabilityProbeResourceDigest
		client.capabilityProbeResourceCleanupImplementationDigest = capabilityProbeResourceCleanupDigest
		client.runtimeFactSourceRegistrationImplementationDigest = runtimeFactSourceRegistrationDigest
		client.ownerAuthorityHealthDigest = healthDigest
		return nil
	}
	digests := map[string]string{
		"provider-capability": stringMember(value, "providerCapabilityAuthorityDigest"),
		"attempt-grading":     stringMember(value, "attemptGradingAuthorityDigest"),
	}
	controlledDigest := stringMember(value, "controlledWorkspaceAuthorityDigest")
	verificationDigest := stringMember(value, "verificationEvidenceAuthorityDigest")
	if len(client.attemptImplementationDigests) != 0 {
		for kind, digest := range digests {
			if client.attemptImplementationDigests[kind] != digest {
				return errEvaluationServiceUnavailable
			}
		}
	}
	if client.g3CellAdmissionImplementationDigest != "" &&
		client.g3CellAdmissionImplementationDigest != controlledDigest {
		return errEvaluationServiceUnavailable
	}
	if client.controlledWorkspaceImplementationDigest != "" &&
		client.controlledWorkspaceImplementationDigest != controlledDigest ||
		client.verificationEvidenceImplementationDigest != "" &&
			client.verificationEvidenceImplementationDigest != verificationDigest {
		return errEvaluationServiceUnavailable
	}
	client.attemptImplementationDigests = digests
	client.g3CellAdmissionImplementationDigest = controlledDigest
	client.controlledWorkspaceImplementationDigest = controlledDigest
	client.verificationEvidenceImplementationDigest = verificationDigest
	client.ownerAuthorityHealthDigest = healthDigest
	return nil
}

// OwnerAuthorityHealthBinding exposes only the exact health commitment that
// VerifyReady already validated and pinned.
func (client *EvaluationLoopbackAuthorityClient) OwnerAuthorityHealthBinding() (string, string, bool) {
	if client == nil {
		return "", "", false
	}
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	return client.purpose, client.ownerAuthorityHealthDigest,
		evaluationDigestPattern.MatchString(client.ownerAuthorityHealthDigest)
}

func (client *EvaluationLoopbackAuthorityClient) AttemptAuthorityImplementationDigest(
	serviceKind string,
) (string, bool) {
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	digest, ok := client.attemptImplementationDigests[serviceKind]
	return digest, ok
}

func (client *EvaluationLoopbackAuthorityClient) G3CellAdmissionImplementationDigest() (string, bool) {
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	return client.g3CellAdmissionImplementationDigest,
		evaluationDigestPattern.MatchString(client.g3CellAdmissionImplementationDigest)
}

func (client *EvaluationLoopbackAuthorityClient) ControlledWorkspaceImplementationDigest() (string, bool) {
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	return client.controlledWorkspaceImplementationDigest,
		evaluationDigestPattern.MatchString(client.controlledWorkspaceImplementationDigest)
}

func (client *EvaluationLoopbackAuthorityClient) VerificationEvidenceImplementationDigest() (string, bool) {
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	return client.verificationEvidenceImplementationDigest,
		evaluationDigestPattern.MatchString(client.verificationEvidenceImplementationDigest)
}

type evaluationLoopbackAuthorityRequest struct {
	Format                                        string          `json:"format"`
	Version                                       int64           `json:"version"`
	ServiceKind                                   string          `json:"serviceKind"`
	Mode                                          string          `json:"mode"`
	NamespaceID                                   string          `json:"namespaceId"`
	PlanDigest                                    string          `json:"planDigest,omitempty"`
	RepositoryCommit                              string          `json:"repositoryCommit"`
	Operation                                     string          `json:"operation"`
	RouteBinding                                  string          `json:"routeBinding"`
	SessionID                                     string          `json:"sessionId,omitempty"`
	RequestDigest                                 string          `json:"requestDigest"`
	AttemptID                                     string          `json:"attemptId,omitempty"`
	DescriptorDigest                              string          `json:"descriptorDigest,omitempty"`
	Generation                                    int64           `json:"generation,omitempty"`
	GrantDigest                                   string          `json:"controlledWorkspaceGrantDigest,omitempty"`
	AuthorityDigest                               string          `json:"authorityDigest,omitempty"`
	Registration                                  string          `json:"sandboxRegistrationReceiptDigest,omitempty"`
	ShardLeaseOwnerID                             string          `json:"shardLeaseOwnerId,omitempty"`
	ShardLeaseGeneration                          int64           `json:"shardLeaseGeneration,omitempty"`
	VerificationGrantGeneration                   int64           `json:"verificationGrantGeneration,omitempty"`
	VerificationGrantReceiptSetDigest             string          `json:"verificationAttemptGrantReceiptSetDigest,omitempty"`
	ProviderCapabilityObservationReceiptSetDigest string          `json:"providerCapabilityObservationReceiptSetDigest,omitempty"`
	OwnerImplementationDigest                     string          `json:"ownerImplementationDigest,omitempty"`
	RegistrationAuthorityIssuerID                 string          `json:"registrationAuthorityIssuerId,omitempty"`
	StageDigest                                   string          `json:"stageDigest,omitempty"`
	DispatchAckDigest                             string          `json:"dispatchAckDigest,omitempty"`
	ResultIngressDigest                           string          `json:"resultIngressDigest,omitempty"`
	ResultIngressReceiptDigest                    string          `json:"resultIngressReceiptDigest,omitempty"`
	SealedOwnerHealth                             json.RawMessage `json:"sealedOwnerHealth,omitempty"`
	SealedProbeObservation                        json.RawMessage `json:"sealedProbeObservation,omitempty"`
	SealedProbeObservationDigest                  string          `json:"sealedProbeObservationDigest,omitempty"`
	SealedProviderResourceResult                  json.RawMessage `json:"sealedProviderResourceResult,omitempty"`
	SealedProviderResourceCleanupReceipt          json.RawMessage `json:"sealedProviderResourceCleanupReceipt,omitempty"`
	OwnerStateID                                  string          `json:"ownerStateId,omitempty"`
	OwnerStateRevision                            json.RawMessage `json:"ownerStateRevision,omitempty"`
	OwnerStateBundle                              json.RawMessage `json:"ownerStateBundle,omitempty"`
	OwnerStateRootDigest                          json.RawMessage `json:"ownerStateRootDigest,omitempty"`
	SealedOwnerOperation                          json.RawMessage `json:"sealedOwnerOperation,omitempty"`
	ClaimGeneration                               int64           `json:"claimGeneration"`
	Payload                                       json.RawMessage `json:"payload"`
}

func (client *EvaluationLoopbackAuthorityClient) invoke(
	ctx context.Context,
	path string,
	requestDigest string,
	requestValue evaluationLoopbackAuthorityRequest,
	maximumResponse int64,
) (map[string]any, error) {
	expectedPurpose := "full-attempt"
	if oneOfString(
		requestValue.Operation,
		evaluationCapabilityProbeOperation,
		evaluationCapabilityProbeProviderResourceOperation,
		evaluationCapabilityProbeProviderResourceCleanupOperation,
		evaluationRuntimeFactSourceRegistrationOperation,
	) {
		expectedPurpose = "preplan"
	}
	if client.purpose != expectedPurpose {
		return nil, errEvaluationServiceUnavailable
	}
	body, err := canonicaljson.Bytes(requestValue)
	if err != nil || len(body) > maximumEvaluationLoopbackAuthorityBytes {
		return nil, ErrInvalid
	}
	request, err := http.NewRequestWithContext(
		ctx, http.MethodPost, client.baseURL+path, bytes.NewReader(body),
	)
	if err != nil {
		return nil, errEvaluationServiceUnavailable
	}
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Authorization", "Bearer "+client.serviceToken)
	request.Header.Set("Content-Type", "application/json")
	request.Header.Set("Idempotency-Key", requestDigest)
	response, err := client.httpClient.Do(request)
	request.Header.Del("Authorization")
	if err != nil {
		return nil, errEvaluationServiceUnavailable
	}
	defer response.Body.Close()
	mediaType, _, mediaErr := mime.ParseMediaType(response.Header.Get("Content-Type"))
	if response.StatusCode != http.StatusOK || mediaErr != nil || mediaType != "application/json" ||
		response.Header.Get("Content-Encoding") != "" && response.Header.Get("Content-Encoding") != "identity" ||
		response.ContentLength > maximumResponse {
		_, _ = io.Copy(io.Discard, io.LimitReader(response.Body, 8_192))
		return nil, errEvaluationServiceUnavailable
	}
	source, err := io.ReadAll(io.LimitReader(response.Body, maximumResponse+1))
	if err != nil || int64(len(source)) > maximumResponse {
		return nil, errEvaluationServiceUnavailable
	}
	value, err := decodeCanonicalEvaluationObject(source, int(maximumResponse))
	if err != nil || stringMember(value, "format") != evaluationLoopbackAuthorityResponseFormat ||
		stringMember(value, "requestDigest") != requestDigest ||
		stringMember(value, "serviceKind") != requestValue.ServiceKind ||
		stringMember(value, "mode") != requestValue.Mode {
		return nil, errEvaluationServiceUnavailable
	}
	version, versionOK := integerMember(value, "version")
	if !versionOK || version != evaluationLoopbackAuthorityVersion {
		return nil, errEvaluationServiceUnavailable
	}
	return value, nil
}

func loopbackControlledWorkspaceFacts(
	value map[string]any,
	mode string,
	request EvaluationControlledWorkspaceAuthorityRequest,
) ([]json.RawMessage, bool, error) {
	required := []string{"format", "version", "serviceKind", "mode", "requestDigest", "facts"}
	if mode != "read" {
		required = append(required, "ownerImplementationDigest", "stageDigest", "dispatchAckDigest")
	}
	if mode == "reconcile" {
		required = append(required, "reconciled")
	}
	if !oneOfString(mode, "read", "execute", "reconcile") || !exactEvaluationKeys(value, required) {
		return nil, false, errEvaluationServiceUnavailable
	}
	entries, ok := value["facts"].([]any)
	if !ok || len(entries) > maximumEvaluationControlledWorkspaceFacts {
		return nil, false, errEvaluationServiceUnavailable
	}
	facts := make([]json.RawMessage, len(entries))
	for index, entry := range entries {
		fact, err := canonicaljson.Bytes(entry)
		if err != nil || len(fact) > maximumEvaluationControlledAuthorityResponseBytes {
			return nil, false, errEvaluationServiceUnavailable
		}
		facts[index] = fact
	}
	reconciled := true
	if mode == "reconcile" {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok || !reconciled {
			return nil, false, errEvaluationServiceUnavailable
		}
	}
	if mode != "read" {
		ownerImplementationDigest := stringMember(value, "ownerImplementationDigest")
		stageDigest := stringMember(value, "stageDigest")
		dispatchAckDigest := stringMember(value, "dispatchAckDigest")
		partition := EvaluationPlanPartition{PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit}
		route := evaluationControlledWorkspaceRoute{Operation: request.Operation, RouteBinding: request.RouteBinding}
		expectedStage, stageErr := evaluationControlledWorkspaceDirectStageDigest(
			request.NamespaceID, partition, route, request.RequestDigest, request.OwnerImplementationDigest,
		)
		expectedAck, ackErr := evaluationControlledWorkspaceDirectDispatchAckDigest(
			request.NamespaceID, partition, route, request.RequestDigest,
			request.OwnerImplementationDigest, request.StageDigest, facts,
		)
		if stageErr != nil || ackErr != nil || ownerImplementationDigest != request.OwnerImplementationDigest ||
			stageDigest != request.StageDigest || stageDigest != expectedStage || dispatchAckDigest != expectedAck ||
			(mode == "execute" && request.DispatchAckDigest != "") ||
			(mode == "reconcile" && request.DispatchAckDigest != dispatchAckDigest) {
			return nil, false, errEvaluationServiceUnavailable
		}
	}
	return facts, reconciled, nil
}

func controlledLoopbackRequest(
	mode string,
	request EvaluationControlledWorkspaceAuthorityRequest,
) evaluationLoopbackAuthorityRequest {
	value := evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: "controlled-workspace", Mode: mode, NamespaceID: request.NamespaceID,
		PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit,
		Operation: request.Operation, RouteBinding: request.RouteBinding, SessionID: request.SessionID,
		RequestDigest: request.RequestDigest, AttemptID: request.AttemptID,
		DescriptorDigest: request.DescriptorDigest, GrantDigest: request.GrantDigest,
		Generation: request.Generation, ClaimGeneration: request.ClaimGeneration,
		OwnerImplementationDigest: request.OwnerImplementationDigest,
		StageDigest:               request.StageDigest, DispatchAckDigest: request.DispatchAckDigest,
		Payload: append(json.RawMessage(nil), request.Payload...),
	}
	applyEvaluationOwnerStateLoopbackFields(
		&value, request.OwnerStateID, request.OwnerStateRevision, request.OwnerStateBundle,
		request.OwnerStateRootDigest, request.SealedOwnerOperation,
	)
	return value
}

func evaluationOwnerStateRawString(value string) json.RawMessage {
	if value == "" {
		return json.RawMessage("null")
	}
	source, _ := canonicaljson.Bytes(value)
	return source
}

func applyEvaluationOwnerStateLoopbackFields(
	value *evaluationLoopbackAuthorityRequest,
	ownerStateID string,
	revision int64,
	bundle json.RawMessage,
	rootDigest string,
	sealedOperation json.RawMessage,
) {
	if value == nil || ownerStateID == "" {
		return
	}
	value.OwnerStateID = ownerStateID
	value.OwnerStateRevision = json.RawMessage(strconv.FormatInt(revision, 10))
	if len(bundle) == 0 {
		value.OwnerStateBundle = json.RawMessage("null")
	} else {
		value.OwnerStateBundle = append(json.RawMessage(nil), bundle...)
	}
	value.OwnerStateRootDigest = evaluationOwnerStateRawString(rootDigest)
	value.SealedOwnerOperation = append(json.RawMessage(nil), sealedOperation...)
}

func loopbackOwnerStateNullableDigest(value map[string]any, key string) (string, bool) {
	if value[key] == nil {
		return "", true
	}
	digest := stringMember(value, key)
	return digest, evaluationDigestPattern.MatchString(digest)
}

func loopbackOwnerStateStageDigest(
	value map[string]any,
	serviceKind string,
	requestDigest string,
	ownerImplementationDigest string,
	ownerStateID string,
	priorRevision int64,
	priorRootDigest string,
) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "ownerImplementationDigest",
		"ownerStateId", "priorOwnerStateRevision", "priorOwnerStateRootDigest", "stageDigest",
	}) || stringMember(value, "serviceKind") != serviceKind || stringMember(value, "mode") != "stage" ||
		stringMember(value, "requestDigest") != requestDigest ||
		stringMember(value, "ownerImplementationDigest") != ownerImplementationDigest ||
		stringMember(value, "ownerStateId") != ownerStateID {
		return "", errEvaluationServiceUnavailable
	}
	revision, revisionOK := integerMember(value, "priorOwnerStateRevision")
	root, rootOK := loopbackOwnerStateNullableDigest(value, "priorOwnerStateRootDigest")
	stage := stringMember(value, "stageDigest")
	if !revisionOK || revision != priorRevision || !rootOK || root != priorRootDigest ||
		!evaluationDigestPattern.MatchString(stage) {
		return "", errEvaluationServiceUnavailable
	}
	return stage, nil
}

func loopbackOwnerStateTransition(
	value map[string]any,
	serviceKind, operation, routeBinding string,
	requestDigest string,
	ownerImplementationDigest string,
	requestOwnerStateID string,
	requestRevision int64,
	requestRootDigest string,
	sealedOperation json.RawMessage,
	reconcile bool,
	includeAuthorityResponse bool,
) (EvaluationOwnerStateTransition, bool, error) {
	required := []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "ownerImplementationDigest",
		"ownerStateId", "priorOwnerStateRevision", "priorOwnerStateRootDigest", "stageDigest",
		"publicResult", "responseDigest", "dispatchAckDigest", "ownerStateRevision",
		"ownerStateBundle", "ownerStateRootDigest", "resultReceiptDigest",
	}
	if reconcile {
		required = append(required, "reconciled")
	}
	if includeAuthorityResponse {
		required = append(required, "response")
	}
	if !exactEvaluationKeys(value, required) || stringMember(value, "serviceKind") != serviceKind ||
		stringMember(value, "mode") != map[bool]string{false: "execute", true: "reconcile"}[reconcile] ||
		stringMember(value, "requestDigest") != requestDigest ||
		stringMember(value, "ownerImplementationDigest") != ownerImplementationDigest ||
		stringMember(value, "ownerStateId") != requestOwnerStateID {
		return EvaluationOwnerStateTransition{}, false, errEvaluationServiceUnavailable
	}
	priorRevision, priorOK := integerMember(value, "priorOwnerStateRevision")
	priorRoot, priorRootOK := loopbackOwnerStateNullableDigest(value, "priorOwnerStateRootDigest")
	revision, revisionOK := integerMember(value, "ownerStateRevision")
	publicResult, resultErr := canonicaljson.Bytes(value["publicResult"])
	var authorityResponse json.RawMessage
	var authorityResponseErr error
	if includeAuthorityResponse {
		authorityResponse, authorityResponseErr = canonicaljson.Bytes(value["response"])
	}
	bundle, bundleErr := canonicaljson.Bytes(value["ownerStateBundle"])
	transition := EvaluationOwnerStateTransition{
		PublicResult: publicResult, AuthorityResponse: authorityResponse,
		ResponseDigest:            stringMember(value, "responseDigest"),
		OwnerImplementationDigest: ownerImplementationDigest, OwnerStateID: requestOwnerStateID,
		PriorRevision: priorRevision, PriorRootDigest: priorRoot, StageDigest: stringMember(value, "stageDigest"),
		DispatchAckDigest: stringMember(value, "dispatchAckDigest"), OwnerStateRevision: revision,
		OwnerStateBundle: bundle, OwnerStateRootDigest: stringMember(value, "ownerStateRootDigest"),
		ResultReceiptDigest: stringMember(value, "resultReceiptDigest"),
	}
	reconciled := true
	if reconcile {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok || !reconciled {
			return EvaluationOwnerStateTransition{}, false, errEvaluationServiceUnavailable
		}
	}
	if !priorOK || !priorRootOK || !revisionOK || resultErr != nil || bundleErr != nil || authorityResponseErr != nil {
		return EvaluationOwnerStateTransition{}, false, errEvaluationServiceUnavailable
	}
	if !reconcile {
		if priorRevision != requestRevision || priorRoot != requestRootDigest {
			return EvaluationOwnerStateTransition{}, false, errEvaluationServiceUnavailable
		}
	} else {
		sealed, err := decodeEvaluationOwnerStateSealedOperation(sealedOperation)
		if err != nil || sealed.RequestDigest != requestDigest || sealed.OwnerStateID != requestOwnerStateID ||
			sealed.OwnerStateRevision != requestRevision || sealed.OwnerStateRootDigest != requestRootDigest ||
			sealed.ResultReceiptDigest != transition.ResultReceiptDigest ||
			!bytes.Equal(sealed.PublicResult, transition.PublicResult) {
			return EvaluationOwnerStateTransition{}, false, errEvaluationServiceUnavailable
		}
	}
	return transition, reconciled, nil
}

func (client *EvaluationLoopbackAuthorityClient) ReadControlledWorkspace(
	ctx context.Context,
	request EvaluationControlledWorkspaceAuthorityRequest,
) ([]json.RawMessage, error) {
	value, err := client.invoke(ctx, "/v1/controlled-workspace/read", request.RequestDigest,
		controlledLoopbackRequest("read", request), maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil {
		return nil, err
	}
	facts, _, err := loopbackControlledWorkspaceFacts(value, "read", request)
	return facts, err
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteControlledWorkspace(
	ctx context.Context,
	request EvaluationControlledWorkspaceAuthorityRequest,
) ([]json.RawMessage, error) {
	value, err := client.invoke(ctx, "/v1/controlled-workspace/execute", request.RequestDigest,
		controlledLoopbackRequest("execute", request), maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil {
		return nil, err
	}
	facts, _, err := loopbackControlledWorkspaceFacts(value, "execute", request)
	return facts, err
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileControlledWorkspace(
	ctx context.Context,
	request EvaluationControlledWorkspaceAuthorityRequest,
) ([]json.RawMessage, bool, error) {
	value, err := client.invoke(ctx, "/v1/controlled-workspace/reconcile", request.RequestDigest,
		controlledLoopbackRequest("reconcile", request), maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil {
		return nil, false, err
	}
	return loopbackControlledWorkspaceFacts(value, "reconcile", request)
}

func validateControlledWorkspaceOwnerStateAuthorityRequest(
	mode string,
	request EvaluationControlledWorkspaceAuthorityRequest,
) error {
	partition := EvaluationPlanPartition{PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit}
	ownerStateID, err := evaluationOwnerStateIdentity(
		"controlled-workspace", request.NamespaceID, partition, request.AttemptID,
		request.DescriptorDigest, request.GrantDigest, request.Generation,
	)
	if err != nil || ownerStateID != request.OwnerStateID || request.ClaimGeneration != 1 ||
		!evaluationOwnerStatefulOperation("controlled-workspace", request.Operation, request.RouteBinding) ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) {
		return ErrInvalid
	}
	if request.OwnerStateRevision == 0 {
		if len(request.OwnerStateBundle) != 0 || request.OwnerStateRootDigest != "" {
			return ErrInvalid
		}
	} else {
		_, root, decodeErr := decodeEvaluationOwnerStateBundle(
			request.OwnerStateBundle, "controlled-workspace", request.NamespaceID, partition,
			request.OwnerStateID, request.OwnerStateRevision, evaluationOwnerStatePreviousRoot(request.OwnerStateBundle),
		)
		if decodeErr != nil || root != request.OwnerStateRootDigest {
			return ErrConflict
		}
	}
	expectedStage, err := evaluationOwnerStateStageDigest(
		"controlled-workspace", request.Operation, request.RouteBinding, request.RequestDigest,
		request.OwnerImplementationDigest, request.OwnerStateID, request.OwnerStateRevision, request.OwnerStateRootDigest,
	)
	if err != nil {
		return ErrInvalid
	}
	switch mode {
	case "stage":
		if request.StageDigest != "" || request.DispatchAckDigest != "" || len(request.SealedOwnerOperation) != 0 {
			return ErrInvalid
		}
	case "execute":
		if request.StageDigest != expectedStage || request.DispatchAckDigest != "" || len(request.SealedOwnerOperation) != 0 {
			return ErrInvalid
		}
	case "reconcile":
		sealed, sealedErr := decodeEvaluationOwnerStateSealedOperation(request.SealedOwnerOperation)
		if sealedErr != nil || sealed.ServiceKind != "controlled-workspace" ||
			sealed.Operation != request.Operation || sealed.RouteBinding != request.RouteBinding ||
			sealed.RequestDigest != request.RequestDigest || sealed.OwnerStateID != request.OwnerStateID ||
			sealed.OwnerStateRevision != request.OwnerStateRevision ||
			sealed.OwnerStateRootDigest != request.OwnerStateRootDigest ||
			sealed.StageDigest != request.StageDigest || sealed.DispatchAckDigest != request.DispatchAckDigest {
			return ErrInvalid
		}
	default:
		return ErrInvalid
	}
	return nil
}

func (client *EvaluationLoopbackAuthorityClient) StageControlledWorkspaceState(
	ctx context.Context,
	request EvaluationControlledWorkspaceAuthorityRequest,
) (string, error) {
	if err := validateControlledWorkspaceOwnerStateAuthorityRequest("stage", request); err != nil {
		return "", err
	}
	value, err := client.invoke(
		ctx, "/v1/controlled-workspace/stage", request.RequestDigest,
		controlledLoopbackRequest("stage", request), 65_536,
	)
	if err != nil {
		return "", err
	}
	stage, err := loopbackOwnerStateStageDigest(
		value, "controlled-workspace", request.RequestDigest, request.OwnerImplementationDigest,
		request.OwnerStateID, request.OwnerStateRevision, request.OwnerStateRootDigest,
	)
	expected, digestErr := evaluationOwnerStateStageDigest(
		"controlled-workspace", request.Operation, request.RouteBinding, request.RequestDigest,
		request.OwnerImplementationDigest, request.OwnerStateID, request.OwnerStateRevision,
		request.OwnerStateRootDigest,
	)
	if err != nil || digestErr != nil || stage != expected {
		return "", errEvaluationServiceUnavailable
	}
	return stage, nil
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteControlledWorkspaceState(
	ctx context.Context,
	request EvaluationControlledWorkspaceAuthorityRequest,
) (EvaluationOwnerStateTransition, error) {
	if err := validateControlledWorkspaceOwnerStateAuthorityRequest("execute", request); err != nil {
		return EvaluationOwnerStateTransition{}, err
	}
	value, err := client.invoke(
		ctx, "/v1/controlled-workspace/execute", request.RequestDigest,
		controlledLoopbackRequest("execute", request), maximumEvaluationOwnerStateOuterBytes,
	)
	if err != nil {
		return EvaluationOwnerStateTransition{}, err
	}
	transition, _, err := loopbackOwnerStateTransition(
		value, "controlled-workspace", request.Operation, request.RouteBinding, request.RequestDigest,
		request.OwnerImplementationDigest, request.OwnerStateID, request.OwnerStateRevision,
		request.OwnerStateRootDigest, nil, false, false,
	)
	if err != nil {
		return EvaluationOwnerStateTransition{}, err
	}
	partition := EvaluationPlanPartition{PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit}
	if _, err := validateEvaluationOwnerStateTransition(
		EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID},
		partition, transition, "controlled-workspace", request.Operation, request.RouteBinding, request.RequestDigest,
	); err != nil {
		return EvaluationOwnerStateTransition{}, errEvaluationServiceUnavailable
	}
	return transition, nil
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileControlledWorkspaceState(
	ctx context.Context,
	request EvaluationControlledWorkspaceAuthorityRequest,
) (EvaluationOwnerStateTransition, bool, error) {
	if err := validateControlledWorkspaceOwnerStateAuthorityRequest("reconcile", request); err != nil {
		return EvaluationOwnerStateTransition{}, false, err
	}
	value, err := client.invoke(
		ctx, "/v1/controlled-workspace/reconcile", request.RequestDigest,
		controlledLoopbackRequest("reconcile", request), maximumEvaluationOwnerStateOuterBytes,
	)
	if err != nil {
		return EvaluationOwnerStateTransition{}, false, err
	}
	transition, reconciled, err := loopbackOwnerStateTransition(
		value, "controlled-workspace", request.Operation, request.RouteBinding, request.RequestDigest,
		request.OwnerImplementationDigest, request.OwnerStateID, request.OwnerStateRevision,
		request.OwnerStateRootDigest, request.SealedOwnerOperation, true, false,
	)
	if err != nil {
		return EvaluationOwnerStateTransition{}, false, err
	}
	partition := EvaluationPlanPartition{PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit}
	if _, err := validateEvaluationOwnerStateTransition(
		EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID},
		partition, transition, "controlled-workspace", request.Operation, request.RouteBinding, request.RequestDigest,
	); err != nil {
		return EvaluationOwnerStateTransition{}, false, errEvaluationServiceUnavailable
	}
	return transition, reconciled, nil
}

func verificationLoopbackRequest(
	mode string,
	request EvaluationVerificationEvidenceAuthorityRequest,
) evaluationLoopbackAuthorityRequest {
	value := evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: "verification-evidence", Mode: mode, NamespaceID: request.NamespaceID,
		PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit,
		Operation: request.Operation, RouteBinding: request.RouteBinding, RequestDigest: request.RequestDigest,
		AttemptID: request.AttemptID, DescriptorDigest: request.DescriptorDigest, Generation: request.Generation,
		GrantDigest: request.ControlledWorkspaceGrantDigest, AuthorityDigest: request.AuthorityDigest,
		Registration: request.SandboxRegistrationReceiptDigest, ClaimGeneration: request.ClaimGeneration,
		OwnerImplementationDigest: request.OwnerImplementationDigest,
		StageDigest:               request.StageDigest, DispatchAckDigest: request.DispatchAckDigest,
		Payload: append(json.RawMessage(nil), request.Request...),
	}
	applyEvaluationOwnerStateLoopbackFields(
		&value, request.OwnerStateID, request.OwnerStateRevision, request.OwnerStateBundle,
		request.OwnerStateRootDigest, request.SealedOwnerOperation,
	)
	return value
}

func g3CellAdmissionLoopbackRequest(
	mode string,
	request EvaluationG3CellAdmissionAuthorityRequest,
) evaluationLoopbackAuthorityRequest {
	return evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: "controlled-workspace", Mode: mode, NamespaceID: request.NamespaceID,
		PlanDigest: request.EvaluationPlanDigest, RepositoryCommit: request.RepositoryCommit,
		Operation: evaluationG3CellAdmissionOperation, RouteBinding: evaluationG3CellAdmissionRouteBinding,
		RequestDigest: request.RequestDigest, AttemptID: request.AttemptID,
		DescriptorDigest: request.DescriptorDigest, Generation: request.Generation,
		OwnerImplementationDigest: request.OwnerImplementationDigest,
		StageDigest:               request.StageDigest, DispatchAckDigest: request.DispatchAckDigest,
		ClaimGeneration: request.ClaimGeneration, Payload: append(json.RawMessage(nil), request.Request...),
	}
}

func (client *EvaluationLoopbackAuthorityClient) CapabilityProbeAdmissionImplementationDigest() (string, bool) {
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	return client.capabilityProbeImplementationDigest,
		evaluationDigestPattern.MatchString(client.capabilityProbeImplementationDigest)
}

func (client *EvaluationLoopbackAuthorityClient) CapabilityProbeProviderResourceImplementationDigest() (string, bool) {
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	return client.capabilityProbeResourceImplementationDigest,
		evaluationDigestPattern.MatchString(client.capabilityProbeResourceImplementationDigest)
}

func (client *EvaluationLoopbackAuthorityClient) CapabilityProbeProviderResourceCleanupImplementationDigest() (string, bool) {
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	return client.capabilityProbeResourceCleanupImplementationDigest,
		evaluationDigestPattern.MatchString(client.capabilityProbeResourceCleanupImplementationDigest)
}

func (client *EvaluationLoopbackAuthorityClient) RuntimeFactSourceRegistrationImplementationDigest() (string, bool) {
	client.readyMu.RLock()
	defer client.readyMu.RUnlock()
	return client.runtimeFactSourceRegistrationImplementationDigest,
		evaluationDigestPattern.MatchString(client.runtimeFactSourceRegistrationImplementationDigest)
}

func capabilityProbeAdmissionLoopbackRequest(
	mode string,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
) evaluationLoopbackAuthorityRequest {
	return evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: "provider-capability", Mode: mode, NamespaceID: request.NamespaceID,
		RepositoryCommit: request.RepositoryCommit, Operation: evaluationCapabilityProbeOperation,
		RouteBinding: evaluationCapabilityProbeRouteBinding, RequestDigest: request.RequestDigest,
		OwnerImplementationDigest: request.OwnerImplementationDigest, StageDigest: request.StageDigest,
		DispatchAckDigest:            request.DispatchAckDigest,
		SealedProbeObservation:       append(json.RawMessage(nil), request.SealedProbeObservation...),
		SealedProbeObservationDigest: request.SealedProbeObservationDigest,
		ClaimGeneration:              request.ClaimGeneration,
		Payload:                      append(json.RawMessage(nil), request.Request...),
	}
}

func loopbackCapabilityProbeStageDigest(
	value map[string]any,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "serviceKind", "mode", "requestDigest",
		"ownerImplementationDigest", "stageDigest",
	}) || stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) {
		return "", errEvaluationServiceUnavailable
	}
	return stringMember(value, "stageDigest"), nil
}

func loopbackCapabilityProbeResult(
	value map[string]any,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
	reconcile bool,
) (EvaluationCapabilityProbeAdmissionAuthorityResult, bool, error) {
	required := []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "probeEvidence",
		"ownerImplementationDigest", "ownerAdmissionDigest", "stageDigest",
	}
	if reconcile {
		required = append(required, "dispatchAckDigest", "reconciled")
	}
	if !exactEvaluationKeys(value, required) ||
		stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		stringMember(value, "stageDigest") != request.StageDigest ||
		(reconcile && stringMember(value, "dispatchAckDigest") != request.DispatchAckDigest) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerAdmissionDigest")) {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	probeEvidence, err := canonicaljson.Bytes(value["probeEvidence"])
	if err != nil || len(probeEvidence) == 0 || len(probeEvidence) > 65_536 {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	reconciled := true
	if reconcile {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok {
			return EvaluationCapabilityProbeAdmissionAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	return EvaluationCapabilityProbeAdmissionAuthorityResult{
		ProbeEvidence: probeEvidence, OwnerAdmissionDigest: stringMember(value, "ownerAdmissionDigest"),
	}, reconciled, nil
}

func (client *EvaluationLoopbackAuthorityClient) StageCapabilityProbeAdmission(
	ctx context.Context,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
) (string, error) {
	implementationDigest, ready := client.CapabilityProbeAdmissionImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		request.StageDigest != "" || request.DispatchAckDigest != "" || request.ClaimGeneration != 1 ||
		len(request.SealedProbeObservation) != 0 || request.SealedProbeObservationDigest != "" ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) ||
		!evaluationDigestPattern.MatchString(request.RequestDigest) ||
		!evaluationRepositoryCommitPattern.MatchString(request.RepositoryCommit) {
		return "", ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/stage", request.RequestDigest,
		capabilityProbeAdmissionLoopbackRequest("stage", request), 65_536,
	)
	if err != nil {
		return "", err
	}
	return loopbackCapabilityProbeStageDigest(value, request)
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteCapabilityProbeAdmission(
	ctx context.Context,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
) (EvaluationCapabilityProbeAdmissionAuthorityResult, error) {
	implementationDigest, ready := client.CapabilityProbeAdmissionImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		!evaluationDigestPattern.MatchString(request.StageDigest) || request.DispatchAckDigest != "" ||
		len(request.SealedProbeObservation) != 0 || request.SealedProbeObservationDigest != "" ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/execute", request.RequestDigest,
		capabilityProbeAdmissionLoopbackRequest("execute", request), maximumEvaluationCapabilityProbeReferenceBytes+131_072,
	)
	if err != nil {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, err
	}
	result, _, err := loopbackCapabilityProbeResult(value, request, false)
	return result, err
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileCapabilityProbeAdmission(
	ctx context.Context,
	request EvaluationCapabilityProbeAdmissionAuthorityRequest,
) (EvaluationCapabilityProbeAdmissionAuthorityResult, bool, error) {
	implementationDigest, ready := client.CapabilityProbeAdmissionImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		!evaluationDigestPattern.MatchString(request.StageDigest) ||
		!evaluationDigestPattern.MatchString(request.DispatchAckDigest) ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) ||
		len(request.SealedProbeObservation) == 0 ||
		!evaluationDigestPattern.MatchString(request.SealedProbeObservationDigest) {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, false, ErrInvalid
	}
	sealedObservation, err := decodeCanonicalEvaluationObject(
		request.SealedProbeObservation, maximumEvaluationCapabilityProbeReferenceBytes+65_536,
	)
	computedObservationDigest, digestErr := canonicaljson.Digest(sealedObservation)
	if err != nil || digestErr != nil || computedObservationDigest != request.SealedProbeObservationDigest ||
		!exactEvaluationKeys(sealedObservation, []string{"probeEvidence", "referenceBundle", "ownerAdmissionDigest"}) {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, false, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/reconcile", request.RequestDigest,
		capabilityProbeAdmissionLoopbackRequest("reconcile", request), maximumEvaluationCapabilityProbeReferenceBytes+131_072,
	)
	if err != nil {
		return EvaluationCapabilityProbeAdmissionAuthorityResult{}, false, err
	}
	return loopbackCapabilityProbeResult(value, request, true)
}

func capabilityProbeProviderResourceLoopbackRequest(
	mode string,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) evaluationLoopbackAuthorityRequest {
	return evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: "provider-capability", Mode: mode, NamespaceID: request.NamespaceID,
		RepositoryCommit: request.RepositoryCommit, Operation: evaluationCapabilityProbeProviderResourceOperation,
		RouteBinding: evaluationCapabilityProbeProviderResourceRouteBinding, RequestDigest: request.RequestDigest,
		OwnerImplementationDigest: request.OwnerImplementationDigest, StageDigest: request.StageDigest,
		DispatchAckDigest: request.DispatchAckDigest, ResultIngressDigest: request.ResultIngressDigest,
		ResultIngressReceiptDigest:   request.ResultIngressReceiptDigest,
		SealedProviderResourceResult: append(json.RawMessage(nil), request.SealedProviderResourceResult...),
		ClaimGeneration:              request.ClaimGeneration, Payload: append(json.RawMessage(nil), request.Request...),
	}
}

func loopbackCapabilityProbeProviderResourceStageDigest(
	value map[string]any,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "ownerImplementationDigest", "stageDigest",
	}) || stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) {
		return "", errEvaluationServiceUnavailable
	}
	return stringMember(value, "stageDigest"), nil
}

func loopbackCapabilityProbeProviderResourceSealedResultDigest(
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) (string, error) {
	value, err := decodeCanonicalEvaluationObject(
		request.SealedProviderResourceResult, maximumEvaluationCapabilityProbeProviderResourceResultBytes,
	)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "requestDigest", "resourceManifest", "contentUploadReceipt",
		"deletionAuthorityReceipt", "providerResourceAuthority", "resultDigest",
	}) || stringMember(value, "format") != evaluationCapabilityProbeProviderResourceResultFormat ||
		stringMember(value, "requestDigest") != request.RequestDigest {
		return "", ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	base := cloneEvaluationObject(value)
	delete(base, "resultDigest")
	digest, digestErr := canonicaljson.Digest(base)
	if !versionOK || version != evaluationCapabilityProbeProviderResourceVersion || digestErr != nil ||
		digest != stringMember(value, "resultDigest") {
		return "", ErrConflict
	}
	return digest, nil
}

func validateLoopbackCapabilityProbeProviderResourceRequest(
	mode string,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) error {
	if request.ClaimGeneration != 1 || !validEvaluationAgentControlIdentity(request.NamespaceID) ||
		!evaluationRepositoryCommitPattern.MatchString(request.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(request.RequestDigest) ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) || len(request.Request) == 0 {
		return ErrInvalid
	}
	decoded, err := decodeEvaluationCapabilityProbeProviderResourceRegistrationRequest(request.Request, EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID,
	})
	if err != nil || decoded.RepositoryCommit != request.RepositoryCommit || decoded.RequestDigest != request.RequestDigest {
		return ErrInvalid
	}
	switch mode {
	case "stage":
		if request.StageDigest != "" || request.DispatchAckDigest != "" || request.ResultIngressDigest != "" ||
			request.ResultIngressReceiptDigest != "" || len(request.SealedProviderResourceResult) != 0 {
			return ErrInvalid
		}
	case "execute":
		if !evaluationDigestPattern.MatchString(request.StageDigest) || request.DispatchAckDigest != "" ||
			request.ResultIngressDigest != "" || request.ResultIngressReceiptDigest != "" ||
			len(request.SealedProviderResourceResult) != 0 {
			return ErrInvalid
		}
	case "reconcile":
		if !evaluationDigestPattern.MatchString(request.StageDigest) ||
			!evaluationDigestPattern.MatchString(request.DispatchAckDigest) ||
			!evaluationDigestPattern.MatchString(request.ResultIngressDigest) ||
			!evaluationDigestPattern.MatchString(request.ResultIngressReceiptDigest) ||
			len(request.SealedProviderResourceResult) == 0 {
			return ErrInvalid
		}
		resultDigest, resultErr := loopbackCapabilityProbeProviderResourceSealedResultDigest(request)
		ownerAdmissionDigest, ownerErr := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
			request.RequestDigest, resultDigest, request.OwnerImplementationDigest, request.StageDigest,
		)
		expectedAck, ackErr := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
			request.RequestDigest, resultDigest, ownerAdmissionDigest, request.OwnerImplementationDigest, request.StageDigest,
		)
		expectedIngressReceipt, receiptErr := evaluationCapabilityProbeProviderResourceIngressReceiptDigest(
			request.RequestDigest, request.ResultIngressDigest, resultDigest, expectedAck,
		)
		if resultErr != nil || ownerErr != nil || ackErr != nil || receiptErr != nil ||
			expectedAck != request.DispatchAckDigest || expectedIngressReceipt != request.ResultIngressReceiptDigest {
			return ErrConflict
		}
	default:
		return ErrInvalid
	}
	return nil
}

func loopbackCapabilityProbeProviderResourceResult(
	value map[string]any,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
	reconcile bool,
) (EvaluationCapabilityProbeProviderResourceAuthorityResult, bool, error) {
	required := []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "resourceResultDigest",
		"ownerImplementationDigest", "ownerAdmissionDigest", "stageDigest", "dispatchAckDigest",
		"resultIngressDigest", "resultIngressReceiptDigest",
	}
	if reconcile {
		required = append(required, "reconciled")
	}
	if !exactEvaluationKeys(value, required) ||
		stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		stringMember(value, "stageDigest") != request.StageDigest {
		return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	for _, field := range []string{
		"resourceResultDigest", "ownerImplementationDigest", "ownerAdmissionDigest", "stageDigest",
		"dispatchAckDigest", "resultIngressDigest", "resultIngressReceiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	resultDigest := stringMember(value, "resourceResultDigest")
	ownerAdmissionDigest, ownerErr := evaluationCapabilityProbeProviderResourceOwnerAdmissionDigest(
		request.RequestDigest, resultDigest, request.OwnerImplementationDigest, request.StageDigest,
	)
	expectedAck, ackErr := evaluationCapabilityProbeProviderResourceDispatchAckDigest(
		request.RequestDigest, resultDigest, ownerAdmissionDigest, request.OwnerImplementationDigest, request.StageDigest,
	)
	expectedIngressReceipt, receiptErr := evaluationCapabilityProbeProviderResourceIngressReceiptDigest(
		request.RequestDigest, stringMember(value, "resultIngressDigest"), resultDigest, expectedAck,
	)
	if ownerErr != nil || ackErr != nil || receiptErr != nil ||
		ownerAdmissionDigest != stringMember(value, "ownerAdmissionDigest") ||
		expectedAck != stringMember(value, "dispatchAckDigest") ||
		expectedIngressReceipt != stringMember(value, "resultIngressReceiptDigest") ||
		(reconcile && (expectedAck != request.DispatchAckDigest ||
			stringMember(value, "resultIngressDigest") != request.ResultIngressDigest ||
			expectedIngressReceipt != request.ResultIngressReceiptDigest)) {
		return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	reconciled := true
	if reconcile {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok {
			return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	return EvaluationCapabilityProbeProviderResourceAuthorityResult{
		ResourceResultDigest: resultDigest, OwnerAdmissionDigest: ownerAdmissionDigest,
		ResultIngressReceiptDigest: expectedIngressReceipt,
	}, reconciled, nil
}

func (client *EvaluationLoopbackAuthorityClient) StageCapabilityProbeProviderResource(
	ctx context.Context,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) (string, error) {
	implementationDigest, ready := client.CapabilityProbeProviderResourceImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		validateLoopbackCapabilityProbeProviderResourceRequest("stage", request) != nil {
		return "", ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/stage", request.RequestDigest,
		capabilityProbeProviderResourceLoopbackRequest("stage", request), 65_536,
	)
	if err != nil {
		return "", err
	}
	return loopbackCapabilityProbeProviderResourceStageDigest(value, request)
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteCapabilityProbeProviderResource(
	ctx context.Context,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) (EvaluationCapabilityProbeProviderResourceAuthorityResult, error) {
	implementationDigest, ready := client.CapabilityProbeProviderResourceImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		validateLoopbackCapabilityProbeProviderResourceRequest("execute", request) != nil {
		return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/execute", request.RequestDigest,
		capabilityProbeProviderResourceLoopbackRequest("execute", request), 65_536,
	)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, err
	}
	result, _, err := loopbackCapabilityProbeProviderResourceResult(value, request, false)
	return result, err
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileCapabilityProbeProviderResource(
	ctx context.Context,
	request EvaluationCapabilityProbeProviderResourceAuthorityRequest,
) (EvaluationCapabilityProbeProviderResourceAuthorityResult, bool, error) {
	implementationDigest, ready := client.CapabilityProbeProviderResourceImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		validateLoopbackCapabilityProbeProviderResourceRequest("reconcile", request) != nil {
		return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, false, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/reconcile", request.RequestDigest,
		capabilityProbeProviderResourceLoopbackRequest("reconcile", request), 65_536,
	)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceAuthorityResult{}, false, err
	}
	return loopbackCapabilityProbeProviderResourceResult(value, request, true)
}

func capabilityProbeProviderResourceCleanupLoopbackRequest(
	mode string,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (evaluationLoopbackAuthorityRequest, error) {
	cleanupRequest, err := decodeCanonicalEvaluationObject(request.Request, 16_384)
	if err != nil {
		return evaluationLoopbackAuthorityRequest{}, err
	}
	deletionReceipt, err := decodeCanonicalEvaluationObject(
		request.DeletionAuthorityReceipt, maximumEvaluationCapabilityProbeProviderResourceComponentBytes,
	)
	if err != nil {
		return evaluationLoopbackAuthorityRequest{}, err
	}
	payload, err := canonicaljson.Bytes(map[string]any{
		"cleanupRequest": cleanupRequest, "deletionAuthorityReceipt": deletionReceipt,
	})
	if err != nil {
		return evaluationLoopbackAuthorityRequest{}, err
	}
	return evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: "provider-capability", Mode: mode, NamespaceID: request.NamespaceID,
		RepositoryCommit:           request.RepositoryCommit,
		Operation:                  evaluationCapabilityProbeProviderResourceCleanupOperation,
		RouteBinding:               evaluationCapabilityProbeProviderResourceCleanupRouteBinding,
		RequestDigest:              request.CleanupRequestDigest,
		OwnerImplementationDigest:  request.OwnerImplementationDigest,
		StageDigest:                request.StageDigest,
		DispatchAckDigest:          request.DispatchAckDigest,
		ResultIngressDigest:        request.ResultIngressDigest,
		ResultIngressReceiptDigest: request.ResultIngressReceiptDigest,
		SealedProviderResourceCleanupReceipt: append(
			json.RawMessage(nil), request.SealedProviderResourceCleanupReceipt...,
		),
		ClaimGeneration: request.ClaimGeneration, Payload: payload,
	}, nil
}

func validateLoopbackCapabilityProbeProviderResourceCleanupRequest(
	mode string,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (evaluationCapabilityProbeProviderResourceCleanupRequest, map[string]any, error) {
	if request.ClaimGeneration != 1 || !validEvaluationAgentControlIdentity(request.NamespaceID) ||
		!evaluationRepositoryCommitPattern.MatchString(request.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(request.CleanupRequestDigest) ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) ||
		len(request.Request) == 0 || len(request.DeletionAuthorityReceipt) == 0 {
		return evaluationCapabilityProbeProviderResourceCleanupRequest{}, nil, ErrInvalid
	}
	decoded, err := decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(request.Request)
	deletionReceipt, _, deletionErr := decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceiptBytes(
		request.DeletionAuthorityReceipt,
	)
	if err != nil || deletionErr != nil || decoded.RepositoryCommit != request.RepositoryCommit ||
		decoded.CleanupRequestDigest != request.CleanupRequestDigest ||
		decoded.ResourceRegistrationRequestDigest != stringMember(deletionReceipt, "requestDigest") ||
		decoded.DeletionAuthorityReceiptDigest != stringMember(deletionReceipt, "deletionAuthorityReceiptDigest") {
		return evaluationCapabilityProbeProviderResourceCleanupRequest{}, nil, ErrInvalid
	}
	expectedStage, stageErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(
		decoded, request.OwnerImplementationDigest,
	)
	if stageErr != nil {
		return evaluationCapabilityProbeProviderResourceCleanupRequest{}, nil, ErrInvalid
	}
	switch mode {
	case "stage":
		if request.StageDigest != "" || request.DispatchAckDigest != "" || request.ResultIngressDigest != "" ||
			request.ResultIngressReceiptDigest != "" || len(request.SealedProviderResourceCleanupReceipt) != 0 {
			return evaluationCapabilityProbeProviderResourceCleanupRequest{}, nil, ErrInvalid
		}
	case "execute":
		if request.StageDigest != expectedStage || request.DispatchAckDigest != "" ||
			request.ResultIngressDigest != "" || request.ResultIngressReceiptDigest != "" ||
			len(request.SealedProviderResourceCleanupReceipt) != 0 {
			return evaluationCapabilityProbeProviderResourceCleanupRequest{}, nil, ErrInvalid
		}
	case "reconcile":
		if request.StageDigest != expectedStage || !evaluationDigestPattern.MatchString(request.DispatchAckDigest) ||
			!evaluationDigestPattern.MatchString(request.ResultIngressDigest) ||
			!evaluationDigestPattern.MatchString(request.ResultIngressReceiptDigest) ||
			len(request.SealedProviderResourceCleanupReceipt) == 0 {
			return evaluationCapabilityProbeProviderResourceCleanupRequest{}, nil, ErrInvalid
		}
		sealed, sealedErr := decodeCanonicalEvaluationObject(
			request.SealedProviderResourceCleanupReceipt,
			maximumEvaluationCapabilityProbeProviderResourceCleanupReceiptBytes,
		)
		receipt, receiptErr := decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(sealed, deletionReceipt)
		ownerAdmission, admissionErr := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
			decoded.CleanupRequestDigest, expectedStage, request.OwnerImplementationDigest,
		)
		expectedAck, ackErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
			decoded.CleanupRequestDigest, expectedStage, ownerAdmission, receipt.CleanupReceiptDigest,
		)
		expectedIngress, ingressErr := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
			decoded.CleanupRequestDigest, expectedAck, receipt.CleanupReceiptDigest,
		)
		expectedIngressReceipt, ingressReceiptErr := evaluationCapabilityProbeProviderResourceCleanupIngressReceiptDigest(
			expectedIngress, receipt.CleanupReceiptDigest,
		)
		if sealedErr != nil || receiptErr != nil || admissionErr != nil || ackErr != nil || ingressErr != nil ||
			ingressReceiptErr != nil || expectedAck != request.DispatchAckDigest ||
			expectedIngress != request.ResultIngressDigest ||
			expectedIngressReceipt != request.ResultIngressReceiptDigest {
			return evaluationCapabilityProbeProviderResourceCleanupRequest{}, nil, ErrConflict
		}
	default:
		return evaluationCapabilityProbeProviderResourceCleanupRequest{}, nil, ErrInvalid
	}
	return decoded, deletionReceipt, nil
}

func loopbackCapabilityProbeProviderResourceCleanupStageDigest(
	value map[string]any,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "ownerImplementationDigest", "stageDigest",
	}) || stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) {
		return "", errEvaluationServiceUnavailable
	}
	decoded, err := decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(request.Request)
	expected, expectedErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityStageDigest(
		decoded, request.OwnerImplementationDigest,
	)
	if err != nil || expectedErr != nil || expected != stringMember(value, "stageDigest") {
		return "", errEvaluationServiceUnavailable
	}
	return expected, nil
}

func loopbackCapabilityProbeProviderResourceCleanupResult(
	value map[string]any,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
	reconcile bool,
) (EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult, bool, error) {
	required := []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "ownerImplementationDigest",
		"stageDigest", "cleanupReceiptDigest", "ownerAdmissionDigest", "dispatchAckDigest",
		"resultIngressDigest", "resultIngressReceiptDigest",
	}
	if reconcile {
		required = append(required, "reconciled")
	}
	if !exactEvaluationKeys(value, required) ||
		stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		stringMember(value, "stageDigest") != request.StageDigest {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	for _, field := range []string{
		"cleanupReceiptDigest", "ownerAdmissionDigest", "dispatchAckDigest",
		"resultIngressDigest", "resultIngressReceiptDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	cleanupReceiptDigest := stringMember(value, "cleanupReceiptDigest")
	ownerAdmission, admissionErr := evaluationCapabilityProbeProviderResourceCleanupOwnerAdmissionDigest(
		request.CleanupRequestDigest, request.StageDigest, request.OwnerImplementationDigest,
	)
	expectedAck, ackErr := evaluationCapabilityProbeProviderResourceCleanupAuthorityAckDigest(
		request.CleanupRequestDigest, request.StageDigest, ownerAdmission, cleanupReceiptDigest,
	)
	expectedIngress, ingressErr := evaluationCapabilityProbeProviderResourceCleanupResultIngressDigest(
		request.CleanupRequestDigest, expectedAck, cleanupReceiptDigest,
	)
	expectedIngressReceipt, receiptErr := evaluationCapabilityProbeProviderResourceCleanupIngressReceiptDigest(
		expectedIngress, cleanupReceiptDigest,
	)
	if admissionErr != nil || ackErr != nil || ingressErr != nil || receiptErr != nil ||
		ownerAdmission != stringMember(value, "ownerAdmissionDigest") ||
		expectedAck != stringMember(value, "dispatchAckDigest") ||
		expectedIngress != stringMember(value, "resultIngressDigest") ||
		expectedIngressReceipt != stringMember(value, "resultIngressReceiptDigest") ||
		reconcile && (expectedAck != request.DispatchAckDigest || expectedIngress != request.ResultIngressDigest ||
			expectedIngressReceipt != request.ResultIngressReceiptDigest) {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	reconciled := true
	if reconcile {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok {
			return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{
		CleanupReceiptDigest: cleanupReceiptDigest, OwnerAdmissionDigest: ownerAdmission,
		ResultIngressReceiptDigest: expectedIngressReceipt,
	}, reconciled, nil
}

func (client *EvaluationLoopbackAuthorityClient) StageCapabilityProbeProviderResourceCleanup(
	ctx context.Context,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (string, error) {
	implementationDigest, ready := client.CapabilityProbeProviderResourceCleanupImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest {
		return "", ErrInvalid
	}
	if _, _, err := validateLoopbackCapabilityProbeProviderResourceCleanupRequest("stage", request); err != nil {
		return "", err
	}
	valueRequest, err := capabilityProbeProviderResourceCleanupLoopbackRequest("stage", request)
	if err != nil {
		return "", ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/stage", request.CleanupRequestDigest, valueRequest, 65_536,
	)
	if err != nil {
		return "", err
	}
	return loopbackCapabilityProbeProviderResourceCleanupStageDigest(value, request)
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteCapabilityProbeProviderResourceCleanup(
	ctx context.Context,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult, error) {
	implementationDigest, ready := client.CapabilityProbeProviderResourceCleanupImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, ErrInvalid
	}
	if _, _, err := validateLoopbackCapabilityProbeProviderResourceCleanupRequest("execute", request); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, err
	}
	valueRequest, err := capabilityProbeProviderResourceCleanupLoopbackRequest("execute", request)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/execute", request.CleanupRequestDigest, valueRequest, 65_536,
	)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, err
	}
	result, _, err := loopbackCapabilityProbeProviderResourceCleanupResult(value, request, false)
	return result, err
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileCapabilityProbeProviderResourceCleanup(
	ctx context.Context,
	request EvaluationCapabilityProbeProviderResourceCleanupAuthorityRequest,
) (EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult, bool, error) {
	implementationDigest, ready := client.CapabilityProbeProviderResourceCleanupImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, ErrInvalid
	}
	if _, _, err := validateLoopbackCapabilityProbeProviderResourceCleanupRequest("reconcile", request); err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, err
	}
	valueRequest, err := capabilityProbeProviderResourceCleanupLoopbackRequest("reconcile", request)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/reconcile", request.CleanupRequestDigest, valueRequest, 65_536,
	)
	if err != nil {
		return EvaluationCapabilityProbeProviderResourceCleanupAuthorityResult{}, false, err
	}
	return loopbackCapabilityProbeProviderResourceCleanupResult(value, request, true)
}

func runtimeFactSourceRegistrationLoopbackRequest(
	mode string,
	request EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) evaluationLoopbackAuthorityRequest {
	return evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: "provider-capability", Mode: mode, NamespaceID: request.NamespaceID,
		RepositoryCommit: request.RepositoryCommit, Operation: evaluationRuntimeFactSourceRegistrationOperation,
		RouteBinding: evaluationRuntimeFactSourceRegistrationRouteBinding, RequestDigest: request.RequestDigest,
		RegistrationAuthorityIssuerID: request.RegistrationAuthorityIssuerID,
		OwnerImplementationDigest:     request.OwnerImplementationDigest,
		StageDigest:                   request.StageDigest, DispatchAckDigest: request.DispatchAckDigest,
		SealedOwnerHealth: append(json.RawMessage(nil), request.SealedOwnerHealth...),
		ClaimGeneration:   request.ClaimGeneration, Payload: append(json.RawMessage(nil), request.Request...),
	}
}

func loopbackRuntimeFactSourceRegistrationStageDigest(
	value map[string]any,
	request EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "serviceKind", "mode", "requestDigest",
		"registrationAuthorityIssuerId", "stageDigest",
	}) || stringMember(value, "registrationAuthorityIssuerId") != request.RegistrationAuthorityIssuerID ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) {
		return "", errEvaluationServiceUnavailable
	}
	return stringMember(value, "stageDigest"), nil
}

func loopbackRuntimeFactSourceRegistrationResult(
	value map[string]any,
	request EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
	reconcile bool,
) (EvaluationRuntimeFactSourceRegistrationAuthorityResult, bool, error) {
	required := []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "registrationAuthorityIssuerId",
		"ownerHealth", "ownerAdmissionDigest", "stageDigest",
	}
	if reconcile {
		required = append(required, "dispatchAckDigest", "reconciled")
	}
	if !exactEvaluationKeys(value, required) ||
		stringMember(value, "registrationAuthorityIssuerId") != request.RegistrationAuthorityIssuerID ||
		stringMember(value, "stageDigest") != request.StageDigest ||
		(reconcile && request.DispatchAckDigest != "" &&
			stringMember(value, "dispatchAckDigest") != request.DispatchAckDigest) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "ownerAdmissionDigest")) ||
		(reconcile && !evaluationDigestPattern.MatchString(stringMember(value, "dispatchAckDigest"))) {
		return EvaluationRuntimeFactSourceRegistrationAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	ownerHealth, err := canonicaljson.Bytes(value["ownerHealth"])
	if err != nil || len(ownerHealth) == 0 || len(ownerHealth) > maximumEvaluationRuntimeFactSourceRegistrationResponseBytes {
		return EvaluationRuntimeFactSourceRegistrationAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	reconciled := true
	if reconcile {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok {
			return EvaluationRuntimeFactSourceRegistrationAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	return EvaluationRuntimeFactSourceRegistrationAuthorityResult{
		OwnerHealth: ownerHealth, OwnerAdmissionDigest: stringMember(value, "ownerAdmissionDigest"),
	}, reconciled, nil
}

func validateLoopbackRuntimeFactSourceSealedOwnerHealth(
	request EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) error {
	if len(request.SealedOwnerHealth) == 0 {
		return nil
	}
	health, err := decodeCanonicalEvaluationObject(
		request.SealedOwnerHealth, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes,
	)
	if err != nil || !exactEvaluationKeys(health, []string{
		"format", "version", "requestDigest", "sourceAuthorityId", "sourceAuthorityImplementationDigest",
		"sourceKind", "routeBinding", "status", "checkedAt", "expiresAt", "healthDigest",
	}) || stringMember(health, "format") != evaluationRuntimeFactSourceOwnerHealthFormat ||
		stringMember(health, "requestDigest") != request.RequestDigest ||
		stringMember(health, "status") != "ready" ||
		!evaluationDigestPattern.MatchString(stringMember(health, "healthDigest")) {
		return ErrInvalid
	}
	base := cloneEvaluationObject(health)
	delete(base, "healthDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(health, "healthDigest") {
		return ErrConflict
	}
	return nil
}

func validateLoopbackRuntimeFactSourceRegistrationRequest(
	mode string,
	request EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) error {
	if request.ClaimGeneration != 1 || request.RegistrationAuthorityIssuerID != evaluationServiceAuthorityPrincipal ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) ||
		!validEvaluationAgentControlIdentity(request.NamespaceID) ||
		!evaluationRepositoryCommitPattern.MatchString(request.RepositoryCommit) ||
		!evaluationDigestPattern.MatchString(request.RequestDigest) || len(request.Request) == 0 {
		return ErrInvalid
	}
	decoded, err := decodeEvaluationRuntimeFactSourceRegistrationRequest(request.Request, EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID,
	})
	if err != nil || decoded.RepositoryCommit != request.RepositoryCommit || decoded.RequestDigest != request.RequestDigest {
		return ErrInvalid
	}
	switch mode {
	case "stage":
		if request.StageDigest != "" || request.DispatchAckDigest != "" || len(request.SealedOwnerHealth) != 0 {
			return ErrInvalid
		}
	case "execute":
		if !evaluationDigestPattern.MatchString(request.StageDigest) || request.DispatchAckDigest != "" ||
			len(request.SealedOwnerHealth) != 0 {
			return ErrInvalid
		}
	case "reconcile":
		if !evaluationDigestPattern.MatchString(request.StageDigest) ||
			(request.DispatchAckDigest != "" && !evaluationDigestPattern.MatchString(request.DispatchAckDigest)) ||
			validateLoopbackRuntimeFactSourceSealedOwnerHealth(request) != nil ||
			(request.DispatchAckDigest != "" && len(request.SealedOwnerHealth) == 0) {
			return ErrInvalid
		}
	default:
		return ErrInvalid
	}
	return nil
}

func (client *EvaluationLoopbackAuthorityClient) StageRuntimeFactSourceRegistration(
	ctx context.Context,
	request EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) (string, error) {
	implementationDigest, ready := client.RuntimeFactSourceRegistrationImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		validateLoopbackRuntimeFactSourceRegistrationRequest("stage", request) != nil {
		return "", ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/stage", request.RequestDigest,
		runtimeFactSourceRegistrationLoopbackRequest("stage", request),
		maximumEvaluationRuntimeFactSourceRegistrationResponseBytes,
	)
	if err != nil {
		return "", err
	}
	return loopbackRuntimeFactSourceRegistrationStageDigest(value, request)
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteRuntimeFactSourceRegistration(
	ctx context.Context,
	request EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) (EvaluationRuntimeFactSourceRegistrationAuthorityResult, error) {
	implementationDigest, ready := client.RuntimeFactSourceRegistrationImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		validateLoopbackRuntimeFactSourceRegistrationRequest("execute", request) != nil {
		return EvaluationRuntimeFactSourceRegistrationAuthorityResult{}, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/execute", request.RequestDigest,
		runtimeFactSourceRegistrationLoopbackRequest("execute", request),
		maximumEvaluationRuntimeFactSourceRegistrationResponseBytes,
	)
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationAuthorityResult{}, err
	}
	result, _, err := loopbackRuntimeFactSourceRegistrationResult(value, request, false)
	return result, err
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileRuntimeFactSourceRegistration(
	ctx context.Context,
	request EvaluationRuntimeFactSourceRegistrationAuthorityRequest,
) (EvaluationRuntimeFactSourceRegistrationAuthorityResult, bool, error) {
	implementationDigest, ready := client.RuntimeFactSourceRegistrationImplementationDigest()
	if !ready || request.OwnerImplementationDigest != implementationDigest ||
		validateLoopbackRuntimeFactSourceRegistrationRequest("reconcile", request) != nil {
		return EvaluationRuntimeFactSourceRegistrationAuthorityResult{}, false, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/capability-runtime/reconcile", request.RequestDigest,
		runtimeFactSourceRegistrationLoopbackRequest("reconcile", request),
		maximumEvaluationRuntimeFactSourceRegistrationResponseBytes,
	)
	if err != nil {
		return EvaluationRuntimeFactSourceRegistrationAuthorityResult{}, false, err
	}
	return loopbackRuntimeFactSourceRegistrationResult(value, request, true)
}

func loopbackG3CellAdmissionStageDigest(
	value map[string]any,
	request EvaluationG3CellAdmissionAuthorityRequest,
) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "serviceKind", "mode", "requestDigest",
		"ownerImplementationDigest", "stageDigest",
	}) || stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) {
		return "", errEvaluationServiceUnavailable
	}
	return stringMember(value, "stageDigest"), nil
}

func loopbackG3CellAdmissionResult(
	value map[string]any,
	request EvaluationG3CellAdmissionAuthorityRequest,
	reconcile bool,
) (EvaluationG3CellAdmissionAuthorityResult, bool, error) {
	required := []string{
		"format", "version", "serviceKind", "mode", "requestDigest", "run",
		"runtimeAuthorityDigest", "ownerImplementationDigest", "ownerAdmissionDigest",
		"stageDigest", "dispatchAckDigest",
	}
	if reconcile {
		required = append(required, "reconciled")
	}
	if !exactEvaluationKeys(value, required) ||
		stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		stringMember(value, "stageDigest") != request.StageDigest ||
		(reconcile && stringMember(value, "dispatchAckDigest") != request.DispatchAckDigest) {
		return EvaluationG3CellAdmissionAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	for _, field := range []string{
		"runtimeAuthorityDigest", "ownerImplementationDigest", "ownerAdmissionDigest", "stageDigest", "dispatchAckDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return EvaluationG3CellAdmissionAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	run, err := canonicaljson.Bytes(value["run"])
	if err != nil || len(run) == 0 || len(run) > maximumEvaluationG3CellAdmissionResponseBytes {
		return EvaluationG3CellAdmissionAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	reconciled := true
	if reconcile {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok {
			return EvaluationG3CellAdmissionAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	return EvaluationG3CellAdmissionAuthorityResult{
		Run: run, RuntimeAuthorityDigest: stringMember(value, "runtimeAuthorityDigest"),
		OwnerImplementationDigest: stringMember(value, "ownerImplementationDigest"),
		OwnerAdmissionDigest:      stringMember(value, "ownerAdmissionDigest"),
		StageDigest:               stringMember(value, "stageDigest"), DispatchAckDigest: stringMember(value, "dispatchAckDigest"),
	}, reconciled, nil
}

func (client *EvaluationLoopbackAuthorityClient) StageG3CellAdmission(
	ctx context.Context,
	request EvaluationG3CellAdmissionAuthorityRequest,
) (string, error) {
	if request.StageDigest != "" || request.DispatchAckDigest != "" ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) ||
		!evaluationDigestPattern.MatchString(request.RequestDigest) || request.Generation < 1 {
		return "", ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/controlled-workspace/stage", request.RequestDigest,
		g3CellAdmissionLoopbackRequest("stage", request), 65_536,
	)
	if err != nil {
		return "", err
	}
	return loopbackG3CellAdmissionStageDigest(value, request)
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteG3CellAdmission(
	ctx context.Context,
	request EvaluationG3CellAdmissionAuthorityRequest,
) (EvaluationG3CellAdmissionAuthorityResult, error) {
	if !evaluationDigestPattern.MatchString(request.StageDigest) || request.DispatchAckDigest != "" ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) {
		return EvaluationG3CellAdmissionAuthorityResult{}, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/controlled-workspace/execute", request.RequestDigest,
		g3CellAdmissionLoopbackRequest("execute", request), maximumEvaluationG3CellAdmissionResponseBytes+65_536,
	)
	if err != nil {
		return EvaluationG3CellAdmissionAuthorityResult{}, err
	}
	result, _, err := loopbackG3CellAdmissionResult(value, request, false)
	return result, err
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileG3CellAdmission(
	ctx context.Context,
	request EvaluationG3CellAdmissionAuthorityRequest,
) (EvaluationG3CellAdmissionAuthorityResult, bool, error) {
	if !evaluationDigestPattern.MatchString(request.StageDigest) ||
		!evaluationDigestPattern.MatchString(request.DispatchAckDigest) ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) {
		return EvaluationG3CellAdmissionAuthorityResult{}, false, ErrInvalid
	}
	value, err := client.invoke(
		ctx, "/v1/controlled-workspace/reconcile", request.RequestDigest,
		g3CellAdmissionLoopbackRequest("reconcile", request), maximumEvaluationG3CellAdmissionResponseBytes+65_536,
	)
	if err != nil {
		return EvaluationG3CellAdmissionAuthorityResult{}, false, err
	}
	return loopbackG3CellAdmissionResult(value, request, true)
}

func loopbackVerificationResponse(value map[string]any, reconcile bool) (json.RawMessage, bool, error) {
	required := []string{"format", "version", "serviceKind", "mode", "requestDigest", "response"}
	if reconcile {
		required = append(required, "reconciled")
	}
	if !exactEvaluationKeys(value, required) {
		return nil, false, errEvaluationServiceUnavailable
	}
	response, err := canonicaljson.Bytes(value["response"])
	if err != nil || len(response) > maximumEvaluationVerificationEvidenceResponseBytes {
		return nil, false, errEvaluationServiceUnavailable
	}
	reconciled := true
	if reconcile {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok {
			return nil, false, errEvaluationServiceUnavailable
		}
	}
	return response, reconciled, nil
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteVerificationEvidence(
	ctx context.Context,
	request EvaluationVerificationEvidenceAuthorityRequest,
) (json.RawMessage, error) {
	value, err := client.invoke(ctx, "/v1/verification-evidence/execute", request.RequestDigest,
		verificationLoopbackRequest("execute", request), maximumEvaluationVerificationEvidenceResponseBytes+65_536)
	if err != nil {
		return nil, err
	}
	response, _, err := loopbackVerificationResponse(value, false)
	return response, err
}

func (client *EvaluationLoopbackAuthorityClient) ReadVerificationEvidence(
	ctx context.Context,
	request EvaluationVerificationEvidenceAuthorityRequest,
) (json.RawMessage, error) {
	value, err := client.invoke(ctx, "/v1/verification-evidence/read", request.RequestDigest,
		verificationLoopbackRequest("read", request), maximumEvaluationVerificationEvidenceResponseBytes+65_536)
	if err != nil {
		return nil, err
	}
	response, _, err := loopbackVerificationResponse(value, false)
	return response, err
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileVerificationEvidence(
	ctx context.Context,
	request EvaluationVerificationEvidenceAuthorityRequest,
) (json.RawMessage, bool, error) {
	value, err := client.invoke(ctx, "/v1/verification-evidence/reconcile", request.RequestDigest,
		verificationLoopbackRequest("reconcile", request), maximumEvaluationVerificationEvidenceResponseBytes+65_536)
	if err != nil {
		return nil, false, err
	}
	return loopbackVerificationResponse(value, true)
}

func validateVerificationOwnerStateAuthorityRequest(
	mode string,
	request EvaluationVerificationEvidenceAuthorityRequest,
) error {
	partition := EvaluationPlanPartition{PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit}
	ownerStateID, err := evaluationOwnerStateIdentity(
		"verification-evidence", request.NamespaceID, partition, request.AttemptID,
		request.DescriptorDigest, request.AuthorityDigest, request.Generation,
	)
	if err != nil || ownerStateID != request.OwnerStateID || request.ClaimGeneration != 1 ||
		!evaluationOwnerStatefulOperation("verification-evidence", request.Operation, request.RouteBinding) ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) {
		return ErrInvalid
	}
	if request.OwnerStateRevision == 0 {
		if len(request.OwnerStateBundle) != 0 || request.OwnerStateRootDigest != "" {
			return ErrInvalid
		}
	} else {
		_, root, decodeErr := decodeEvaluationOwnerStateBundle(
			request.OwnerStateBundle, "verification-evidence", request.NamespaceID, partition,
			request.OwnerStateID, request.OwnerStateRevision, evaluationOwnerStatePreviousRoot(request.OwnerStateBundle),
		)
		if decodeErr != nil || root != request.OwnerStateRootDigest {
			return ErrConflict
		}
	}
	expectedStage, err := evaluationOwnerStateStageDigest(
		"verification-evidence", request.Operation, request.RouteBinding, request.RequestDigest,
		request.OwnerImplementationDigest, request.OwnerStateID, request.OwnerStateRevision,
		request.OwnerStateRootDigest,
	)
	if err != nil {
		return ErrInvalid
	}
	switch mode {
	case "stage":
		if request.StageDigest != "" || request.DispatchAckDigest != "" || len(request.SealedOwnerOperation) != 0 {
			return ErrInvalid
		}
	case "execute":
		if request.StageDigest != expectedStage || request.DispatchAckDigest != "" || len(request.SealedOwnerOperation) != 0 {
			return ErrInvalid
		}
	case "reconcile":
		sealed, sealedErr := decodeEvaluationOwnerStateSealedOperation(request.SealedOwnerOperation)
		if sealedErr != nil || sealed.ServiceKind != "verification-evidence" ||
			sealed.Operation != request.Operation || sealed.RouteBinding != request.RouteBinding ||
			sealed.RequestDigest != request.RequestDigest || sealed.OwnerStateID != request.OwnerStateID ||
			sealed.OwnerStateRevision != request.OwnerStateRevision ||
			sealed.OwnerStateRootDigest != request.OwnerStateRootDigest ||
			sealed.StageDigest != request.StageDigest || sealed.DispatchAckDigest != request.DispatchAckDigest {
			return ErrInvalid
		}
	default:
		return ErrInvalid
	}
	return nil
}

func (client *EvaluationLoopbackAuthorityClient) StageVerificationEvidenceState(
	ctx context.Context,
	request EvaluationVerificationEvidenceAuthorityRequest,
) (string, error) {
	if err := validateVerificationOwnerStateAuthorityRequest("stage", request); err != nil {
		return "", err
	}
	value, err := client.invoke(
		ctx, "/v1/verification-evidence/stage", request.RequestDigest,
		verificationLoopbackRequest("stage", request), 65_536,
	)
	if err != nil {
		return "", err
	}
	stage, err := loopbackOwnerStateStageDigest(
		value, "verification-evidence", request.RequestDigest, request.OwnerImplementationDigest,
		request.OwnerStateID, request.OwnerStateRevision, request.OwnerStateRootDigest,
	)
	expected, digestErr := evaluationOwnerStateStageDigest(
		"verification-evidence", request.Operation, request.RouteBinding, request.RequestDigest,
		request.OwnerImplementationDigest, request.OwnerStateID, request.OwnerStateRevision,
		request.OwnerStateRootDigest,
	)
	if err != nil || digestErr != nil || stage != expected {
		return "", errEvaluationServiceUnavailable
	}
	return stage, nil
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteVerificationEvidenceState(
	ctx context.Context,
	request EvaluationVerificationEvidenceAuthorityRequest,
) (EvaluationOwnerStateTransition, error) {
	if err := validateVerificationOwnerStateAuthorityRequest("execute", request); err != nil {
		return EvaluationOwnerStateTransition{}, err
	}
	value, err := client.invoke(
		ctx, "/v1/verification-evidence/execute", request.RequestDigest,
		verificationLoopbackRequest("execute", request), maximumEvaluationOwnerStateOuterBytes,
	)
	if err != nil {
		return EvaluationOwnerStateTransition{}, err
	}
	transition, _, err := loopbackOwnerStateTransition(
		value, "verification-evidence", request.Operation, request.RouteBinding, request.RequestDigest,
		request.OwnerImplementationDigest, request.OwnerStateID, request.OwnerStateRevision,
		request.OwnerStateRootDigest, nil, false, true,
	)
	if err != nil {
		return EvaluationOwnerStateTransition{}, err
	}
	partition := EvaluationPlanPartition{PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit}
	if _, err := validateEvaluationOwnerStateTransition(
		EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID},
		partition, transition, "verification-evidence", request.Operation, request.RouteBinding, request.RequestDigest,
	); err != nil {
		return EvaluationOwnerStateTransition{}, errEvaluationServiceUnavailable
	}
	return transition, nil
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileVerificationEvidenceState(
	ctx context.Context,
	request EvaluationVerificationEvidenceAuthorityRequest,
) (EvaluationOwnerStateTransition, bool, error) {
	if err := validateVerificationOwnerStateAuthorityRequest("reconcile", request); err != nil {
		return EvaluationOwnerStateTransition{}, false, err
	}
	value, err := client.invoke(
		ctx, "/v1/verification-evidence/reconcile", request.RequestDigest,
		verificationLoopbackRequest("reconcile", request), maximumEvaluationOwnerStateOuterBytes,
	)
	if err != nil {
		return EvaluationOwnerStateTransition{}, false, err
	}
	transition, reconciled, err := loopbackOwnerStateTransition(
		value, "verification-evidence", request.Operation, request.RouteBinding, request.RequestDigest,
		request.OwnerImplementationDigest, request.OwnerStateID, request.OwnerStateRevision,
		request.OwnerStateRootDigest, request.SealedOwnerOperation, true, true,
	)
	if err != nil {
		return EvaluationOwnerStateTransition{}, false, err
	}
	partition := EvaluationPlanPartition{PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit}
	if _, err := validateEvaluationOwnerStateTransition(
		EvaluationAuthority{Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: request.NamespaceID},
		partition, transition, "verification-evidence", request.Operation, request.RouteBinding, request.RequestDigest,
	); err != nil {
		return EvaluationOwnerStateTransition{}, false, errEvaluationServiceUnavailable
	}
	return transition, reconciled, nil
}

func attemptLoopbackRequest(
	mode string,
	request EvaluationAttemptAuthorityRequest,
) evaluationLoopbackAuthorityRequest {
	return evaluationLoopbackAuthorityRequest{
		Format: evaluationLoopbackAuthorityRequestFormat, Version: evaluationLoopbackAuthorityVersion,
		ServiceKind: request.ServiceKind, Mode: mode, NamespaceID: request.NamespaceID,
		PlanDigest: request.PlanDigest, RepositoryCommit: request.RepositoryCommit,
		Operation: request.Operation, RouteBinding: request.RouteBinding,
		RequestDigest: request.RequestDigest, AttemptID: request.AttemptID,
		DescriptorDigest: request.DescriptorDigest, ShardLeaseOwnerID: request.ShardLeaseOwnerID,
		ShardLeaseGeneration:                          request.ShardLeaseGeneration,
		VerificationGrantGeneration:                   request.VerificationGrantGeneration,
		VerificationGrantReceiptSetDigest:             request.VerificationAttemptGrantReceiptSetDigest,
		ProviderCapabilityObservationReceiptSetDigest: request.ProviderCapabilityObservationReceiptSetDigest,
		OwnerImplementationDigest:                     request.OwnerImplementationDigest,
		StageDigest:                                   request.StageDigest,
		DispatchAckDigest:                             request.DispatchAckDigest,
		ClaimGeneration:                               request.ClaimGeneration,
		Payload:                                       append(json.RawMessage(nil), request.Payload...),
	}
}

func loopbackAttemptAuthorityStageDigest(
	value map[string]any,
	request EvaluationAttemptAuthorityRequest,
) (string, error) {
	if !exactEvaluationKeys(value, []string{
		"format", "version", "serviceKind", "mode", "requestDigest",
		"ownerImplementationDigest", "stageDigest",
	}) || stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		!evaluationDigestPattern.MatchString(stringMember(value, "stageDigest")) {
		return "", errEvaluationServiceUnavailable
	}
	return stringMember(value, "stageDigest"), nil
}

func loopbackAttemptAuthorityResult(
	value map[string]any,
	request EvaluationAttemptAuthorityRequest,
	reconcile bool,
) (EvaluationAttemptAuthorityResult, bool, error) {
	required := []string{
		"format", "version", "serviceKind", "mode", "requestDigest",
		"shardLeaseOwnerId", "shardLeaseGeneration", "verificationGrantGeneration",
		"verificationAttemptGrantReceiptSetDigest", "ownerImplementationDigest",
		"stageDigest", "response", "dispatchAckDigest",
	}
	if reconcile {
		required = append(required, "reconciled")
	}
	sharedEffect := false
	if request.ServiceKind == "provider-capability" && request.Operation == "tool.execute" {
		payload, payloadErr := decodeCanonicalEvaluationObject(request.Payload, maximumEvaluationAttemptAuthorityRequestBytes)
		sharedEffect = payloadErr == nil && stringMember(payload, "executionAuthorityKind") == "shared-effect"
		if sharedEffect {
			required = append(required, "resultIngressReceiptDigest")
		}
	}
	shardGeneration, shardOK := integerMember(value, "shardLeaseGeneration")
	verificationGeneration, verificationOK := integerMember(value, "verificationGrantGeneration")
	if !exactEvaluationKeys(value, required) {
		return EvaluationAttemptAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	if !shardOK || !verificationOK ||
		stringMember(value, "shardLeaseOwnerId") != request.ShardLeaseOwnerID ||
		shardGeneration != request.ShardLeaseGeneration ||
		verificationGeneration != request.VerificationGrantGeneration ||
		stringMember(value, "verificationAttemptGrantReceiptSetDigest") != request.VerificationAttemptGrantReceiptSetDigest ||
		stringMember(value, "ownerImplementationDigest") != request.OwnerImplementationDigest ||
		stringMember(value, "stageDigest") != request.StageDigest ||
		(reconcile && request.DispatchAckDigest != "" && stringMember(value, "dispatchAckDigest") != request.DispatchAckDigest) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "dispatchAckDigest")) ||
		(sharedEffect && !evaluationDigestPattern.MatchString(stringMember(value, "resultIngressReceiptDigest"))) {
		return EvaluationAttemptAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	response, err := canonicaljson.Bytes(value["response"])
	if err != nil || len(response) == 0 || len(response) > maximumEvaluationAttemptAuthorityResponseBytes {
		return EvaluationAttemptAuthorityResult{}, false, errEvaluationServiceUnavailable
	}
	reconciled := true
	if reconcile {
		var ok bool
		reconciled, ok = value["reconciled"].(bool)
		if !ok {
			return EvaluationAttemptAuthorityResult{}, false, errEvaluationServiceUnavailable
		}
	}
	return EvaluationAttemptAuthorityResult{
		Response: response, DispatchAckDigest: stringMember(value, "dispatchAckDigest"),
		ResultIngressReceiptDigest: stringMember(value, "resultIngressReceiptDigest"),
	}, reconciled, nil
}

func (client *EvaluationLoopbackAuthorityClient) StageAttemptAuthority(
	ctx context.Context,
	request EvaluationAttemptAuthorityRequest,
) (string, error) {
	if request.StageDigest != "" || request.DispatchAckDigest != "" ||
		!evaluationDigestPattern.MatchString(request.ProviderCapabilityObservationReceiptSetDigest) ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) {
		return "", ErrInvalid
	}
	path := "/v1/capability-runtime/stage"
	if request.ServiceKind == "attempt-grading" {
		path = "/v1/attempt-grading/stage"
	}
	value, err := client.invoke(
		ctx, path, request.RequestDigest, attemptLoopbackRequest("stage", request), 65_536,
	)
	if err != nil {
		return "", err
	}
	return loopbackAttemptAuthorityStageDigest(value, request)
}

func (client *EvaluationLoopbackAuthorityClient) ExecuteAttemptAuthority(
	ctx context.Context,
	request EvaluationAttemptAuthorityRequest,
) (EvaluationAttemptAuthorityResult, error) {
	if !evaluationDigestPattern.MatchString(request.StageDigest) || request.DispatchAckDigest != "" {
		return EvaluationAttemptAuthorityResult{}, ErrInvalid
	}
	path := "/v1/capability-runtime/execute"
	if request.ServiceKind == "attempt-grading" {
		path = "/v1/attempt-grading/execute"
	}
	value, err := client.invoke(
		ctx, path, request.RequestDigest, attemptLoopbackRequest("execute", request),
		maximumEvaluationAttemptAuthorityResponseBytes+65_536,
	)
	if err != nil {
		return EvaluationAttemptAuthorityResult{}, err
	}
	result, _, err := loopbackAttemptAuthorityResult(value, request, false)
	return result, err
}

func (client *EvaluationLoopbackAuthorityClient) ReconcileAttemptAuthority(
	ctx context.Context,
	request EvaluationAttemptAuthorityRequest,
) (EvaluationAttemptAuthorityResult, bool, error) {
	if !evaluationDigestPattern.MatchString(request.StageDigest) ||
		request.DispatchAckDigest != "" && !evaluationDigestPattern.MatchString(request.DispatchAckDigest) ||
		!evaluationDigestPattern.MatchString(request.OwnerImplementationDigest) {
		return EvaluationAttemptAuthorityResult{}, false, ErrInvalid
	}
	path := "/v1/capability-runtime/reconcile"
	if request.ServiceKind == "attempt-grading" {
		path = "/v1/attempt-grading/reconcile"
	}
	value, err := client.invoke(
		ctx, path, request.RequestDigest, attemptLoopbackRequest("reconcile", request),
		maximumEvaluationAttemptAuthorityResponseBytes+65_536,
	)
	if err != nil {
		return EvaluationAttemptAuthorityResult{}, false, err
	}
	return loopbackAttemptAuthorityResult(value, request, true)
}

// DecodeEvaluationProductionCanarySet parses the exact production runner
// canary contract: one to 256 unique, safe-alphabet UTF-8 strings, each eight
// to 4,096 bytes. Callers retain ownership of source and returned buffers.
func DecodeEvaluationProductionCanarySet(source []byte) ([][]byte, error) {
	if len(source) == 0 || len(source) > maximumEvaluationProductionCanarySetBytes || !utf8.Valid(source) {
		return nil, ErrInvalid
	}
	decoder := json.NewDecoder(bytes.NewReader(source))
	var decoded []string
	if err := decoder.Decode(&decoded); err != nil || len(decoded) < 1 || len(decoded) > 256 {
		return nil, ErrInvalid
	}
	var extra any
	if err := decoder.Decode(&extra); !errors.Is(err, io.EOF) {
		return nil, ErrInvalid
	}
	result := make([][]byte, len(decoded))
	valid := false
	defer func() {
		if !valid {
			evaluationClearByteSlices(result)
		}
	}()
	seen := make(map[[sha256.Size]byte]struct{}, len(decoded))
	for index, value := range decoded {
		candidate := []byte(value)
		if len(candidate) < 8 || len(candidate) > 4_096 ||
			!evaluationHoldoutCanaryPattern.Match(candidate) ||
			len(bytes.TrimSpace(candidate)) != len(candidate) {
			clear(candidate)
			return nil, ErrInvalid
		}
		key := sha256.Sum256(candidate)
		if _, duplicate := seen[key]; duplicate {
			clear(candidate)
			return nil, ErrInvalid
		}
		seen[key] = struct{}{}
		result[index] = candidate
	}
	valid = true
	return result, nil
}

// EvaluationPublicResponseScannerConfig contains the two complete fixed
// server-only production canary sets plus transport credentials. The
// constructor expands raw, JSON, URL, hex and Base64 encodings once.
type EvaluationPublicResponseScannerConfig struct {
	CredentialCanaries        [][]byte
	SecretCanaries            [][]byte
	ProtectedMaterialCanaries [][]byte
}

type EvaluationPublicResponseScanner struct {
	signatures [][]byte
}

func NewEvaluationPublicResponseScanner(
	config EvaluationPublicResponseScannerConfig,
) (*EvaluationPublicResponseScanner, error) {
	if len(config.CredentialCanaries) == 0 || len(config.CredentialCanaries) > 8 {
		return nil, ErrInvalid
	}
	signatures, _, _, err := evaluationHoldoutCanarySignatures(EvaluationHoldoutCanarySets{
		SecretCanaries:           config.SecretCanaries,
		ProtectedHoldoutCanaries: config.ProtectedMaterialCanaries,
	})
	if err != nil || len(signatures) == 0 {
		return nil, ErrInvalid
	}
	seen := make(map[[sha256.Size]byte]struct{}, len(signatures)+len(config.CredentialCanaries)*9)
	for _, signature := range signatures {
		seen[sha256.Sum256(signature)] = struct{}{}
	}
	appendSignature := func(candidate []byte) {
		key := sha256.Sum256(candidate)
		if _, duplicate := seen[key]; duplicate {
			clear(candidate)
			return
		}
		seen[key] = struct{}{}
		signatures = append(signatures, candidate)
	}
	for _, credential := range config.CredentialCanaries {
		if !validEvaluationPublicResponseCredential(credential) {
			evaluationClearByteSlices(signatures)
			return nil, ErrInvalid
		}
		jsonEncoded := evaluationPublicResponseJSONString(credential)
		jsonInner := evaluationHoldoutClone(jsonEncoded[1 : len(jsonEncoded)-1])
		for _, encoded := range [][]byte{
			evaluationHoldoutClone(credential), jsonEncoded, jsonInner,
			evaluationHoldoutQueryEscape(credential), evaluationHoldoutPercentEscape(credential),
			evaluationHoldoutHex(credential, false), evaluationHoldoutHex(credential, true),
			evaluationHoldoutBase64(credential, base64.StdEncoding),
			evaluationHoldoutBase64(credential, base64.RawURLEncoding),
		} {
			appendSignature(encoded)
		}
	}
	sort.Slice(signatures, func(left, right int) bool {
		if len(signatures[left]) != len(signatures[right]) {
			return len(signatures[left]) > len(signatures[right])
		}
		return bytes.Compare(signatures[left], signatures[right]) < 0
	})
	return &EvaluationPublicResponseScanner{signatures: signatures}, nil
}

func validEvaluationPublicResponseCredential(value []byte) bool {
	if len(value) < 32 || len(value) > 4_096 || !utf8.Valid(value) ||
		len(bytes.TrimSpace(value)) != len(value) {
		return false
	}
	for len(value) != 0 {
		character, size := utf8.DecodeRune(value)
		if character == utf8.RuneError && size == 1 || unicode.IsControl(character) {
			return false
		}
		value = value[size:]
	}
	return true
}

func evaluationPublicResponseJSONString(value []byte) []byte {
	result := make([]byte, 0, len(value)+2)
	result = append(result, '"')
	for _, character := range value {
		switch character {
		case '"', '\\':
			result = append(result, '\\', character)
		default:
			result = append(result, character)
		}
	}
	return append(result, '"')
}

func (scanner *EvaluationPublicResponseScanner) scan(source []byte) error {
	if scanner == nil || len(scanner.signatures) == 0 ||
		evaluationHoldoutBytesContainCanary(source, scanner.signatures) {
		return ErrUnauthorized
	}
	return nil
}

func (scanner *EvaluationPublicResponseScanner) ScanControlledWorkspacePublicResponse(
	_ context.Context,
	_ string,
	_ string,
	source []byte,
) error {
	return scanner.scan(source)
}

func (scanner *EvaluationPublicResponseScanner) ScanVerificationEvidencePublicResponse(
	_ context.Context,
	_ string,
	_ string,
	source []byte,
) error {
	return scanner.scan(source)
}

func (scanner *EvaluationPublicResponseScanner) ScanAttemptAuthorityPublicResponse(
	_ context.Context,
	_ string,
	_ string,
	source []byte,
) error {
	return scanner.scan(source)
}
