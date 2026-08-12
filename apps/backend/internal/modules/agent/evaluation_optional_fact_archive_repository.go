package agent

import (
	"bytes"
	"context"
	"fmt"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const (
	evaluationRuntimeFactSourceRegistrationArchiveRecordFormat = "prodivix.agent-evaluation-runtime-fact-source-owner-registration-archive-record"
	evaluationOptionalFactSourceArchiveRecordFormat            = "prodivix.agent-evaluation-optional-capability-fact-source-archive-record"
	evaluationOptionalFactAuthorityArchiveRecordFormat         = "prodivix.agent-evaluation-optional-capability-fact-authority-archive-record"
	evaluationOptionalFactArchiveRecordVersion                 = 1

	maximumEvaluationRuntimeFactSourceRegistrationArchiveRecordBytes = maximumEvaluationRuntimeFactSourceRegistrationRequestBytes +
		2*maximumEvaluationRuntimeFactSourceRegistrationResponseBytes + maximumEvaluationOptionalFactArchiveRecordOverhead
	maximumEvaluationRuntimeFactSourceRegistrationArchiveBytes = int64(maximumEvaluationRuntimeFactSourceRegistrations) *
		maximumEvaluationRuntimeFactSourceRegistrationArchiveRecordBytes
)

type EvaluationRuntimeFactSourceRegistrationArchiveRecord struct {
	RequestDigest             string
	OwnerHealthDigest         string
	RegistrationReceiptDigest string
	RequestBytes              []byte
	OwnerHealthBytes          []byte
	ReceiptBytes              []byte
	RecordDigest              string
	RecordBytes               []byte
}

type EvaluationOptionalFactSourceArchiveRecord struct {
	AttemptID                        string
	TurnIndex                        int64
	SourceSealDigest                 string
	ReceiptBytes                     []byte
	PreEffectIntentBytes             []byte
	EffectSourceReceiptBytes         []byte
	FactBytes                        []byte
	BootstrapSourceRequestBytes      []byte
	BootstrapSourceReceiptBytes      []byte
	NativeSourceReceiptBytes         []byte
	BootstrapFactBytes               []byte
	StateVaultSealRequestBytes       []byte
	StateVaultSealReceiptBytes       []byte
	StateVaultResolveRequestBytes    []byte
	StateVaultResolveReceiptBytes    []byte
	StateVaultRetireRequestBytes     []byte
	StateVaultRetirementReceiptBytes []byte
	StateVaultStatus                 string
	RecordDigest                     string
	RecordBytes                      []byte
}

type EvaluationOptionalFactAuthorityArchiveRecord struct {
	AttemptID                string
	TurnIndex                int64
	SourceSealDigest         string
	AuthorityRequestDigest   string
	StageDigest              string
	DispatchAckDigest        string
	ResultDigest             string
	RequestBytes             []byte
	FactBytes                []byte
	RuntimeFactEnvelopeBytes []byte
	FactAuthorityBytes       []byte
	ResponseBytes            []byte
	RecordDigest             string
	RecordBytes              []byte
}

type EvaluationOptionalFactArchiveFamilyProjection struct {
	RegistrationCount     int64
	RegistrationBytes     int64
	RegistrationSetDigest string
	SourceCount           int64
	SourceBytes           int64
	SourceSetDigest       string
	AuthorityCount        int64
	AuthorityBytes        int64
	AuthoritySetDigest    string
}

func evaluationOptionalFactArchiveObject(source []byte, maximumBytes int, required bool) (map[string]any, error) {
	if len(source) == 0 {
		if required {
			return nil, ErrConflict
		}
		return nil, nil
	}
	value, err := decodeCanonicalEvaluationObject(source, maximumBytes)
	if err != nil {
		return nil, ErrConflict
	}
	return value, nil
}

func evaluationOptionalFactArchiveSelfDigest(value map[string]any, field, expected string) error {
	if value == nil || !evaluationDigestPattern.MatchString(expected) || stringMember(value, field) != expected {
		return ErrConflict
	}
	base := cloneEvaluationObject(value)
	delete(base, field)
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != expected {
		return ErrConflict
	}
	return nil
}

func evaluationOptionalFactArchiveCanonicalRecord(base map[string]any, maximumBytes int) (string, []byte, error) {
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return "", nil, err
	}
	value := cloneEvaluationObject(base)
	value["recordDigest"] = digest
	encoded, err := canonicaljson.Bytes(value)
	if err != nil || len(encoded) == 0 || len(encoded) > maximumBytes {
		return "", nil, conflict("optional fact archive record exceeds its exact byte bound")
	}
	return digest, encoded, nil
}

func validateEvaluationOptionalFactArchiveCanonicalRecord(source []byte, maximumBytes int, expectedDigest string) error {
	value, err := evaluationOptionalFactArchiveObject(source, maximumBytes, true)
	if err != nil || evaluationOptionalFactArchiveSelfDigest(value, "recordDigest", expectedDigest) != nil {
		return ErrConflict
	}
	return nil
}

func evaluationOptionalFactArchiveObservedFact(source []byte) (map[string]any, error) {
	value, err := evaluationOptionalFactArchiveObject(source, maximumEvaluationOptionalFactAuthorityEnvelopeBytes, false)
	if err != nil || value == nil {
		return value, err
	}
	fact, ok := objectMember(value, "value")
	if !ok {
		return nil, ErrConflict
	}
	recomputed, digest, err := evaluationOptionalFactObservedValue(stringMember(value, "factKind"), fact)
	if err != nil || digest != stringMember(value, "factDigest") {
		return nil, ErrConflict
	}
	canonical, err := canonicaljson.Bytes(recomputed)
	if err != nil || !bytes.Equal(canonical, source) {
		return nil, ErrConflict
	}
	return value, nil
}

func evaluationRuntimeFactSourceRegistrationArchiveCanonicalRecord(
	authority EvaluationAuthority,
	repositoryCommit string,
	record *EvaluationRuntimeFactSourceRegistrationArchiveRecord,
) error {
	request, err := decodeEvaluationRuntimeFactSourceRegistrationRequest(record.RequestBytes, authority)
	if err != nil || request.RepositoryCommit != repositoryCommit || request.RequestDigest != record.RequestDigest {
		return ErrConflict
	}
	health, err := evaluationOptionalFactArchiveObject(
		record.OwnerHealthBytes, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes, true,
	)
	if err != nil || !exactEvaluationKeys(health, []string{
		"format", "version", "requestDigest", "sourceAuthorityId", "sourceAuthorityImplementationDigest",
		"sourceKind", "routeBinding", "status", "checkedAt", "expiresAt", "healthDigest",
	}) || evaluationOptionalFactArchiveSelfDigest(health, "healthDigest", record.OwnerHealthDigest) != nil ||
		stringMember(health, "requestDigest") != request.RequestDigest ||
		stringMember(health, "sourceAuthorityId") != request.SourceAuthorityID ||
		stringMember(health, "sourceAuthorityImplementationDigest") != request.SourceAuthorityImplementationDigest ||
		stringMember(health, "sourceKind") != request.SourceKind || stringMember(health, "routeBinding") != request.RouteBinding ||
		stringMember(health, "status") != "ready" {
		return ErrConflict
	}
	receipt, err := evaluationOptionalFactArchiveObject(
		record.ReceiptBytes, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes, true,
	)
	if err != nil || !exactEvaluationKeys(receipt, []string{
		"format", "version", "namespaceId", "repositoryCommit", "requestDigest", "sourceAuthorityKind",
		"sourceKind", "sourceAuthorityId", "sourceAuthorityImplementationDigest", "routeBinding",
		"capabilityProfileId", "capabilityProfileDigest", "capabilityId", "protocolFamily",
		"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
		"registrationAuthorityIssuerId", "ownerHealthDigest", "ownerAdmissionDigest", "stageDigest",
		"dispatchAckDigest", "registeredAt", "expiresAt", "registrationReceiptDigest",
	}) || evaluationOptionalFactArchiveSelfDigest(receipt, "registrationReceiptDigest", record.RegistrationReceiptDigest) != nil ||
		stringMember(receipt, "namespaceId") != authority.NamespaceID ||
		stringMember(receipt, "repositoryCommit") != repositoryCommit ||
		stringMember(receipt, "requestDigest") != request.RequestDigest ||
		stringMember(receipt, "ownerHealthDigest") != record.OwnerHealthDigest {
		return ErrConflict
	}
	base := map[string]any{
		"format": evaluationRuntimeFactSourceRegistrationArchiveRecordFormat, "version": int64(evaluationOptionalFactArchiveRecordVersion),
		"registrationReceiptDigest": record.RegistrationReceiptDigest, "requestDigest": record.RequestDigest,
		"ownerHealthDigest": record.OwnerHealthDigest, "request": request.Value, "ownerHealth": health, "receipt": receipt,
	}
	record.RecordDigest, record.RecordBytes, err = evaluationOptionalFactArchiveCanonicalRecord(
		base, maximumEvaluationRuntimeFactSourceRegistrationArchiveRecordBytes,
	)
	return err
}

