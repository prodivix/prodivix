package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"testing"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func storeGoldenEvaluationPlan(
	t *testing.T,
	repository *Repository,
	authority EvaluationAuthority,
	planBytes []byte,
) (EvaluationFactRecord, evaluationPlanFact, []byte) {
	t.Helper()
	plan, err := decodeEvaluationPlan(planBytes)
	if err != nil {
		t.Fatal(err)
	}
	admissions := evaluationCapabilityProbePlanTestAdmissions(t, &plan, authority, false)
	persistGoldenEvaluationCapabilityProbeAuthorities(t, repository.db, authority, plan, admissions)
	encoded := encodeGoldenEvaluationPlan(t, planBytes, plan.Value)
	record, replayed, err := repository.StoreEvaluationPlan(context.Background(), authority, encoded)
	if err != nil || replayed {
		t.Fatalf("store golden evaluation plan replay=%v err=%v", replayed, err)
	}
	stored, err := decodeEvaluationPlan(record.FactBytes)
	if err != nil {
		t.Fatal(err)
	}
	return record, stored, encoded
}

func encodeGoldenEvaluationPlan(t *testing.T, original []byte, value map[string]any) []byte {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(original))
	decoder.UseNumber()
	var envelope map[string]any
	if err := decoder.Decode(&envelope); err != nil {
		t.Fatal(err)
	}
	envelope["value"] = value
	encoded, err := canonicaljson.Bytes(envelope)
	if err != nil {
		t.Fatal(err)
	}
	return encoded
}

func persistGoldenEvaluationCapabilityProbeAuthorities(
	t *testing.T,
	db *sql.DB,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
	admissions []evaluationCapabilityProbePlanTestAdmission,
) {
	t.Helper()
	ctx := context.Background()
	exec := func(query string, args ...any) {
		t.Helper()
		if _, err := db.ExecContext(ctx, query, args...); err != nil {
			t.Fatalf("persist golden probe authority: %v", err)
		}
	}
	tables := []string{
		"agent_evaluation_capability_probe_admissions",
		"agent_evaluation_capability_probe_reference_receipts",
		"agent_evaluation_runtime_fact_source_owner_registrations",
		"ae_cppr_registrations",
		"ae_cppr_manifests",
		"ae_cppr_content_upload_receipts",
		"ae_cppr_deletion_authority_receipts",
		"ae_cppr_cleanups",
		"ae_cppr_cleanup_receipts",
	}
	for _, table := range tables {
		exec("ALTER TABLE " + table + " DISABLE TRIGGER USER")
	}
	defer func() {
		for i := len(tables) - 1; i >= 0; i-- {
			exec("ALTER TABLE " + tables[i] + " ENABLE TRIGGER USER")
		}
	}()
	claimedAt := plan.PlannedAt.Add(-2 * time.Hour)
	dispatchedAt := claimedAt.Add(time.Minute)
	sealedAt := plan.PlannedAt.Add(-time.Minute)
	for _, admission := range admissions {
		persistGoldenEvaluationCapabilityProbeAdmission(
			t, exec, authority, plan, admission, claimedAt, dispatchedAt, sealedAt,
		)
	}
}

