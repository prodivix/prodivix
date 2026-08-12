package agent

import (
	"bytes"
	"context"
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"errors"
	"fmt"
	"io"
	"sync"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type EvaluationNativeProviderStateVaultRecord struct {
	NamespaceID                  string
	Partition                    EvaluationPlanPartition
	OwnerInstanceID              string
	AuthorityDigest              string
	Purpose                      string
	AttemptID                    string
	InvocationID                 string
	Generation                   int64
	TaskID                       string
	RunID                        string
	ProviderStateReferenceKind   string
	ProviderStateReferenceDigest string
	OpaqueProviderStateRef       string
	SealRequest                  evaluationNativeProviderStateVaultSealRequest
	SealReceipt                  evaluationNativeProviderStateVaultSealReceipt
	AADBytes                     []byte
	AADDigest                    string
	CiphertextBytes              []byte
	CiphertextDigest             string
	CiphertextNonce              []byte
	WrappedStateKeyBytes         []byte
	WrappedStateKeyDigest        string
	WrappedStateKeyNonce         []byte
	ResolveRequest               *evaluationNativeProviderStateVaultResolveRequest
	ResolveReceipt               *evaluationNativeProviderStateVaultResolveReceipt
	RetireRequest                *evaluationNativeProviderStateVaultRetireRequest
	RetirementReceipt            *evaluationNativeProviderStateVaultRetirementReceipt
	ForcedExpiryTombstone        *evaluationNativeProviderStateVaultForcedExpiryTombstone
	RecoveryRequestDigest        string
	Status                       string
	Disposition                  string
	CreatedAt                    time.Time
	UpdatedAt                    time.Time
	V46Eligible                  bool
}

type EvaluationNativeProviderStateVaultSummary struct {
	SealedRecordCount          int64
	ActiveEncryptedRecordCount int64
	RetiredRecordCount         int64
	CancelledRetirementCount   int64
	ConsumedRetirementCount    int64
	ExpiredRetirementCount     int64
	ForcedExpiryTombstoneCount int64
	OverdueActiveRecordCount   int64
}

type evaluationNativeProviderStateVaultForcedExpiryTombstone struct {
	NamespaceID                   string
	Partition                     EvaluationPlanPartition
	OwnerInstanceID               string
	AuthorityDigest               string
	OpaqueProviderStateRef        string
	SealRequestDigest             string
	SealReceiptDigest             string
	StateKeyCreationReceiptDigest string
	AADDigest                     string
	CiphertextDigest              string
	WrappedStateKeyDigest         string
	ExpiresAt                     time.Time
	ForcedExpiredAt               time.Time
	Reason                        string
	TombstoneDigest               string
	Value                         map[string]any
	Bytes                         []byte
}

const (
	evaluationNativeProviderStateVaultForcedExpiryTombstoneFormat = "prodivix.agent-evaluation-native-provider-state-vault-forced-expiry-tombstone"
	evaluationNativeProviderStateVaultForcedExpiryReason          = "maximum-lifecycle-ack-window-elapsed"
)

func createEvaluationNativeProviderStateVaultForcedExpiryTombstone(
	record EvaluationNativeProviderStateVaultRecord,
	forcedExpiredAt time.Time,
) (evaluationNativeProviderStateVaultForcedExpiryTombstone, error) {
	forcedExpiredAt = evaluationNativeProviderStateVaultMillisecond(forcedExpiredAt)
	if record.Status != "active" || record.RetireRequest != nil || record.RetirementReceipt != nil ||
		record.ForcedExpiryTombstone != nil ||
		!forcedExpiredAt.After(record.SealRequest.ExpiresAt.Add(evaluationNativeProviderStateVaultMaximumACKDelay)) {
		return evaluationNativeProviderStateVaultForcedExpiryTombstone{}, ErrConflict
	}
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultForcedExpiryTombstoneFormat, "version": int64(1),
		"namespaceId": record.NamespaceID, "planDigest": record.Partition.PlanDigest,
		"repositoryCommit": record.Partition.RepositoryCommit, "vaultOwnerInstanceId": record.OwnerInstanceID,
		"authorityDigest": record.AuthorityDigest, "opaqueProviderStateRef": record.OpaqueProviderStateRef,
		"sealRequestDigest": record.SealRequest.SealRequestDigest, "sealReceiptDigest": record.SealReceipt.ReceiptDigest,
		"stateKeyCreationReceiptDigest": record.SealReceipt.StateKeyCreationReceiptDigest,
		"aadDigest":                     record.AADDigest, "ciphertextDigest": record.CiphertextDigest,
		"wrappedStateKeyDigest": record.WrappedStateKeyDigest,
		"expiresAt":             evaluationNativeProviderStateVaultInstant(record.SealRequest.ExpiresAt),
		"forcedExpiredAt":       evaluationNativeProviderStateVaultInstant(forcedExpiredAt),
		"reason":                evaluationNativeProviderStateVaultForcedExpiryReason,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationNativeProviderStateVaultForcedExpiryTombstone{}, err
	}
	value := cloneEvaluationObject(base)
	value["tombstoneDigest"] = digest
	source, err := canonicaljson.Bytes(value)
	if err != nil || len(source) > maximumEvaluationNativeProviderStateVaultComponentBytes {
		return evaluationNativeProviderStateVaultForcedExpiryTombstone{}, ErrInvalid
	}
	return evaluationNativeProviderStateVaultForcedExpiryTombstone{
		NamespaceID: record.NamespaceID, Partition: record.Partition, OwnerInstanceID: record.OwnerInstanceID,
		AuthorityDigest: record.AuthorityDigest, OpaqueProviderStateRef: record.OpaqueProviderStateRef,
		SealRequestDigest: record.SealRequest.SealRequestDigest, SealReceiptDigest: record.SealReceipt.ReceiptDigest,
		StateKeyCreationReceiptDigest: record.SealReceipt.StateKeyCreationReceiptDigest,
		AADDigest:                     record.AADDigest, CiphertextDigest: record.CiphertextDigest,
		WrappedStateKeyDigest: record.WrappedStateKeyDigest, ExpiresAt: record.SealRequest.ExpiresAt,
		ForcedExpiredAt: forcedExpiredAt, Reason: evaluationNativeProviderStateVaultForcedExpiryReason,
		TombstoneDigest: digest, Value: value, Bytes: source,
	}, nil
}

