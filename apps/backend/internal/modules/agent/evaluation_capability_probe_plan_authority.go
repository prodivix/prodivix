package agent

import (
	"bytes"
	"context"
	"database/sql"
	"errors"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type evaluationPlanCapabilityProbeAdmissionLink struct {
	TargetID        string
	TargetDigest    string
	AuthorityDigest string
	EvidenceDigest  string
	RequestDigest   string
}

func requireEvaluationPlanProbeProviderResourceAuthority(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
	target map[string]any,
	optionalAuthority map[string]any,
	probeRequest evaluationCapabilityProbeAdmissionRequest,
) error {
	resource, exists := objectMember(optionalAuthority, "probeProviderResourceAuthority")
	requestResourceExists := probeRequest.ProbeProviderResourceAuthority != nil
	if exists != requestResourceExists || exists && !sameEvaluationCanonicalValue(resource, probeRequest.ProbeProviderResourceAuthority) {
		return conflict("evaluation capability probe provider resource drifted between the plan and admission request")
	}
	if !exists {
		return nil
	}
	var resourceRequestBytes, resultBytes []byte
	var requestDigest, resultDigest, manifestDigest, uploadDigest, deletionDigest, resourceAuthorityDigest string
	var registeredAt, expiresAt, claimedAt time.Time
	err := tx.QueryRowContext(ctx, `SELECT
		request_digest,resource_result_digest,resource_manifest_digest,content_upload_receipt_digest,
		deletion_authority_receipt_digest,provider_resource_authority_digest,registered_at,expires_at,
		request_bytes,result_bytes,claimed_at
	FROM agent_evaluation_capability_probe_provider_resource_registrations
	WHERE namespace_id=$1 AND repository_commit=$2 AND state='sealed' AND v46_eligible
		AND provider_resource_authority_digest=$3 FOR SHARE`, authority.NamespaceID, plan.RepositoryCommit,
		stringMember(resource, "authorityDigest"),
	).Scan(&requestDigest, &resultDigest, &manifestDigest, &uploadDigest, &deletionDigest,
		&resourceAuthorityDigest, &registeredAt, &expiresAt, &resourceRequestBytes, &resultBytes, &claimedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return conflict("evaluation capability probe provider resource has no sealed production registration")
	}
	if err != nil {
		return err
	}
	resourceRequest, err := decodeEvaluationCapabilityProbeProviderResourceRegistrationRequest(resourceRequestBytes, authority)
	if err != nil || resourceRequest.RequestDigest != requestDigest ||
		resourceRequest.RepositoryCommit != plan.RepositoryCommit ||
		resourceRequest.ProviderConfigurationID != stringMember(target, "providerConfigurationId") ||
		resourceRequest.ProtocolFamily != stringMember(target, "protocolFamily") ||
		resourceRequest.ModelID != stringMember(target, "modelId") ||
		resourceRequest.ModelLineageDigest != stringMember(target, "modelLineageDigest") ||
		resourceRequest.CapabilityProfileID != stringMember(target, "capabilityProfileId") ||
		resourceRequest.MinimumExpiresAt.Before(plan.ExpiresAt) ||
		resourceAuthorityDigest != stringMember(resource, "authorityDigest") ||
		manifestDigest != stringMember(resource, "resourceManifestDigest") ||
		uploadDigest != stringMember(resource, "contentUploadReceiptDigest") ||
		deletionDigest != stringMember(resource, "deletionAuthorityReceiptDigest") ||
		registeredAt.After(plan.PlannedAt) || expiresAt.Before(plan.ExpiresAt) {
		return conflict("evaluation capability probe provider resource registration drifted from the plan target")
	}
	resultValue, err := decodeCanonicalEvaluationObject(resultBytes, maximumEvaluationCapabilityProbeProviderResourceResultBytes)
	result, resultErr := decodeEvaluationCapabilityProbeProviderResourceResult(
		resultValue, resourceRequest, claimedAt, plan.PlannedAt,
	)
	if err != nil || resultErr != nil || result.ResultDigest != resultDigest ||
		!sameEvaluationCanonicalValue(result.ProviderResourceAuthority, resource) {
		return conflict("evaluation capability probe provider resource result drifted from the plan authority")
	}
	planDeletion, hasPlanDeletion := objectMember(optionalAuthority, "probeProviderResourceDeletionAuthorityReceipt")
	planCleanup, hasPlanCleanup := objectMember(optionalAuthority, "probeProviderResourceCleanupReceipt")
	if !hasPlanDeletion || !hasPlanCleanup || !sameEvaluationCanonicalValue(planDeletion, result.DeletionAuthorityReceipt) {
		return conflict("evaluation capability probe provider resource deletion authority drifted from the plan")
	}
	components := []struct {
		table        string
		digestColumn string
		digest       string
		bytes        []byte
	}{
		{"agent_evaluation_capability_probe_provider_resource_manifests", "manifest_digest", result.ResourceManifestDigest, result.ResourceManifestBytes},
		{"agent_evaluation_capability_probe_provider_resource_content_upload_receipts", "content_upload_receipt_digest", result.ContentUploadReceiptDigest, result.ContentUploadReceiptBytes},
		{"agent_evaluation_capability_probe_provider_resource_deletion_authority_receipts", "deletion_authority_receipt_digest", result.DeletionAuthorityReceiptDigest, result.DeletionAuthorityReceiptBytes},
	}
	for _, component := range components {
		var storedBytes []byte
		query := `SELECT receipt_bytes FROM ` + component.table + ` WHERE namespace_id=$1 AND repository_commit=$2
			AND request_digest=$3 AND ` + component.digestColumn + `=$4 FOR SHARE`
		if err := tx.QueryRowContext(ctx, query, authority.NamespaceID, plan.RepositoryCommit,
			requestDigest, component.digest).Scan(&storedBytes); err != nil || !bytes.Equal(storedBytes, component.bytes) {
			if errors.Is(err, sql.ErrNoRows) {
				return conflict("evaluation capability probe provider resource raw component is absent")
			}
			if err != nil {
				return err
			}
			return conflict("evaluation capability probe provider resource raw component drifted")
		}
	}
	cleanupRequestValue, cleanupRequestDigest, cleanupRequestBytes, err :=
		evaluationCapabilityProbeProviderResourceCleanupRequestValue(
			plan.RepositoryCommit, requestDigest, result.DeletionAuthorityReceiptDigest,
		)
	if err != nil {
		return err
	}
	_ = cleanupRequestValue
	var cleanupOwnerImplementationDigest, cleanupStageDigest, cleanupReceiptDigest string
	var cleanupOwnerAdmissionDigest, cleanupDispatchAckDigest, resultIngressDigest string
	var resultIngressReceiptDigest, cleanupResponseDigest string
	var storedCleanupRequestBytes, cleanupReceiptBytes, cleanupResponseBytes []byte
	var cleanupCompletedAt, cleanupSealedAt time.Time
	err = tx.QueryRowContext(ctx, `SELECT
		c.owner_implementation_digest,c.stage_digest,c.cleanup_receipt_digest,c.owner_admission_digest,
		c.dispatch_ack_digest,c.result_ingress_digest,c.result_ingress_receipt_digest,c.response_digest,
		c.request_bytes,r.receipt_bytes,c.response_bytes,c.completed_at,c.sealed_at
	FROM agent_evaluation_capability_probe_provider_resource_cleanups c
	JOIN agent_evaluation_capability_probe_provider_resource_cleanup_receipts r
	  ON r.namespace_id=c.namespace_id AND r.repository_commit=c.repository_commit
	 AND r.cleanup_request_digest=c.cleanup_request_digest AND r.cleanup_receipt_digest=c.cleanup_receipt_digest
	WHERE c.namespace_id=$1 AND c.repository_commit=$2 AND c.cleanup_request_digest=$3
	  AND c.resource_registration_request_digest=$4 AND c.deletion_authority_receipt_digest=$5
	  AND c.state='sealed' AND c.v46_eligible FOR SHARE`,
		authority.NamespaceID, plan.RepositoryCommit, cleanupRequestDigest, requestDigest,
		result.DeletionAuthorityReceiptDigest,
	).Scan(&cleanupOwnerImplementationDigest, &cleanupStageDigest, &cleanupReceiptDigest,
		&cleanupOwnerAdmissionDigest, &cleanupDispatchAckDigest, &resultIngressDigest,
		&resultIngressReceiptDigest, &cleanupResponseDigest, &storedCleanupRequestBytes,
		&cleanupReceiptBytes, &cleanupResponseBytes, &cleanupCompletedAt, &cleanupSealedAt)
	if errors.Is(err, sql.ErrNoRows) {
		return conflict("evaluation capability probe provider resource cleanup has no sealed production authority")
	}
	if err != nil {
		return err
	}
	cleanupRequest, requestErr := decodeEvaluationCapabilityProbeProviderResourceCleanupRequest(storedCleanupRequestBytes)
	deletionReceipt, _, deletionErr := decodeEvaluationCapabilityProbeProviderResourceDeletionAuthorityReceipt(
		result.DeletionAuthorityReceipt,
	)
	cleanupValue, cleanupDecodeErr := decodeCanonicalEvaluationObject(
		cleanupReceiptBytes, maximumEvaluationCapabilityProbeProviderResourceCleanupReceiptBytes,
	)
	cleanupReceipt, cleanupErr := decodeEvaluationCapabilityProbeProviderResourceCleanupReceipt(
		cleanupValue, deletionReceipt,
	)
	cleanupRecord := EvaluationCapabilityProbeProviderResourceCleanupRecord{
		OwnerImplementationDigest: cleanupOwnerImplementationDigest, StageDigest: cleanupStageDigest,
		CleanupReceiptDigest: cleanupReceiptDigest, OwnerAdmissionDigest: cleanupOwnerAdmissionDigest,
		DispatchAckDigest: cleanupDispatchAckDigest, ResultIngressDigest: resultIngressDigest,
		ResultIngressReceiptDigest: resultIngressReceiptDigest, ResponseDigest: cleanupResponseDigest,
		ResponseBytes: cleanupResponseBytes,
	}
	if requestErr != nil || deletionErr != nil || cleanupDecodeErr != nil || cleanupErr != nil ||
		cleanupRequest.CleanupRequestDigest != cleanupRequestDigest ||
		!bytes.Equal(storedCleanupRequestBytes, cleanupRequestBytes) ||
		cleanupReceipt.CleanupReceiptDigest != cleanupReceiptDigest ||
		!sameEvaluationCanonicalValue(cleanupReceipt.Value, planCleanup) ||
		!cleanupCompletedAt.Equal(cleanupReceipt.CompletedAt) || cleanupCompletedAt.After(plan.PlannedAt) ||
		cleanupSealedAt.Before(cleanupCompletedAt) || cleanupSealedAt.After(plan.PlannedAt) ||
		validateEvaluationCapabilityProbeProviderResourceCleanupResponse(
			cleanupResponseBytes, cleanupRequest, cleanupRecord, deletionReceipt,
		) != nil {
		return conflict("evaluation capability probe provider resource cleanup authority drifted from the plan")
	}
	return nil
}

func requireEvaluationPlanRuntimeFactSourceRegistration(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
	target map[string]any,
	optionalAuthority map[string]any,
) error {
	runtimeAuthority, exists := objectMember(optionalAuthority, "runtimeFactSourceAuthority")
	capabilityID := stringMember(optionalAuthority, "capabilityId")
	factBacked := evaluationRuntimeFactSourceExpectedKind(capabilityID) != ""
	if factBacked != exists {
		return conflict("evaluation optional capability runtime fact source registration coverage drifted")
	}
	if !factBacked {
		return nil
	}
	var registered bool
	err := tx.QueryRowContext(ctx, `SELECT EXISTS (
		SELECT 1 FROM agent_evaluation_runtime_fact_source_owner_registrations registration
		WHERE registration.namespace_id=$1 AND registration.repository_commit=$2
			AND registration.state='sealed' AND registration.v46_eligible
			AND registration.registration_receipt_digest=$3
			AND registration.source_authority_kind=$4 AND registration.source_kind=$5
			AND registration.source_authority_id=$6
			AND registration.source_authority_implementation_digest=$7
			AND registration.route_binding=$8 AND registration.capability_profile_id=$9
			AND registration.capability_profile_digest=$10 AND registration.capability_id=$11
			AND registration.protocol_family=$12 AND registration.provider_configuration_id=$13
			AND registration.model_id=$14 AND registration.model_lineage_digest=$15
			AND registration.adapter_digest=$16 AND registration.registration_authority_issuer_id=$17
			AND registration.minimum_expires_at >= $18 AND registration.registered_at <= $19
			AND registration.expires_at >= $18
	)`,
		authority.NamespaceID, plan.RepositoryCommit, stringMember(runtimeAuthority, "registrationReceiptDigest"),
		stringMember(runtimeAuthority, "kind"), stringMember(runtimeAuthority, "sourceKind"),
		stringMember(runtimeAuthority, "sourceAuthorityId"),
		stringMember(runtimeAuthority, "sourceAuthorityImplementationDigest"),
		stringMember(runtimeAuthority, "routeBinding"), stringMember(runtimeAuthority, "capabilityProfileId"),
		stringMember(runtimeAuthority, "capabilityProfileDigest"), stringMember(runtimeAuthority, "capabilityId"),
		stringMember(runtimeAuthority, "protocolFamily"), stringMember(runtimeAuthority, "providerConfigurationId"),
		stringMember(runtimeAuthority, "modelId"), stringMember(runtimeAuthority, "modelLineageDigest"),
		stringMember(runtimeAuthority, "adapterDigest"), stringMember(runtimeAuthority, "registrationAuthorityIssuerId"),
		plan.ExpiresAt, plan.PlannedAt,
	).Scan(&registered)
	if err != nil {
		return err
	}
	if !registered || stringMember(runtimeAuthority, "capabilityProfileId") != stringMember(target, "capabilityProfileId") ||
		stringMember(runtimeAuthority, "capabilityProfileDigest") != stringMember(target, "capabilityProfileDigest") ||
		stringMember(runtimeAuthority, "capabilityId") != capabilityID ||
		stringMember(runtimeAuthority, "protocolFamily") != stringMember(target, "protocolFamily") ||
		stringMember(runtimeAuthority, "providerConfigurationId") != stringMember(target, "providerConfigurationId") ||
		stringMember(runtimeAuthority, "modelId") != stringMember(target, "modelId") ||
		stringMember(runtimeAuthority, "modelLineageDigest") != stringMember(target, "modelLineageDigest") {
		return conflict("evaluation optional capability runtime fact source registration is absent or drifted")
	}
	return nil
}

func evaluationPlanCapabilityProbeAdmissions(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
) ([]evaluationPlanCapabilityProbeAdmissionLink, error) {
	providers := make(map[string]map[string]any)
	rawProviders, ok := plan.Value["providerConfigurations"].([]any)
	if !ok {
		return nil, ErrInvalid
	}
	for _, raw := range rawProviders {
		provider, ok := raw.(map[string]any)
		if !ok {
			return nil, ErrInvalid
		}
		providers[stringMember(provider, "providerConfigurationId")] = provider
	}
	models := make(map[string]map[string]any)
	rawModels, ok := plan.Value["modelConfigurations"].([]any)
	if !ok {
		return nil, ErrInvalid
	}
	for _, raw := range rawModels {
		model, ok := raw.(map[string]any)
		if !ok {
			return nil, ErrInvalid
		}
		models[stringMember(model, "lineageDigest")] = model
	}
	rawTargets, ok := plan.Value["capabilityQualificationTargets"].([]any)
	if !ok {
		return nil, ErrInvalid
	}
	links := make([]evaluationPlanCapabilityProbeAdmissionLink, 0, len(rawTargets))
	for _, raw := range rawTargets {
		target, ok := raw.(map[string]any)
		if !ok {
			return nil, ErrInvalid
		}
		optionalAuthority, optional := objectMember(target, "optionalCapabilitySupportAuthority")
		if !optional {
			continue
		}
		evidence, evidenceOK := objectMember(optionalAuthority, "probeEvidence")
		receipt, receiptOK := objectMember(evidence, "receipt")
		provider := providers[stringMember(target, "providerConfigurationId")]
		model := models[stringMember(target, "modelLineageDigest")]
		if !evidenceOK || !receiptOK || provider == nil || model == nil {
			return nil, ErrConflict
		}
		adapter, adapterOK := objectMember(provider, "adapter")
		if !adapterOK {
			return nil, ErrConflict
		}
		declaredDigest, err := canonicaljson.Digest(optionalAuthority["declaredCapabilityProfileDigests"])
		if err != nil {
			return nil, err
		}
		evidenceDigest := stringMember(evidence, "evidenceDigest")
		var requestDigest, providerID, providerDigest, protocol, modelID, modelDigest string
		var profileID, profileDigest, capabilityID, storedDeclaredDigest, adapterDigest string
		var ownerImplementationDigest, authorityIssuerID, probeReceiptDigest, probeStatus string
		var ownerAdmissionDigest, stageDigest, dispatchAckDigest, referenceReceiptSetDigest string
		var admissionReceiptDigest, responseDigest string
		var observedProfile sql.NullString
		var probedAt, expiresAt time.Time
		var requestBytes, responseBytes, referenceBundleBytes []byte
		err = tx.QueryRowContext(ctx, `SELECT
			request_digest, provider_configuration_id, provider_configuration_digest, protocol_family,
			model_id, model_lineage_digest, qualification_capability_profile_id,
			qualification_capability_profile_digest, capability_id,
			declared_capability_profile_set_digest, adapter_digest, owner_implementation_digest,
			authority_issuer_id, probe_receipt_digest, probe_status, observed_profile_digest,
			probed_at, expires_at, request_bytes, response_bytes,
			owner_admission_digest, stage_digest, dispatch_ack_digest,
			reference_receipt_set_digest, admission_receipt_digest, response_digest,
			reference_bundle_bytes
		FROM agent_evaluation_capability_probe_admissions
		WHERE namespace_id=$1 AND repository_commit=$2 AND evidence_digest=$3 AND state='sealed'
		FOR SHARE`, authority.NamespaceID, plan.RepositoryCommit, evidenceDigest).Scan(
			&requestDigest, &providerID, &providerDigest, &protocol, &modelID, &modelDigest,
			&profileID, &profileDigest, &capabilityID, &storedDeclaredDigest, &adapterDigest,
			&ownerImplementationDigest, &authorityIssuerID, &probeReceiptDigest, &probeStatus,
			&observedProfile, &probedAt, &expiresAt, &requestBytes, &responseBytes,
			&ownerAdmissionDigest, &stageDigest, &dispatchAckDigest, &referenceReceiptSetDigest,
			&admissionReceiptDigest, &responseDigest, &referenceBundleBytes,
		)
		if errors.Is(err, sql.ErrNoRows) {
			return nil, conflict("evaluation optional capability probe has no sealed production admission")
		}
		if err != nil {
			return nil, err
		}
		probeRequest, err := decodeEvaluationCapabilityProbeAdmissionRequest(requestBytes, authority)
		if err != nil || probeRequest.RequestDigest != requestDigest ||
			providerID != stringMember(target, "providerConfigurationId") ||
			providerDigest != stringMember(target, "providerIdentityDigest") ||
			protocol != stringMember(target, "protocolFamily") ||
			modelID != stringMember(target, "modelId") || modelDigest != stringMember(target, "modelLineageDigest") ||
			profileID != stringMember(optionalAuthority, "qualificationCapabilityProfileId") ||
			profileDigest != stringMember(optionalAuthority, "qualificationCapabilityProfileDigest") ||
			capabilityID != stringMember(optionalAuthority, "capabilityId") ||
			storedDeclaredDigest != declaredDigest || adapterDigest != stringMember(adapter, "adapterDigest") ||
			ownerImplementationDigest != stringMember(evidence, "ownerImplementationDigest") ||
			authorityIssuerID != stringMember(evidence, "authorityIssuerId") ||
			probeReceiptDigest != stringMember(receipt, "receiptDigest") ||
			probeStatus != stringMember(receipt, "status") ||
			probeRequest.MinimumExpiresAt.Before(plan.ExpiresAt) ||
			!sameEvaluationCanonicalValue(probeRequest.ProviderConfiguration, provider) ||
			!sameEvaluationCanonicalValue(probeRequest.ModelLineage, model) ||
			!sameEvaluationCanonicalValue(probeRequest.Value["declaredCapabilityProfileDigests"], optionalAuthority["declaredCapabilityProfileDigests"]) ||
			probedAt.After(plan.PlannedAt) || expiresAt.Before(plan.ExpiresAt) {
			return nil, conflict("evaluation optional capability probe admission drifted from the plan target")
		}
		response, err := decodeCanonicalEvaluationObject(responseBytes, maximumEvaluationCapabilityProbeResponseBytes)
		responseEvidence, responseEvidenceOK := objectMember(response, "probeEvidence")
		if err != nil || !responseEvidenceOK || !sameEvaluationCanonicalValue(responseEvidence, evidence) ||
			stringMember(response, "ownerAdmissionDigest") != ownerAdmissionDigest {
			return nil, conflict("evaluation optional capability probe response drifted from the plan evidence")
		}
		evidenceBytes, err := canonicaljson.Bytes(evidence)
		if err != nil {
			return nil, err
		}
		sealed, err := evaluationCapabilityProbeEvidence(
			probeRequest, ownerImplementationDigest, stageDigest,
			EvaluationCapabilityProbeAdmissionAuthorityResult{
				ProbeEvidence: evidenceBytes, OwnerAdmissionDigest: ownerAdmissionDigest,
			},
			referenceBundleBytes,
			plan.PlannedAt,
		)
		if err != nil || sealed.DispatchAckDigest != dispatchAckDigest ||
			sealed.ReferenceReceiptSetDigest != referenceReceiptSetDigest ||
			sealed.EvidenceDigest != evidenceDigest || sealed.ProbeReceiptDigest != probeReceiptDigest ||
			sealed.ProbeStatus != probeStatus || sealed.ObservedProfileDigest != observedProfile.String ||
			!sealed.ProbedAt.Equal(probedAt) || !sealed.ExpiresAt.Equal(expiresAt) ||
			sealed.AdmissionReceiptDigest != admissionReceiptDigest || sealed.ResponseDigest != responseDigest ||
			!bytes.Equal(sealed.ResponseBytes, responseBytes) ||
			!bytes.Equal(sealed.ReferenceBundleBytes, referenceBundleBytes) {
			return nil, conflict("evaluation optional capability probe admission commitments drifted")
		}
		if err := requireEvaluationCapabilityProbeReferenceReceipts(
			ctx, tx, authority, probeRequest, referenceBundleBytes,
		); err != nil {
			return nil, err
		}
		if err := requireEvaluationPlanProbeProviderResourceAuthority(
			ctx, tx, authority, plan, target, optionalAuthority, probeRequest,
		); err != nil {
			return nil, err
		}
		supportExpectation := stringMember(optionalAuthority, "supportExpectation")
		if probeStatus == "supported" {
			if supportExpectation != "required" || !observedProfile.Valid ||
				observedProfile.String != profileDigest {
				return nil, conflict("evaluation supported capability probe admission drifted from required support")
			}
		} else if probeStatus == "unsupported" {
			if supportExpectation != "expected-blocked" || observedProfile.Valid {
				return nil, conflict("evaluation unsupported capability probe admission drifted from blocked support")
			}
		} else {
			return nil, ErrConflict
		}
		if err := requireEvaluationPlanRuntimeFactSourceRegistration(
			ctx, tx, authority, plan, target, optionalAuthority,
		); err != nil {
			return nil, err
		}
		links = append(links, evaluationPlanCapabilityProbeAdmissionLink{
			TargetID: stringMember(target, "targetId"), TargetDigest: stringMember(target, "targetDigest"),
			AuthorityDigest: stringMember(optionalAuthority, "authorityDigest"),
			EvidenceDigest:  evidenceDigest, RequestDigest: requestDigest,
		})
	}
	if len(links) == 0 {
		return nil, conflict("evaluation plan has no sealed optional capability probe admissions")
	}
	return links, nil
}

func storeEvaluationPlanCapabilityProbeAdmissionLinks(
	ctx context.Context,
	tx *sql.Tx,
	authority EvaluationAuthority,
	plan evaluationPlanFact,
	links []evaluationPlanCapabilityProbeAdmissionLink,
) error {
	for _, link := range links {
		result, err := tx.ExecContext(ctx, `INSERT INTO agent_evaluation_plan_capability_probe_admission_links (
			namespace_id, plan_digest, repository_commit, target_id, target_digest,
			authority_digest, evidence_digest, request_digest, created_at
		) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT DO NOTHING`,
			authority.NamespaceID, plan.PlanDigest, plan.RepositoryCommit, link.TargetID, link.TargetDigest,
			link.AuthorityDigest, link.EvidenceDigest, link.RequestDigest, plan.PlannedAt)
		if err != nil {
			return err
		}
		inserted, err := result.RowsAffected()
		if err != nil {
			return err
		}
		if inserted != 1 {
			return conflict("evaluation capability probe admission link already exists with another authority")
		}
	}
	return nil
}
