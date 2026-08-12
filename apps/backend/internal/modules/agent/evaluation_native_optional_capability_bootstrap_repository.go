package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

const evaluationNativeOptionalBootstrapSourceSelectColumns = `namespace_id,plan_digest,repository_commit,
	attempt_id,descriptor_digest,target_id,target_digest,capability_profile_id,capability_profile_digest,
	capability_descriptor_digest,capability_id,support_expectation,turn_index,invocation_id,protocol_family,
	provider_configuration_id,model_id,model_lineage_digest,adapter_digest,provider_request_digest,
	provider_response_digest,dispatch_intent_digest,transport_receipt_digest,result_spool_receipt_digest,
	result_spool_aad_digest,result_spool_envelope_digest,normalized_event_set_digest,source_authority_id,
	source_authority_implementation_digest,source_authority_route_binding,registration_authority_issuer_id,
	registration_receipt_digest,runtime_fact_source_authority_digest,probe_program_digest,outcome,
	native_provider_source_receipt_digest,native_provider_source_digest,fact_kind,fact_digest,ingress_digest,
	ingress_bytes,native_provider_source_receipt_bytes,fact_bytes,source_request_digest,source_request_bytes,
	source_owner_stage_digest,source_owner_dispatch_ack_digest,source_receipt_digest,source_receipt_bytes,
	optional_authority_request_digest,optional_authority_request_bytes,observed_at,sealed_at,v46_eligible`

func scanEvaluationNativeOptionalBootstrapSource(
	scanner interface{ Scan(...any) error },
) (EvaluationNativeOptionalBootstrapSourceRecord, error) {
	var record EvaluationNativeOptionalBootstrapSourceRecord
	var nativeReceiptDigest, nativeSourceDigest, factKind, factDigest sql.NullString
	var nativeReceiptBytes, factBytes []byte
	if err := scanner.Scan(
		&record.NamespaceID, &record.PlanDigest, &record.RepositoryCommit, &record.AttemptID,
		&record.DescriptorDigest, &record.TargetID, &record.TargetDigest, &record.CapabilityProfileID,
		&record.CapabilityProfileDigest, &record.CapabilityDescriptorDigest, &record.CapabilityID,
		&record.SupportExpectation, &record.TurnIndex, &record.InvocationID, &record.ProtocolFamily,
		&record.ProviderConfigurationID, &record.ModelID, &record.ModelLineageDigest, &record.AdapterDigest,
		&record.ProviderRequestDigest, &record.ProviderResponseDigest, &record.DispatchIntentDigest,
		&record.TransportReceiptDigest, &record.ResultSpoolReceiptDigest, &record.ResultSpoolAADigest,
		&record.ResultSpoolEnvelopeDigest, &record.NormalizedEventSetDigest, &record.SourceAuthorityID,
		&record.SourceAuthorityImplementationDigest, &record.SourceAuthorityRouteBinding,
		&record.RegistrationAuthorityIssuerID, &record.RegistrationReceiptDigest,
		&record.RuntimeFactSourceAuthorityDigest, &record.ProbeProgramDigest, &record.Outcome,
		&nativeReceiptDigest, &nativeSourceDigest, &factKind, &factDigest, &record.IngressDigest,
		&record.IngressBytes, &nativeReceiptBytes, &factBytes, &record.SourceRequestDigest,
		&record.SourceRequestBytes, &record.SourceOwnerStageDigest, &record.SourceOwnerDispatchAckDigest,
		&record.SourceReceiptDigest, &record.SourceReceiptBytes, &record.OptionalAuthorityRequestDigest,
		&record.OptionalAuthorityRequestBytes, &record.ObservedAt, &record.SealedAt, &record.V46Eligible,
	); err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	record.NativeProviderSourceReceiptDigest = nativeReceiptDigest.String
	record.NativeProviderSourceDigest = nativeSourceDigest.String
	record.FactKind, record.FactDigest = factKind.String, factDigest.String
	record.NativeProviderSourceReceiptBytes = append([]byte(nil), nativeReceiptBytes...)
	record.FactBytes = append([]byte(nil), factBytes...)
	if err := validateEvaluationNativeOptionalBootstrapSourceRecord(record); err != nil {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, err
	}
	return record, nil
}