func decodeEvaluationNativeProviderStateVaultForcedExpiryTombstone(
	source []byte,
) (evaluationNativeProviderStateVaultForcedExpiryTombstone, error) {
	value, canonical, err := decodeEvaluationJSONObject(source, maximumEvaluationNativeProviderStateVaultComponentBytes)
	if err != nil || !exactEvaluationKeys(value, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "vaultOwnerInstanceId",
		"authorityDigest", "opaqueProviderStateRef", "sealRequestDigest", "sealReceiptDigest",
		"stateKeyCreationReceiptDigest", "aadDigest", "ciphertextDigest", "wrappedStateKeyDigest",
		"expiresAt", "forcedExpiredAt", "reason", "tombstoneDigest",
	}) || stringMember(value, "format") != evaluationNativeProviderStateVaultForcedExpiryTombstoneFormat ||
		mustEvaluationInteger(value, "version") != 1 ||
		!validEvaluationServiceIdentity(stringMember(value, "namespaceId")) ||
		!evaluationDigestPattern.MatchString(stringMember(value, "planDigest")) ||
		!evaluationRepositoryCommitPattern.MatchString(stringMember(value, "repositoryCommit")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "vaultOwnerInstanceId")) ||
		!validEvaluationAgentControlIdentity(stringMember(value, "opaqueProviderStateRef")) ||
		stringMember(value, "reason") != evaluationNativeProviderStateVaultForcedExpiryReason {
		return evaluationNativeProviderStateVaultForcedExpiryTombstone{}, ErrInvalid
	}
	for _, field := range []string{
		"authorityDigest", "sealRequestDigest", "sealReceiptDigest", "stateKeyCreationReceiptDigest",
		"aadDigest", "ciphertextDigest", "wrappedStateKeyDigest", "tombstoneDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, field)) {
			return evaluationNativeProviderStateVaultForcedExpiryTombstone{}, ErrInvalid
		}
	}
	expiresAt, expiresErr := evaluationInstant(value["expiresAt"], "state vault forced expiry expiresAt")
	forcedExpiredAt, forcedErr := evaluationInstant(value["forcedExpiredAt"], "state vault forced expiry forcedExpiredAt")
	if expiresErr != nil || forcedErr != nil ||
		!forcedExpiredAt.After(expiresAt.Add(evaluationNativeProviderStateVaultMaximumACKDelay)) {
		return evaluationNativeProviderStateVaultForcedExpiryTombstone{}, ErrInvalid
	}
	base := cloneEvaluationObject(value)
	delete(base, "tombstoneDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != stringMember(value, "tombstoneDigest") {
		return evaluationNativeProviderStateVaultForcedExpiryTombstone{}, ErrConflict
	}
	return evaluationNativeProviderStateVaultForcedExpiryTombstone{
		NamespaceID:     stringMember(value, "namespaceId"),
		Partition:       EvaluationPlanPartition{PlanDigest: stringMember(value, "planDigest"), RepositoryCommit: stringMember(value, "repositoryCommit")},
		OwnerInstanceID: stringMember(value, "vaultOwnerInstanceId"), AuthorityDigest: stringMember(value, "authorityDigest"),
		OpaqueProviderStateRef: stringMember(value, "opaqueProviderStateRef"),
		SealRequestDigest:      stringMember(value, "sealRequestDigest"), SealReceiptDigest: stringMember(value, "sealReceiptDigest"),
		StateKeyCreationReceiptDigest: stringMember(value, "stateKeyCreationReceiptDigest"),
		AADDigest:                     stringMember(value, "aadDigest"), CiphertextDigest: stringMember(value, "ciphertextDigest"),
		WrappedStateKeyDigest: stringMember(value, "wrappedStateKeyDigest"), ExpiresAt: expiresAt,
		ForcedExpiredAt: forcedExpiredAt, Reason: stringMember(value, "reason"),
		TombstoneDigest: digest, Value: value, Bytes: canonical,
	}, nil
}

type evaluationNativeProviderStateVaultRepository interface {
	CheckEvaluationNativeProviderStateVaultAuthority(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		EvaluationNativeProviderStateVaultAuthority,
	) error
	StoreEvaluationNativeProviderStateVaultSeal(
		context.Context,
		EvaluationAuthority,
		EvaluationNativeProviderStateVaultRecord,
	) (EvaluationNativeProviderStateVaultRecord, bool, error)
	LoadEvaluationNativeProviderStateVaultRecord(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
	) (EvaluationNativeProviderStateVaultRecord, error)
	StoreEvaluationNativeProviderStateVaultResolve(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		evaluationNativeProviderStateVaultResolveRequest,
		evaluationNativeProviderStateVaultResolveReceipt,
	) (EvaluationNativeProviderStateVaultRecord, bool, error)
	StoreEvaluationNativeProviderStateVaultRetirement(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		evaluationNativeProviderStateVaultRetireRequest,
		evaluationNativeProviderStateVaultRetirementReceipt,
	) (EvaluationNativeProviderStateVaultRecord, bool, error)
	StoreEvaluationNativeProviderStateVaultForcedExpiry(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		evaluationNativeProviderStateVaultForcedExpiryTombstone,
	) (EvaluationNativeProviderStateVaultRecord, bool, error)
	LookupEvaluationNativeProviderStateVaultRetirement(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
	) (EvaluationNativeProviderStateVaultRecord, error)
	ListEvaluationNativeProviderStateVaultActive(
		context.Context,
		EvaluationAuthority,
		string,
		string,
		time.Time,
		bool,
		int,
	) ([]EvaluationNativeProviderStateVaultRecord, error)
	EvaluationNativeProviderStateVaultSummary(
		context.Context,
		EvaluationAuthority,
		string,
		time.Time,
	) (EvaluationNativeProviderStateVaultSummary, error)
}

type evaluationNativeProviderStateVaultRecoveryRepository interface {
	ListEvaluationNativeProviderStateVaultActiveForRecovery(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		int,
	) ([]EvaluationNativeProviderStateVaultRecord, error)
	StoreEvaluationNativeProviderStateVaultRecovery(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
		evaluationNativeProviderStateVaultRecoveryRequest,
		[]evaluationNativeProviderStateVaultRecoveryDisposition,
		evaluationNativeProviderStateVaultRecoveryReceipt,
	) (evaluationNativeProviderStateVaultRecoveryReceipt, bool, error)
	LookupEvaluationNativeProviderStateVaultRecovery(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
	) (evaluationNativeProviderStateVaultRecoveryRequest, evaluationNativeProviderStateVaultRecoveryReceipt, error)
	CountEvaluationNativeProviderStateVaultActiveForRecovery(
		context.Context,
		EvaluationAuthority,
		EvaluationPlanPartition,
		string,
	) (int64, error)
}

type EvaluationNativeProviderStateVaultConfig struct {
	Repository      evaluationNativeProviderStateVaultRepository
	MasterKey       []byte
	OwnerInstanceID string
	Scanner         EvaluationAttemptAuthorityPublicResponseScanner
	RecoveryOnly    bool
	Clock           func() time.Time
	Random          io.Reader
}

// EvaluationNativeProviderStateVault is the only owner of callback-local
// Provider state after the Provider callback returns. Plaintext exists only
// while one seal/resolve callback is executing.
type EvaluationNativeProviderStateVault struct {
	repository      evaluationNativeProviderStateVaultRepository
	authority       EvaluationNativeProviderStateVaultAuthority
	ownerInstanceID string
	masterKey       [32]byte
	scanner         EvaluationAttemptAuthorityPublicResponseScanner
	clock           func() time.Time
	random          io.Reader
	recoveryOnly    bool
	closeOnce       sync.Once
	closeErr        error
}