func persistGoldenEvaluationCapabilityProbeAdmission(
	t *testing.T,
	exec func(string, ...any),
	authority EvaluationAuthority,
	plan evaluationPlanFact,
	admission evaluationCapabilityProbePlanTestAdmission,
	claimedAt time.Time,
	dispatchedAt time.Time,
	sealedAt time.Time,
) {
	t.Helper()
	stageDigest := mustEvaluationCapabilityProbeStageDigest(t, admission)
	var observedProfile any
	if admission.sealed.ObservedProfileDigest != "" {
		observedProfile = admission.sealed.ObservedProfileDigest
	}
	exec(`INSERT INTO agent_evaluation_capability_probe_admissions (
		namespace_id,repository_commit,request_digest,state,claim_generation,
		provider_configuration_id,provider_configuration_digest,protocol_family,model_id,
		model_lineage_digest,qualification_capability_profile_id,
		qualification_capability_profile_digest,capability_id,
		declared_capability_profile_set_digest,minimum_expires_at,adapter_digest,
		owner_implementation_digest,stage_digest,dispatch_ack_digest,authority_issuer_id,
		owner_admission_digest,reference_receipt_set_digest,evidence_digest,probe_receipt_digest,
		probe_status,observed_profile_digest,probed_at,expires_at,admission_receipt_digest,
		response_digest,request_json,request_bytes,reference_bundle_json,reference_bundle_bytes,
		response_json,response_bytes,claimed_at,dispatched_at,sealed_at
	) VALUES (
		$1,$2,$3,'sealed',1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,
		$23,$24,$25,$26,$27,$28,$29::jsonb,$30,$31::jsonb,$32,$33::jsonb,$34,$35,$36,$37
	)`,
		authority.NamespaceID, plan.RepositoryCommit, admission.request.RequestDigest,
		admission.request.ProviderConfigurationID, admission.request.ProviderConfigurationDigest,
		admission.request.ProtocolFamily, admission.request.ModelID, admission.request.ModelLineageDigest,
		admission.request.QualificationCapabilityProfileID,
		admission.request.QualificationCapabilityProfileDigest, admission.request.CapabilityID,
		admission.request.DeclaredCapabilityProfileSetDigest, admission.request.MinimumExpiresAt,
		admission.request.AdapterDigest, admission.ownerImplementation, stageDigest,
		admission.sealed.DispatchAckDigest, admission.authorityIssuer,
		admission.sealed.OwnerAdmissionDigest, admission.sealed.ReferenceReceiptSetDigest,
		admission.sealed.EvidenceDigest, admission.sealed.ProbeReceiptDigest, admission.sealed.ProbeStatus,
		observedProfile, admission.sealed.ProbedAt, admission.sealed.ExpiresAt,
		admission.sealed.AdmissionReceiptDigest, admission.sealed.ResponseDigest,
		string(admission.request.Bytes), admission.request.Bytes,
		string(admission.sealed.ReferenceBundleBytes), admission.sealed.ReferenceBundleBytes,
		string(admission.sealed.ResponseBytes), admission.sealed.ResponseBytes,
		claimedAt, dispatchedAt, sealedAt,
	)
	entries, err := decodeEvaluationCapabilityProbeReferenceValues(admission.sealed.ReferenceBundleBytes)
	if err != nil {
		t.Fatal(err)
	}
	for index, raw := range entries {
		entry := raw.(map[string]any)
		receipt, _ := objectMember(entry, "receipt")
		receiptBytes, err := canonicaljson.Bytes(receipt)
		if err != nil {
			t.Fatal(err)
		}
		exec(`INSERT INTO agent_evaluation_capability_probe_reference_receipts (
			namespace_id,repository_commit,request_digest,ordinal,kind,receipt_digest,
			source_receipt_digest,receipt_json,receipt_bytes,created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9,$10)`,
			authority.NamespaceID, plan.RepositoryCommit, admission.request.RequestDigest, index,
			stringMember(entry, "kind"), stringMember(entry, "receiptDigest"),
			stringMember(receipt, "sourceReceiptDigest"), string(receiptBytes), receiptBytes,
			admission.sealed.ProbedAt,
		)
	}
	if runtimeAuthority, ok := objectMember(admission.optionalAuthority, "runtimeFactSourceAuthority"); ok {
		persistGoldenRuntimeFactSourceRegistration(t, exec, authority, plan, runtimeAuthority, claimedAt, dispatchedAt, sealedAt)
	}
	if admission.resourceRequest != nil && admission.resourceResult != nil && admission.resourceCleanup != nil {
		persistGoldenProviderResourceAuthority(t, exec, authority, plan, admission, claimedAt, dispatchedAt, sealedAt)
	}
}