func loadEvaluationNativeOptionalBootstrapSourceByTurn(
	ctx context.Context,
	queryer evaluationReadQueryer,
	namespaceID string,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
	forShare bool,
) (EvaluationNativeOptionalBootstrapSourceRecord, error) {
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	record, err := scanEvaluationNativeOptionalBootstrapSource(queryer.QueryRowContext(ctx,
		`SELECT `+evaluationNativeOptionalBootstrapSourceSelectColumns+`
		FROM agent_evaluation_native_optional_capability_bootstrap_sources
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND attempt_id=$4 AND turn_index=$5`+lock,
		namespaceID, partition.PlanDigest, partition.RepositoryCommit, attemptID, turnIndex))
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrNotFound
	}
	return record, err
}

func loadEvaluationNativeOptionalBootstrapSourceByRequestDigest(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	requestDigest string,
	forShare bool,
) (EvaluationNativeOptionalBootstrapSourceRecord, error) {
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	record, err := scanEvaluationNativeOptionalBootstrapSource(queryer.QueryRowContext(ctx,
		`SELECT `+evaluationNativeOptionalBootstrapSourceSelectColumns+`
		FROM agent_evaluation_native_optional_capability_bootstrap_sources
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND source_request_digest=$4`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, requestDigest))
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrNotFound
	}
	return record, err
}

func loadEvaluationNativeOptionalBootstrapSourceByReceiptDigest(
	ctx context.Context,
	queryer evaluationReadQueryer,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	receiptDigest string,
	forShare bool,
) (EvaluationNativeOptionalBootstrapSourceRecord, error) {
	lock := ""
	if forShare {
		lock = " FOR SHARE"
	}
	record, err := scanEvaluationNativeOptionalBootstrapSource(queryer.QueryRowContext(ctx,
		`SELECT `+evaluationNativeOptionalBootstrapSourceSelectColumns+`
		FROM agent_evaluation_native_optional_capability_bootstrap_sources
		WHERE namespace_id=$1 AND plan_digest=$2 AND repository_commit=$3 AND source_receipt_digest=$4`+lock,
		authority.NamespaceID, partition.PlanDigest, partition.RepositoryCommit, receiptDigest))
	if errors.Is(err, sql.ErrNoRows) {
		return EvaluationNativeOptionalBootstrapSourceRecord{}, ErrNotFound
	}
	return record, err
}