func NewEvaluationNativeProviderStateVault(config EvaluationNativeProviderStateVaultConfig) (*EvaluationNativeProviderStateVault, error) {
	if config.Repository == nil || len(config.MasterKey) != 32 ||
		(config.RecoveryOnly && config.Scanner != nil) || (!config.RecoveryOnly && config.Scanner == nil) ||
		!validEvaluationAgentControlIdentity(config.OwnerInstanceID) {
		return nil, ErrInvalid
	}
	if config.RecoveryOnly {
		if _, ok := config.Repository.(evaluationNativeProviderStateVaultRecoveryRepository); !ok {
			return nil, ErrInvalid
		}
	}
	authority, err := newEvaluationNativeProviderStateVaultAuthority()
	if err != nil {
		return nil, err
	}
	clock := config.Clock
	if clock == nil {
		clock = time.Now
	}
	randomSource := config.Random
	if randomSource == nil {
		randomSource = rand.Reader
	}
	service := &EvaluationNativeProviderStateVault{
		repository: config.Repository, authority: authority, ownerInstanceID: config.OwnerInstanceID,
		scanner: config.Scanner, clock: clock, random: randomSource, recoveryOnly: config.RecoveryOnly,
	}
	copy(service.masterKey[:], config.MasterKey)
	return service, nil
}

func NewRepositoryEvaluationNativeProviderStateVaultRecovery(
	repository *Repository,
	masterKey []byte,
	ownerInstanceID string,
	clock func() time.Time,
) (*EvaluationNativeProviderStateVault, error) {
	if repository == nil || repository.available() != nil {
		return nil, ErrInvalid
	}
	return NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: &repositoryEvaluationNativeProviderStateVault{repository: repository},
		MasterKey:  masterKey, OwnerInstanceID: ownerInstanceID, RecoveryOnly: true, Clock: clock,
	})
}

func NewRepositoryEvaluationNativeProviderStateVault(
	repository *Repository,
	masterKey []byte,
	ownerInstanceID string,
	scanner EvaluationAttemptAuthorityPublicResponseScanner,
	clock func() time.Time,
) (*EvaluationNativeProviderStateVault, error) {
	if repository == nil || repository.available() != nil {
		return nil, ErrInvalid
	}
	return NewEvaluationNativeProviderStateVault(EvaluationNativeProviderStateVaultConfig{
		Repository: &repositoryEvaluationNativeProviderStateVault{repository: repository},
		MasterKey:  masterKey, OwnerInstanceID: ownerInstanceID, Scanner: scanner, Clock: clock,
	})
}

func (vault *EvaluationNativeProviderStateVault) Authority() (EvaluationNativeProviderStateVaultAuthority, error) {
	if vault == nil || vault.repository == nil || (!vault.recoveryOnly && vault.scanner == nil) {
		return EvaluationNativeProviderStateVaultAuthority{}, errEvaluationServiceUnavailable
	}
	return vault.authority, nil
}

func (vault *EvaluationNativeProviderStateVault) RecoveryOnly() bool {
	return vault != nil && vault.recoveryOnly
}

func (vault *EvaluationNativeProviderStateVault) OwnerInstanceID() (string, error) {
	if vault == nil || !validEvaluationAgentControlIdentity(vault.ownerInstanceID) {
		return "", errEvaluationServiceUnavailable
	}
	return vault.ownerInstanceID, nil
}

func (vault *EvaluationNativeProviderStateVault) scan(
	ctx context.Context,
	operation, digest string,
	source []byte,
) error {
	if vault == nil || vault.scanner == nil || len(source) == 0 {
		return errEvaluationServiceUnavailable
	}
	if err := vault.scanner.ScanAttemptAuthorityPublicResponse(ctx, operation, digest, source); err != nil {
		return err
	}
	return nil
}