func evaluationOptionalFactSourceArchiveCanonicalRecord(record *EvaluationOptionalFactSourceArchiveRecord) error {
	receipt, err := evaluationOptionalFactArchiveObject(
		record.ReceiptBytes, maximumEvaluationOptionalFactAuthorityResponseBytes, true,
	)
	if err != nil || evaluationOptionalFactArchiveSelfDigest(receipt, "sourceSealDigest", record.SourceSealDigest) != nil {
		return ErrConflict
	}
	if stringMember(receipt, "nativeBootstrapSourceRequestDigest") != "" {
		return evaluationOptionalFactNativeSourceArchiveCanonicalRecord(record, receipt)
	}
	return evaluationOptionalFactEffectSourceArchiveCanonicalRecord(record, receipt)
}

func evaluationOptionalFactEffectSourceArchiveCanonicalRecord(
	record *EvaluationOptionalFactSourceArchiveRecord,
	receipt map[string]any,
) error {
	if len(record.BootstrapSourceRequestBytes) != 0 || len(record.BootstrapSourceReceiptBytes) != 0 ||
		len(record.NativeSourceReceiptBytes) != 0 || len(record.BootstrapFactBytes) != 0 ||
		evaluationOptionalFactArchiveHasStateVault(record) {
		return ErrConflict
	}
	turnIndex, turnOK := integerMember(receipt, "turnIndex")
	if !turnOK || stringMember(receipt, "attemptId") != record.AttemptID || turnIndex != record.TurnIndex {
		return ErrConflict
	}
	preEffectIntent, err := evaluationOptionalFactArchiveObject(
		record.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes, true,
	)
	if err != nil || evaluationOptionalFactArchiveSelfDigest(
		preEffectIntent, "intentDigest", stringMember(receipt, "preEffectIntentDigest"),
	) != nil {
		return ErrConflict
	}
	effectSourceReceipt, err := evaluationOptionalFactArchiveObject(
		record.EffectSourceReceiptBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes, true,
	)
	if err != nil || evaluationOptionalFactArchiveSelfDigest(
		effectSourceReceipt, "receiptDigest", stringMember(receipt, "effectSourceReceiptDigest"),
	) != nil || stringMember(effectSourceReceipt, "intentDigest") != stringMember(preEffectIntent, "intentDigest") ||
		stringMember(effectSourceReceipt, "ownerRequestId") != stringMember(preEffectIntent, "ownerRequestId") ||
		stringMember(effectSourceReceipt, "ownerRequestDigest") != stringMember(preEffectIntent, "ownerRequestDigest") ||
		stringMember(effectSourceReceipt, "registrationReceiptDigest") != stringMember(receipt, "registrationReceiptDigest") ||
		stringMember(effectSourceReceipt, "providerRuntimeJournalResultRecordDigest") !=
			stringMember(receipt, "providerRuntimeJournalResultRecordDigest") ||
		stringMember(effectSourceReceipt, "providerRuntimeResultSealReceiptDigest") !=
			stringMember(receipt, "providerRuntimeResultSealReceiptDigest") ||
		stringMember(effectSourceReceipt, "businessResultDigest") != stringMember(receipt, "businessResultDigest") ||
		stringMember(effectSourceReceipt, "stageDigest") != stringMember(receipt, "ownerStageDigest") ||
		stringMember(effectSourceReceipt, "dispatchAckDigest") != stringMember(receipt, "ownerDispatchAckDigest") ||
		stringMember(effectSourceReceipt, "transportReceiptDigest") != stringMember(receipt, "transportReceiptDigest") ||
		stringMember(effectSourceReceipt, "resultSpoolReceiptDigest") != stringMember(receipt, "resultSpoolReceiptDigest") ||
		stringMember(effectSourceReceipt, "normalizedEventSetDigest") != stringMember(receipt, "normalizedEventSetDigest") {
		return ErrConflict
	}
	fact, err := evaluationOptionalFactArchiveObservedFact(record.FactBytes)
	if err != nil {
		return err
	}
	outcome := stringMember(receipt, "outcome")
	receiptFact, receiptHasFact := objectMember(receipt, "fact")
	if (outcome == "observed") != (fact != nil) || (fact != nil) != receiptHasFact ||
		!oneOfString(outcome, "observed", "unavailable", "failed") {
		return ErrConflict
	}
	if fact != nil {
		receiptFactBytes, receiptFactErr := canonicaljson.Bytes(receiptFact)
		if receiptFactErr != nil || !bytes.Equal(receiptFactBytes, record.FactBytes) {
			return ErrConflict
		}
		if stringMember(effectSourceReceipt, "sourceFactKind") != stringMember(fact, "factKind") ||
			stringMember(effectSourceReceipt, "sourceFactDigest") != stringMember(fact, "factDigest") ||
			stringMember(receipt, "effectSourceFactDigest") != stringMember(fact, "factDigest") {
			return ErrConflict
		}
	} else if effectSourceReceipt["sourceFactKind"] != nil || effectSourceReceipt["sourceFactDigest"] != nil ||
		receipt["effectSourceFactDigest"] != nil {
		return ErrConflict
	}
	base := map[string]any{
		"format": evaluationOptionalFactSourceArchiveRecordFormat, "version": int64(evaluationOptionalFactArchiveRecordVersion),
		"attemptId": record.AttemptID, "turnIndex": record.TurnIndex, "sourceSealDigest": record.SourceSealDigest,
		"sourceReceipt": receipt, "preEffectIntent": preEffectIntent,
		"effectSourceReceipt": effectSourceReceipt, "effectSourceFact": fact,
	}
	record.RecordDigest, record.RecordBytes, err = evaluationOptionalFactArchiveCanonicalRecord(
		base, maximumEvaluationOptionalFactSourceArchiveRecordBytes,
	)
	return err
}

type evaluationOptionalFactNativeStateVaultArchiveValues struct {
	sealRequest       any
	sealReceipt       any
	resolveRequest    any
	resolveReceipt    any
	retireRequest     any
	retirementReceipt any
}

func evaluationOptionalFactArchiveHasStateVault(record *EvaluationOptionalFactSourceArchiveRecord) bool {
	return record.StateVaultStatus != "" || len(record.StateVaultSealRequestBytes) != 0 ||
		len(record.StateVaultSealReceiptBytes) != 0 || len(record.StateVaultResolveRequestBytes) != 0 ||
		len(record.StateVaultResolveReceiptBytes) != 0 || len(record.StateVaultRetireRequestBytes) != 0 ||
		len(record.StateVaultRetirementReceiptBytes) != 0
}