func insertEvaluationNativeOptionalBootstrapSource(
	ctx context.Context,
	tx *sql.Tx,
	record EvaluationNativeOptionalBootstrapSourceRecord,
) (bool, error) {
	if err := validateEvaluationNativeOptionalBootstrapSourceRecord(record); err != nil {
		return false, err
	}
	result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_native_optional_capability_bootstrap_sources (
		namespace_id,plan_digest,repository_commit,attempt_id,descriptor_digest,target_id,target_digest,
		capability_profile_id,capability_profile_digest,capability_descriptor_digest,capability_id,
		support_expectation,turn_index,invocation_id,protocol_family,provider_configuration_id,model_id,
		model_lineage_digest,adapter_digest,provider_request_digest,provider_response_digest,
		dispatch_intent_digest,transport_receipt_digest,result_spool_receipt_digest,result_spool_aad_digest,
		result_spool_envelope_digest,normalized_event_set_digest,source_authority_id,
		source_authority_implementation_digest,source_authority_route_binding,registration_authority_issuer_id,
		registration_receipt_digest,runtime_fact_source_authority_digest,probe_program_digest,outcome,
		native_provider_source_receipt_digest,native_provider_source_digest,fact_kind,fact_digest,
		ingress_digest,ingress_json,ingress_bytes,native_provider_source_receipt_json,
		native_provider_source_receipt_bytes,fact_json,fact_bytes,source_request_digest,source_request_json,
		source_request_bytes,source_owner_stage_digest,source_owner_dispatch_ack_digest,source_receipt_digest,
		source_receipt_json,source_receipt_bytes,optional_authority_request_digest,
		optional_authority_request_json,optional_authority_request_bytes,observed_at,sealed_at,v46_eligible
	) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,
		$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,
		$41::jsonb,$42,$43::jsonb,$44,$45::jsonb,$46,$47,$48::jsonb,$49,$50,$51,$52,$53::jsonb,
		$54,$55,$56::jsonb,$57,$58,$59,$60) ON CONFLICT DO NOTHING`,
		record.NamespaceID, record.PlanDigest, record.RepositoryCommit, record.AttemptID, record.DescriptorDigest,
		record.TargetID, record.TargetDigest, record.CapabilityProfileID, record.CapabilityProfileDigest,
		record.CapabilityDescriptorDigest, record.CapabilityID, record.SupportExpectation, record.TurnIndex,
		record.InvocationID, record.ProtocolFamily, record.ProviderConfigurationID, record.ModelID,
		record.ModelLineageDigest, record.AdapterDigest, record.ProviderRequestDigest, record.ProviderResponseDigest,
		record.DispatchIntentDigest, record.TransportReceiptDigest, record.ResultSpoolReceiptDigest,
		record.ResultSpoolAADigest, record.ResultSpoolEnvelopeDigest, record.NormalizedEventSetDigest,
		record.SourceAuthorityID, record.SourceAuthorityImplementationDigest, record.SourceAuthorityRouteBinding,
		record.RegistrationAuthorityIssuerID, record.RegistrationReceiptDigest,
		record.RuntimeFactSourceAuthorityDigest, record.ProbeProgramDigest, record.Outcome,
		evaluationOptionalFactNullableText(record.NativeProviderSourceReceiptDigest),
		evaluationOptionalFactNullableText(record.NativeProviderSourceDigest),
		evaluationOptionalFactNullableText(record.FactKind), evaluationOptionalFactNullableText(record.FactDigest),
		record.IngressDigest, string(record.IngressBytes), record.IngressBytes,
		evaluationOptionalFactNullableJSON(record.NativeProviderSourceReceiptBytes),
		evaluationOptionalFactNullableBytes(record.NativeProviderSourceReceiptBytes),
		evaluationOptionalFactNullableJSON(record.FactBytes), evaluationOptionalFactNullableBytes(record.FactBytes),
		record.SourceRequestDigest, string(record.SourceRequestBytes), record.SourceRequestBytes,
		record.SourceOwnerStageDigest, record.SourceOwnerDispatchAckDigest, record.SourceReceiptDigest,
		string(record.SourceReceiptBytes), record.SourceReceiptBytes, record.OptionalAuthorityRequestDigest,
		string(record.OptionalAuthorityRequestBytes), record.OptionalAuthorityRequestBytes,
		record.ObservedAt, record.SealedAt, record.V46Eligible)
	if err != nil {
		return false, err
	}
	inserted, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	if inserted == 1 {
		return true, nil
	}
	existing, err := loadEvaluationNativeOptionalBootstrapSourceByTurn(
		ctx, tx, record.NamespaceID, EvaluationPlanPartition{
			PlanDigest: record.PlanDigest, RepositoryCommit: record.RepositoryCommit,
		}, record.AttemptID, record.TurnIndex, true,
	)
	if err != nil || !sameEvaluationNativeOptionalBootstrapSourceRecord(existing, record) {
		if err == nil {
			err = conflict("native optional capability bootstrap identity was reused")
		}
		return false, err
	}
	return false, nil
}

// GetEvaluationNativeOptionalBootstrapSource returns only the already-sealed
// source receipt used to recover a transport-close acknowledgement loss.
func (repository *Repository) GetEvaluationNativeOptionalBootstrapSource(
	ctx context.Context,
	authority EvaluationAuthority,
	partition EvaluationPlanPartition,
	attemptID string,
	turnIndex int64,
) (EvaluationNativeOptionalBootstrapSourceReadRecord, error) {
	if !validEvaluationServiceIdentity(attemptID) || turnIndex != 0 {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, ErrInvalid
	}
	readContext, cancel, tx, _, err := repository.beginEvaluationReadSnapshot(ctx, authority, partition)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, err
	}
	defer cancel()
	defer func() { _ = tx.Rollback() }()
	record, err := loadEvaluationNativeOptionalBootstrapSourceByTurn(
		readContext, tx, authority.NamespaceID, partition, attemptID, turnIndex, false,
	)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, err
	}
	read, err := evaluationNativeOptionalBootstrapSourceReadRecord(record)
	if err != nil {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, err
	}
	if err := tx.Commit(); err != nil {
		return EvaluationNativeOptionalBootstrapSourceReadRecord{}, err
	}
	return read, nil
}

func evaluationOptionalFactEvidenceFromNativeBootstrap(
	record EvaluationNativeOptionalBootstrapSourceRecord,
	request evaluationOptionalFactAuthorityRequest,
	target EvaluationOptionalFactTargetAuthority,
	transport evaluationOptionalFactTransportSource,
) (EvaluationOptionalFactSourceEvidence, error) {
	if err := validateEvaluationNativeOptionalBootstrapSourceRecord(record); err != nil ||
		request.Source.NativeBootstrapSourceRequestDigest != record.SourceRequestDigest ||
		request.AuthorityRequestDigest != record.OptionalAuthorityRequestDigest ||
		!bytes.Equal(request.RequestBytes, record.OptionalAuthorityRequestBytes) ||
		!evaluationOptionalFactTargetMatchesRequest(request, target) ||
		target.TargetAuthorityDigest != record.RuntimeFactSourceAuthorityDigest ||
		target.RegistrationReceiptDigest != record.RegistrationReceiptDigest {
		return EvaluationOptionalFactSourceEvidence{}, ErrConflict
	}
	if err := validateEvaluationOptionalFactTransportSource(request, transport); err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	if record.AttemptID != request.AttemptID || record.DescriptorDigest != request.DescriptorDigest ||
		record.TurnIndex != request.TurnIndex || record.InvocationID != request.InvocationID ||
		record.ProviderRequestDigest != request.ProviderRequestDigest ||
		record.ProviderResponseDigest != request.ResponseDigest ||
		record.DispatchIntentDigest != request.DispatchIntentDigest ||
		record.TransportReceiptDigest != request.TransportReceiptDigest ||
		record.ResultSpoolReceiptDigest != request.ResultSpoolReceiptDigest ||
		record.NormalizedEventSetDigest != request.NormalizedEventSetDigest ||
		record.ObservedAt.Before(transport.Receipt.CompletedAt) ||
		record.ObservedAt.Sub(transport.Receipt.CompletedAt) > maximumEvaluationNativeOptionalBootstrapDelay {
		return EvaluationOptionalFactSourceEvidence{}, ErrConflict
	}
	var fact map[string]any
	if record.Outcome == "observed" {
		observed, err := decodeCanonicalEvaluationObject(record.FactBytes, maximumEvaluationOptionalFactAuthorityEnvelopeBytes)
		if err != nil || stringMember(observed, "factKind") != record.FactKind ||
			stringMember(observed, "factDigest") != record.FactDigest {
			return EvaluationOptionalFactSourceEvidence{}, ErrConflict
		}
		fact, _ = objectMember(observed, "value")
	}
	sourceBase := map[string]any{
		"kind": "sealed-provider-response-metadata", "planDigest": record.PlanDigest,
		"repositoryCommit": record.RepositoryCommit, "attemptId": record.AttemptID,
		"descriptorDigest": record.DescriptorDigest, "turnIndex": record.TurnIndex,
		"invocationId": record.InvocationID, "providerRequestDigest": record.ProviderRequestDigest,
		"responseDigest": record.ProviderResponseDigest, "dispatchIntentDigest": record.DispatchIntentDigest,
		"transportReceiptDigest":             record.TransportReceiptDigest,
		"resultSpoolReceiptDigest":           record.ResultSpoolReceiptDigest,
		"normalizedEventSetDigest":           record.NormalizedEventSetDigest,
		"nativeBootstrapSourceRequestDigest": record.SourceRequestDigest,
		"nativeBootstrapSourceReceiptDigest": record.SourceReceiptDigest,
		"ownerStageDigest":                   record.SourceOwnerStageDigest,
		"ownerDispatchAckDigest":             record.SourceOwnerDispatchAckDigest,
		"nativeProviderSourceReceiptDigest":  nil, "nativeProviderSourceDigest": nil,
		"nativeProviderSourceFactDigest": nil, "outcome": record.Outcome,
	}
	if record.Outcome == "observed" {
		sourceBase["nativeProviderSourceReceiptDigest"] = record.NativeProviderSourceReceiptDigest
		sourceBase["nativeProviderSourceDigest"] = record.NativeProviderSourceDigest
		sourceBase["nativeProviderSourceFactDigest"] = record.FactDigest
	}
	sourceDigest, err := canonicaljson.Digest(sourceBase)
	if err != nil {
		return EvaluationOptionalFactSourceEvidence{}, err
	}
	return EvaluationOptionalFactSourceEvidence{
		Target: target, Kind: "sealed-provider-response-metadata", SourceDigest: sourceDigest,
		OwnerStageDigest: record.SourceOwnerStageDigest, OwnerDispatchAckDigest: record.SourceOwnerDispatchAckDigest,
		NativeBootstrapSourceRequestDigest: record.SourceRequestDigest,
		NativeBootstrapSourceReceiptDigest: record.SourceReceiptDigest,
		NativeProviderSourceReceiptDigest:  record.NativeProviderSourceReceiptDigest,
		NativeProviderSourceDigest:         record.NativeProviderSourceDigest,
		NativeBootstrapSourceRequestBytes:  append([]byte(nil), record.SourceRequestBytes...),
		NativeProviderSourceReceiptBytes:   append([]byte(nil), record.NativeProviderSourceReceiptBytes...),
		Outcome:                            record.Outcome, FactKind: record.FactKind, FactDigest: record.FactDigest, Fact: fact,
		ObservedAt: record.ObservedAt, NativeBootstrapSealedAt: record.SealedAt,
	}, nil
}