func (vault *EvaluationNativeProviderStateVault) Seal(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	command evaluationNativeProviderStateVaultSealCommand,
) (evaluationNativeProviderStateVaultSealReceipt, bool, error) {
	if vault == nil || vault.recoveryOnly || validateEvaluationAuthority(authority) != nil || validateEvaluationPartition(partition) != nil ||
		command.Request.AuthorityDigest != vault.authority.AuthorityDigest {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, ErrInvalid
	}
	if err := vault.scan(ctx, "native-provider-state-vault.seal-ingress", command.Request.SealRequestDigest, command.Bytes); err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	if err := vault.repository.CheckEvaluationNativeProviderStateVaultAuthority(ctx, authority, partition, vault.authority); err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	sealedAt := evaluationNativeProviderStateVaultMillisecond(vault.clock())
	if sealedAt.Before(command.Request.ObservedAt) || sealedAt.Sub(command.Request.ObservedAt) > evaluationNativeProviderStateVaultMaximumACKDelay {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, ErrConflict
	}
	aad, aadDigest, err := evaluationNativeProviderStateVaultAAD(authority, partition, command.Request)
	if err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	dataKey := make([]byte, 32)
	defer clear(dataKey)
	if _, err := io.ReadFull(vault.random, dataKey); err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, errEvaluationServiceUnavailable
	}
	ciphertext, ciphertextNonce, err := evaluationNativeProviderStateVaultEncrypt(
		dataKey, []byte(command.CallbackLocalProviderStateHandle), aad, vault.random,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	wrappedKey, wrappedNonce, err := evaluationNativeProviderStateVaultEncrypt(
		vault.masterKey[:], dataKey, append(append([]byte(nil), aad...), []byte("\x00wrapped-state-key")...), vault.random,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	ciphertextDigest := evaluationNativeProviderStateVaultRawDigest(ciphertext)
	wrappedKeyDigest := evaluationNativeProviderStateVaultRawDigest(wrappedKey)
	creationDigest, err := evaluationNativeProviderStateVaultStateKeyCreationDigest(
		command.Request, aadDigest, ciphertextDigest, wrappedKeyDigest, sealedAt,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	opaqueRef, err := createEvaluationNativeProviderStateVaultOpaqueRef(
		command.Request.AuthorityDigest, command.Request.SealRequestDigest, creationDigest,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	receipt, err := createEvaluationNativeProviderStateVaultSealReceipt(
		command.Request, "sealed", opaqueRef, creationDigest, sealedAt,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	if err := vault.scan(ctx, "native-provider-state-vault.seal-receipt", receipt.ReceiptDigest, receipt.Bytes); err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	record := EvaluationNativeProviderStateVaultRecord{
		NamespaceID: authority.NamespaceID, Partition: partition, OwnerInstanceID: vault.ownerInstanceID,
		AuthorityDigest: command.Request.AuthorityDigest,
		Purpose:         command.Request.Purpose, AttemptID: command.Request.AttemptID,
		InvocationID: command.Request.InvocationID, Generation: command.Request.Generation,
		TaskID: command.Request.TaskID, RunID: command.Request.RunID,
		ProviderStateReferenceKind:   command.Request.ProviderStateReferenceKind,
		ProviderStateReferenceDigest: command.Request.ProviderStateReferenceDigest,
		OpaqueProviderStateRef:       opaqueRef, SealRequest: command.Request, SealReceipt: receipt,
		AADBytes: aad, AADDigest: aadDigest, CiphertextBytes: ciphertext,
		CiphertextDigest: ciphertextDigest, CiphertextNonce: ciphertextNonce,
		WrappedStateKeyBytes: wrappedKey, WrappedStateKeyDigest: wrappedKeyDigest,
		WrappedStateKeyNonce: wrappedNonce, Status: "active", CreatedAt: sealedAt,
		UpdatedAt: sealedAt, V46Eligible: true,
	}
	stored, replayed, err := vault.repository.StoreEvaluationNativeProviderStateVaultSeal(ctx, authority, record)
	if err != nil {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, err
	}
	if stored.SealRequest.SealRequestDigest != command.Request.SealRequestDigest ||
		stored.SealReceipt.ReceiptDigest == "" || stored.OwnerInstanceID != vault.ownerInstanceID ||
		stored.ProviderStateReferenceDigest != command.Request.ProviderStateReferenceDigest {
		return evaluationNativeProviderStateVaultSealReceipt{}, false, ErrConflict
	}
	return stored.SealReceipt, replayed, nil
}

type evaluationNativeProviderStateVaultResolveResult struct {
	Receipt                          evaluationNativeProviderStateVaultResolveReceipt
	CallbackLocalProviderStateHandle string
	Bytes                            []byte
}

func (vault *EvaluationNativeProviderStateVault) Resolve(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationNativeProviderStateVaultResolveRequest,
) (evaluationNativeProviderStateVaultResolveResult, bool, error) {
	if vault == nil || vault.recoveryOnly || request.AuthorityDigest != vault.authority.AuthorityDigest {
		return evaluationNativeProviderStateVaultResolveResult{}, false, ErrInvalid
	}
	if err := vault.scan(ctx, "native-provider-state-vault.resolve-request", request.ResolveRequestDigest, request.Bytes); err != nil {
		return evaluationNativeProviderStateVaultResolveResult{}, false, err
	}
	if err := vault.repository.CheckEvaluationNativeProviderStateVaultAuthority(ctx, authority, partition, vault.authority); err != nil {
		return evaluationNativeProviderStateVaultResolveResult{}, false, err
	}
	record, err := vault.repository.LoadEvaluationNativeProviderStateVaultRecord(
		ctx, authority, partition, request.OpaqueProviderStateRef,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultResolveResult{}, false, err
	}
	if record.OwnerInstanceID != vault.ownerInstanceID {
		return evaluationNativeProviderStateVaultResolveResult{}, false, ErrUnauthorized
	}
	if err := matchEvaluationNativeProviderStateVaultResolveRequest(request, record); err != nil {
		return evaluationNativeProviderStateVaultResolveResult{}, false, err
	}
	if record.ResolveRequest != nil || record.ResolveReceipt != nil {
		if record.ResolveRequest == nil || record.ResolveReceipt == nil ||
			!bytes.Equal(record.ResolveRequest.Bytes, request.Bytes) {
			return evaluationNativeProviderStateVaultResolveResult{}, false, ErrConflict
		}
		handle := ""
		if record.ResolveReceipt.Status == "resolved" {
			if record.Status != "active" {
				return evaluationNativeProviderStateVaultResolveResult{}, false, ErrConflict
			}
			var err error
			handle, err = vault.decrypt(record)
			if err != nil {
				return evaluationNativeProviderStateVaultResolveResult{}, false, errEvaluationServiceUnavailable
			}
		}
		responseBytes, err := evaluationNativeProviderStateVaultResolveResultBytes(*record.ResolveReceipt, handle)
		if err != nil {
			return evaluationNativeProviderStateVaultResolveResult{}, false, err
		}
		if err := vault.scan(ctx, "native-provider-state-vault.resolve-result", record.ResolveReceipt.ReceiptDigest, responseBytes); err != nil {
			return evaluationNativeProviderStateVaultResolveResult{}, false, err
		}
		return evaluationNativeProviderStateVaultResolveResult{
			Receipt: *record.ResolveReceipt, CallbackLocalProviderStateHandle: handle, Bytes: responseBytes,
		}, true, nil
	}
	resolvedAt := evaluationNativeProviderStateVaultMillisecond(vault.clock())
	status := "resolved"
	handle := ""
	if record.Status == "retired" {
		status = "retired"
	} else if !resolvedAt.Before(request.ExpiresAt) {
		status = "expired"
	} else {
		handle, err = vault.decrypt(record)
		if err != nil {
			return evaluationNativeProviderStateVaultResolveResult{}, false, errEvaluationServiceUnavailable
		}
	}
	receipt, err := createEvaluationNativeProviderStateVaultResolveReceipt(request, status, handle, resolvedAt)
	if err != nil {
		return evaluationNativeProviderStateVaultResolveResult{}, false, err
	}
	responseBytes, err := evaluationNativeProviderStateVaultResolveResultBytes(receipt, handle)
	if err != nil {
		return evaluationNativeProviderStateVaultResolveResult{}, false, err
	}
	if err := vault.scan(ctx, "native-provider-state-vault.resolve-result", receipt.ReceiptDigest, responseBytes); err != nil {
		return evaluationNativeProviderStateVaultResolveResult{}, false, err
	}
	stored, replayed, err := vault.repository.StoreEvaluationNativeProviderStateVaultResolve(
		ctx, authority, partition, request.OpaqueProviderStateRef, request, receipt,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultResolveResult{}, false, err
	}
	if stored.ResolveReceipt == nil || stored.ResolveReceipt.ReceiptDigest != receipt.ReceiptDigest {
		return evaluationNativeProviderStateVaultResolveResult{}, false, ErrConflict
	}
	if replayed {
		if stored.ResolveReceipt.Status != "resolved" {
			handle = ""
		} else if record.Status != "active" {
			return evaluationNativeProviderStateVaultResolveResult{}, false, ErrConflict
		}
		responseBytes, err = evaluationNativeProviderStateVaultResolveResultBytes(*stored.ResolveReceipt, handle)
		if err != nil {
			return evaluationNativeProviderStateVaultResolveResult{}, false, err
		}
		receipt = *stored.ResolveReceipt
	}
	return evaluationNativeProviderStateVaultResolveResult{Receipt: receipt, CallbackLocalProviderStateHandle: handle, Bytes: responseBytes}, replayed, nil
}

func (vault *EvaluationNativeProviderStateVault) Retire(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationNativeProviderStateVaultRetireRequest,
) (evaluationNativeProviderStateVaultRetirementReceipt, bool, error) {
	if vault == nil || vault.recoveryOnly {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, errEvaluationServiceUnavailable
	}
	return vault.retire(ctx, authority, partition, request, false)
}

func (vault *EvaluationNativeProviderStateVault) retire(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationNativeProviderStateVaultRetireRequest,
	allowForeignExpired bool,
) (evaluationNativeProviderStateVaultRetirementReceipt, bool, error) {
	if vault == nil || request.AuthorityDigest != vault.authority.AuthorityDigest {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, ErrInvalid
	}
	if err := vault.scan(ctx, "native-provider-state-vault.retire-request", request.RetireRequestDigest, request.Bytes); err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, err
	}
	if err := vault.repository.CheckEvaluationNativeProviderStateVaultAuthority(ctx, authority, partition, vault.authority); err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, err
	}
	record, err := vault.repository.LoadEvaluationNativeProviderStateVaultRecord(ctx, authority, partition, request.OpaqueProviderStateRef)
	if err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, err
	}
	if record.OwnerInstanceID != vault.ownerInstanceID &&
		(!allowForeignExpired || request.Disposition != "expired" || vault.clock().Before(record.SealRequest.ExpiresAt)) {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, ErrUnauthorized
	}
	if record.RetirementReceipt != nil {
		if record.RetireRequest == nil || record.RetireRequest.RetireRequestDigest != request.RetireRequestDigest {
			return evaluationNativeProviderStateVaultRetirementReceipt{}, false, ErrConflict
		}
		return *record.RetirementReceipt, true, nil
	}
	if err := matchEvaluationNativeProviderStateVaultRetireRequest(request, record); err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, err
	}
	retiredAt := evaluationNativeProviderStateVaultMillisecond(vault.clock())
	destructionDigest, deletionDigest, err := evaluationNativeProviderStateVaultDestructionDigests(record, request, retiredAt)
	if err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, err
	}
	receipt, err := createEvaluationNativeProviderStateVaultRetirementReceipt(request, record.SealReceipt, destructionDigest, deletionDigest, retiredAt)
	if err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, err
	}
	if err := vault.scan(ctx, "native-provider-state-vault.retirement-receipt", receipt.ReceiptDigest, receipt.Bytes); err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, err
	}
	stored, replayed, err := vault.repository.StoreEvaluationNativeProviderStateVaultRetirement(
		ctx, authority, partition, request.OpaqueProviderStateRef, request, receipt,
	)
	if err != nil {
		lookup, lookupErr := vault.repository.LookupEvaluationNativeProviderStateVaultRetirement(
			ctx, authority, partition, request.RetireRequestDigest,
		)
		if lookupErr != nil || lookup.RetirementReceipt == nil {
			return evaluationNativeProviderStateVaultRetirementReceipt{}, false, err
		}
		stored, replayed = lookup, true
	}
	if stored.RetirementReceipt == nil || stored.RetirementReceipt.ReceiptDigest != receipt.ReceiptDigest {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, false, ErrConflict
	}
	return *stored.RetirementReceipt, replayed, nil
}

