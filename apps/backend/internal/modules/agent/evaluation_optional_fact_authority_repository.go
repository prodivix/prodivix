package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationOptionalFactNullableText(value string) any {
	if value == "" {
		return nil
	}
	return value
}

func evaluationOptionalFactNullableBytes(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return value
}

func evaluationOptionalFactNullableJSON(value []byte) any {
	if len(value) == 0 {
		return nil
	}
	return string(value)
}

func loadEvaluationOptionalFactEffectOwnerSource(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	request evaluationOptionalFactAuthorityRequest,
) (evaluationOptionalFactEffectOwnerSource, error) {
	var receiptBytes []byte
	err := tx.QueryRowContext(ctx, `SELECT receipt_bytes
		FROM agent_evaluation_attempt_authority_owner_receipts
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='capability-runtime' AND operation='execute-tool'
			AND attempt_id=$4 AND descriptor_digest=$5 AND request_digest=$6 AND receipt_digest=$7
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		request.AttemptID, request.DescriptorDigest, request.Source.OwnerRequestDigest,
		request.Source.OwnerReceiptDigest).Scan(&receiptBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return evaluationOptionalFactEffectOwnerSource{}, ErrNotFound
	}
	if err != nil {
		return evaluationOptionalFactEffectOwnerSource{}, err
	}
	receipt, err := decodeEvaluationAttemptAuthorityOwnerReceipt(receiptBytes)
	if err != nil || receipt.NamespaceID != authority.NamespaceID || receipt.PlanDigest != partition.PlanDigest ||
		receipt.RepositoryCommit != partition.RepositoryCommit || receipt.AttemptID != request.AttemptID ||
		receipt.DescriptorDigest != request.DescriptorDigest || receipt.RequestDigest != request.Source.OwnerRequestDigest ||
		receipt.ReceiptDigest != request.Source.OwnerReceiptDigest || receipt.ServiceKind != "capability-runtime" ||
		receipt.Operation != "execute-tool" {
		return evaluationOptionalFactEffectOwnerSource{}, ErrConflict
	}
	if err := validateEvaluationAttemptAuthorityOwnerJournal(ctx, tx, authority.NamespaceID, partition, receipt); err != nil {
		return evaluationOptionalFactEffectOwnerSource{}, err
	}
	var state, operation, ownerImplementationDigest, stageDigest, dispatchAckDigest, responseDigest string
	var preEffectIntentDigest string
	var v46Eligible bool
	var preEffectIntentBytes, responseBytes []byte
	err = tx.QueryRowContext(ctx, `SELECT state,operation,v46_eligible,owner_implementation_digest,
		stage_digest,dispatch_ack_digest,response_digest,pre_effect_intent_digest,
		pre_effect_intent_bytes,response_bytes
		FROM agent_evaluation_controlled_authority_requests
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3
			AND service_kind='provider-capability' AND request_digest=$4
		FOR SHARE`, authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit,
		request.Source.OwnerRequestDigest).Scan(&state, &operation, &v46Eligible, &ownerImplementationDigest,
		&stageDigest, &dispatchAckDigest, &responseDigest, &preEffectIntentDigest,
		&preEffectIntentBytes, &responseBytes)
	if errors.Is(err, sql.ErrNoRows) {
		return evaluationOptionalFactEffectOwnerSource{}, ErrNotFound
	}
	if err != nil {
		return evaluationOptionalFactEffectOwnerSource{}, err
	}
	rawResponseDigest, err := evaluationCanonicalByteDigest(responseBytes, maximumEvaluationAttemptAuthorityResponseBytes)
	if err != nil || state != "sealed" || operation != "tool.execute" || !v46Eligible ||
		ownerImplementationDigest != receipt.OwnerImplementationDigest || responseDigest != rawResponseDigest ||
		preEffectIntentDigest != stringMember(receipt.ResponseProjection, "preEffectIntentDigest") {
		return evaluationOptionalFactEffectOwnerSource{}, ErrConflict
	}
	return evaluationOptionalFactEffectOwnerSource{
		RequestDigest: request.Source.OwnerRequestDigest, ReceiptDigest: request.Source.OwnerReceiptDigest,
		StageDigest: stageDigest, DispatchAckDigest: dispatchAckDigest,
		OwnerImplementationDigest: ownerImplementationDigest,
		ResponseProjection:        cloneEvaluationObject(receipt.ResponseProjection),
		PreEffectIntentBytes:      append([]byte(nil), preEffectIntentBytes...), ResponseBytes: responseBytes,
		CompletedAt: receipt.CompletedAt,
	}, nil
}

func evaluationOptionalFactSourceEvidenceFromRepository(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	plan evaluationPlanFact,
	request evaluationOptionalFactAuthorityRequest,
) (EvaluationOptionalFactSourceEvidence, error) {
	target, err := evaluationOptionalFactTargetAuthorityFromPlan(plan, request)
	if err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	if err := requireEvaluationRuntimeFactSourceRegistration(
		ctx, tx, authority, plan, request, target,
	); err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	intent, err := loadEvaluationTransportDispatchIntent(ctx, tx, authority.NamespaceID, partition, request.AttemptID, request.TurnIndex, true)
	if err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	receipt, err := loadEvaluationTransportReceipt(ctx, tx, authority.NamespaceID, partition, request.AttemptID, request.TurnIndex)
	if err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	// The outer turn spool proves the model response that emitted this tool
	// invocation. The nullable request digest belongs to the inner Provider
	// shared-effect journal and is joined separately by that journal owner.
	outerTurnSpool, err := loadEvaluationProviderResultSpoolReceipt(
		ctx, tx, authority.NamespaceID, partition, request.AttemptID, request.TurnIndex,
	)
	if err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	transport := evaluationOptionalFactTransportSource{Intent: intent, Receipt: receipt, Spool: outerTurnSpool}
	if request.Source.NativeBootstrapSourceRequestDigest != "" {
		bootstrap, loadErr := loadEvaluationNativeOptionalBootstrapSourceByRequestDigest(
			ctx, tx, authority, partition, request.Source.NativeBootstrapSourceRequestDigest, true,
		)
		if loadErr != nil {
			return EvaluationOptionalFactSourceEvidence{}, loadErr
		}
		return evaluationOptionalFactEvidenceFromNativeBootstrap(bootstrap, request, target, transport)
	}
	owner, err := loadEvaluationOptionalFactEffectOwnerSource(ctx, tx, authority, partition, request)
	if err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	return evaluationOptionalFactEffectSourceEvidence(authority, partition, request, target, transport, owner)
}

// requireEvaluationRuntimeFactSourceRegistration prevents a canonical plan
// object and its self-digest from creating a production source owner. The
// descriptor must resolve to the independently sealed 8790 registration whose
// 8791 health result covers the complete plan lifetime.
func requireEvaluationRuntimeFactSourceRegistration(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
	request evaluationOptionalFactAuthorityRequest,
	target EvaluationOptionalFactTargetAuthority,
) error {
	var repositoryCommit, state, sourceAuthorityKind, sourceKind, sourceAuthorityID string
	var sourceAuthorityImplementationDigest, routeBinding, capabilityProfileID, capabilityProfileDigest string
	var capabilityID, protocolFamily, providerConfigurationID, modelID, modelLineageDigest, adapterDigest string
	var issuerID, ownerHealthDigest, ownerAdmissionDigest, stageDigest, dispatchAckDigest, receiptDigest string
	var expiresAt time.Time
	var receiptBytes []byte
	var v46Eligible bool
	err := tx.QueryRowContext(ctx, `SELECT repository_commit,state,source_authority_kind,source_kind,
		source_authority_id,source_authority_implementation_digest,route_binding,
		capability_profile_id,capability_profile_digest,capability_id,protocol_family,
		provider_configuration_id,model_id,model_lineage_digest,adapter_digest,
		registration_authority_issuer_id,owner_health_digest,owner_admission_digest,stage_digest,
		dispatch_ack_digest,expires_at,registration_receipt_digest,receipt_bytes,v46_eligible
	FROM agent_evaluation_runtime_fact_source_owner_registrations
	WHERE namespace_id=$1 AND repository_commit=$2 AND registration_receipt_digest=$3
	FOR SHARE`, authority.NamespaceID, plan.RepositoryCommit, target.RegistrationReceiptDigest).Scan(
		&repositoryCommit, &state, &sourceAuthorityKind, &sourceKind, &sourceAuthorityID,
		&sourceAuthorityImplementationDigest, &routeBinding, &capabilityProfileID, &capabilityProfileDigest,
		&capabilityID, &protocolFamily, &providerConfigurationID, &modelID, &modelLineageDigest,
		&adapterDigest, &issuerID, &ownerHealthDigest, &ownerAdmissionDigest, &stageDigest,
		&dispatchAckDigest, &expiresAt, &receiptDigest, &receiptBytes, &v46Eligible,
	)
	if errors.Is(err, sql.ErrNoRows) {
		return conflict("runtime optional fact source owner registration is missing")
	}
	if err != nil {
		return err
	}
	if repositoryCommit != plan.RepositoryCommit || state != "sealed" || !v46Eligible ||
		sourceAuthorityKind != "shared-durable-capability" || sourceKind != request.Source.Kind ||
		sourceKind != target.SourceKind || sourceAuthorityID != target.SourceAuthorityID ||
		sourceAuthorityImplementationDigest != target.SourceAuthorityImplementationDigest ||
		routeBinding != target.SourceAuthorityRouteBinding || capabilityProfileID != request.CapabilityProfileID ||
		capabilityProfileDigest != request.CapabilityProfileDigest || capabilityID != request.CapabilityID ||
		protocolFamily != request.ProtocolFamily || providerConfigurationID != request.ProviderConfigurationID ||
		modelID != request.ModelID || modelLineageDigest != request.ModelLineageDigest || adapterDigest != request.AdapterDigest ||
		issuerID != target.RegistrationAuthorityIssuerID || receiptDigest != target.RegistrationReceiptDigest ||
		expiresAt.Before(plan.ExpiresAt) {
		return conflict("runtime optional fact source owner registration drifted from the frozen target")
	}
	for _, digest := range []string{ownerHealthDigest, ownerAdmissionDigest, stageDigest, dispatchAckDigest, receiptDigest} {
		if !evaluationDigestPattern.MatchString(digest) {
			return conflict("runtime optional fact source owner registration authority is incomplete")
		}
	}
	receipt, err := decodeCanonicalEvaluationObject(receiptBytes, maximumEvaluationRuntimeFactSourceRegistrationResponseBytes)
	if err != nil || stringMember(receipt, "registrationReceiptDigest") != receiptDigest ||
		stringMember(receipt, "registrationAuthorityIssuerId") != issuerID ||
		stringMember(receipt, "sourceAuthorityId") != sourceAuthorityID ||
		stringMember(receipt, "sourceAuthorityImplementationDigest") != sourceAuthorityImplementationDigest ||
		stringMember(receipt, "routeBinding") != routeBinding || stringMember(receipt, "sourceKind") != sourceKind ||
		stringMember(receipt, "ownerHealthDigest") != ownerHealthDigest ||
		stringMember(receipt, "ownerAdmissionDigest") != ownerAdmissionDigest ||
		stringMember(receipt, "stageDigest") != stageDigest || stringMember(receipt, "dispatchAckDigest") != dispatchAckDigest {
		return conflict("runtime optional fact source owner registration receipt drifted")
	}
	base := cloneEvaluationObject(receipt)
	delete(base, "registrationReceiptDigest")
	computed, err := canonicaljson.Digest(base)
	if err != nil || computed != receiptDigest {
		return conflict("runtime optional fact source owner registration digest drifted")
	}
	return nil
}

func scanEvaluationOptionalFactSource(
	scanner interface{ Scan(...any) error },
) (EvaluationOptionalFactSourceRecord, error) {
	var record EvaluationOptionalFactSourceRecord
	var ownerRequestDigest, ownerReceiptDigest, ownerStageDigest, ownerDispatchAckDigest sql.NullString
	var preEffectIntentDigest, effectReceiptDigest, effectFactDigest, businessResultDigest sql.NullString
	var providerRuntimeJournalResultRecordDigest, providerRuntimeResultSealReceiptDigest sql.NullString
	var nativeBootstrapRequestDigest, nativeBootstrapReceiptDigest sql.NullString
	var nativeProviderReceiptDigest, nativeProviderSourceDigest sql.NullString
	var resultSpoolReceiptDigest sql.NullString
	var factKind, factDigest sql.NullString
	var preEffectIntentBytes, effectSourceReceiptBytes, factBytes []byte
	if err := scanner.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &record.AttemptID,
		&record.DescriptorDigest, &record.TargetID, &record.TargetDigest,
		&record.CapabilityProfileID, &record.CapabilityProfileDigest, &record.CapabilityDescriptorDigest,
		&record.CapabilityID, &record.SupportExpectation, &record.TurnIndex, &record.InvocationID,
		&record.ProtocolFamily, &record.ProviderConfigurationID, &record.ModelID, &record.ModelLineageDigest,
		&record.AdapterDigest, &record.ProviderRequestDigest, &record.ResponseDigest,
		&record.DispatchIntentDigest, &record.TransportReceiptDigest, &resultSpoolReceiptDigest,
		&record.NormalizedEventSetDigest, &record.SourceRequestDigest, &record.TargetAuthorityDigest, &record.SourceAuthorityID,
		&record.SourceAuthorityImplementationDigest, &record.SourceAuthorityRouteBinding,
		&record.RegistrationAuthorityIssuerID, &record.RegistrationReceiptDigest,
		&record.SourceKind, &record.SourceDigest,
		&nativeBootstrapRequestDigest, &nativeBootstrapReceiptDigest,
		&nativeProviderReceiptDigest, &nativeProviderSourceDigest,
		&ownerRequestDigest, &ownerReceiptDigest, &ownerStageDigest, &ownerDispatchAckDigest,
		&preEffectIntentDigest, &preEffectIntentBytes, &effectReceiptDigest,
		&providerRuntimeJournalResultRecordDigest, &providerRuntimeResultSealReceiptDigest, &effectSourceReceiptBytes,
		&effectFactDigest, &businessResultDigest,
		&factKind, &factDigest,
		&factBytes, &record.SourceSealDigest, &record.ReceiptBytes, &record.SealedAt, &record.V46Eligible,
	); err != nil {
		return EvaluationOptionalFactSourceRecord{}, err
	}
	record.OwnerRequestDigest = ownerRequestDigest.String
	record.ResultSpoolReceiptDigest = resultSpoolReceiptDigest.String
	record.OwnerReceiptDigest, record.OwnerStageDigest = ownerReceiptDigest.String, ownerStageDigest.String
	record.OwnerDispatchAckDigest = ownerDispatchAckDigest.String
	record.PreEffectIntentDigest, record.EffectSourceReceiptDigest = preEffectIntentDigest.String, effectReceiptDigest.String
	record.ProviderRuntimeJournalResultRecordDigest = providerRuntimeJournalResultRecordDigest.String
	record.ProviderRuntimeResultSealReceiptDigest = providerRuntimeResultSealReceiptDigest.String
	record.EffectSourceFactDigest = effectFactDigest.String
	record.BusinessResultDigest, record.FactKind, record.FactDigest = businessResultDigest.String, factKind.String, factDigest.String
	record.NativeBootstrapSourceRequestDigest = nativeBootstrapRequestDigest.String
	record.NativeBootstrapSourceReceiptDigest = nativeBootstrapReceiptDigest.String
	record.NativeProviderSourceReceiptDigest = nativeProviderReceiptDigest.String
	record.NativeProviderSourceDigest = nativeProviderSourceDigest.String
	record.PreEffectIntentBytes = append([]byte(nil), preEffectIntentBytes...)
	record.EffectSourceReceiptBytes = append([]byte(nil), effectSourceReceiptBytes...)
	record.FactBytes = append([]byte(nil), factBytes...)
	receipt, err := decodeCanonicalEvaluationObject(record.ReceiptBytes, maximumEvaluationOptionalFactAuthorityResponseBytes)
	version, versionOK := integerMember(receipt, "version")
	receiptResultSpoolDigest, receiptResultSpoolErr := evaluationOptionalFactNullableDigest(
		receipt, "resultSpoolReceiptDigest",
	)
	if err != nil || !versionOK || version != 1 ||
		receiptResultSpoolErr != nil || receiptResultSpoolDigest != record.ResultSpoolReceiptDigest ||
		stringMember(receipt, "format") != evaluationOptionalFactSourceReceiptFormat ||
		stringMember(receipt, "sourceSealDigest") != record.SourceSealDigest ||
		stringMember(receipt, "sourceDigest") != record.SourceDigest ||
		stringMember(receipt, "sourceKind") != record.SourceKind ||
		stringMember(receipt, "targetAuthorityDigest") != record.TargetAuthorityDigest ||
		stringMember(receipt, "sourceAuthorityId") != record.SourceAuthorityID ||
		stringMember(receipt, "sourceAuthorityImplementationDigest") != record.SourceAuthorityImplementationDigest ||
		stringMember(receipt, "sourceAuthorityRouteBinding") != record.SourceAuthorityRouteBinding ||
		stringMember(receipt, "registrationAuthorityIssuerId") != record.RegistrationAuthorityIssuerID ||
		stringMember(receipt, "registrationReceiptDigest") != record.RegistrationReceiptDigest ||
		stringMember(receipt, "outcome") == "" {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	base := cloneEvaluationObject(receipt)
	delete(base, "sourceSealDigest")
	digest, err := canonicaljson.Digest(base)
	if err != nil || digest != record.SourceSealDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	record.Outcome = stringMember(receipt, "outcome")
	if stringMember(receipt, "sourceRequestDigest") != record.SourceRequestDigest ||
		record.Outcome == "observed" && record.ResultSpoolReceiptDigest == "" {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	record.ObservedAt, err = parseEvaluationServiceInstant(stringMember(receipt, "observedAt"))
	if err != nil || !evaluationDigestPattern.MatchString(record.SourceRequestDigest) ||
		!record.SealedAt.Equal(mustEvaluationOptionalFactInstant(receipt, "sealedAt")) {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	if record.NativeBootstrapSourceRequestDigest != "" {
		if !exactEvaluationKeys(receipt, []string{
			"format", "version", "namespaceId", "planDigest", "repositoryCommit", "attemptId",
			"descriptorDigest", "targetId", "targetDigest", "capabilityProfileId", "capabilityProfileDigest",
			"capabilityDescriptorDigest", "capabilityId", "supportExpectation", "turnIndex", "invocationId",
			"protocolFamily", "providerConfigurationId", "modelId", "modelLineageDigest", "adapterDigest",
			"providerRequestDigest", "responseDigest", "dispatchIntentDigest", "transportReceiptDigest",
			"resultSpoolReceiptDigest", "normalizedEventSetDigest", "targetAuthorityDigest", "sourceAuthorityId",
			"sourceAuthorityImplementationDigest", "sourceAuthorityRouteBinding", "registrationAuthorityIssuerId",
			"registrationReceiptDigest", "sourceKind", "sourceDigest", "sourceRequestDigest", "ownerStageDigest",
			"ownerDispatchAckDigest", "nativeBootstrapSourceRequestDigest", "nativeBootstrapSourceReceiptDigest",
			"nativeProviderSourceReceiptDigest", "nativeProviderSourceDigest", "nativeProviderSourceFactDigest",
			"outcome", "observedAt", "sealedAt", "sourceSealDigest",
		}, "fact") || record.SourceKind != "sealed-provider-response-metadata" ||
			stringMember(receipt, "nativeBootstrapSourceRequestDigest") != record.NativeBootstrapSourceRequestDigest ||
			stringMember(receipt, "nativeBootstrapSourceReceiptDigest") != record.NativeBootstrapSourceReceiptDigest ||
			stringMember(receipt, "nativeProviderSourceReceiptDigest") != record.NativeProviderSourceReceiptDigest ||
			stringMember(receipt, "nativeProviderSourceDigest") != record.NativeProviderSourceDigest ||
			stringMember(receipt, "ownerStageDigest") != record.OwnerStageDigest ||
			stringMember(receipt, "ownerDispatchAckDigest") != record.OwnerDispatchAckDigest ||
			record.OwnerRequestDigest != "" || record.OwnerReceiptDigest != "" || record.PreEffectIntentDigest != "" ||
			record.EffectSourceReceiptDigest != "" || record.EffectSourceFactDigest != "" ||
			record.ProviderRuntimeJournalResultRecordDigest != "" || record.ProviderRuntimeResultSealReceiptDigest != "" ||
			record.BusinessResultDigest != "" || len(record.PreEffectIntentBytes) != 0 ||
			len(record.EffectSourceReceiptBytes) != 0 {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
		if record.Outcome == "observed" {
			fact, ok := objectMember(receipt, "fact")
			if !ok || stringMember(receipt, "nativeProviderSourceFactDigest") != record.FactDigest ||
				!evaluationDigestPattern.MatchString(record.NativeProviderSourceReceiptDigest) ||
				!evaluationDigestPattern.MatchString(record.NativeProviderSourceDigest) {
				return EvaluationOptionalFactSourceRecord{}, ErrConflict
			}
			canonical, canonicalErr := canonicaljson.Bytes(fact)
			if canonicalErr != nil || !bytes.Equal(canonical, record.FactBytes) ||
				stringMember(fact, "factKind") != record.FactKind || stringMember(fact, "factDigest") != record.FactDigest {
				return EvaluationOptionalFactSourceRecord{}, ErrConflict
			}
		} else if len(record.FactBytes) != 0 || record.FactKind != "" || record.FactDigest != "" ||
			record.NativeProviderSourceReceiptDigest != "" || record.NativeProviderSourceDigest != "" ||
			receipt["nativeProviderSourceReceiptDigest"] != nil || receipt["nativeProviderSourceDigest"] != nil ||
			receipt["nativeProviderSourceFactDigest"] != nil {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
		return record, nil
	}
	if record.NativeBootstrapSourceReceiptDigest != "" || record.NativeProviderSourceReceiptDigest != "" ||
		record.NativeProviderSourceDigest != "" || stringMember(receipt, "ownerRequestDigest") != record.OwnerRequestDigest ||
		stringMember(receipt, "ownerReceiptDigest") != record.OwnerReceiptDigest ||
		stringMember(receipt, "ownerStageDigest") != record.OwnerStageDigest ||
		stringMember(receipt, "ownerDispatchAckDigest") != record.OwnerDispatchAckDigest ||
		stringMember(receipt, "preEffectIntentDigest") != record.PreEffectIntentDigest ||
		stringMember(receipt, "effectSourceReceiptDigest") != record.EffectSourceReceiptDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	if record.Outcome == "observed" {
		fact, ok := objectMember(receipt, "fact")
		if !ok {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
		canonical, canonicalErr := canonicaljson.Bytes(fact)
		if canonicalErr != nil || !bytes.Equal(canonical, record.FactBytes) ||
			stringMember(fact, "factKind") != record.FactKind || stringMember(fact, "factDigest") != record.FactDigest {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
		if stringMember(receipt, "effectSourceFactDigest") != record.EffectSourceFactDigest ||
			record.EffectSourceFactDigest != record.FactDigest {
			return EvaluationOptionalFactSourceRecord{}, ErrConflict
		}
	} else if len(record.FactBytes) != 0 || record.FactKind != "" || record.FactDigest != "" ||
		record.EffectSourceFactDigest != "" || receipt["effectSourceFactDigest"] != nil {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	preEffectIntent, err := decodeCanonicalEvaluationObject(
		record.PreEffectIntentBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	preEffectTurn, preEffectTurnOK := integerMember(preEffectIntent, "turnIndex")
	if err != nil || !preEffectTurnOK || preEffectTurn != record.TurnIndex ||
		stringMember(preEffectIntent, "intentDigest") != record.PreEffectIntentDigest ||
		stringMember(preEffectIntent, "namespaceId") != record.NamespaceID ||
		stringMember(preEffectIntent, "planDigest") != record.PlanDigest ||
		stringMember(preEffectIntent, "repositoryCommit") != record.RepositoryCommit ||
		stringMember(preEffectIntent, "attemptId") != record.AttemptID ||
		stringMember(preEffectIntent, "descriptorDigest") != record.DescriptorDigest ||
		stringMember(preEffectIntent, "invocationId") != record.InvocationID ||
		stringMember(preEffectIntent, "providerRequestDigest") != record.ProviderRequestDigest ||
		stringMember(preEffectIntent, "registrationReceiptDigest") != record.RegistrationReceiptDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	preEffectBase := cloneEvaluationObject(preEffectIntent)
	delete(preEffectBase, "intentDigest")
	computedPreEffectDigest, err := canonicaljson.Digest(preEffectBase)
	if err != nil || computedPreEffectDigest != record.PreEffectIntentDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	effectReceipt, err := decodeCanonicalEvaluationObject(
		record.EffectSourceReceiptBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes,
	)
	effectResultSpoolDigest, effectResultSpoolErr := evaluationOptionalFactNullableDigest(
		effectReceipt, "resultSpoolReceiptDigest",
	)
	if err != nil || stringMember(effectReceipt, "receiptDigest") != record.EffectSourceReceiptDigest ||
		effectResultSpoolErr != nil || effectResultSpoolDigest != record.ResultSpoolReceiptDigest ||
		stringMember(effectReceipt, "providerRuntimeJournalResultRecordDigest") != record.ProviderRuntimeJournalResultRecordDigest ||
		stringMember(effectReceipt, "providerRuntimeResultSealReceiptDigest") != record.ProviderRuntimeResultSealReceiptDigest ||
		stringMember(effectReceipt, "intentDigest") != record.PreEffectIntentDigest ||
		stringMember(effectReceipt, "ownerRequestId") != stringMember(preEffectIntent, "ownerRequestId") ||
		stringMember(effectReceipt, "ownerRequestDigest") != stringMember(preEffectIntent, "ownerRequestDigest") ||
		stringMember(effectReceipt, "registrationReceiptDigest") != record.RegistrationReceiptDigest ||
		stringMember(effectReceipt, "businessResultDigest") != record.BusinessResultDigest ||
		stringMember(effectReceipt, "stageDigest") != record.OwnerStageDigest ||
		stringMember(effectReceipt, "dispatchAckDigest") != record.OwnerDispatchAckDigest ||
		stringMember(effectReceipt, "transportReceiptDigest") != record.TransportReceiptDigest ||
		stringMember(effectReceipt, "normalizedEventSetDigest") != record.NormalizedEventSetDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	effectReceiptBase := cloneEvaluationObject(effectReceipt)
	delete(effectReceiptBase, "receiptDigest")
	computedEffectReceiptDigest, err := canonicaljson.Digest(effectReceiptBase)
	if err != nil || computedEffectReceiptDigest != record.EffectSourceReceiptDigest {
		return EvaluationOptionalFactSourceRecord{}, ErrConflict
	}
	return record, nil
}

func mustEvaluationOptionalFactInstant(value map[string]any, field string) time.Time {
	parsed, _ := parseEvaluationServiceInstant(stringMember(value, field))
	return parsed
}

const evaluationOptionalFactSourceSelectColumns = `namespace_id,plan_digest,repository_commit,attempt_id,
	descriptor_digest,target_id,target_digest,capability_profile_id,capability_profile_digest,
	capability_descriptor_digest,capability_id,support_expectation,turn_index,invocation_id,
	protocol_family,provider_configuration_id,model_id,model_lineage_digest,adapter_digest,
	provider_request_digest,response_digest,dispatch_intent_digest,transport_receipt_digest,
	result_spool_receipt_digest,normalized_event_set_digest,source_request_digest,target_authority_digest,source_authority_id,
	source_authority_implementation_digest,source_authority_route_binding,
	registration_authority_issuer_id,registration_receipt_digest,source_kind,source_digest,
	native_bootstrap_source_request_digest,native_bootstrap_source_receipt_digest,
	native_provider_source_receipt_digest,native_provider_source_digest,
	source_owner_request_digest,source_owner_receipt_digest,source_owner_stage_digest,
	source_owner_dispatch_ack_digest,source_pre_effect_intent_digest,source_pre_effect_intent_bytes,
	source_effect_receipt_digest,provider_runtime_journal_result_record_digest,
	provider_runtime_result_seal_receipt_digest,source_effect_receipt_bytes,
	source_effect_fact_digest,source_business_result_digest,
	fact_kind,fact_digest,fact_bytes,source_seal_digest,source_receipt_bytes,sealed_at,v46_eligible`

func loadEvaluationOptionalFactSource(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	sourceSealDigest string,
	forShare bool,
) (EvaluationOptionalFactSourceRecord, error) {
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	record, err := scanEvaluationOptionalFactSource(queryer.QueryRowContext(ctx,
		`SELECT `+evaluationOptionalFactSourceSelectColumns+`
		FROM agent_evaluation_optional_capability_fact_sources
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND source_seal_digest=$4`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, sourceSealDigest))
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationOptionalFactSourceRecord{}, ErrNotFound
	}
	return record, err
}

// SealEvaluationOptionalFactSource validates real persisted source authority
// and appends one immutable source seal. It performs no Provider or owner call.
func (repository *Repository) SealEvaluationOptionalFactSource(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	requestBytes []byte,
	sealedAt time.Time,
) (EvaluationOptionalFactSourceRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	request, err := decodeEvaluationOptionalFactAuthorityRequest(requestBytes)
	if err != nil || sealedAt.IsZero() {
		return EvaluationOptionalFactSourceRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, _, plan, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	evidence, err := evaluationOptionalFactSourceEvidenceFromRepository(writeContext, tx, authority, partition, plan, request)
	if err != nil {
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	record, err := evaluationOptionalFactSourceSeal(authority, partition, request, evidence, sealedAt)
	if err != nil {
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_optional_capability_fact_sources (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,target_digest,
		capability_profile_id,capability_profile_digest,capability_descriptor_digest,capability_id,
		support_expectation,turn_index,invocation_id,protocol_family,provider_configuration_id,model_id,
		model_lineage_digest,adapter_digest,provider_request_digest,response_digest,dispatch_intent_digest,
		transport_receipt_digest,result_spool_receipt_digest,normalized_event_set_digest,source_request_digest,target_authority_digest,
		source_authority_id,source_authority_implementation_digest,source_authority_route_binding,
		registration_authority_issuer_id,registration_receipt_digest,source_kind,source_digest,
		native_bootstrap_source_request_digest,native_bootstrap_source_receipt_digest,
		native_provider_source_receipt_digest,native_provider_source_digest,
		source_owner_request_digest,source_owner_receipt_digest,source_owner_stage_digest,
		source_owner_dispatch_ack_digest,source_pre_effect_intent_digest,source_pre_effect_intent_json,
		source_pre_effect_intent_bytes,source_effect_receipt_digest,
		provider_runtime_journal_result_record_digest,provider_runtime_result_seal_receipt_digest,source_effect_receipt_json,
		source_effect_receipt_bytes,
		source_effect_fact_digest,source_business_result_digest,
		fact_kind,fact_digest,fact_json,fact_bytes,source_seal_digest,source_receipt_json,source_receipt_bytes,
		sealed_at,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
		$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
		$41,$42,$43,$44::jsonb,$45,$46,$47,$48,$49::jsonb,$50,$51,$52,$53,$54,$55::jsonb,$56,$57,
		$58::jsonb,$59,$60,$61) ON CONFLICT DO NOTHING`,
		record.NamespaceID, record.PlanDigest, record.RepositoryCommit, record.AttemptID, record.DescriptorDigest,
		record.TargetID, record.TargetDigest, record.CapabilityProfileID, record.CapabilityProfileDigest,
		record.CapabilityDescriptorDigest, record.CapabilityID, record.SupportExpectation, record.TurnIndex,
		record.InvocationID, record.ProtocolFamily, record.ProviderConfigurationID, record.ModelID,
		record.ModelLineageDigest, record.AdapterDigest, record.ProviderRequestDigest, record.ResponseDigest,
		record.DispatchIntentDigest, record.TransportReceiptDigest,
		evaluationOptionalFactNullableText(record.ResultSpoolReceiptDigest),
		record.NormalizedEventSetDigest, record.SourceRequestDigest, record.TargetAuthorityDigest, record.SourceAuthorityID,
		record.SourceAuthorityImplementationDigest, record.SourceAuthorityRouteBinding,
		record.RegistrationAuthorityIssuerID, record.RegistrationReceiptDigest, record.SourceKind, record.SourceDigest,
		evaluationOptionalFactNullableText(record.NativeBootstrapSourceRequestDigest),
		evaluationOptionalFactNullableText(record.NativeBootstrapSourceReceiptDigest),
		evaluationOptionalFactNullableText(record.NativeProviderSourceReceiptDigest),
		evaluationOptionalFactNullableText(record.NativeProviderSourceDigest),
		evaluationOptionalFactNullableText(record.OwnerRequestDigest), evaluationOptionalFactNullableText(record.OwnerReceiptDigest),
		evaluationOptionalFactNullableText(record.OwnerStageDigest), evaluationOptionalFactNullableText(record.OwnerDispatchAckDigest),
		evaluationOptionalFactNullableText(record.PreEffectIntentDigest), evaluationOptionalFactNullableJSON(record.PreEffectIntentBytes),
		evaluationOptionalFactNullableBytes(record.PreEffectIntentBytes),
		evaluationOptionalFactNullableText(record.EffectSourceReceiptDigest),
		evaluationOptionalFactNullableText(record.ProviderRuntimeJournalResultRecordDigest),
		evaluationOptionalFactNullableText(record.ProviderRuntimeResultSealReceiptDigest),
		evaluationOptionalFactNullableJSON(record.EffectSourceReceiptBytes),
		evaluationOptionalFactNullableBytes(record.EffectSourceReceiptBytes),
		evaluationOptionalFactNullableText(record.EffectSourceFactDigest), evaluationOptionalFactNullableText(record.BusinessResultDigest),
		evaluationOptionalFactNullableText(record.FactKind), evaluationOptionalFactNullableText(record.FactDigest),
		evaluationOptionalFactNullableJSON(record.FactBytes), evaluationOptionalFactNullableBytes(record.FactBytes),
		record.SourceSealDigest, string(record.ReceiptBytes), record.ReceiptBytes, record.SealedAt, record.V46Eligible)
	if err != nil {
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	stored, err := loadEvaluationOptionalFactSource(writeContext, tx, authority, partition, record.SourceSealDigest, true)
	if err != nil || !sameEvaluationOptionalFactSourceRecord(stored, record) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationOptionalFactSourceRecord{}, false, err
	}
	return stored, inserted == 0, nil
}