func evaluationOptionalFactNativeStateVaultArchive(
	record *EvaluationOptionalFactSourceArchiveRecord,
	nativeReceipt map[string]any,
	outerReceipt map[string]any,
) (evaluationOptionalFactNativeStateVaultArchiveValues, error) {
	empty := evaluationOptionalFactNativeStateVaultArchiveValues{}
	if nativeReceipt == nil {
		if evaluationOptionalFactArchiveHasStateVault(record) {
			return empty, ErrConflict
		}
		return empty, nil
	}
	source, ok := objectMember(nativeReceipt, "source")
	if !ok {
		return empty, ErrConflict
	}
	sourceKind := stringMember(source, "sourceKind")
	if sourceKind == "provider-cache-usage" {
		if evaluationOptionalFactArchiveHasStateVault(record) {
			return empty, ErrConflict
		}
		return empty, nil
	}
	if !oneOfString(sourceKind, "provider-job-active-status", "provider-job-terminal-status", "provider-stored-continuation") ||
		record.StateVaultStatus != "retired" || len(record.StateVaultSealRequestBytes) == 0 ||
		len(record.StateVaultSealReceiptBytes) == 0 || len(record.StateVaultRetireRequestBytes) == 0 ||
		len(record.StateVaultRetirementReceiptBytes) == 0 ||
		(len(record.StateVaultResolveRequestBytes) == 0) != (len(record.StateVaultResolveReceiptBytes) == 0) {
		return empty, conflict("native state-vault archive lifecycle is incomplete")
	}
	sealRequest, err := decodeEvaluationNativeProviderStateVaultSealRequest(record.StateVaultSealRequestBytes)
	if err != nil {
		return empty, err
	}
	sealReceipt, err := decodeEvaluationNativeProviderStateVaultSealReceipt(record.StateVaultSealReceiptBytes, sealRequest)
	if err != nil || sealReceipt.Status != "sealed" {
		return empty, conflict("native state-vault archive seal binding drifted")
	}
	expectedPurpose := "background-job-state"
	if sourceKind == "provider-stored-continuation" {
		expectedPurpose = "reasoning-continuation-state"
	}
	generation, generationOK := integerMember(source, "generation")
	if !generationOK || sealRequest.AuthorityDigest != stringMember(source, "stateVaultAuthorityDigest") ||
		sealRequest.Purpose != expectedPurpose || sealRequest.AttemptID != record.AttemptID ||
		sealRequest.InvocationID != stringMember(outerReceipt, "invocationId") ||
		sealRequest.RequestDigest != stringMember(outerReceipt, "providerRequestDigest") ||
		sealRequest.ResponseDigest != stringMember(outerReceipt, "responseDigest") ||
		sealRequest.ProtocolFamily != stringMember(outerReceipt, "protocolFamily") ||
		sealRequest.ProviderConfigurationID != stringMember(outerReceipt, "providerConfigurationId") ||
		sealRequest.ModelLineageDigest != stringMember(outerReceipt, "modelLineageDigest") ||
		sealRequest.AdapterDigest != stringMember(outerReceipt, "adapterDigest") ||
		sealRequest.CapabilityProfileDigest != stringMember(outerReceipt, "capabilityProfileDigest") ||
		sealRequest.ProviderStateReferenceDigest != stringMember(source, "providerStateReferenceDigest") ||
		sealRequest.Generation != generation || sealRequest.TaskID != stringMember(source, "taskId") ||
		sealRequest.RunID != stringMember(source, "runId") ||
		sealRequest.SealRequestDigest != stringMember(source, "stateVaultSealRequestDigest") ||
		sealReceipt.AuthorityDigest != stringMember(source, "stateVaultAuthorityDigest") ||
		sealReceipt.OpaqueProviderStateRef != stringMember(source, "opaqueProviderStateRef") ||
		sealReceipt.ReceiptDigest != stringMember(source, "stateVaultSealReceiptDigest") {
		return empty, conflict("native state-vault archive seal source projection drifted")
	}
	vaultRecord := EvaluationNativeProviderStateVaultRecord{
		AuthorityDigest: sealRequest.AuthorityDigest, Purpose: sealRequest.Purpose,
		AttemptID: sealRequest.AttemptID, InvocationID: sealRequest.InvocationID, Generation: sealRequest.Generation,
		TaskID: sealRequest.TaskID, RunID: sealRequest.RunID,
		ProviderStateReferenceKind:   sealRequest.ProviderStateReferenceKind,
		ProviderStateReferenceDigest: sealRequest.ProviderStateReferenceDigest,
		OpaqueProviderStateRef:       sealReceipt.OpaqueProviderStateRef, SealRequest: sealRequest, SealReceipt: sealReceipt,
	}
	values := evaluationOptionalFactNativeStateVaultArchiveValues{
		sealRequest: sealRequest.Value, sealReceipt: sealReceipt.Value,
	}
	if len(record.StateVaultResolveRequestBytes) != 0 {
		resolveRequest, err := decodeEvaluationNativeProviderStateVaultResolveRequest(record.StateVaultResolveRequestBytes)
		if err != nil || matchEvaluationNativeProviderStateVaultResolveRequest(resolveRequest, vaultRecord) != nil {
			return empty, conflict("native state-vault archive resolve request drifted")
		}
		resolveReceipt, err := decodeEvaluationNativeProviderStateVaultResolveReceipt(
			record.StateVaultResolveReceiptBytes, resolveRequest,
		)
		if err != nil {
			return empty, err
		}
		vaultRecord.ResolveRequest, vaultRecord.ResolveReceipt = &resolveRequest, &resolveReceipt
		values.resolveRequest, values.resolveReceipt = resolveRequest.Value, resolveReceipt.Value
	}
	retireRequest, err := decodeEvaluationNativeProviderStateVaultRetireRequest(record.StateVaultRetireRequestBytes)
	if err != nil || matchEvaluationNativeProviderStateVaultRetireRequest(retireRequest, vaultRecord) != nil {
		return empty, conflict("native state-vault archive retire request drifted")
	}
	retirementReceipt, err := decodeEvaluationNativeProviderStateVaultRetirementReceipt(
		record.StateVaultRetirementReceiptBytes, retireRequest, sealReceipt,
	)
	if err != nil {
		return empty, err
	}
	values.retireRequest, values.retirementReceipt = retireRequest.Value, retirementReceipt.Value
	return values, nil
}