func (vault *EvaluationNativeProviderStateVault) LookupRetirement(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	retireRequestDigest string,
) (evaluationNativeProviderStateVaultRetirementReceipt, error) {
	if vault == nil || vault.recoveryOnly || !evaluationDigestPattern.MatchString(retireRequestDigest) {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, ErrInvalid
	}
	record, err := vault.repository.LookupEvaluationNativeProviderStateVaultRetirement(ctx, authority, partition, retireRequestDigest)
	if err != nil {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, err
	}
	if record.RetirementReceipt == nil || record.RetireRequest == nil || record.RetireRequest.RetireRequestDigest != retireRequestDigest {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, ErrConflict
	}
	if record.OwnerInstanceID != vault.ownerInstanceID {
		return evaluationNativeProviderStateVaultRetirementReceipt{}, ErrUnauthorized
	}
	return *record.RetirementReceipt, nil
}

func (vault *EvaluationNativeProviderStateVault) forceExpire(
	ctx context.Context,
	authority EvaluationAuthority,
	record EvaluationNativeProviderStateVaultRecord,
	forcedExpiredAt time.Time,
) error {
	if vault == nil || record.Status != "active" ||
		!forcedExpiredAt.After(record.SealRequest.ExpiresAt.Add(evaluationNativeProviderStateVaultMaximumACKDelay)) {
		return ErrInvalid
	}
	if err := vault.repository.CheckEvaluationNativeProviderStateVaultAuthority(
		ctx, authority, record.Partition, vault.authority,
	); err != nil {
		return err
	}
	tombstone, err := createEvaluationNativeProviderStateVaultForcedExpiryTombstone(record, forcedExpiredAt)
	if err != nil {
		return err
	}
	stored, _, err := vault.repository.StoreEvaluationNativeProviderStateVaultForcedExpiry(
		ctx, authority, record.Partition, record.OpaqueProviderStateRef, tombstone,
	)
	if err != nil {
		lookup, lookupErr := vault.repository.LoadEvaluationNativeProviderStateVaultRecord(
			ctx, authority, record.Partition, record.OpaqueProviderStateRef,
		)
		if lookupErr != nil || lookup.Status != "expired-unqualified" || lookup.ForcedExpiryTombstone == nil ||
			lookup.ForcedExpiryTombstone.SealRequestDigest != record.SealRequest.SealRequestDigest ||
			lookup.ForcedExpiryTombstone.SealReceiptDigest != record.SealReceipt.ReceiptDigest {
			return err
		}
		stored = lookup
	}
	if stored.Status != "expired-unqualified" || stored.ForcedExpiryTombstone == nil ||
		len(stored.CiphertextBytes) != 0 || len(stored.CiphertextNonce) != 0 ||
		len(stored.WrappedStateKeyBytes) != 0 || len(stored.WrappedStateKeyNonce) != 0 {
		return ErrConflict
	}
	return nil
}