func scanEvaluationOptionalFactAuthority(
	scanner interface{ Scan(...any) error },
) (EvaluationOptionalFactAuthorityRecord, error) {
	var record EvaluationOptionalFactAuthorityRecord
	var ownerRequestDigest, ownerReceiptDigest, ownerStageDigest, ownerDispatchAckDigest sql.NullString
	var preEffectIntentDigest, effectReceiptDigest, effectFactDigest, businessResultDigest sql.NullString
	var resultSpoolReceiptDigest sql.NullString
	var outcome, factKind, factDigest, dispatchAckDigest, runtimeEnvelopeDigest sql.NullString
	var factAuthorityDigest, resultDigest sql.NullString
	var factBytes, runtimeEnvelopeBytes, factAuthorityBytes, responseBytes []byte
	var sealedAt sql.NullTime
	if err := scanner.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &record.AttemptID,
		&record.DescriptorDigest, &record.TargetID, &record.TargetDigest,
		&record.CapabilityProfileID, &record.CapabilityProfileDigest, &record.CapabilityDescriptorDigest,
		&record.CapabilityID, &record.SupportExpectation, &record.TurnIndex, &record.InvocationID,
		&record.ProtocolFamily, &record.ProviderConfigurationID, &record.ModelID, &record.ModelLineageDigest,
		&record.AdapterDigest, &record.ProviderRequestDigest, &record.ResponseDigest,
		&record.DispatchIntentDigest, &record.TransportReceiptDigest, &resultSpoolReceiptDigest,
		&record.NormalizedEventSetDigest, &record.TargetAuthorityDigest, &record.SourceAuthorityID,
		&record.SourceAuthorityImplementationDigest, &record.SourceAuthorityRouteBinding,
		&record.SourceRegistrationAuthorityIssuerID, &record.SourceRegistrationReceiptDigest,
		&record.SourceKind, &record.SourceDigest,
		&record.SourceSealDigest, &record.AuthorityRequestDigest, &record.State, &record.ClaimGeneration,
		&record.V46Eligible, &record.StageDigest, &record.StagedAt,
		&ownerRequestDigest, &ownerReceiptDigest, &ownerStageDigest, &ownerDispatchAckDigest,
		&preEffectIntentDigest, &effectReceiptDigest, &effectFactDigest, &businessResultDigest,
		&outcome, &factKind, &factDigest, &dispatchAckDigest, &runtimeEnvelopeDigest,
		&factAuthorityDigest, &resultDigest, &sealedAt, &record.RequestBytes, &factBytes,
		&runtimeEnvelopeBytes, &factAuthorityBytes, &responseBytes,
	); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	record.SourceOwnerRequestDigest, record.SourceOwnerReceiptDigest = ownerRequestDigest.String, ownerReceiptDigest.String
	record.ResultSpoolReceiptDigest = resultSpoolReceiptDigest.String
	record.SourceOwnerStageDigest, record.SourceOwnerDispatchAckDigest = ownerStageDigest.String, ownerDispatchAckDigest.String
	record.SourcePreEffectIntentDigest, record.SourceEffectReceiptDigest = preEffectIntentDigest.String, effectReceiptDigest.String
	record.SourceEffectFactDigest, record.SourceBusinessResultDigest = effectFactDigest.String, businessResultDigest.String
	record.Outcome, record.FactKind, record.FactDigest = outcome.String, factKind.String, factDigest.String
	record.DispatchAckDigest, record.RuntimeFactEnvelopeDigest = dispatchAckDigest.String, runtimeEnvelopeDigest.String
	record.FactAuthorityDigest, record.ResultDigest = factAuthorityDigest.String, resultDigest.String
	record.FactBytes, record.RuntimeFactEnvelopeBytes = append([]byte(nil), factBytes...), append([]byte(nil), runtimeEnvelopeBytes...)
	record.FactAuthorityBytes, record.ResponseBytes = append([]byte(nil), factAuthorityBytes...), append([]byte(nil), responseBytes...)
	if sealedAt.Valid {
		record.SealedAt = sealedAt.Time
	}
	request, err := decodeEvaluationOptionalFactAuthorityStageRequest(record.RequestBytes)
	if err != nil || request.PlanDigest != record.PlanDigest || request.RepositoryCommit != record.RepositoryCommit ||
		request.AttemptID != record.AttemptID || request.DescriptorDigest != record.DescriptorDigest ||
		request.TurnIndex != record.TurnIndex || request.SourceSealDigest != record.SourceSealDigest ||
		request.AuthorityRequestDigest != record.AuthorityRequestDigest || record.ClaimGeneration != 1 || !record.V46Eligible {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	if record.State == "staged" {
		if record.Outcome != "" || record.DispatchAckDigest != "" || len(record.ResponseBytes) != 0 || !record.SealedAt.IsZero() {
			return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
		}
		return record, nil
	}
	if record.State != "sealed" || !oneOfString(record.Outcome, "observed", "unavailable", "failed") ||
		(record.Outcome == "observed" && record.ResultSpoolReceiptDigest == "") ||
		record.DispatchAckDigest == "" || record.ResultDigest == "" || len(record.ResponseBytes) == 0 || record.SealedAt.IsZero() {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	response, err := evaluationOptionalFactAuthorityResponseValue(record)
	if err != nil || stringMember(response, "authorityRequestDigest") != record.AuthorityRequestDigest ||
		stringMember(response, "stageDigest") != record.StageDigest ||
		stringMember(response, "dispatchAckDigest") != record.DispatchAckDigest ||
		stringMember(response, "outcome") != record.Outcome {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	return record, nil
}

const evaluationOptionalFactAuthoritySelectColumns = `namespace_id,plan_digest,repository_commit,attempt_id,
	descriptor_digest,target_id,target_digest,capability_profile_id,capability_profile_digest,
	capability_descriptor_digest,capability_id,support_expectation,turn_index,invocation_id,
	protocol_family,provider_configuration_id,model_id,model_lineage_digest,adapter_digest,
	provider_request_digest,response_digest,dispatch_intent_digest,transport_receipt_digest,
	result_spool_receipt_digest,normalized_event_set_digest,target_authority_digest,source_authority_id,
	source_authority_implementation_digest,source_authority_route_binding,
	source_registration_authority_issuer_id,source_registration_receipt_digest,
	source_kind,source_digest,source_seal_digest,
	authority_request_digest,state,claim_generation,v46_eligible,stage_digest,staged_at,
	source_owner_request_digest,source_owner_receipt_digest,
	source_owner_stage_digest,source_owner_dispatch_ack_digest,source_pre_effect_intent_digest,
	source_effect_receipt_digest,source_effect_fact_digest,
	source_business_result_digest,outcome,fact_kind,fact_digest,dispatch_ack_digest,
	runtime_fact_envelope_digest,fact_authority_digest,result_digest,sealed_at,request_bytes,fact_bytes,
	runtime_fact_envelope_bytes,fact_authority_bytes,response_bytes`

func loadEvaluationOptionalFactAuthority(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
	forUpdate bool,
) (EvaluationOptionalFactAuthorityRecord, error) {
	lock := ""
	if forUpdate {
		lock = " FOR UPDATE"
	}
	record, err := scanEvaluationOptionalFactAuthority(queryer.QueryRowContext(ctx,
		`SELECT `+evaluationOptionalFactAuthoritySelectColumns+`
		FROM agent_evaluation_optional_fact_authorities
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND attempt_id=$4 AND turn_index=$5`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID, turnIndex))
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationOptionalFactAuthorityRecord{}, ErrNotFound
	}
	return record, err
}

// StageEvaluationOptionalFactAuthority accepts only a previously sealed source
// reference. The stage digest is persisted before a result ACK can exist.
func (repository *Repository) StageEvaluationOptionalFactAuthority(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	requestBytes []byte,
	stagedAt time.Time,
) (EvaluationOptionalFactAuthorityRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	stage, err := decodeEvaluationOptionalFactAuthorityStageRequest(requestBytes)
	if err != nil || stage.PlanDigest != partition.PlanDigest || stage.RepositoryCommit != partition.RepositoryCommit || stagedAt.IsZero() {
		return EvaluationOptionalFactAuthorityRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, _, _, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	source, err := loadEvaluationOptionalFactSource(writeContext, tx, authority, partition, stage.SourceSealDigest, true)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	record, err := evaluationOptionalFactAuthorityStage(authority, partition, stage, source, stagedAt)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `INSERT INTO agent_evaluation_optional_fact_authorities (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,target_digest,
		capability_profile_id,capability_profile_digest,capability_descriptor_digest,capability_id,
		support_expectation,turn_index,invocation_id,protocol_family,provider_configuration_id,model_id,
		model_lineage_digest,adapter_digest,provider_request_digest,response_digest,dispatch_intent_digest,
		transport_receipt_digest,result_spool_receipt_digest,normalized_event_set_digest,target_authority_digest,
		source_authority_id,source_authority_implementation_digest,source_authority_route_binding,
		source_registration_authority_issuer_id,source_registration_receipt_digest,
		source_kind,source_digest,source_seal_digest,
		authority_request_digest,state,claim_generation,v46_eligible,stage_digest,staged_at,
		source_owner_request_digest,source_owner_receipt_digest,
		source_owner_stage_digest,source_owner_dispatch_ack_digest,source_pre_effect_intent_digest,
		source_effect_receipt_digest,source_effect_fact_digest,
		source_business_result_digest,request_json,request_bytes
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
		$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,
		$42,$43,$44,$45,$46,$47,$48,$49::jsonb,$50) ON CONFLICT DO NOTHING`,
		record.NamespaceID, record.PlanDigest, record.RepositoryCommit, record.AttemptID, record.DescriptorDigest,
		record.TargetID, record.TargetDigest, record.CapabilityProfileID, record.CapabilityProfileDigest,
		record.CapabilityDescriptorDigest, record.CapabilityID, record.SupportExpectation, record.TurnIndex,
		record.InvocationID, record.ProtocolFamily, record.ProviderConfigurationID, record.ModelID,
		record.ModelLineageDigest, record.AdapterDigest, record.ProviderRequestDigest, record.ResponseDigest,
		record.DispatchIntentDigest, record.TransportReceiptDigest,
		evaluationOptionalFactNullableText(record.ResultSpoolReceiptDigest),
		record.NormalizedEventSetDigest, record.TargetAuthorityDigest, record.SourceAuthorityID,
		record.SourceAuthorityImplementationDigest, record.SourceAuthorityRouteBinding,
		record.SourceRegistrationAuthorityIssuerID, record.SourceRegistrationReceiptDigest,
		record.SourceKind, record.SourceDigest, record.SourceSealDigest,
		record.AuthorityRequestDigest, record.State, record.ClaimGeneration, record.V46Eligible,
		record.StageDigest, record.StagedAt,
		evaluationOptionalFactNullableText(record.SourceOwnerRequestDigest), evaluationOptionalFactNullableText(record.SourceOwnerReceiptDigest),
		evaluationOptionalFactNullableText(record.SourceOwnerStageDigest), evaluationOptionalFactNullableText(record.SourceOwnerDispatchAckDigest),
		evaluationOptionalFactNullableText(record.SourcePreEffectIntentDigest), evaluationOptionalFactNullableText(record.SourceEffectReceiptDigest),
		evaluationOptionalFactNullableText(record.SourceEffectFactDigest), evaluationOptionalFactNullableText(record.SourceBusinessResultDigest),
		string(record.RequestBytes), record.RequestBytes)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	stored, err := loadEvaluationOptionalFactAuthority(writeContext, tx, authority, partition, record.AttemptID, record.TurnIndex, false)
	if err != nil || stored.StageDigest != record.StageDigest || stored.AuthorityRequestDigest != record.AuthorityRequestDigest ||
		stored.SourceSealDigest != record.SourceSealDigest || !bytes.Equal(stored.RequestBytes, record.RequestBytes) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	return stored, inserted == 0, nil
}

// SealEvaluationOptionalFactAuthority atomically writes the ACK and bounded
// response. Replays read the stored bytes and never re-run a Provider or owner.
func (repository *Repository) SealEvaluationOptionalFactAuthority(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
	authorityRequestDigest string,
	sourceSealDigest string,
	stageDigest string,
	sealedAt time.Time,
) (EvaluationOptionalFactAuthorityRecord, bool, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	if !validEvaluationAgentControlIdentity(attemptID) || turnIndex < 0 || turnIndex >= maximumEvaluationOptionalFactAuthorityTurns ||
		!evaluationDigestPattern.MatchString(authorityRequestDigest) || !evaluationDigestPattern.MatchString(sourceSealDigest) ||
		!evaluationDigestPattern.MatchString(stageDigest) || sealedAt.IsZero() {
		return EvaluationOptionalFactAuthorityRecord{}, false, ErrInvalid
	}
	writeContext, cancel, tx, _, _, err := beginEvaluationAuthenticityWrite(ctx, repository, authority, partition)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	if err := ensureEvaluationAuthenticitySetOpen(writeContext, tx, authority.NamespaceID, partition.PlanDigest); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	staged, err := loadEvaluationOptionalFactAuthority(writeContext, tx, authority, partition, attemptID, turnIndex, true)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	if staged.AuthorityRequestDigest != authorityRequestDigest || staged.SourceSealDigest != sourceSealDigest || staged.StageDigest != stageDigest {
		return EvaluationOptionalFactAuthorityRecord{}, false, ErrConflict
	}
	if staged.State == "sealed" {
		if err := tx.Commit(); err != nil {
			return EvaluationOptionalFactAuthorityRecord{}, false, err
		}
		return staged, true, nil
	}
	source, err := loadEvaluationOptionalFactSource(writeContext, tx, authority, partition, sourceSealDigest, true)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	sealed, err := evaluationOptionalFactAuthoritySealFromSource(authority, partition, staged, source, sealedAt)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	result, err := tx.ExecContext(writeContext, `UPDATE agent_evaluation_optional_fact_authorities SET
		state='sealed',outcome=$6,fact_kind=$7,fact_digest=$8,dispatch_ack_digest=$9,
		runtime_fact_envelope_digest=$10,fact_authority_digest=$11,result_digest=$12,sealed_at=$13,
		fact_json=$14::jsonb,fact_bytes=$15,runtime_fact_envelope_json=$16::jsonb,
		runtime_fact_envelope_bytes=$17,fact_authority_json=$18::jsonb,fact_authority_bytes=$19,
		response_json=$20::jsonb,response_bytes=$21
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND attempt_id=$4 AND turn_index=$5
			AND state='staged' AND claim_generation=1 AND v46_eligible`,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID, turnIndex,
		sealed.Outcome, evaluationOptionalFactNullableText(sealed.FactKind), evaluationOptionalFactNullableText(sealed.FactDigest),
		sealed.DispatchAckDigest, evaluationOptionalFactNullableText(sealed.RuntimeFactEnvelopeDigest),
		evaluationOptionalFactNullableText(sealed.FactAuthorityDigest), sealed.ResultDigest, sealed.SealedAt,
		evaluationOptionalFactNullableJSON(sealed.FactBytes), evaluationOptionalFactNullableBytes(sealed.FactBytes),
		evaluationOptionalFactNullableJSON(sealed.RuntimeFactEnvelopeBytes), evaluationOptionalFactNullableBytes(sealed.RuntimeFactEnvelopeBytes),
		evaluationOptionalFactNullableJSON(sealed.FactAuthorityBytes), evaluationOptionalFactNullableBytes(sealed.FactAuthorityBytes),
		string(sealed.ResponseBytes), sealed.ResponseBytes)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	updated, err := result.RowsAffected()
	if err != nil || updated != 1 {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	stored, err := loadEvaluationOptionalFactAuthority(writeContext, tx, authority, partition, attemptID, turnIndex, false)
	if err != nil || stored.State != "sealed" || stored.ResultDigest != sealed.ResultDigest ||
		stored.DispatchAckDigest != sealed.DispatchAckDigest || !equalEvaluationOptionalFactAuthorityRecordBytes(stored, sealed) {
		if err == nil {
			err = ErrConflict
		}
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, false, err
	}
	return stored, false, nil
}

// GetEvaluationOptionalFactAuthority is the ACK-loss reconciliation read. It
// has no callback and therefore performs zero effect executions.
func (repository *Repository) GetEvaluationOptionalFactAuthority(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
	authorityRequestDigest string,
	stageDigest string,
) (EvaluationOptionalFactAuthorityRecord, error) {
	if err := validateEvaluationAuthenticityWriteInput(repository, authority, partition); err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	if !validEvaluationAgentControlIdentity(attemptID) || turnIndex < 0 || turnIndex >= maximumEvaluationOptionalFactAuthorityTurns ||
		!evaluationDigestPattern.MatchString(authorityRequestDigest) || !evaluationDigestPattern.MatchString(stageDigest) {
		return EvaluationOptionalFactAuthorityRecord{}, ErrInvalid
	}
	readContext, cancel := repositoryContext(ctx)
	defer cancel()
	record, err := loadEvaluationOptionalFactAuthority(readContext, repository.db, authority, partition, attemptID, turnIndex, false)
	if err != nil {
		return EvaluationOptionalFactAuthorityRecord{}, err
	}
	if record.AuthorityRequestDigest != authorityRequestDigest || record.StageDigest != stageDigest || record.State != "sealed" {
		return EvaluationOptionalFactAuthorityRecord{}, ErrConflict
	}
	return record, nil
}