func evaluationOptionalFactNativeSourceArchiveCanonicalRecord(
	record *EvaluationOptionalFactSourceArchiveRecord,
	receipt map[string]any,
) error {
	if len(record.PreEffectIntentBytes) != 0 || len(record.EffectSourceReceiptBytes) != 0 ||
		!exactEvaluationKeys(receipt, []string{
			"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
			"targetId", "targetDigest", "capabilityProfileId", "capabilityProfileDigest", "capabilityDescriptorDigest",
			"capabilityId", "supportExpectation", "turnIndex", "invocationId", "protocolFamily",
			"providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest", "providerRequestDigest",
			"responseDigest", "dispatchIntentDigest", "transportReceiptDigest", "resultSpoolReceiptDigest",
			"normalizedEventSetDigest", "targetAuthorityDigest", "sourceAuthorityId",
			"sourceAuthorityImplementationDigest", "sourceAuthorityRouteBinding", "registrationAuthorityIssuerId",
			"registrationReceiptDigest", "sourceKind", "sourceDigest", "sourceRequestDigest", "ownerStageDigest",
			"ownerDispatchAckDigest", "nativeBootstrapSourceRequestDigest", "nativeBootstrapSourceReceiptDigest",
			"nativeProviderSourceReceiptDigest", "nativeProviderSourceDigest", "nativeProviderSourceFactDigest",
			"outcome", "observedAt", "sealedAt", "sourceSealDigest",
		}, "fact") || stringMember(receipt, "format") != evaluationOptionalFactSourceReceiptFormat ||
		stringMember(receipt, "sourceKind") != "sealed-provider-response-metadata" {
		return ErrConflict
	}
	version, versionOK := integerMember(receipt, "version")
	turnIndex, turnOK := integerMember(receipt, "turnIndex")
	observedAt, observedErr := parseEvaluationServiceInstant(stringMember(receipt, "observedAt"))
	outerSealedAt, sealedErr := parseEvaluationServiceInstant(stringMember(receipt, "sealedAt"))
	if !versionOK || version != 1 || !turnOK || turnIndex != record.TurnIndex || record.TurnIndex < 0 ||
		record.TurnIndex >= maximumEvaluationOptionalFactAuthorityTurns ||
		stringMember(receipt, "attemptId") != record.AttemptID || observedErr != nil || sealedErr != nil ||
		outerSealedAt.Before(observedAt) {
		return ErrConflict
	}
	bootstrapRequest, err := evaluationOptionalFactArchiveObject(
		record.BootstrapSourceRequestBytes, maximumEvaluationNativeOptionalBootstrapBytes, true,
	)
	if err != nil || !exactEvaluationKeys(bootstrapRequest, []string{
		"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId", "descriptorDigest",
		"turnIndex", "invocationId", "providerRequestDigest", "providerResponseDigest", "protocolFamily",
		"providerConfigurationId", "modelLineageDigest", "adapterDigest", "dispatchIntentDigest",
		"transportReceiptDigest", "resultSpoolReceiptDigest", "normalizedEventSetDigest", "transportCompletedAt",
		"runtimeFactSourceAuthority", "probeProgramDigest", "outcome", "nativeSourceReceipt",
		"nativeSourceReceiptDigest", "fact", "observedAt", "requestDigest",
	}) || stringMember(bootstrapRequest, "format") != evaluationNativeOptionalBootstrapSourceRequestFormat ||
		evaluationOptionalFactArchiveSelfDigest(
			bootstrapRequest, "requestDigest", stringMember(receipt, "nativeBootstrapSourceRequestDigest"),
		) != nil {
		return ErrConflict
	}
	transportCompletedAt, transportTimeErr := parseEvaluationServiceInstant(
		stringMember(bootstrapRequest, "transportCompletedAt"),
	)
	bootstrapObservedAt, bootstrapObservedErr := parseEvaluationServiceInstant(
		stringMember(bootstrapRequest, "observedAt"),
	)
	if transportTimeErr != nil || bootstrapObservedErr != nil || transportCompletedAt.After(bootstrapObservedAt) ||
		bootstrapObservedAt.Sub(transportCompletedAt) > maximumEvaluationNativeOptionalBootstrapDelay ||
		!bootstrapObservedAt.Equal(observedAt) {
		return ErrConflict
	}
	bootstrapReceipt, err := evaluationOptionalFactArchiveObject(
		record.BootstrapSourceReceiptBytes, maximumEvaluationNativeOptionalBootstrapBytes, true,
	)
	if err != nil || !exactEvaluationKeys(bootstrapReceipt, []string{
		"format", "version", "sourceRequest", "sourceRequestDigest", "sourceOwnerStageDigest",
		"sourceOwnerDispatchAckDigest", "sealedAt", "receiptDigest",
	}) || stringMember(bootstrapReceipt, "format") != evaluationNativeOptionalBootstrapSourceReceiptFormat ||
		evaluationOptionalFactArchiveSelfDigest(
			bootstrapReceipt, "receiptDigest", stringMember(receipt, "nativeBootstrapSourceReceiptDigest"),
		) != nil || stringMember(bootstrapReceipt, "sourceRequestDigest") != stringMember(bootstrapRequest, "requestDigest") {
		return ErrConflict
	}
	nestedRequest, nestedOK := objectMember(bootstrapReceipt, "sourceRequest")
	if !nestedOK || !sameEvaluationCanonicalValue(nestedRequest, bootstrapRequest) {
		return ErrConflict
	}
	target := EvaluationOptionalFactTargetAuthority{
		TargetID: stringMember(receipt, "targetId"), TargetDigest: stringMember(receipt, "targetDigest"),
		CapabilityProfileID:        stringMember(receipt, "capabilityProfileId"),
		CapabilityProfileDigest:    stringMember(receipt, "capabilityProfileDigest"),
		CapabilityDescriptorDigest: stringMember(receipt, "capabilityDescriptorDigest"),
		CapabilityID:               stringMember(receipt, "capabilityId"), SupportExpectation: stringMember(receipt, "supportExpectation"),
		ProtocolFamily:          stringMember(receipt, "protocolFamily"),
		ProviderConfigurationID: stringMember(receipt, "providerConfigurationId"), ModelID: stringMember(receipt, "modelId"),
		ModelLineageDigest: stringMember(receipt, "modelLineageDigest"), AdapterDigest: stringMember(receipt, "adapterDigest"),
		SourceKind: stringMember(receipt, "sourceKind"), SourceAuthorityID: stringMember(receipt, "sourceAuthorityId"),
		SourceAuthorityImplementationDigest: stringMember(receipt, "sourceAuthorityImplementationDigest"),
		SourceAuthorityRouteBinding:         stringMember(receipt, "sourceAuthorityRouteBinding"),
		RegistrationAuthorityIssuerID:       stringMember(receipt, "registrationAuthorityIssuerId"),
		RegistrationReceiptDigest:           stringMember(receipt, "registrationReceiptDigest"),
		TargetAuthorityDigest:               stringMember(receipt, "targetAuthorityDigest"),
	}
	runtimeAuthority, runtimeOK := objectMember(bootstrapRequest, "runtimeFactSourceAuthority")
	program, programErr := expectedEvaluationCapabilityProbeProgram(target.CapabilityProfileID, target.CapabilityProfileDigest)
	bootstrapSealedAt, bootstrapSealedErr := parseEvaluationServiceInstant(stringMember(bootstrapReceipt, "sealedAt"))
	if !runtimeOK || !evaluationOptionalFactRuntimeAuthorityMatches(runtimeAuthority, target) || programErr != nil ||
		stringMember(bootstrapRequest, "probeProgramDigest") != program.ProgramDigest || bootstrapSealedErr != nil ||
		bootstrapSealedAt.Before(bootstrapObservedAt) ||
		bootstrapSealedAt.Sub(bootstrapObservedAt) > maximumEvaluationNativeOptionalBootstrapDelay ||
		outerSealedAt.Before(bootstrapSealedAt) || stringMember(bootstrapReceipt, "sourceOwnerStageDigest") != stringMember(receipt, "ownerStageDigest") ||
		stringMember(bootstrapReceipt, "sourceOwnerDispatchAckDigest") != stringMember(receipt, "ownerDispatchAckDigest") {
		return ErrConflict
	}
	for _, binding := range []struct{ outer, bootstrap string }{
		{"namespaceId", "namespaceId"}, {"planDigest", "planDigest"}, {"repositoryCommit", "repositoryCommit"},
		{"attemptId", "attemptId"}, {"descriptorDigest", "descriptorDigest"}, {"invocationId", "invocationId"},
		{"providerRequestDigest", "providerRequestDigest"}, {"responseDigest", "providerResponseDigest"},
		{"protocolFamily", "protocolFamily"}, {"providerConfigurationId", "providerConfigurationId"},
		{"modelLineageDigest", "modelLineageDigest"}, {"adapterDigest", "adapterDigest"},
		{"dispatchIntentDigest", "dispatchIntentDigest"}, {"transportReceiptDigest", "transportReceiptDigest"},
		{"resultSpoolReceiptDigest", "resultSpoolReceiptDigest"}, {"normalizedEventSetDigest", "normalizedEventSetDigest"},
		{"outcome", "outcome"}, {"observedAt", "observedAt"},
	} {
		if stringMember(receipt, binding.outer) != stringMember(bootstrapRequest, binding.bootstrap) {
			return ErrConflict
		}
	}
	bootstrapTurn, bootstrapTurnOK := integerMember(bootstrapRequest, "turnIndex")
	if !bootstrapTurnOK || bootstrapTurn != record.TurnIndex ||
		stringMember(receipt, "nativeBootstrapSourceRequestDigest") != stringMember(bootstrapRequest, "requestDigest") ||
		stringMember(receipt, "nativeBootstrapSourceReceiptDigest") != stringMember(bootstrapReceipt, "receiptDigest") {
		return ErrConflict
	}
	stageDigest, err := evaluationNativeOptionalBootstrapSourceOwnerStageDigest(
		stringMember(bootstrapRequest, "requestDigest"), target,
	)
	if err != nil || stageDigest != stringMember(bootstrapReceipt, "sourceOwnerStageDigest") {
		return ErrConflict
	}
	outcome := stringMember(receipt, "outcome")
	if !oneOfString(outcome, "observed", "unavailable", "failed") {
		return ErrConflict
	}
	var nativeReceipt map[string]any
	var bootstrapFact map[string]any
	if outcome == "observed" {
		var nativeErr, factErr error
		nativeReceipt, nativeErr = evaluationOptionalFactArchiveObject(
			record.NativeSourceReceiptBytes, maximumEvaluationNativeOptionalSourceBytes, true,
		)
		bootstrapFact, factErr = evaluationOptionalFactArchiveObservedFact(record.BootstrapFactBytes)
		outerFact, outerFactOK := objectMember(receipt, "fact")
		requestNative, requestNativeOK := objectMember(bootstrapRequest, "nativeSourceReceipt")
		requestFact, requestFactOK := objectMember(bootstrapRequest, "fact")
		if nativeErr != nil || factErr != nil || !outerFactOK || !requestNativeOK || !requestFactOK || bootstrapFact == nil ||
			!sameEvaluationCanonicalValue(nativeReceipt, requestNative) ||
			!sameEvaluationCanonicalValue(bootstrapFact, requestFact) ||
			!sameEvaluationCanonicalValue(bootstrapFact, outerFact) ||
			!bytes.Equal(record.BootstrapFactBytes, record.FactBytes) {
			return ErrConflict
		}
		decodedNative, decodeErr := decodeEvaluationNativeProviderOptionalSourceReceipt(
			nativeReceipt, program, evaluationNativeOptionalReceiptBinding{
				ProtocolFamily: target.ProtocolFamily, CapabilityProfileID: target.CapabilityProfileID,
				CapabilityProfileDigest: target.CapabilityProfileDigest,
				InvocationID:            stringMember(receipt, "invocationId"), RequestDigest: stringMember(receipt, "providerRequestDigest"),
				ResponseDigest: stringMember(receipt, "responseDigest"), ProviderConfigurationID: target.ProviderConfigurationID,
				ModelLineageDigest: target.ModelLineageDigest, AdapterDigest: target.AdapterDigest, ObservedAt: observedAt,
			},
		)
		if decodeErr != nil || decodedNative.ReceiptDigest != stringMember(receipt, "nativeProviderSourceReceiptDigest") ||
			decodedNative.SourceDigest != stringMember(receipt, "nativeProviderSourceDigest") ||
			decodedNative.FactDigest != stringMember(receipt, "nativeProviderSourceFactDigest") ||
			stringMember(bootstrapFact, "factDigest") != decodedNative.FactDigest ||
			stringMember(bootstrapRequest, "nativeSourceReceiptDigest") != decodedNative.ReceiptDigest {
			return ErrConflict
		}
	} else if len(record.NativeSourceReceiptBytes) != 0 || len(record.BootstrapFactBytes) != 0 || len(record.FactBytes) != 0 ||
		bootstrapRequest["nativeSourceReceipt"] != nil || bootstrapRequest["nativeSourceReceiptDigest"] != nil ||
		bootstrapRequest["fact"] != nil || receipt["nativeProviderSourceReceiptDigest"] != nil ||
		receipt["nativeProviderSourceDigest"] != nil || receipt["nativeProviderSourceFactDigest"] != nil ||
		receipt["fact"] != nil {
		return ErrConflict
	}
	stateVault, err := evaluationOptionalFactNativeStateVaultArchive(record, nativeReceipt, receipt)
	if err != nil {
		return err
	}
	factDigest := ""
	nativeReceiptDigest := ""
	if nativeReceipt != nil {
		nativeReceiptDigest = stringMember(nativeReceipt, "receiptDigest")
		factDigest = stringMember(bootstrapFact, "factDigest")
	}
	ackDigest, err := evaluationNativeOptionalBootstrapSourceOwnerAckDigest(
		stringMember(bootstrapRequest, "requestDigest"), stageDigest, outcome, nativeReceiptDigest, factDigest, bootstrapSealedAt,
	)
	if err != nil || ackDigest != stringMember(bootstrapReceipt, "sourceOwnerDispatchAckDigest") {
		return ErrConflict
	}
	sourceBase := map[string]any{
		"kind": stringMember(receipt, "sourceKind"), "planDigest": stringMember(receipt, "planDigest"),
		"repositoryCommit": stringMember(receipt, "repositoryCommit"), "attemptId": record.AttemptID,
		"descriptorDigest": stringMember(receipt, "descriptorDigest"), "turnIndex": receipt["turnIndex"],
		"invocationId": stringMember(receipt, "invocationId"), "providerRequestDigest": stringMember(receipt, "providerRequestDigest"),
		"responseDigest": stringMember(receipt, "responseDigest"), "dispatchIntentDigest": stringMember(receipt, "dispatchIntentDigest"),
		"transportReceiptDigest":             stringMember(receipt, "transportReceiptDigest"),
		"resultSpoolReceiptDigest":           stringMember(receipt, "resultSpoolReceiptDigest"),
		"normalizedEventSetDigest":           stringMember(receipt, "normalizedEventSetDigest"),
		"nativeBootstrapSourceRequestDigest": stringMember(receipt, "nativeBootstrapSourceRequestDigest"),
		"nativeBootstrapSourceReceiptDigest": stringMember(receipt, "nativeBootstrapSourceReceiptDigest"),
		"ownerStageDigest":                   stringMember(receipt, "ownerStageDigest"),
		"ownerDispatchAckDigest":             stringMember(receipt, "ownerDispatchAckDigest"),
		"nativeProviderSourceReceiptDigest":  receipt["nativeProviderSourceReceiptDigest"],
		"nativeProviderSourceDigest":         receipt["nativeProviderSourceDigest"],
		"nativeProviderSourceFactDigest":     receipt["nativeProviderSourceFactDigest"], "outcome": outcome,
	}
	sourceDigest, err := canonicaljson.Digest(sourceBase)
	if err != nil || sourceDigest != stringMember(receipt, "sourceDigest") {
		return ErrConflict
	}
	base := map[string]any{
		"format": evaluationOptionalFactSourceArchiveRecordFormat, "version": int64(evaluationOptionalFactArchiveRecordVersion),
		"attemptId": record.AttemptID, "turnIndex": record.TurnIndex, "sourceSealDigest": record.SourceSealDigest,
		"sourceReceipt": receipt, "bootstrapSourceRequest": bootstrapRequest,
		"bootstrapSourceReceipt": bootstrapReceipt, "nativeSourceReceipt": nativeReceipt, "bootstrapFact": bootstrapFact,
		"stateVaultSealRequest": stateVault.sealRequest, "stateVaultSealReceipt": stateVault.sealReceipt,
		"stateVaultResolveRequest": stateVault.resolveRequest, "stateVaultResolveReceipt": stateVault.resolveReceipt,
		"stateVaultRetireRequest":     stateVault.retireRequest,
		"stateVaultRetirementReceipt": stateVault.retirementReceipt,
	}
	record.RecordDigest, record.RecordBytes, err = evaluationOptionalFactArchiveCanonicalRecord(
		base, maximumEvaluationOptionalFactSourceArchiveRecordBytes,
	)
	return err
}