func (vault *EvaluationNativeProviderStateVault) Recover(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationNativeProviderStateVaultRecoveryRequest,
) (evaluationNativeProviderStateVaultRecoveryReceipt, bool, error) {
	if vault == nil || !vault.recoveryOnly || validateEvaluationAuthority(authority) != nil ||
		validateEvaluationPartition(partition) != nil || request.NamespaceID != authority.NamespaceID ||
		request.Partition != partition || request.OwnerInstanceID != vault.ownerInstanceID ||
		request.AuthorityDigest != vault.authority.AuthorityDigest {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrInvalid
	}
	repository, ok := vault.repository.(evaluationNativeProviderStateVaultRecoveryRepository)
	if !ok {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, errEvaluationServiceUnavailable
	}
	storedRequest, storedReceipt, lookupErr := repository.LookupEvaluationNativeProviderStateVaultRecovery(
		ctx, authority, partition, request.RecoveryRequestDigest,
	)
	if lookupErr == nil {
		if !bytes.Equal(storedRequest.Bytes, request.Bytes) ||
			matchEvaluationNativeProviderStateVaultRecoveryReceipt(storedReceipt, request) != nil {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
		return storedReceipt, true, nil
	}
	if !errors.Is(lookupErr, ErrNotFound) {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, lookupErr
	}
	completedAt := evaluationNativeProviderStateVaultMillisecond(vault.clock())
	if completedAt.Before(request.RequestedAt) ||
		completedAt.Sub(request.RequestedAt) > evaluationNativeProviderStateVaultLifetime {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
	}
	if err := vault.repository.CheckEvaluationNativeProviderStateVaultAuthority(ctx, authority, partition, vault.authority); err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	records, err := repository.ListEvaluationNativeProviderStateVaultActiveForRecovery(
		ctx, authority, partition, vault.ownerInstanceID, maximumEvaluationNativeProviderStateVaultRecords+1,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	if len(records) > maximumEvaluationNativeProviderStateVaultRecords {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
	}
	dispositions := make([]evaluationNativeProviderStateVaultRecoveryDisposition, 0, len(records))
	for _, record := range records {
		if record.NamespaceID != authority.NamespaceID || record.Partition != partition ||
			record.OwnerInstanceID != vault.ownerInstanceID || record.AuthorityDigest != vault.authority.AuthorityDigest ||
			record.Status != "active" {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
		}
		if err := vault.verifyRecoveryMasterKey(record); err != nil {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
		}
		disposition := evaluationNativeProviderStateVaultRecoveryDisposition{
			OpaqueProviderStateRef: record.OpaqueProviderStateRef,
			SealRequestDigest:      record.SealRequest.SealRequestDigest,
		}
		if completedAt.After(record.SealRequest.ExpiresAt.Add(evaluationNativeProviderStateVaultMaximumACKDelay)) {
			tombstone, err := createEvaluationNativeProviderStateVaultForcedExpiryTombstone(record, completedAt)
			if err != nil {
				return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
			}
			disposition.ForcedExpiryTombstone = &tombstone
		} else {
			retireRequest, err := createEvaluationNativeProviderStateVaultSweepRetireRequest(record, completedAt)
			if err != nil {
				return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
			}
			destructionDigest, deletionDigest, err := evaluationNativeProviderStateVaultDestructionDigests(
				record, retireRequest, completedAt,
			)
			if err != nil {
				return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
			}
			retirementReceipt, err := createEvaluationNativeProviderStateVaultRetirementReceipt(
				retireRequest, record.SealReceipt, destructionDigest, deletionDigest, completedAt,
			)
			if err != nil {
				return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
			}
			disposition.RetireRequest = &retireRequest
			disposition.RetirementReceipt = &retirementReceipt
		}
		dispositions = append(dispositions, disposition)
	}
	receipt, err := createEvaluationNativeProviderStateVaultRecoveryReceipt(request, dispositions, completedAt)
	if err != nil {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
	}
	stored, replayed, err := repository.StoreEvaluationNativeProviderStateVaultRecovery(
		ctx, authority, partition, vault.ownerInstanceID, request, dispositions, receipt,
	)
	if err != nil {
		lookupRequest, lookupReceipt, lookupErr := repository.LookupEvaluationNativeProviderStateVaultRecovery(
			ctx, authority, partition, request.RecoveryRequestDigest,
		)
		if lookupErr != nil || !bytes.Equal(lookupRequest.Bytes, request.Bytes) ||
			matchEvaluationNativeProviderStateVaultRecoveryReceipt(lookupReceipt, request) != nil {
			return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, err
		}
		stored, replayed = lookupReceipt, true
	}
	if !evaluationNativeProviderStateVaultRecoveryReceiptEqual(stored, receipt) {
		return evaluationNativeProviderStateVaultRecoveryReceipt{}, false, ErrConflict
	}
	return stored, replayed, nil
}

func (vault *EvaluationNativeProviderStateVault) verifyRecoveryMasterKey(
	record EvaluationNativeProviderStateVaultRecord,
) error {
	if vault == nil || !vault.recoveryOnly || record.Status != "active" || len(record.AADBytes) == 0 ||
		len(record.WrappedStateKeyBytes) == 0 || len(record.WrappedStateKeyNonce) == 0 {
		return ErrConflict
	}
	wrappedAAD := append(append([]byte(nil), record.AADBytes...), []byte("\x00wrapped-state-key")...)
	dataKey, err := evaluationNativeProviderStateVaultDecrypt(
		vault.masterKey[:], record.WrappedStateKeyBytes, record.WrappedStateKeyNonce, wrappedAAD,
	)
	defer clear(dataKey)
	if err != nil || len(dataKey) != 32 {
		return ErrConflict
	}
	return nil
}

func (vault *EvaluationNativeProviderStateVault) LookupRecovery(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	recoveryRequestDigest string,
) (evaluationNativeProviderStateVaultRecoveryRequest, evaluationNativeProviderStateVaultRecoveryReceipt, error) {
	if vault == nil || !vault.recoveryOnly || !evaluationDigestPattern.MatchString(recoveryRequestDigest) {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrInvalid
	}
	repository, ok := vault.repository.(evaluationNativeProviderStateVaultRecoveryRepository)
	if !ok {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, errEvaluationServiceUnavailable
	}
	request, receipt, err := repository.LookupEvaluationNativeProviderStateVaultRecovery(
		ctx, authority, partition, recoveryRequestDigest,
	)
	if err != nil {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, err
	}
	if request.OwnerInstanceID != vault.ownerInstanceID || request.AuthorityDigest != vault.authority.AuthorityDigest ||
		matchEvaluationNativeProviderStateVaultRecoveryReceipt(receipt, request) != nil {
		return evaluationNativeProviderStateVaultRecoveryRequest{}, evaluationNativeProviderStateVaultRecoveryReceipt{}, ErrConflict
	}
	return request, receipt, nil
}

func (vault *EvaluationNativeProviderStateVault) RecoveryZeroResidual(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	recoveryRequestDigest string,
) ([]byte, error) {
	request, receipt, err := vault.LookupRecovery(ctx, authority, partition, recoveryRequestDigest)
	if err != nil {
		return nil, err
	}
	repository, ok := vault.repository.(evaluationNativeProviderStateVaultRecoveryRepository)
	if !ok {
		return nil, errEvaluationServiceUnavailable
	}
	count, err := repository.CountEvaluationNativeProviderStateVaultActiveForRecovery(
		ctx, authority, partition, vault.ownerInstanceID,
	)
	if err != nil {
		return nil, err
	}
	if count != 0 {
		return nil, ErrConflict
	}
	return createEvaluationNativeProviderStateVaultRecoveryZeroResidualReceipt(
		request, receipt, evaluationNativeProviderStateVaultMillisecond(vault.clock()),
	)
}

func (vault *EvaluationNativeProviderStateVault) Summary(
	ctx context.Context,
	authority EvaluationAuthority,
) (EvaluationNativeProviderStateVaultSummary, error) {
	if vault == nil || vault.repository == nil {
		return EvaluationNativeProviderStateVaultSummary{}, errEvaluationServiceUnavailable
	}
	return vault.repository.EvaluationNativeProviderStateVaultSummary(
		ctx, authority, vault.ownerInstanceID, evaluationNativeProviderStateVaultMillisecond(vault.clock()),
	)
}

// Sweep retires expired records and, during shutdown, cancels every remaining
// unconsumed state. It is bounded and may be called repeatedly after ACK loss.
func (vault *EvaluationNativeProviderStateVault) Sweep(
	ctx context.Context,
	authority EvaluationAuthority,
	repositoryCommit string,
	shutdown bool,
) (EvaluationNativeProviderStateVaultSummary, error) {
	if vault == nil || vault.recoveryOnly || !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return EvaluationNativeProviderStateVaultSummary{}, ErrInvalid
	}
	for {
		now := evaluationNativeProviderStateVaultMillisecond(vault.clock())
		records, err := vault.repository.ListEvaluationNativeProviderStateVaultActive(
			ctx, authority, repositoryCommit, vault.ownerInstanceID, now, !shutdown,
			maximumEvaluationNativeProviderStateVaultRecords+1,
		)
		if err != nil {
			return EvaluationNativeProviderStateVaultSummary{}, err
		}
		if len(records) > maximumEvaluationNativeProviderStateVaultRecords {
			return EvaluationNativeProviderStateVaultSummary{}, ErrConflict
		}
		progress := 0
		for _, record := range records {
			if !shutdown && now.Before(record.SealRequest.ExpiresAt) {
				continue
			}
			if now.After(record.SealRequest.ExpiresAt.Add(evaluationNativeProviderStateVaultMaximumACKDelay)) {
				if err := vault.forceExpire(ctx, authority, record, now); err != nil {
					return EvaluationNativeProviderStateVaultSummary{}, err
				}
				progress++
				continue
			}
			request, err := createEvaluationNativeProviderStateVaultSweepRetireRequest(record, now)
			if err != nil {
				return EvaluationNativeProviderStateVaultSummary{}, err
			}
			if _, _, err := vault.retire(ctx, authority, record.Partition, request, !shutdown); err != nil {
				return EvaluationNativeProviderStateVaultSummary{}, err
			}
			progress++
		}
		if progress == 0 || len(records) < maximumEvaluationNativeProviderStateVaultRecords {
			break
		}
	}
	summary, err := vault.Summary(ctx, authority)
	if err != nil {
		return EvaluationNativeProviderStateVaultSummary{}, err
	}
	if shutdown && summary.ActiveEncryptedRecordCount != 0 {
		return EvaluationNativeProviderStateVaultSummary{}, ErrConflict
	}
	return summary, nil
}

func (vault *EvaluationNativeProviderStateVault) Close(
	ctx context.Context,
	authority EvaluationAuthority,
	repositoryCommit string,
) error {
	if vault == nil {
		return errEvaluationServiceUnavailable
	}
	vault.closeOnce.Do(func() {
		if vault.recoveryOnly {
			summary, err := vault.Summary(ctx, authority)
			if err != nil {
				vault.closeErr = err
			} else if summary.ActiveEncryptedRecordCount != 0 {
				vault.closeErr = ErrConflict
			}
		} else {
			_, vault.closeErr = vault.Sweep(ctx, authority, repositoryCommit, true)
		}
		clear(vault.masterKey[:])
	})
	return vault.closeErr
}

func (vault *EvaluationNativeProviderStateVault) SweepNamespace(
	ctx context.Context,
	namespaceID string,
	repositoryCommit string,
	shutdown bool,
) (EvaluationNativeProviderStateVaultSummary, error) {
	if !validEvaluationServiceIdentity(namespaceID) {
		return EvaluationNativeProviderStateVaultSummary{}, ErrInvalid
	}
	return vault.Sweep(ctx, EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: namespaceID,
	}, repositoryCommit, shutdown)
}