func persistGoldenRuntimeFactSourceRegistration(
	t *testing.T,
	exec func(string, ...any),
	authority EvaluationAuthority,
	plan evaluationPlanFact,
	runtime map[string]any,
	claimedAt time.Time,
	dispatchedAt time.Time,
	sealedAt time.Time,
) {
	t.Helper()
	requestDigest := evaluationFixtureDigest(t, "runtime-reg-"+stringMember(runtime, "registrationReceiptDigest"))
	minimumExpiresAt := plan.ExpiresAt
	registeredAt := plan.PlannedAt.Add(-time.Hour)
	expiresAt := plan.ExpiresAt.Add(time.Hour)
	request := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-request", "version": int64(1),
		"namespaceId": authority.NamespaceID, "repositoryCommit": plan.RepositoryCommit,
		"sourceAuthorityKind": stringMember(runtime, "kind"), "sourceKind": stringMember(runtime, "sourceKind"),
		"sourceAuthorityId":                   stringMember(runtime, "sourceAuthorityId"),
		"sourceAuthorityImplementationDigest": stringMember(runtime, "sourceAuthorityImplementationDigest"),
		"routeBinding":                        stringMember(runtime, "routeBinding"),
		"capabilityProfileId":                 stringMember(runtime, "capabilityProfileId"),
		"capabilityProfileDigest":             stringMember(runtime, "capabilityProfileDigest"),
		"capabilityId":                        stringMember(runtime, "capabilityId"),
		"protocolFamily":                      stringMember(runtime, "protocolFamily"),
		"providerConfigurationId":             stringMember(runtime, "providerConfigurationId"),
		"modelId":                             stringMember(runtime, "modelId"),
		"modelLineageDigest":                  stringMember(runtime, "modelLineageDigest"),
		"adapterDigest":                       stringMember(runtime, "adapterDigest"),
		"minimumExpiresAt":                    minimumExpiresAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		"requestDigest":                       requestDigest,
	}
	requestBytes, err := canonicaljson.Bytes(request)
	if err != nil {
		t.Fatal(err)
	}
	stageDigest := evaluationFixtureDigest(t, "runtime-stage-"+requestDigest)
	healthBase := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-health", "version": int64(1),
		"requestDigest":                       requestDigest,
		"sourceAuthorityId":                   stringMember(runtime, "sourceAuthorityId"),
		"sourceAuthorityImplementationDigest": stringMember(runtime, "sourceAuthorityImplementationDigest"),
		"sourceKind":                          stringMember(runtime, "sourceKind"),
		"routeBinding":                        stringMember(runtime, "routeBinding"), "status": "ready",
		"checkedAt": registeredAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		"expiresAt": expiresAt.UTC().Format("2006-01-02T15:04:05.000Z"),
	}
	healthDigest, err := canonicaljson.Digest(healthBase)
	if err != nil {
		t.Fatal(err)
	}
	healthBase["healthDigest"] = healthDigest
	healthBytes, err := canonicaljson.Bytes(healthBase)
	if err != nil {
		t.Fatal(err)
	}
	ownerAdmission := evaluationFixtureDigest(t, "runtime-owner-"+requestDigest)
	dispatchAck := evaluationFixtureDigest(t, "runtime-ack-"+requestDigest)
	receipt := map[string]any{
		"format": "prodivix.agent-evaluation-runtime-fact-source-owner-registration-receipt", "version": int64(1),
		"namespaceId": authority.NamespaceID, "repositoryCommit": plan.RepositoryCommit,
		"requestDigest": requestDigest, "sourceAuthorityKind": stringMember(runtime, "kind"),
		"sourceKind": stringMember(runtime, "sourceKind"), "sourceAuthorityId": stringMember(runtime, "sourceAuthorityId"),
		"sourceAuthorityImplementationDigest": stringMember(runtime, "sourceAuthorityImplementationDigest"),
		"routeBinding":                        stringMember(runtime, "routeBinding"),
		"capabilityProfileId":                 stringMember(runtime, "capabilityProfileId"),
		"capabilityProfileDigest":             stringMember(runtime, "capabilityProfileDigest"),
		"capabilityId":                        stringMember(runtime, "capabilityId"),
		"protocolFamily":                      stringMember(runtime, "protocolFamily"),
		"providerConfigurationId":             stringMember(runtime, "providerConfigurationId"),
		"modelId":                             stringMember(runtime, "modelId"),
		"modelLineageDigest":                  stringMember(runtime, "modelLineageDigest"),
		"adapterDigest":                       stringMember(runtime, "adapterDigest"),
		"registrationAuthorityIssuerId":       stringMember(runtime, "registrationAuthorityIssuerId"),
		"ownerHealthDigest":                   healthDigest,
		"ownerAdmissionDigest":                ownerAdmission,
		"stageDigest":                         stageDigest,
		"dispatchAckDigest":                   dispatchAck,
		"registeredAt":                        registeredAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		"expiresAt":                           expiresAt.UTC().Format("2006-01-02T15:04:05.000Z"),
		"registrationReceiptDigest":           stringMember(runtime, "registrationReceiptDigest"),
	}
	receiptBytes, err := canonicaljson.Bytes(receipt)
	if err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO agent_evaluation_runtime_fact_source_owner_registrations (
		namespace_id,repository_commit,request_digest,source_authority_kind,source_kind,
		source_authority_id,source_authority_implementation_digest,route_binding,
		capability_profile_id,capability_profile_digest,capability_id,protocol_family,
		provider_configuration_id,model_id,model_lineage_digest,adapter_digest,minimum_expires_at,
		registration_authority_issuer_id,state,claim_generation,stage_digest,owner_health_digest,
		owner_admission_digest,dispatch_ack_digest,registered_at,expires_at,registration_receipt_digest,
		request_json,request_bytes,owner_health_json,owner_health_bytes,receipt_json,receipt_bytes,
		v45_eligible,v46_eligible,claimed_at,dispatched_at,sealed_at,updated_at
	) VALUES (
		$1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,'sealed',1,$19,$20,$21,$22,
		$23,$24,$25,$26::jsonb,$27,$28::jsonb,$29,$30::jsonb,$31,TRUE,TRUE,$32,$33,$34,$34
	)`,
		authority.NamespaceID, plan.RepositoryCommit, requestDigest, stringMember(runtime, "kind"),
		stringMember(runtime, "sourceKind"), stringMember(runtime, "sourceAuthorityId"),
		stringMember(runtime, "sourceAuthorityImplementationDigest"), stringMember(runtime, "routeBinding"),
		stringMember(runtime, "capabilityProfileId"), stringMember(runtime, "capabilityProfileDigest"),
		stringMember(runtime, "capabilityId"), stringMember(runtime, "protocolFamily"),
		stringMember(runtime, "providerConfigurationId"), stringMember(runtime, "modelId"),
		stringMember(runtime, "modelLineageDigest"), stringMember(runtime, "adapterDigest"),
		minimumExpiresAt, stringMember(runtime, "registrationAuthorityIssuerId"), stageDigest, healthDigest,
		ownerAdmission, dispatchAck, registeredAt, expiresAt, stringMember(runtime, "registrationReceiptDigest"),
		string(requestBytes), requestBytes, string(healthBytes), healthBytes, string(receiptBytes), receiptBytes,
		claimedAt, dispatchedAt, sealedAt,
	)
}

func persistGoldenProviderResourceAuthority(
	t *testing.T,
	exec func(string, ...any),
	authority EvaluationAuthority,
	plan evaluationPlanFact,
	admission evaluationCapabilityProbePlanTestAdmission,
	claimedAt time.Time,
	dispatchedAt time.Time,
	sealedAt time.Time,
) {
	t.Helper()
	request := admission.resourceRequest
	result := admission.resourceResult
	cleanup := admission.resourceCleanup
	claimedAt = admission.resourceClaimedAt
	if claimedAt.IsZero() {
		claimedAt = result.RegisteredAt.Add(-time.Minute)
	}
	dispatchedAt = claimedAt.Add(time.Second)
	if !result.RegisteredAt.After(dispatchedAt) {
		dispatchedAt = claimedAt
	}
	sealedAt = result.RegisteredAt
	if sealedAt.Before(dispatchedAt) {
		sealedAt = dispatchedAt
	}
	stageDigest := evaluationFixtureDigest(t, "resource-stage-"+request.RequestDigest)
	ownerAdmission := evaluationFixtureDigest(t, "resource-owner-"+request.RequestDigest)
	dispatchAck := evaluationFixtureDigest(t, "resource-ack-"+request.RequestDigest)
	ingress := evaluationFixtureDigest(t, "resource-ingress-"+request.RequestDigest)
	ingressReceipt := evaluationFixtureDigest(t, "resource-ingress-receipt-"+request.RequestDigest)
	registrationReceipt := evaluationFixtureDigest(t, "resource-reg-receipt-"+request.RequestDigest)
	response := map[string]any{
		"format": evaluationCapabilityProbeProviderResourceRegistrationResponseFormat, "version": int64(1),
		"requestDigest": request.RequestDigest, "resultDigest": result.ResultDigest,
	}
	responseBytes, err := canonicaljson.Bytes(response)
	if err != nil {
		t.Fatal(err)
	}
	exec(`INSERT INTO ae_cppr_registrations (
		namespace_id,repository_commit,request_digest,state,claim_generation,
		provider_configuration_id,provider_configuration_digest,protocol_family,model_id,
		model_lineage_digest,adapter_digest,capability_profile_id,probe_program_digest,
		public_resource_descriptor_digest,minimum_expires_at,owner_implementation_digest,
		authority_issuer_id,request_json,request_bytes,v45_eligible,v46_eligible,claimed_at,updated_at
	) VALUES (
		$1,$2,$3,'claimed',1,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17,TRUE,TRUE,$18,$18
	)`,
		authority.NamespaceID, plan.RepositoryCommit, request.RequestDigest,
		request.ProviderConfigurationID, request.ProviderConfigurationDigest, request.ProtocolFamily,
		request.ModelID, request.ModelLineageDigest, request.AdapterDigest, request.CapabilityProfileID,
		request.ProbeProgramDigest, request.PublicResourceDigest, request.MinimumExpiresAt,
		admission.ownerImplementation, admission.authorityIssuer, string(request.Bytes), request.Bytes,
		claimedAt,
	)
	exec(`UPDATE ae_cppr_registrations SET
		state='dispatched',stage_digest=$4,dispatched_at=$5,updated_at=$5
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		authority.NamespaceID, plan.RepositoryCommit, request.RequestDigest, stageDigest, dispatchedAt,
	)
	for _, component := range []struct {
		table  string
		column string
		digest string
		body   []byte
	}{
		{"ae_cppr_manifests", "manifest_digest", result.ResourceManifestDigest, result.ResourceManifestBytes},
		{"ae_cppr_content_upload_receipts", "content_upload_receipt_digest", result.ContentUploadReceiptDigest, result.ContentUploadReceiptBytes},
		{"ae_cppr_deletion_authority_receipts", "deletion_authority_receipt_digest", result.DeletionAuthorityReceiptDigest, result.DeletionAuthorityReceiptBytes},
	} {
		exec(fmt.Sprintf(`INSERT INTO %s (
			namespace_id,repository_commit,request_digest,%s,receipt_json,receipt_bytes,created_at
		) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`, component.table, component.column),
			authority.NamespaceID, plan.RepositoryCommit, request.RequestDigest, component.digest,
			string(component.body), component.body, dispatchedAt.Add(time.Second),
		)
	}
	exec(`UPDATE ae_cppr_registrations SET
		state='sealed',resource_result_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,
		result_ingress_digest=$7,result_ingress_receipt_digest=$8,resource_manifest_digest=$9,
		content_upload_receipt_digest=$10,deletion_authority_receipt_digest=$11,
		provider_resource_authority_digest=$12,registration_receipt_digest=$13,
		registered_at=$14,expires_at=$15,result_json=$16::jsonb,result_bytes=$17,
		response_json=$18::jsonb,response_bytes=$19,sealed_at=$20,updated_at=$20
		WHERE namespace_id=$1 AND repository_commit=$2 AND request_digest=$3`,
		authority.NamespaceID, plan.RepositoryCommit, request.RequestDigest, result.ResultDigest,
		ownerAdmission, dispatchAck, ingress, ingressReceipt, result.ResourceManifestDigest,
		result.ContentUploadReceiptDigest, result.DeletionAuthorityReceiptDigest,
		result.ProviderResourceAuthorityDigest, registrationReceipt, result.RegisteredAt, result.ExpiresAt,
		string(result.Bytes), result.Bytes, string(responseBytes), responseBytes, sealedAt,
	)
	exec(`INSERT INTO ae_cppr_cleanups (
		namespace_id,repository_commit,cleanup_request_digest,resource_registration_request_digest,
		deletion_authority_receipt_digest,state,claim_generation,owner_implementation_digest,
		authority_issuer_id,request_json,request_bytes,v45_eligible,v46_eligible,claimed_at,updated_at
	) VALUES (
		$1,$2,$3,$4,$5,'claimed',1,$6,$7,$8::jsonb,$9,TRUE,TRUE,$10,$10
	)`,
		authority.NamespaceID, plan.RepositoryCommit, cleanup.request.CleanupRequestDigest,
		request.RequestDigest, result.DeletionAuthorityReceiptDigest, cleanup.ownerImplementationDigest,
		admission.authorityIssuer, string(cleanup.request.Bytes), cleanup.request.Bytes, claimedAt,
	)
	exec(`UPDATE ae_cppr_cleanups SET
		state='dispatched',stage_digest=$4,dispatched_at=$5,updated_at=$5
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`,
		authority.NamespaceID, plan.RepositoryCommit, cleanup.request.CleanupRequestDigest,
		cleanup.stageDigest, dispatchedAt,
	)
	exec(`INSERT INTO ae_cppr_cleanup_receipts (
		namespace_id,repository_commit,cleanup_request_digest,cleanup_receipt_digest,
		receipt_json,receipt_bytes,created_at
	) VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7)`,
		authority.NamespaceID, plan.RepositoryCommit, cleanup.request.CleanupRequestDigest,
		cleanup.receipt.CleanupReceiptDigest, string(cleanup.receipt.Bytes), cleanup.receipt.Bytes,
		cleanup.receipt.CompletedAt,
	)
	exec(`UPDATE ae_cppr_cleanups SET
		state='sealed',cleanup_receipt_digest=$4,owner_admission_digest=$5,dispatch_ack_digest=$6,
		result_ingress_digest=$7,result_ingress_receipt_digest=$8,response_digest=$9,
		response_json=$10::jsonb,response_bytes=$11,completed_at=$12,sealed_at=$13,updated_at=$13
		WHERE namespace_id=$1 AND repository_commit=$2 AND cleanup_request_digest=$3`,
		authority.NamespaceID, plan.RepositoryCommit, cleanup.request.CleanupRequestDigest,
		cleanup.receipt.CleanupReceiptDigest, cleanup.ownerAdmissionDigest, cleanup.dispatchAckDigest,
		cleanup.resultIngressDigest, cleanup.resultIngressReceiptDigest, cleanup.responseDigest,
		string(cleanup.responseBytes), cleanup.responseBytes, cleanup.receipt.CompletedAt, cleanup.sealedAt,
	)
}
