package agent

import (
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

var evaluationCapabilityProbeReferenceSourceFormats = [...]string{
	"prodivix.agent-evaluation-capability-probe-provider-request-source-receipt",
	"prodivix.agent-evaluation-capability-probe-provider-response-source-receipt",
	"prodivix.agent-evaluation-capability-probe-dispatch-source-receipt",
	"prodivix.agent-evaluation-capability-probe-transport-source-receipt",
	"prodivix.agent-evaluation-capability-probe-encrypted-response-spool-source-receipt",
	"prodivix.agent-evaluation-capability-probe-normalized-event-set-source-receipt",
}

var evaluationCapabilityProbeReferenceSourceCommonKeys = []string{
	"format", "version", "admissionRequestDigest", "probeProgramDigest", "profileProjectionDigest",
	"providerConfigurationDigest", "modelLineageDigest", "adapterDigest", "ownerImplementationDigest",
	"authorityIssuerId", "observedAt",
}

func evaluationCapabilityProbeProgramPhases(request evaluationCapabilityProbeAdmissionRequest) ([]string, error) {
	intent, ok := objectMember(request.ProbeProgram, "providerRequestIntent")
	raw, phasesOK := intent["requestPhases"].([]any)
	if !ok || !phasesOK || len(raw) == 0 || len(raw) > 16 {
		return nil, ErrInvalid
	}
	phases := make([]string, len(raw))
	for index, value := range raw {
		phase, phaseOK := value.(string)
		if !phaseOK || !validEvaluationAgentControlIdentity(phase) ||
			(index > 0 && phases[index-1] == phase) {
			return nil, ErrInvalid
		}
		phases[index] = phase
	}
	return phases, nil
}

func evaluationCapabilityProbeNetworkRoundTripPhase(
	request evaluationCapabilityProbeAdmissionRequest,
	sequence int64,
) (string, bool) {
	phases, err := evaluationCapabilityProbeProgramPhases(request)
	intent, intentOK := objectMember(request.ProbeProgram, "providerRequestIntent")
	policy, policyOK := objectMember(intent, "networkRoundTripPolicy")
	maximum, maximumOK := evaluationCapabilityProbeNonnegativeInteger(policy["maximumRoundTrips"])
	if err != nil || !intentOK || !policyOK || !maximumOK || sequence < 0 || sequence >= maximum ||
		maximum != request.Program.MaximumProviderRoundTrips {
		return "", false
	}
	if stringMember(policy, "mode") == "repeat-until-terminal" {
		if len(phases) != 2 || stringMember(policy, "repeatedPhase") != phases[1] {
			return "", false
		}
		if sequence == 0 {
			return phases[0], true
		}
		return phases[1], true
	}
	if stringMember(policy, "mode") != "fixed" || int64(len(phases)) != maximum {
		return "", false
	}
	return phases[sequence], true
}

func evaluationCapabilityProbeSourceKeys(specific ...string) []string {
	keys := append([]string(nil), evaluationCapabilityProbeReferenceSourceCommonKeys...)
	return append(keys, specific...)
}

func evaluationCapabilityProbeSourceArray(
	source map[string]any,
	field string,
	request evaluationCapabilityProbeAdmissionRequest,
	exactKeys []string,
) ([]map[string]any, error) {
	raw, ok := source[field].([]any)
	if !ok || len(raw) == 0 || int64(len(raw)) > request.Program.MaximumProviderRoundTrips {
		return nil, conflict("evaluation capability probe network row cardinality drifted")
	}
	result := make([]map[string]any, len(raw))
	for index, value := range raw {
		entry, entryOK := value.(map[string]any)
		sequence, sequenceOK := evaluationCapabilityProbeNonnegativeInteger(entry["sequence"])
		expectedPhase, expectedOK := evaluationCapabilityProbeNetworkRoundTripPhase(request, int64(index))
		if !entryOK || !exactEvaluationKeys(entry, exactKeys) || !sequenceOK || sequence != int64(index) ||
			!expectedOK || stringMember(entry, "phase") != expectedPhase {
			return nil, conflict("evaluation capability probe network row phase or sequence drifted")
		}
		result[index] = entry
	}
	return result, nil
}

func validateEvaluationCapabilityProbeNetworkRoundTripSequence(
	request evaluationCapabilityProbeAdmissionRequest,
	entries []map[string]any,
) error {
	intent, intentOK := objectMember(request.ProbeProgram, "providerRequestIntent")
	policy, policyOK := objectMember(intent, "networkRoundTripPolicy")
	mode := stringMember(policy, "mode")
	if !intentOK || !policyOK || len(entries) == 0 ||
		int64(len(entries)) > request.Program.MaximumProviderRoundTrips {
		return ErrConflict
	}
	for index, entry := range entries {
		terminal, terminalOK := entry["programTerminal"].(bool)
		outcome := stringMember(entry, "outcome")
		expectedPhase, phaseOK := evaluationCapabilityProbeNetworkRoundTripPhase(request, int64(index))
		if !terminalOK || !phaseOK || stringMember(entry, "phase") != expectedPhase ||
			(index < len(entries)-1 && terminal) {
			return ErrConflict
		}
		completed := outcome == "completed"
		if mode == "fixed" {
			expectedTerminal := !completed || int64(index) == request.Program.MaximumProviderRoundTrips-1
			if entry["providerJobStatus"] != nil || terminal != expectedTerminal {
				return ErrConflict
			}
			continue
		}
		status, statusOK := entry["providerJobStatus"].(string)
		if mode != "repeat-until-terminal" || !statusOK ||
			!oneOfString(status, "queued", "in-progress", "completed", "failed", "cancelled") {
			return ErrConflict
		}
		expectedTerminal := !completed || oneOfString(status, "completed", "failed", "cancelled")
		if terminal != expectedTerminal {
			return ErrConflict
		}
	}
	if terminal, _ := entries[len(entries)-1]["programTerminal"].(bool); !terminal {
		return ErrConflict
	}
	return nil
}

func validateEvaluationCapabilityProbeTypedSourceReceipt(
	source map[string]any,
	ordinal int,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
	authorityIssuerID string,
	outerObservedAt time.Time,
) error {
	if ordinal < 0 || ordinal >= len(evaluationCapabilityProbeReferenceSourceFormats) ||
		stringMember(source, "format") != evaluationCapabilityProbeReferenceSourceFormats[ordinal] ||
		stringMember(source, "admissionRequestDigest") != request.RequestDigest ||
		stringMember(source, "probeProgramDigest") != request.ProbeProgramDigest ||
		stringMember(source, "profileProjectionDigest") != request.ProfileProjectionDigest ||
		stringMember(source, "providerConfigurationDigest") != request.ProviderConfigurationDigest ||
		stringMember(source, "modelLineageDigest") != request.ModelLineageDigest ||
		stringMember(source, "adapterDigest") != request.AdapterDigest ||
		stringMember(source, "ownerImplementationDigest") != ownerImplementationDigest ||
		stringMember(source, "authorityIssuerId") != authorityIssuerID ||
		!validEvaluationAgentControlIdentity(authorityIssuerID) ||
		agentcontract.ValidateSanitizedAgentPayload(source) != nil {
		return conflict("evaluation capability probe source authority binding or sanitizer drifted")
	}
	version, versionOK := integerMember(source, "version")
	observedAt, observedErr := parseEvaluationServiceInstant(stringMember(source, "observedAt"))
	if !versionOK || version != 1 || observedErr != nil || !observedAt.Equal(outerObservedAt) {
		return conflict("evaluation capability probe source version or instant drifted")
	}
	intent, _ := objectMember(request.ProbeProgram, "providerRequestIntent")
	switch ordinal {
	case 0:
		if !exactEvaluationKeys(source, evaluationCapabilityProbeSourceKeys(
			"phaseRequests", "requestPhaseSetDigest", "publicProbeResourceDescriptorDigest",
		)) {
			return ErrInvalid
		}
		entries, err := evaluationCapabilityProbeSourceArray(source, "phaseRequests", request,
			[]string{"phase", "sequence", "requestDigest", "requestBytes"})
		if err != nil {
			return err
		}
		for _, entry := range entries {
			count, countOK := integerMember(entry, "requestBytes")
			if !evaluationDigestPattern.MatchString(stringMember(entry, "requestDigest")) || !countOK || count < 1 ||
				count > 16_777_216 {
				return ErrConflict
			}
		}
		root, err := canonicaljson.Digest(map[string]any{"phaseRequests": source["phaseRequests"]})
		resource := intent["publicProbeResource"]
		expectedResourceDigest := any(nil)
		if descriptor, ok := resource.(map[string]any); ok {
			expectedResourceDigest = descriptor["descriptorDigest"]
		}
		if err != nil || root != stringMember(source, "requestPhaseSetDigest") ||
			!sameEvaluationCanonicalValue(source["publicProbeResourceDescriptorDigest"], expectedResourceDigest) {
			return ErrConflict
		}
	case 1:
		if !exactEvaluationKeys(source, evaluationCapabilityProbeSourceKeys(
			"phaseResponses", "responsePhaseSetDigest", "terminalResponseDigest",
		)) {
			return ErrInvalid
		}
		entries, err := evaluationCapabilityProbeSourceArray(source, "phaseResponses", request,
			[]string{"phase", "sequence", "requestDigest", "responseDigest", "responseBytes", "outcome", "programTerminal", "providerJobStatus", "completedAt"})
		if err != nil {
			return err
		}
		for _, entry := range entries {
			count, countOK := integerMember(entry, "responseBytes")
			completedAt, completedErr := parseEvaluationServiceInstant(stringMember(entry, "completedAt"))
			if !evaluationDigestPattern.MatchString(stringMember(entry, "requestDigest")) ||
				!evaluationDigestPattern.MatchString(stringMember(entry, "responseDigest")) || !countOK || count < 1 ||
				count > 16_777_216 || !oneOfString(stringMember(entry, "outcome"), "completed", "refused", "failed", "timed-out") ||
				completedErr != nil || completedAt.After(observedAt) {
				return ErrConflict
			}
		}
		if err := validateEvaluationCapabilityProbeNetworkRoundTripSequence(request, entries); err != nil {
			return err
		}
		root, err := canonicaljson.Digest(map[string]any{"phaseResponses": source["phaseResponses"]})
		if err != nil || root != stringMember(source, "responsePhaseSetDigest") ||
			stringMember(source, "terminalResponseDigest") != stringMember(entries[len(entries)-1], "responseDigest") {
			return ErrConflict
		}
	case 2:
		if !exactEvaluationKeys(source, evaluationCapabilityProbeSourceKeys("dispatchIntents", "dispatchIntentSetDigest")) {
			return ErrInvalid
		}
		entries, err := evaluationCapabilityProbeSourceArray(source, "dispatchIntents", request,
			[]string{"phase", "sequence", "requestDigest", "dispatchIntentDigest", "dispatchedAt"})
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if !evaluationDigestPattern.MatchString(stringMember(entry, "requestDigest")) ||
				!evaluationDigestPattern.MatchString(stringMember(entry, "dispatchIntentDigest")) {
				return ErrConflict
			}
			if _, err := parseEvaluationServiceInstant(stringMember(entry, "dispatchedAt")); err != nil {
				return ErrConflict
			}
		}
		root, err := canonicaljson.Digest(map[string]any{"dispatchIntents": source["dispatchIntents"]})
		if err != nil || root != stringMember(source, "dispatchIntentSetDigest") {
			return ErrConflict
		}
	case 3:
		if !exactEvaluationKeys(source, evaluationCapabilityProbeSourceKeys("transportReceipts", "transportReceiptSetDigest")) {
			return ErrInvalid
		}
		entries, err := evaluationCapabilityProbeSourceArray(source, "transportReceipts", request,
			[]string{"phase", "sequence", "dispatchIntentDigest", "transportReceiptDigest", "outcome", "responseDigest", "completedAt"})
		if err != nil {
			return err
		}
		for _, entry := range entries {
			if !evaluationDigestPattern.MatchString(stringMember(entry, "dispatchIntentDigest")) ||
				!evaluationDigestPattern.MatchString(stringMember(entry, "transportReceiptDigest")) ||
				!evaluationDigestPattern.MatchString(stringMember(entry, "responseDigest")) ||
				!oneOfString(stringMember(entry, "outcome"), "completed", "refused", "failed", "timed-out") {
				return ErrConflict
			}
			if _, err := parseEvaluationServiceInstant(stringMember(entry, "completedAt")); err != nil {
				return ErrConflict
			}
		}
		root, err := canonicaljson.Digest(map[string]any{"transportReceipts": source["transportReceipts"]})
		if err != nil || root != stringMember(source, "transportReceiptSetDigest") {
			return ErrConflict
		}
	case 4:
		if !exactEvaluationKeys(source, evaluationCapabilityProbeSourceKeys(
			"encryptionPolicyDigest", "spoolReceipts", "spoolReceiptSetDigest",
		)) || !evaluationDigestPattern.MatchString(stringMember(source, "encryptionPolicyDigest")) {
			return ErrInvalid
		}
		entries, err := evaluationCapabilityProbeSourceArray(source, "spoolReceipts", request, []string{
			"phase", "sequence", "transportReceiptDigest", "responseDigest", "spoolRef", "envelopeDigest",
			"ciphertextDigest", "ciphertextByteLength", "aadDigest", "encryptionProfileDigest", "keyRefDigest", "spoolReceiptDigest",
		})
		if err != nil {
			return err
		}
		for _, entry := range entries {
			byteLength, bytesOK := integerMember(entry, "ciphertextByteLength")
			if !validEvaluationAgentControlIdentity(stringMember(entry, "spoolRef")) || !bytesOK || byteLength < 1 ||
				byteLength > 16_777_216 {
				return ErrConflict
			}
			for _, field := range []string{
				"transportReceiptDigest", "responseDigest", "envelopeDigest", "ciphertextDigest", "aadDigest",
				"encryptionProfileDigest", "keyRefDigest", "spoolReceiptDigest",
			} {
				if !evaluationDigestPattern.MatchString(stringMember(entry, field)) {
					return ErrConflict
				}
			}
			base := cloneEvaluationObject(entry)
			delete(base, "spoolReceiptDigest")
			digest, err := canonicaljson.Digest(base)
			if err != nil || digest != stringMember(entry, "spoolReceiptDigest") {
				return ErrConflict
			}
		}
		root, err := canonicaljson.Digest(map[string]any{"spoolReceipts": source["spoolReceipts"]})
		if err != nil || root != stringMember(source, "spoolReceiptSetDigest") {
			return ErrConflict
		}
	case 5:
		if !exactEvaluationKeys(source, evaluationCapabilityProbeSourceKeys(
			"normalizedObservationProjection", "normalizedObservationProjectionDigest", "normalizerImplementationDigest",
			"semanticProofPhaseLeaves", "semanticProofPhaseLeavesDigest",
		)) || !evaluationDigestPattern.MatchString(stringMember(source, "normalizerImplementationDigest")) {
			return ErrInvalid
		}
		projection, ok := objectMember(source, "normalizedObservationProjection")
		if !ok || !exactEvaluationKeys(projection, []string{
			"format", "version", "observationSource", "probeProgramDigest", "profileProjectionDigest",
			"providerConfigurationDigest", "modelLineageDigest", "adapterDigest", "probeRequestDigest",
			"providerResponseDigest", "status", "observedFacts", "semanticProof", "denial", "observedLimits",
			"observedLimitDigest", "observedAt",
		}) {
			return ErrConflict
		}
		digest, err := canonicaljson.Digest(projection)
		if err != nil || digest != stringMember(source, "normalizedObservationProjectionDigest") ||
			stringMember(projection, "observedAt") != stringMember(source, "observedAt") {
			return ErrConflict
		}
		proof, proofOK := objectMember(projection, "semanticProof")
		phaseLeaves, leavesOK := objectMember(source, "semanticProofPhaseLeaves")
		if !proofOK {
			if source["semanticProofPhaseLeaves"] != nil || source["semanticProofPhaseLeavesDigest"] != nil {
				return ErrConflict
			}
			break
		}
		expectedLeaves, err := evaluationCapabilityProbeSemanticProofPhaseLeaves(
			request.Program, proof,
		)
		if err != nil || !leavesOK || !sameEvaluationCanonicalValue(expectedLeaves, phaseLeaves) ||
			stringMember(source, "semanticProofPhaseLeavesDigest") != stringMember(expectedLeaves, "projectionDigest") {
			return ErrConflict
		}
	}
	return nil
}

