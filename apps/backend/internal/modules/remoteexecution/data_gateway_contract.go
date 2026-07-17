package remoteexecution

import (
	"context"
	"encoding/json"
	"errors"
	"time"

	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
)

const (
	maximumDataGatewayRequestBytes  int64 = 1024 * 1024
	maximumDataGatewayResponseBytes int64 = 8 * 1024 * 1024
	maximumDataGatewayReplayBytes   int64 = maximumDataGatewayRequestBytes + 256*1024
	maximumDataGatewayReplays             = 256
)

var (
	ErrDataGatewayInvalidRequest = errors.New("remote Data gateway request is invalid")
	ErrDataGatewayDenied         = errors.New("remote Data gateway request is denied")
	ErrDataGatewayUnavailable    = errors.New("remote Data gateway is unavailable")
	ErrDataGatewayUpstream       = errors.New("remote Data gateway upstream failed")
	ErrDataGatewayReplayConflict = errors.New("remote Data mutation replay identity conflicts")
	ErrDataGatewayReplayUnsafe   = errors.New("remote Data mutation replay is unsafe")
	ErrDataGatewayReplayCapacity = errors.New("remote Data mutation replay capacity exceeded")
)

type DataGatewayEnvironmentStore interface {
	Available() bool
	GetSnapshot(ctx context.Context, principal backendenvironment.PrincipalSession, workspaceID string, environmentID string, revision string) (*backendenvironment.Snapshot, error)
	IssueGrant(ctx context.Context, input backendenvironment.IssueGrantInput) (*backendenvironment.Grant, error)
	UseSecret(ctx context.Context, input backendenvironment.UseSecretInput, consumer func([]byte) error) error
	RevokeGrant(ctx context.Context, grantID string, principal backendenvironment.PrincipalSession) error
}

type DataGatewayTransportRequest struct {
	URL     string
	Method  string
	Headers map[string]string
	Body    []byte
}

type DataGatewayTransportResponse struct {
	Status int
	Body   []byte
}

type DataGatewayTransport interface {
	Execute(ctx context.Context, request DataGatewayTransportRequest) (*DataGatewayTransportResponse, error)
}

type DataGatewayMutationReplayKey struct {
	ExecutionID  string
	DocumentID   string
	OperationID  string
	InvocationID string
	Sequence     int64
}

type DataGatewayMutationReplayClaim struct {
	Acquired bool
	Result   *DataGatewayResult
}

type DataGatewayMutationReplayPolicy struct {
	Attempt         int64
	MaximumAttempts int64
}

type DataGatewayMutationReplayStore interface {
	ClaimDataGatewayMutation(ctx context.Context, key DataGatewayMutationReplayKey, requestHash string, policy DataGatewayMutationReplayPolicy) (*DataGatewayMutationReplayClaim, error)
	CompleteDataGatewayMutation(ctx context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64, result DataGatewayResult) error
	ReleaseDataGatewayMutationRetry(ctx context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64) error
	FenceDataGatewayMutation(ctx context.Context, key DataGatewayMutationReplayKey, requestHash string, attempt int64) error
}

type DataGatewayInvocation struct {
	InvocationID string          `json:"invocationId"`
	Sequence     int64           `json:"sequence"`
	Attempt      int64           `json:"attempt"`
	Input        json.RawMessage `json:"input"`
}

type dataGatewayCorrelation struct {
	Kind         string `json:"kind"`
	DocumentID   string `json:"documentId"`
	OperationID  string `json:"operationId"`
	InvocationID string `json:"invocationId"`
	Sequence     int64  `json:"sequence"`
	Attempt      int64  `json:"attempt"`
}

type dataGatewayNetworkTrace struct {
	Format        string                 `json:"format"`
	RequestID     string                 `json:"requestId"`
	Phase         string                 `json:"phase"`
	RuntimeZone   string                 `json:"runtimeZone"`
	Mode          string                 `json:"mode"`
	Adapter       string                 `json:"adapter"`
	Method        string                 `json:"method"`
	SanitizedURL  string                 `json:"sanitizedUrl"`
	Protocol      string                 `json:"protocol"`
	StartedAt     int64                  `json:"startedAt"`
	CompletedAt   int64                  `json:"completedAt"`
	DurationMS    int64                  `json:"durationMs"`
	Outcome       string                 `json:"outcome"`
	Status        int                    `json:"status,omitempty"`
	RequestBytes  int64                  `json:"requestBytes,omitempty"`
	ResponseBytes int64                  `json:"responseBytes,omitempty"`
	Correlation   dataGatewayCorrelation `json:"correlation"`
	Redacted      bool                   `json:"redacted"`
}

type DataGatewayResult struct {
	Value   any                     `json:"value"`
	Empty   bool                    `json:"empty"`
	Network dataGatewayNetworkTrace `json:"network"`
}

type dataConfigurationReference struct {
	BindingID string `json:"bindingId"`
}

type dataConfigurationValue struct {
	Kind      string                     `json:"kind"`
	Value     any                        `json:"value"`
	Reference dataConfigurationReference `json:"reference"`
}

type dataGatewaySource struct {
	ID                 string                            `json:"id"`
	AdapterID          string                            `json:"adapterId"`
	RuntimeZone        string                            `json:"runtimeZone"`
	BindingsByID       map[string]dataConfigurationValue `json:"bindingsById"`
	ConfigurationByKey map[string]dataConfigurationValue `json:"configurationByKey"`
}

type dataGatewayOperation struct {
	ID                 string                            `json:"id"`
	Kind               string                            `json:"kind"`
	ConfigurationByKey map[string]dataConfigurationValue `json:"configurationByKey"`
	Policies           dataGatewayOperationPolicies      `json:"policies"`
}

type dataGatewayRetryPolicy struct {
	MaximumAttempts int64  `json:"maxAttempts"`
	Backoff         string `json:"backoff"`
	InitialDelayMS  int64  `json:"initialDelayMs"`
	MaximumDelayMS  *int64 `json:"maxDelayMs,omitempty"`
}

type dataGatewayIdempotencyPolicy struct {
	Kind string `json:"kind"`
}

type dataGatewayOperationPolicies struct {
	Retry       *dataGatewayRetryPolicy       `json:"retry,omitempty"`
	Idempotency *dataGatewayIdempotencyPolicy `json:"idempotency,omitempty"`
}

type dataGatewayDocument struct {
	WireVersion    int                             `json:"wireVersion"`
	Source         dataGatewaySource               `json:"source"`
	OperationsByID map[string]dataGatewayOperation `json:"operationsById"`
}

type DataGateway struct {
	store        GrantStore
	replays      DataGatewayMutationReplayStore
	environments DataGatewayEnvironmentStore
	transport    DataGatewayTransport
	now          func() time.Time
}