func evaluationOptionalFactAuthorityArchiveCanonicalRecord(record *EvaluationOptionalFactAuthorityArchiveRecord) error {
	stageRequest, err := decodeEvaluationOptionalFactAuthorityStageRequest(record.RequestBytes)
	if err != nil || stageRequest.AuthorityRequestDigest != record.AuthorityRequestDigest ||
		stageRequest.AttemptID != record.AttemptID || stageRequest.TurnIndex != record.TurnIndex ||
		stageRequest.SourceSealDigest != record.SourceSealDigest {
		return ErrConflict
	}
	stageRequestValue, err := evaluationOptionalFactArchiveObject(
		record.RequestBytes, maximumEvaluationOptionalFactAuthorityRequestBytes, true,
	)
	if err != nil {
		return err
	}
	fact, err := evaluationOptionalFactArchiveObservedFact(record.FactBytes)
	if err != nil {
		return err
	}
	envelope, err := evaluationOptionalFactArchiveObject(
		record.RuntimeFactEnvelopeBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes, false,
	)
	if err != nil {
		return err
	}
	factAuthority, err := evaluationOptionalFactArchiveObject(
		record.FactAuthorityBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes, false,
	)
	if err != nil {
		return err
	}
	response, err := evaluationOptionalFactArchiveObject(
		record.ResponseBytes, maximumEvaluationOptionalFactAuthorityResponseBytes, true,
	)
	if err != nil || evaluationOptionalFactArchiveSelfDigest(response, "resultDigest", record.ResultDigest) != nil ||
		stringMember(response, "authorityRequestDigest") != record.AuthorityRequestDigest ||
		stringMember(response, "stageDigest") != record.StageDigest ||
		stringMember(response, "dispatchAckDigest") != record.DispatchAckDigest {
		return ErrConflict
	}
	outcome := stringMember(response, "outcome")
	observed := outcome == "observed"
	if !oneOfString(outcome, "observed", "unavailable", "failed") ||
		observed != (fact != nil && envelope != nil && factAuthority != nil) ||
		(!observed && (fact != nil || envelope != nil || factAuthority != nil)) {
		return ErrConflict
	}
	if observed {
		if evaluationOptionalFactArchiveSelfDigest(envelope, "envelopeDigest", stringMember(envelope, "envelopeDigest")) != nil ||
			evaluationOptionalFactArchiveSelfDigest(factAuthority, "authorityDigest", stringMember(factAuthority, "authorityDigest")) != nil ||
			stringMember(factAuthority, "factKind") != stringMember(fact, "factKind") ||
			stringMember(factAuthority, "factDigest") != stringMember(fact, "factDigest") ||
			stringMember(factAuthority, "runtimeFactEnvelopeDigest") != stringMember(envelope, "envelopeDigest") {
			return ErrConflict
		}
		runtimeEnvelopes, envelopesOK := response["runtimeFactEnvelopes"].([]any)
		factAuthorities, authoritiesOK := response["factAuthorities"].([]any)
		if !envelopesOK || !authoritiesOK || len(runtimeEnvelopes) != 1 || len(factAuthorities) != 1 {
			return ErrConflict
		}
		nestedEnvelope, nestedEnvelopeErr := canonicaljson.Bytes(runtimeEnvelopes[0])
		nestedAuthority, nestedAuthorityErr := canonicaljson.Bytes(factAuthorities[0])
		if nestedEnvelopeErr != nil || nestedAuthorityErr != nil ||
			!bytes.Equal(nestedEnvelope, record.RuntimeFactEnvelopeBytes) ||
			!bytes.Equal(nestedAuthority, record.FactAuthorityBytes) {
			return ErrConflict
		}
	} else {
		runtimeEnvelopes, envelopesOK := response["runtimeFactEnvelopes"].([]any)
		factAuthorities, authoritiesOK := response["factAuthorities"].([]any)
		if !envelopesOK || !authoritiesOK || len(runtimeEnvelopes) != 0 || len(factAuthorities) != 0 {
			return ErrConflict
		}
	}
	base := map[string]any{
		"format": evaluationOptionalFactAuthorityArchiveRecordFormat, "version": int64(evaluationOptionalFactArchiveRecordVersion),
		"attemptId": record.AttemptID, "turnIndex": record.TurnIndex, "sourceSealDigest": record.SourceSealDigest,
		"authorityRequestDigest": record.AuthorityRequestDigest, "stageDigest": record.StageDigest,
		"dispatchAckDigest": record.DispatchAckDigest, "resultDigest": record.ResultDigest,
		"stageRequest": stageRequestValue, "fact": fact, "runtimeFactEnvelope": envelope,
		"factAuthority": factAuthority, "sealedResponse": response,
	}
	record.RecordDigest, record.RecordBytes, err = evaluationOptionalFactArchiveCanonicalRecord(
		base, maximumEvaluationOptionalFactAuthorityArchiveRecordBytes,
	)
	return err
}