func evaluationCapabilityProbeSemanticProofPhaseLeaves(
	program evaluationCapabilityProbeProgram,
	proof map[string]any,
) (map[string]any, error) {
	proofKind := stringMember(proof, "proofKind")
	requestPhaseDigests := []any{}
	responsePhaseDigests := []any{}
	appendDigest := func(target *[]any, phase, digest string) error {
		if !evaluationDigestPattern.MatchString(digest) {
			return ErrInvalid
		}
		*target = append(*target, map[string]any{"phase": phase, "digest": digest})
		return nil
	}
	switch proofKind {
	case "background-job-lifecycle":
		if err := appendDigest(&requestPhaseDigests, "submit-request", stringMember(proof, "submitRequestDigest")); err != nil {
			return nil, err
		}
		if err := appendDigest(&responsePhaseDigests, "poll-response", stringMember(proof, "pollResponseDigest")); err != nil {
			return nil, err
		}
		if err := appendDigest(&responsePhaseDigests, "terminal-response", stringMember(proof, "terminalResponseDigest")); err != nil {
			return nil, err
		}
	case "hosted-retrieval-public-document", "hosted-retrieval-public-text", "parallel-tool-call-set":
		if err := appendDigest(&responsePhaseDigests, "provider-response", stringMember(proof, "providerResponseDigest")); err != nil {
			return nil, err
		}
	case "isolated-cache-roundtrip":
		if err := appendDigest(&responsePhaseDigests, "cold-response", stringMember(proof, "coldResponseDigest")); err != nil {
			return nil, err
		}
		if err := appendDigest(&responsePhaseDigests, "warm-response", stringMember(proof, "warmResponseDigest")); err != nil {
			return nil, err
		}
	case "opaque-continuation-roundtrip":
		if err := appendDigest(&requestPhaseDigests, "resume-request", stringMember(proof, "resumeRequestDigest")); err != nil {
			return nil, err
		}
		if err := appendDigest(&responsePhaseDigests, "parent-response", stringMember(proof, "parentResponseDigest")); err != nil {
			return nil, err
		}
		if err := appendDigest(&responsePhaseDigests, "resume-response", stringMember(proof, "resumeResponseDigest")); err != nil {
			return nil, err
		}
	default:
		return nil, ErrInvalid
	}
	phaseLeafSetDigest, err := canonicaljson.Digest(map[string]any{
		"requestPhaseDigests": requestPhaseDigests, "responsePhaseDigests": responsePhaseDigests,
	})
	if err != nil {
		return nil, err
	}
	base := map[string]any{
		"format": "prodivix.agent-capability-probe-semantic-proof-phase-leaf-projection", "version": int64(1),
		"probeProgramDigest": program.ProgramDigest, "proofKind": proofKind,
		"proofDigest": stringMember(proof, "proofDigest"), "requestPhaseDigests": requestPhaseDigests,
		"responsePhaseDigests": responsePhaseDigests, "phaseLeafSetDigest": phaseLeafSetDigest,
	}
	projectionDigest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	result := cloneEvaluationObject(base)
	result["projectionDigest"] = projectionDigest
	return result, nil
}