func (vault *EvaluationNativeProviderStateVault) CloseNamespace(
	ctx context.Context,
	namespaceID string,
	repositoryCommit string,
) error {
	if vault == nil {
		return errEvaluationServiceUnavailable
	}
	return vault.Close(ctx, EvaluationAuthority{
		Kind: "service", PrincipalID: evaluationServiceAuthorityPrincipal, NamespaceID: namespaceID,
	}, repositoryCommit)
}

func (vault *EvaluationNativeProviderStateVault) decrypt(record EvaluationNativeProviderStateVaultRecord) (string, error) {
	if record.Status != "active" || len(record.WrappedStateKeyBytes) == 0 || len(record.CiphertextBytes) == 0 {
		return "", ErrConflict
	}
	wrappedAAD := append(append([]byte(nil), record.AADBytes...), []byte("\x00wrapped-state-key")...)
	dataKey, err := evaluationNativeProviderStateVaultDecrypt(
		vault.masterKey[:], record.WrappedStateKeyBytes, record.WrappedStateKeyNonce, wrappedAAD,
	)
	if err != nil || len(dataKey) != 32 {
		clear(dataKey)
		return "", ErrConflict
	}
	defer clear(dataKey)
	plaintext, err := evaluationNativeProviderStateVaultDecrypt(
		dataKey, record.CiphertextBytes, record.CiphertextNonce, record.AADBytes,
	)
	if err != nil || len(plaintext) == 0 || len(plaintext) > maximumEvaluationNativeProviderStateVaultHandleBytes {
		clear(plaintext)
		return "", ErrConflict
	}
	handle := string(plaintext)
	clear(plaintext)
	if !validEvaluationAgentControlIdentity(handle) {
		return "", ErrConflict
	}
	digest, err := canonicaljson.Digest(map[string]any{"kind": record.ProviderStateReferenceKind, "value": handle})
	if err != nil || digest != record.ProviderStateReferenceDigest {
		return "", ErrConflict
	}
	return handle, nil
}

func evaluationNativeProviderStateVaultEncrypt(key, plaintext, aad []byte, randomSource io.Reader) ([]byte, []byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return nil, nil, err
	}
	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(randomSource, nonce); err != nil {
		return nil, nil, err
	}
	return gcm.Seal(nil, nonce, plaintext, aad), nonce, nil
}

func evaluationNativeProviderStateVaultDecrypt(key, ciphertext, nonce, aad []byte) ([]byte, error) {
	block, err := aes.NewCipher(key)
	if err != nil {
		return nil, err
	}
	gcm, err := cipher.NewGCM(block)
	if err != nil || len(nonce) != gcm.NonceSize() {
		return nil, ErrConflict
	}
	return gcm.Open(nil, nonce, ciphertext, aad)
}

func evaluationNativeProviderStateVaultRawDigest(source []byte) string {
	return fmt.Sprintf("sha256-%x", sha256.Sum256(source))
}

func evaluationNativeProviderStateVaultMillisecond(value time.Time) time.Time {
	return value.UTC().Truncate(time.Millisecond)
}