func evaluationRuntimeFactSourceRegistrationDenominator(plan evaluationPlanFact) (int64, error) {
	rawTargets, ok := plan.Value["capabilityQualificationTargets"].([]any)
	if !ok {
		return 0, ErrInvalid
	}
	var count int64
	for _, rawTarget := range rawTargets {
		target, ok := rawTarget.(map[string]any)
		if !ok {
			return 0, ErrInvalid
		}
		optionalAuthority, optional := objectMember(target, "optionalCapabilitySupportAuthority")
		if !optional {
			continue
		}
		if _, exists := optionalAuthority["runtimeFactSourceAuthority"]; exists {
			capabilityID := stringMember(optionalAuthority, "capabilityId")
			if evaluationOptionalFactKind(capabilityID) == "" || capabilityID == "provider.parallel-tool" {
				return 0, ErrConflict
			}
			count++
		}
	}
	if count > maximumEvaluationRuntimeFactSourceRegistrations {
		return 0, conflict("runtime fact source registration denominator exceeds the frozen G4 bound")
	}
	return count, nil
}

func evaluationRuntimeFactSourceRegistrationReceiptDigests(plan evaluationPlanFact) (map[string]struct{}, error) {
	rawTargets, ok := plan.Value["capabilityQualificationTargets"].([]any)
	if !ok {
		return nil, ErrInvalid
	}
	digests := make(map[string]struct{}, maximumEvaluationRuntimeFactSourceRegistrations)
	for _, rawTarget := range rawTargets {
		target, targetOK := rawTarget.(map[string]any)
		if !targetOK {
			return nil, ErrInvalid
		}
		optional, optionalOK := objectMember(target, "optionalCapabilitySupportAuthority")
		if !optionalOK {
			continue
		}
		runtime, runtimeOK := objectMember(optional, "runtimeFactSourceAuthority")
		if !runtimeOK {
			continue
		}
		digest := stringMember(runtime, "registrationReceiptDigest")
		if !evaluationDigestPattern.MatchString(digest) {
			return nil, ErrConflict
		}
		if _, duplicate := digests[digest]; duplicate {
			return nil, conflict("runtime fact source registration is duplicated in the frozen plan")
		}
		digests[digest] = struct{}{}
	}
	if len(digests) > maximumEvaluationRuntimeFactSourceRegistrations {
		return nil, conflict("runtime fact source registration archive exceeds its exact bound")
	}
	return digests, nil
}