func evaluationCapabilityProbePhaseEntries(source map[string]any, field string) []map[string]any {
	raw, _ := source[field].([]any)
	result := make([]map[string]any, len(raw))
	for index := range raw {
		result[index], _ = raw[index].(map[string]any)
	}
	return result
}

func validateEvaluationCapabilityProbeTypedReferenceBundle(
	entries []any,
	evidence map[string]any,
	request evaluationCapabilityProbeAdmissionRequest,
	ownerImplementationDigest string,
) error {
	if len(entries) != len(evaluationCapabilityProbeReferenceKinds) {
		return conflict("evaluation capability probe typed reference count drifted")
	}
	sources := make([]map[string]any, len(entries))
	receipts := make([]map[string]any, len(entries))
	for index, raw := range entries {
		entry, entryOK := raw.(map[string]any)
		receipt, receiptOK := objectMember(entry, "receipt")
		source, sourceOK := objectMember(receipt, "sourceReceipt")
		observedAt, observedErr := parseEvaluationServiceInstant(stringMember(receipt, "observedAt"))
		if !entryOK || !receiptOK || !sourceOK || observedErr != nil ||
			validateEvaluationCapabilityProbeTypedSourceReceipt(
				source, index, request, ownerImplementationDigest, stringMember(receipt, "authorityIssuerId"), observedAt,
			) != nil {
			return conflict("evaluation capability probe typed source receipt drifted")
		}
		sources[index], receipts[index] = source, receipt
	}
	requests := evaluationCapabilityProbePhaseEntries(sources[0], "phaseRequests")
	responses := evaluationCapabilityProbePhaseEntries(sources[1], "phaseResponses")
	dispatches := evaluationCapabilityProbePhaseEntries(sources[2], "dispatchIntents")
	transports := evaluationCapabilityProbePhaseEntries(sources[3], "transportReceipts")
	spools := evaluationCapabilityProbePhaseEntries(sources[4], "spoolReceipts")
	if len(requests) == 0 || len(requests) != len(responses) || len(requests) != len(dispatches) ||
		len(requests) != len(transports) || len(requests) != len(spools) {
		return conflict("evaluation capability probe typed phase cardinality drifted")
	}
	var totalRequestBytes, totalResponseBytes, maximumDispatchMS int64
	var firstDispatch, lastCompletion time.Time
	pollCount := int64(0)
	for index := range requests {
		requestBytes, _ := integerMember(requests[index], "requestBytes")
		responseBytes, _ := integerMember(responses[index], "responseBytes")
		dispatchedAt, _ := parseEvaluationServiceInstant(stringMember(dispatches[index], "dispatchedAt"))
		completedAt, _ := parseEvaluationServiceInstant(stringMember(transports[index], "completedAt"))
		duration := completedAt.Sub(dispatchedAt).Milliseconds()
		if duration < 0 || stringMember(requests[index], "requestDigest") != stringMember(responses[index], "requestDigest") ||
			stringMember(requests[index], "requestDigest") != stringMember(dispatches[index], "requestDigest") ||
			stringMember(dispatches[index], "dispatchIntentDigest") != stringMember(transports[index], "dispatchIntentDigest") ||
			stringMember(transports[index], "transportReceiptDigest") != stringMember(spools[index], "transportReceiptDigest") ||
			stringMember(responses[index], "responseDigest") != stringMember(transports[index], "responseDigest") ||
			stringMember(responses[index], "responseDigest") != stringMember(spools[index], "responseDigest") ||
			stringMember(responses[index], "outcome") != stringMember(transports[index], "outcome") {
			return conflict("evaluation capability probe typed phase chain drifted")
		}
		totalRequestBytes += requestBytes
		totalResponseBytes += responseBytes
		if duration > maximumDispatchMS {
			maximumDispatchMS = duration
		}
		if index == 0 || dispatchedAt.Before(firstDispatch) {
			firstDispatch = dispatchedAt
		}
		if index == 0 || completedAt.After(lastCompletion) {
			lastCompletion = completedAt
		}
		if stringMember(requests[index], "phase") == "poll" {
			pollCount++
		}
	}
	projection, _ := objectMember(sources[5], "normalizedObservationProjection")
	if stringMember(projection, "probeRequestDigest") != stringMember(receipts[0], "sourceReceiptDigest") &&
		stringMember(projection, "probeRequestDigest") != stringMember(entries[0].(map[string]any), "receiptDigest") {
		return conflict("evaluation capability probe normalized request root drifted")
	}
	// Canonical production evidence binds the final observation to the outer
	// request/response reference receipts, while the inner phase roots remain
	// independently available for semantic proof joins.
	if stringMember(projection, "probeRequestDigest") != stringMember(entries[0].(map[string]any), "receiptDigest") ||
		stringMember(projection, "providerResponseDigest") != stringMember(entries[1].(map[string]any), "receiptDigest") {
		return conflict("evaluation capability probe normalized outer roots drifted")
	}
	if proof, ok := objectMember(projection, "semanticProof"); ok {
		phaseLeaves, leavesOK := objectMember(sources[5], "semanticProofPhaseLeaves")
		expectedLeaves, leavesErr := evaluationCapabilityProbeSemanticProofPhaseLeaves(request.Program, proof)
		if leavesErr != nil || !leavesOK || !sameEvaluationCanonicalValue(expectedLeaves, phaseLeaves) {
			return conflict("evaluation capability probe semantic proof phase leaves drifted")
		}
		requestLeaves, _ := phaseLeaves["requestPhaseDigests"].([]any)
		responseLeaves, _ := phaseLeaves["responsePhaseDigests"].([]any)
		for _, rawLeaf := range requestLeaves {
			leaf, leafOK := rawLeaf.(map[string]any)
			matched := false
			for _, phase := range requests {
				matched = matched || stringMember(phase, "requestDigest") == stringMember(leaf, "digest")
			}
			if !leafOK || !matched {
				return conflict("evaluation capability probe semantic proof request leaf lacks raw authority")
			}
		}
		for _, rawLeaf := range responseLeaves {
			leaf, leafOK := rawLeaf.(map[string]any)
			matched := false
			for _, phase := range responses {
				matched = matched || stringMember(phase, "responseDigest") == stringMember(leaf, "digest")
			}
			if !leafOK || !matched {
				return conflict("evaluation capability probe semantic proof response leaf lacks raw authority")
			}
		}
	} else if sources[5]["semanticProofPhaseLeaves"] != nil || sources[5]["semanticProofPhaseLeavesDigest"] != nil {
		return conflict("evaluation capability probe denial carried semantic proof phase leaves")
	}
	finalBase := cloneEvaluationObject(projection)
	finalBase["normalizedEventSetDigest"] = stringMember(entries[5].(map[string]any), "receiptDigest")
	observationDigest, err := canonicaljson.Digest(finalBase)
	if err != nil {
		return err
	}
	final := cloneEvaluationObject(finalBase)
	final["observationDigest"] = observationDigest
	observation, ok := objectMember(evidence, "normalizedObservation")
	if !ok || !sameEvaluationCanonicalValue(final, observation) {
		return conflict("evaluation capability probe normalized source projection drifted: computed=" +
			observationDigest + " actual=" + stringMember(observation, "observationDigest"))
	}
	limits, limitsOK := objectMember(projection, "observedLimits")
	facts, factsOK := projection["observedFacts"].([]any)
	if !limitsOK || !factsOK {
		return conflict("evaluation capability probe observed limits shape drifted")
	}
	toolCallCount := int64(0)
	if proof, ok := projection["semanticProof"].(map[string]any); ok {
		// The current canonical observation contract binds several proof response
		// leaves to the outer response-reference digest. The independently sealed
		// phase response digests are therefore checked through the typed phase
		// chain here; a direct proof-leaf join remains fail-closed in the external
		// verifier until the canonical proof projection is cycle-free.
		switch stringMember(proof, "proofKind") {
		case "background-job-lifecycle":
		case "hosted-retrieval-public-document", "hosted-retrieval-public-text", "parallel-tool-call-set":
			if tools, ok := proof["toolCalls"].([]any); ok {
				toolCallCount = int64(len(tools))
			}
		case "isolated-cache-roundtrip":
		case "opaque-continuation-roundtrip":
		default:
			return conflict("evaluation capability probe semantic proof kind drifted")
		}
	}
	observedDurationMS := lastCompletion.Sub(firstDispatch).Milliseconds()
	if requestCount, ok := integerMember(limits, "requestBytes"); !ok || requestCount != totalRequestBytes {
		return conflict("evaluation capability probe observed request bytes drifted")
	}
	if responseCount, ok := integerMember(limits, "responseBytes"); !ok || responseCount != totalResponseBytes {
		return conflict("evaluation capability probe observed response bytes drifted")
	}
	if factCount, ok := integerMember(limits, "normalizedFactCount"); !ok || factCount != int64(len(facts)) {
		return conflict("evaluation capability probe observed fact count drifted")
	}
	if count, ok := integerMember(limits, "toolCallCount"); !ok || count != toolCallCount {
		return conflict("evaluation capability probe observed tool count drifted")
	}
	if count, ok := integerMember(limits, "providerRoundTripCount"); !ok || count != int64(len(requests)) {
		return conflict("evaluation capability probe observed round-trip count drifted")
	}
	if count, ok := integerMember(limits, "pollAttemptCount"); !ok || count != pollCount {
		return conflict("evaluation capability probe observed poll count drifted")
	}
	if count, ok := integerMember(limits, "observedMaximumSingleDispatchMs"); !ok || count != maximumDispatchMS {
		return conflict("evaluation capability probe observed maximum dispatch drifted")
	}
	if count, ok := integerMember(limits, "observedExecutionDurationMs"); !ok || count != observedDurationMS {
		return conflict("evaluation capability probe observed execution duration drifted")
	}
	return nil
}