func evaluationNativeProviderStateVaultResolveResultBytes(receipt evaluationNativeProviderStateVaultResolveReceipt, handle string) ([]byte, error) {
	value := map[string]any{
		"format": evaluationNativeProviderStateVaultResolveResultFormat, "version": int64(1),
		"receipt": receipt.Value, "callbackLocalProviderStateHandle": nullableEvaluationString(handle),
	}
	source, err := canonicaljson.Bytes(value)
	if err != nil || len(source) > maximumEvaluationNativeProviderStateVaultEnvelopeBytes {
		return nil, ErrInvalid
	}
	return source, nil
}

func matchEvaluationNativeProviderStateVaultResolveRequest(request evaluationNativeProviderStateVaultResolveRequest, record EvaluationNativeProviderStateVaultRecord) error {
	if record.SealReceipt.Status != "sealed" || request.AuthorityDigest != record.AuthorityDigest ||
		request.OpaqueProviderStateRef != record.OpaqueProviderStateRef ||
		request.SealRequestDigest != record.SealRequest.SealRequestDigest ||
		request.SealReceiptDigest != record.SealReceipt.ReceiptDigest || request.Purpose != record.Purpose ||
		request.ProviderStateReferenceKind != record.ProviderStateReferenceKind ||
		request.ProviderStateReferenceDigest != record.ProviderStateReferenceDigest ||
		request.SourceAttemptID != record.AttemptID || request.SourceInvocationID != record.InvocationID ||
		request.SourceGeneration != record.Generation || request.TaskID != record.TaskID || request.RunID != record.RunID ||
		!request.ExpiresAt.Equal(record.SealRequest.ExpiresAt) || request.RequestedAt.Before(record.SealReceipt.SealedAt) {
		return ErrConflict
	}
	return nil
}

func matchEvaluationNativeProviderStateVaultRetireRequest(request evaluationNativeProviderStateVaultRetireRequest, record EvaluationNativeProviderStateVaultRecord) error {
	if request.AuthorityDigest != record.AuthorityDigest || request.OpaqueProviderStateRef != record.OpaqueProviderStateRef ||
		request.SealRequestDigest != record.SealRequest.SealRequestDigest || request.SealReceiptDigest != record.SealReceipt.ReceiptDigest ||
		request.Purpose != record.Purpose || request.SourceAttemptID != record.AttemptID ||
		request.SourceInvocationID != record.InvocationID || request.SourceGeneration != record.Generation ||
		!request.ExpiresAt.Equal(record.SealRequest.ExpiresAt) || request.RequestedAt.Before(record.SealReceipt.SealedAt) {
		return ErrConflict
	}
	if request.ResolveReceiptDigest == "" {
		if request.Disposition == "consumed" {
			return ErrConflict
		}
		return nil
	}
	if record.ResolveRequest == nil || record.ResolveReceipt == nil ||
		request.ResolveReceiptDigest != record.ResolveReceipt.ReceiptDigest ||
		request.ConsumerAttemptID != record.ResolveRequest.ConsumerAttemptID ||
		request.ConsumerInvocationID != record.ResolveRequest.ConsumerInvocationID ||
		request.ConsumerGeneration == nil || *request.ConsumerGeneration != record.ResolveRequest.ConsumerGeneration ||
		request.RequestedAt.Before(record.ResolveReceipt.ResolvedAt) ||
		(request.Disposition == "consumed" && record.ResolveReceipt.Status != "resolved") ||
		(request.Disposition == "cancelled" && record.ResolveReceipt.Status == "resolved") ||
		(request.Disposition == "expired" && record.ResolveReceipt.Status != "expired") {
		return ErrConflict
	}
	return nil
}

func createEvaluationNativeProviderStateVaultSweepRetireRequest(record EvaluationNativeProviderStateVaultRecord, requestedAt time.Time) (evaluationNativeProviderStateVaultRetireRequest, error) {
	disposition := "cancelled"
	var resolveReceiptDigest any
	var consumerAttemptID any
	var consumerInvocationID any
	var consumerGeneration any
	if record.ResolveReceipt != nil && record.ResolveRequest != nil && record.ResolveReceipt.Status == "resolved" {
		disposition = "consumed"
		resolveReceiptDigest = record.ResolveReceipt.ReceiptDigest
		consumerAttemptID = record.ResolveRequest.ConsumerAttemptID
		consumerInvocationID = record.ResolveRequest.ConsumerInvocationID
		consumerGeneration = record.ResolveRequest.ConsumerGeneration
	} else {
		resolveReceiptDigest, consumerAttemptID, consumerInvocationID, consumerGeneration = nil, nil, nil, nil
		if !requestedAt.Before(record.SealRequest.ExpiresAt) {
			disposition = "expired"
		}
	}
	if requestedAt.After(record.SealRequest.ExpiresAt.Add(evaluationNativeProviderStateVaultMaximumACKDelay)) {
		return evaluationNativeProviderStateVaultRetireRequest{}, ErrConflict
	}
	base := map[string]any{
		"format": evaluationNativeProviderStateVaultRetireRequestFormat, "version": int64(1),
		"authorityDigest": record.AuthorityDigest, "opaqueProviderStateRef": record.OpaqueProviderStateRef,
		"sealRequestDigest": record.SealRequest.SealRequestDigest, "sealReceiptDigest": record.SealReceipt.ReceiptDigest,
		"resolveReceiptDigest": resolveReceiptDigest, "purpose": record.Purpose,
		"sourceAttemptId": record.AttemptID, "sourceInvocationId": record.InvocationID, "sourceGeneration": record.Generation,
		"consumerAttemptId": consumerAttemptID, "consumerInvocationId": consumerInvocationID,
		"consumerGeneration": consumerGeneration, "disposition": disposition,
		"requestedAt": evaluationNativeProviderStateVaultInstant(requestedAt),
		"expiresAt":   evaluationNativeProviderStateVaultInstant(record.SealRequest.ExpiresAt),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return evaluationNativeProviderStateVaultRetireRequest{}, err
	}
	value := cloneEvaluationObject(base)
	value["retireRequestDigest"] = digest
	source, err := canonicaljson.Bytes(value)
	if err != nil {
		return evaluationNativeProviderStateVaultRetireRequest{}, err
	}
	return decodeEvaluationNativeProviderStateVaultRetireRequest(source)
}

func decodeEvaluationNativeProviderStateVaultKey(source string) ([]byte, error) {
	decoded, err := base64.StdEncoding.Strict().DecodeString(source)
	if err != nil || len(decoded) != 32 || base64.StdEncoding.EncodeToString(decoded) != source {
		clear(decoded)
		return nil, ErrInvalid
	}
	return decoded, nil
}

func isEvaluationNativeProviderStateVaultRetryable(err error) bool {
	return errors.Is(err, context.DeadlineExceeded) || errors.Is(err, context.Canceled) ||
		errors.Is(err, errEvaluationServiceUnavailable)
}