func queryEvaluationRuntimeFactSourceRegistrationArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
) ([]EvaluationRuntimeFactSourceRegistrationArchiveRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	repositoryCommit := plan.RepositoryCommit
	if !evaluationRepositoryCommitPattern.MatchString(repositoryCommit) {
		return nil, ErrInvalid
	}
	referenced, err := evaluationRuntimeFactSourceRegistrationReceiptDigests(plan)
	if err != nil {
		return nil, err
	}
	rows, err := queryer.QueryContext(ctx, `SELECT state,request_digest,owner_health_digest,
		registration_receipt_digest,request_bytes,owner_health_bytes,receipt_bytes
	FROM agent_evaluation_runtime_fact_source_owner_registrations
	WHERE namespace_id=$1 AND repository_commit=$2 AND v46_eligible
	ORDER BY registration_receipt_digest`, authority.NamespaceID, repositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationRuntimeFactSourceRegistrationArchiveRecord, 0, maximumEvaluationRuntimeFactSourceRegistrations)
	for rows.Next() {
		var state string
		var record EvaluationRuntimeFactSourceRegistrationArchiveRecord
		if err := rows.Scan(&state, &record.RequestDigest, &record.OwnerHealthDigest,
			&record.RegistrationReceiptDigest, &record.RequestBytes, &record.OwnerHealthBytes, &record.ReceiptBytes); err != nil {
			return nil, err
		}
		if _, selected := referenced[record.RegistrationReceiptDigest]; !selected {
			continue
		}
		if state != "sealed" || !evaluationDigestPattern.MatchString(record.RequestDigest) ||
			!evaluationDigestPattern.MatchString(record.OwnerHealthDigest) ||
			!evaluationDigestPattern.MatchString(record.RegistrationReceiptDigest) ||
			len(record.RequestBytes) == 0 || len(record.OwnerHealthBytes) == 0 || len(record.ReceiptBytes) == 0 {
			return nil, ErrConflict
		}
		if err := evaluationRuntimeFactSourceRegistrationArchiveCanonicalRecord(
			authority, repositoryCommit, &record,
		); err != nil {
			return nil, err
		}
		records = append(records, record)
		if len(records) > maximumEvaluationRuntimeFactSourceRegistrations {
			return nil, conflict("runtime fact source registration archive exceeds its exact bound")
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	if len(records) != len(referenced) {
		return nil, conflict("runtime fact source registration archive is incomplete")
	}
	sort.Slice(records, func(left, right int) bool {
		return records[left].RegistrationReceiptDigest < records[right].RegistrationReceiptDigest
	})
	return records, nil
}

func (repository *Repository) ListEvaluationRuntimeFactSourceRegistrationArchiveRecords(
	ctx context.Context,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
) ([]EvaluationRuntimeFactSourceRegistrationArchiveRecord, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	return queryEvaluationRuntimeFactSourceRegistrationArchiveRecords(ctx, repository.db, authority, plan)
}

func queryEvaluationOptionalFactSourceArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationOptionalFactSourceArchiveRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return nil, err
	}
	rows, err := queryer.QueryContext(ctx, `SELECT source.attempt_id,source.turn_index,source.source_seal_digest,
		source.source_receipt_bytes,source.source_pre_effect_intent_bytes,source.source_effect_receipt_bytes,
		source.fact_bytes,bootstrap.source_request_bytes,bootstrap.source_receipt_bytes,
		bootstrap.native_provider_source_receipt_bytes,bootstrap.fact_bytes,
		COALESCE(vault.status,''),vault.seal_request_bytes,vault.seal_receipt_bytes,
		vault.resolve_request_bytes,vault.resolve_receipt_bytes,vault.retire_request_bytes,vault.retirement_receipt_bytes
	FROM agent_evaluation_optional_capability_fact_sources AS source
	LEFT JOIN agent_evaluation_native_optional_capability_bootstrap_sources AS bootstrap
		ON bootstrap.namespace_id=source.namespace_id AND bootstrap.plan_digest=source.plan_digest
		AND bootstrap.repository_commit=source.repository_commit AND bootstrap.attempt_id=source.attempt_id
		AND bootstrap.turn_index=source.turn_index
		AND bootstrap.source_request_digest=source.native_bootstrap_source_request_digest
		AND bootstrap.source_receipt_digest=source.native_bootstrap_source_receipt_digest
		AND bootstrap.v46_eligible
	LEFT JOIN agent_evaluation_native_provider_state_vault_records AS vault
		ON vault.namespace_id=bootstrap.namespace_id AND vault.plan_digest=bootstrap.plan_digest
		AND vault.repository_commit=bootstrap.repository_commit AND vault.attempt_id=bootstrap.attempt_id
		AND vault.invocation_id=bootstrap.invocation_id
		AND vault.seal_request_digest=bootstrap.native_provider_source_receipt_json#>>'{source,stateVaultSealRequestDigest}'
		AND vault.seal_receipt_digest=bootstrap.native_provider_source_receipt_json#>>'{source,stateVaultSealReceiptDigest}'
		AND vault.opaque_provider_state_ref=bootstrap.native_provider_source_receipt_json#>>'{source,opaqueProviderStateRef}'
		AND vault.v46_eligible
	WHERE source.namespace_id=$1 AND source.plan_digest=$2 AND source.repository_commit=$3 AND source.v46_eligible
	ORDER BY source.attempt_id,source.turn_index`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationOptionalFactSourceArchiveRecord, 0)
	identities := make(map[string]struct{})
	for rows.Next() {
		var factBytes, bootstrapFactBytes []byte
		var record EvaluationOptionalFactSourceArchiveRecord
		if err := rows.Scan(&record.AttemptID, &record.TurnIndex, &record.SourceSealDigest,
			&record.ReceiptBytes, &record.PreEffectIntentBytes, &record.EffectSourceReceiptBytes, &factBytes,
			&record.BootstrapSourceRequestBytes, &record.BootstrapSourceReceiptBytes,
			&record.NativeSourceReceiptBytes, &bootstrapFactBytes, &record.StateVaultStatus,
			&record.StateVaultSealRequestBytes, &record.StateVaultSealReceiptBytes,
			&record.StateVaultResolveRequestBytes, &record.StateVaultResolveReceiptBytes,
			&record.StateVaultRetireRequestBytes, &record.StateVaultRetirementReceiptBytes); err != nil {
			return nil, err
		}
		if !validEvaluationAgentControlIdentity(record.AttemptID) || record.TurnIndex < 0 ||
			record.TurnIndex >= maximumEvaluationOptionalFactAuthorityTurns ||
			!evaluationDigestPattern.MatchString(record.SourceSealDigest) || len(record.ReceiptBytes) == 0 {
			return nil, ErrConflict
		}
		identity := fmt.Sprintf("%s\x00%d", record.AttemptID, record.TurnIndex)
		if _, duplicate := identities[identity]; duplicate {
			return nil, conflict("optional fact source archive identity is duplicated")
		}
		identities[identity] = struct{}{}
		record.FactBytes = append([]byte(nil), factBytes...)
		record.BootstrapFactBytes = append([]byte(nil), bootstrapFactBytes...)
		if err := evaluationOptionalFactSourceArchiveCanonicalRecord(&record); err != nil {
			return nil, err
		}
		records = append(records, record)
		if len(records) > maximumEvaluationOptionalFactAuthorityRecords {
			return nil, conflict("optional fact source archive exceeds its exact bound")
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		if records[left].AttemptID != records[right].AttemptID {
			return records[left].AttemptID < records[right].AttemptID
		}
		return records[left].TurnIndex < records[right].TurnIndex
	})
	return records, nil
}

func (repository *Repository) ListEvaluationOptionalFactSourceArchiveRecords(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationOptionalFactSourceArchiveRecord, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return nil, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	return queryEvaluationOptionalFactSourceArchiveRecords(ctx, repository.db, authority, partition)
}

func queryEvaluationOptionalFactAuthorityArchiveRecords(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationOptionalFactAuthorityArchiveRecord, error) {
	if err := validateEvaluationAuthority(authority); err != nil {
		return nil, err
	}
	if err := validateEvaluationPartition(partition); err != nil {
		return nil, err
	}
	rows, err := queryer.QueryContext(ctx, `SELECT state,attempt_id,turn_index,source_seal_digest,
		authority_request_digest,stage_digest,dispatch_ack_digest,result_digest,request_bytes,fact_bytes,
		runtime_fact_envelope_bytes,fact_authority_bytes,response_bytes
	FROM agent_evaluation_optional_fact_authorities
	WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND v46_eligible
	ORDER BY attempt_id,turn_index`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	records := make([]EvaluationOptionalFactAuthorityArchiveRecord, 0)
	for rows.Next() {
		var state string
		var factBytes, envelopeBytes, factAuthorityBytes, responseBytes []byte
		var record EvaluationOptionalFactAuthorityArchiveRecord
		if err := rows.Scan(&state, &record.AttemptID, &record.TurnIndex, &record.SourceSealDigest,
			&record.AuthorityRequestDigest, &record.StageDigest, &record.DispatchAckDigest, &record.ResultDigest,
			&record.RequestBytes, &factBytes, &envelopeBytes, &factAuthorityBytes, &responseBytes); err != nil {
			return nil, err
		}
		if state != "sealed" || !validEvaluationAgentControlIdentity(record.AttemptID) || record.TurnIndex < 0 ||
			record.TurnIndex >= maximumEvaluationOptionalFactAuthorityTurns {
			return nil, ErrConflict
		}
		for _, digest := range []string{
			record.SourceSealDigest, record.AuthorityRequestDigest, record.StageDigest,
			record.DispatchAckDigest, record.ResultDigest,
		} {
			if !evaluationDigestPattern.MatchString(digest) {
				return nil, ErrConflict
			}
		}
		if len(record.RequestBytes) == 0 || len(responseBytes) == 0 {
			return nil, ErrConflict
		}
		record.FactBytes, record.RuntimeFactEnvelopeBytes = append([]byte(nil), factBytes...), append([]byte(nil), envelopeBytes...)
		record.FactAuthorityBytes, record.ResponseBytes = append([]byte(nil), factAuthorityBytes...), append([]byte(nil), responseBytes...)
		if err := evaluationOptionalFactAuthorityArchiveCanonicalRecord(&record); err != nil {
			return nil, err
		}
		records = append(records, record)
		if len(records) > maximumEvaluationOptionalFactAuthorityRecords {
			return nil, conflict("optional fact authority archive exceeds its exact bound")
		}
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	sort.Slice(records, func(left, right int) bool {
		if records[left].AttemptID != records[right].AttemptID {
			return records[left].AttemptID < records[right].AttemptID
		}
		return records[left].TurnIndex < records[right].TurnIndex
	})
	return records, nil
}

func (repository *Repository) ListEvaluationOptionalFactAuthorityArchiveRecords(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
) ([]EvaluationOptionalFactAuthorityArchiveRecord, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return nil, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	return queryEvaluationOptionalFactAuthorityArchiveRecords(ctx, repository.db, authority, partition)
}

func evaluationOptionalFactArchiveFamilyProjection(
	plannedTurns int64,
	plannedRegistrations int64,
	registrations []EvaluationRuntimeFactSourceRegistrationArchiveRecord,
	sources []EvaluationOptionalFactSourceArchiveRecord,
	authorities []EvaluationOptionalFactAuthorityArchiveRecord,
) (EvaluationOptionalFactArchiveFamilyProjection, error) {
	registrationDigests := make([]string, len(registrations))
	var registrationBytes int64
	for index, record := range registrations {
		if validateEvaluationOptionalFactArchiveCanonicalRecord(
			record.RecordBytes, maximumEvaluationRuntimeFactSourceRegistrationArchiveRecordBytes, record.RecordDigest,
		) != nil {
			return EvaluationOptionalFactArchiveFamilyProjection{}, ErrConflict
		}
		registrationDigests[index] = record.RecordDigest
		registrationBytes += int64(len(record.RecordBytes))
	}
	if plannedRegistrations < 0 || plannedRegistrations > maximumEvaluationRuntimeFactSourceRegistrations ||
		int64(len(registrations)) != plannedRegistrations ||
		registrationBytes > maximumEvaluationRuntimeFactSourceRegistrationArchiveBytes {
		return EvaluationOptionalFactArchiveFamilyProjection{}, ErrConflict
	}
	sourceDigests := make([]string, len(sources))
	var sourceBytes int64
	for index, record := range sources {
		if validateEvaluationOptionalFactArchiveCanonicalRecord(
			record.RecordBytes, maximumEvaluationOptionalFactSourceArchiveRecordBytes, record.RecordDigest,
		) != nil {
			return EvaluationOptionalFactArchiveFamilyProjection{}, ErrConflict
		}
		sourceDigests[index] = record.RecordDigest
		sourceBytes += int64(len(record.RecordBytes))
	}
	authorityDigests := make([]string, len(authorities))
	var authorityBytes int64
	sourceIdentities := make(map[string]string, len(sources))
	authorityIdentities := make(map[string]struct{}, len(authorities))
	for _, source := range sources {
		identity := fmt.Sprintf("%s\x00%d", source.AttemptID, source.TurnIndex)
		if _, exists := sourceIdentities[identity]; exists {
			return EvaluationOptionalFactArchiveFamilyProjection{}, ErrConflict
		}
		sourceIdentities[identity] = source.SourceSealDigest
	}
	for index, record := range authorities {
		if validateEvaluationOptionalFactArchiveCanonicalRecord(
			record.RecordBytes, maximumEvaluationOptionalFactAuthorityArchiveRecordBytes, record.RecordDigest,
		) != nil {
			return EvaluationOptionalFactArchiveFamilyProjection{}, ErrConflict
		}
		identity := fmt.Sprintf("%s\x00%d", record.AttemptID, record.TurnIndex)
		if _, exists := authorityIdentities[identity]; exists || sourceIdentities[identity] != record.SourceSealDigest {
			return EvaluationOptionalFactArchiveFamilyProjection{}, ErrConflict
		}
		authorityIdentities[identity] = struct{}{}
		authorityDigests[index] = record.RecordDigest
		authorityBytes += int64(len(record.RecordBytes))
	}
	if len(sources) != len(authorities) || validateEvaluationOptionalFactArchiveFamilyBounds(
		plannedTurns, int64(len(sources)), sourceBytes, int64(len(authorities)), authorityBytes,
	) != nil {
		return EvaluationOptionalFactArchiveFamilyProjection{}, ErrConflict
	}
	sort.Strings(registrationDigests)
	sort.Strings(sourceDigests)
	sort.Strings(authorityDigests)
	registrationSetDigest, err := canonicaljson.Digest(map[string]any{"recordDigests": registrationDigests})
	if err != nil {
		return EvaluationOptionalFactArchiveFamilyProjection{}, err
	}
	sourceSetDigest, err := canonicaljson.Digest(map[string]any{"recordDigests": sourceDigests})
	if err != nil {
		return EvaluationOptionalFactArchiveFamilyProjection{}, err
	}
	authoritySetDigest, err := canonicaljson.Digest(map[string]any{"recordDigests": authorityDigests})
	if err != nil {
		return EvaluationOptionalFactArchiveFamilyProjection{}, err
	}
	return EvaluationOptionalFactArchiveFamilyProjection{
		RegistrationCount: int64(len(registrations)), RegistrationBytes: registrationBytes,
		RegistrationSetDigest: registrationSetDigest,
		SourceCount:           int64(len(sources)), SourceBytes: sourceBytes, SourceSetDigest: sourceSetDigest,
		AuthorityCount: int64(len(authorities)), AuthorityBytes: authorityBytes, AuthoritySetDigest: authoritySetDigest,
	}, nil
}
