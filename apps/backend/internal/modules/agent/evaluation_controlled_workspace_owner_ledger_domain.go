package agent

import (
	"encoding/json"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func evaluationControlledWorkspaceOwnerLedgerGrant(
	payload map[string]any,
	requestDigest string,
	claimedAt time.Time,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	if claimedAt.IsZero() || !evaluationDigestPattern.MatchString(requestDigest) {
		return nil, ErrInvalid
	}
	for _, record := range records {
		if record.Operation == "grant.issue" {
			return nil, ErrConflict
		}
	}
	fixture, ok := objectMember(payload, "fixture")
	if !ok || !evaluationDigestPattern.MatchString(stringMember(payload, "planDigest")) ||
		!validEvaluationAgentControlIdentity(stringMember(payload, "attemptId")) ||
		!evaluationDigestPattern.MatchString(stringMember(payload, "descriptorDigest")) ||
		!validEvaluationAgentControlIdentity(stringMember(payload, "caseId")) ||
		!evaluationDigestPattern.MatchString(stringMember(payload, "materialDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(fixture, "fixtureDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(fixture, "workspaceSnapshotDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(payload, "toolRegistryDigest")) ||
		!evaluationDigestPattern.MatchString(stringMember(payload, "actionRegistryDigest")) {
		return nil, ErrInvalid
	}
	toolIDs, err := evaluationControlledWorkspaceSortedIdentities(payload["toolIds"], false)
	if err != nil {
		return nil, err
	}
	actionIDs, err := evaluationControlledWorkspaceSortedIdentities(payload["actionIds"], true)
	if err != nil {
		return nil, err
	}
	targetRefs, err := evaluationControlledWorkspaceSortedIdentities(payload["targetRefs"], false)
	if err != nil {
		return nil, err
	}
	issuedAt := claimedAt.UTC().Truncate(time.Millisecond)
	base := map[string]any{
		"format": "prodivix.agent-evaluation-controlled-workspace-grant", "version": int64(1),
		"grantId":     "grant.controlled-workspace." + requestDigest[7:],
		"authorityId": evaluationControlledWorkspaceOwnerLedgerAuthorityID,
		"planDigest":  payload["planDigest"], "attemptId": payload["attemptId"],
		"descriptorDigest": payload["descriptorDigest"], "caseId": payload["caseId"],
		"materialDigest": payload["materialDigest"], "fixtureDigest": fixture["fixtureDigest"],
		"baseSnapshotDigest":   fixture["workspaceSnapshotDigest"],
		"toolRegistryDigest":   payload["toolRegistryDigest"],
		"actionRegistryDigest": payload["actionRegistryDigest"],
		"allowedToolIds":       evaluationControlledWorkspaceStringValues(toolIDs),
		"allowedActionIds":     evaluationControlledWorkspaceStringValues(actionIDs),
		"allowedTargetRefs":    evaluationControlledWorkspaceStringValues(targetRefs),
		"generation":           int64(1), "maximumUses": int64(4),
		"issuedAt":  evaluationExportInstant(issuedAt),
		"expiresAt": evaluationExportInstant(issuedAt.Add(evaluationControlledWorkspaceGrantLifetime)),
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	base["grantDigest"] = digest
	canonical, err := canonicaljson.Bytes(base)
	if err != nil {
		return nil, err
	}
	normalized, err := decodeCanonicalEvaluationObject(canonical, maximumEvaluationControlledAuthorityResponseBytes)
	if err != nil {
		return nil, err
	}
	if _, err := decodeEvaluationControlledWorkspaceGrant(normalized); err != nil {
		return nil, err
	}
	return base, nil
}

func validateEvaluationControlledWorkspaceOwnerOperationIntent(value map[string]any) error {
	if !exactControlledWorkspaceOperationIntent(value) ||
		stringMember(value, "format") != "prodivix.agent-evaluation-controlled-workspace-operation" ||
		!controlledWorkspaceReceiptDigestMatches(value, "intentDigest") {
		return ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	generation, generationOK := integerMember(value, "generation")
	turnIndex, turnOK := integerMember(value, "turnIndex")
	maximumCalls, callsOK := integerMember(value, "maximumToolCallsPerAttempt")
	maximumRepairs, repairsOK := integerMember(value, "maximumRepairRoundsPerAttempt")
	maximumBytes, bytesOK := integerMember(value, "maximumAggregateToolResultBytes")
	if !versionOK || version != 1 || !generationOK || generation < 1 ||
		!turnOK || turnIndex < 0 || turnIndex >= 7 || !callsOK || maximumCalls != 4 ||
		!repairsOK || maximumRepairs != 2 || !bytesOK || maximumBytes != 8_388_608 {
		return ErrInvalid
	}
	for _, key := range []string{"operationId", "idempotencyKey", "attemptId", "caseId", "toolCallId", "toolId", "sessionId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, key)) {
			return ErrInvalid
		}
	}
	for _, key := range []string{
		"planDigest", "descriptorDigest", "materialDigest", "loopPolicyDigest", "argumentsDigest",
		"grantDigest", "toolRegistryDigest", "toolDefinitionDigest", "inputSchemaDigest", "priorCheckpointDigest",
	} {
		if !evaluationDigestPattern.MatchString(stringMember(value, key)) {
			return ErrInvalid
		}
	}
	expiresAt, err := time.Parse(time.RFC3339Nano, stringMember(value, "grantExpiresAt"))
	if err != nil || expiresAt.IsZero() {
		return ErrInvalid
	}
	return nil
}

func validateEvaluationControlledWorkspaceOwnerCleanupIntent(value map[string]any) error {
	if !exactControlledWorkspaceCleanupIntent(value) ||
		stringMember(value, "format") != "prodivix.agent-evaluation-controlled-workspace-cleanup" ||
		!controlledWorkspaceReceiptDigestMatches(value, "intentDigest") {
		return ErrInvalid
	}
	version, versionOK := integerMember(value, "version")
	generation, generationOK := integerMember(value, "generation")
	if !versionOK || version != 1 || !generationOK || generation < 1 ||
		!oneOfString(stringMember(value, "reason"), "completed", "failed", "discarded", "orphaned") {
		return ErrInvalid
	}
	for _, key := range []string{"operationId", "idempotencyKey", "attemptId", "caseId", "sessionId"} {
		if !validEvaluationAgentControlIdentity(stringMember(value, key)) {
			return ErrInvalid
		}
	}
	for _, key := range []string{"planDigest", "descriptorDigest", "materialDigest", "grantDigest", "checkpointDigest"} {
		if !evaluationDigestPattern.MatchString(stringMember(value, key)) {
			return ErrInvalid
		}
	}
	return nil
}

func evaluationControlledWorkspaceOwnerLedgerGrantFor(
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
	attemptID, grantDigest string,
	generation int64,
) (evaluationControlledWorkspaceGrant, error) {
	var matched evaluationControlledWorkspaceGrant
	found := false
	for _, record := range records {
		if record.Operation != "grant.issue" {
			continue
		}
		grant, err := decodeControlledWorkspaceGrantAcknowledgement(record.ResponseBytes)
		if err != nil {
			return evaluationControlledWorkspaceGrant{}, err
		}
		if grant.AttemptID != attemptID || grant.GrantDigest != grantDigest || grant.Generation != generation {
			continue
		}
		if found {
			return evaluationControlledWorkspaceGrant{}, ErrConflict
		}
		matched, found = grant, true
	}
	if !found {
		return evaluationControlledWorkspaceGrant{}, ErrNotFound
	}
	return matched, nil
}

func evaluationControlledWorkspaceOwnerLedgerClaim(
	partition EvaluationPlanPartition,
	intent map[string]any,
	requestDigest string,
	claimedAt time.Time,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	if err := validateEvaluationControlledWorkspaceOwnerOperationIntent(intent); err != nil ||
		stringMember(intent, "planDigest") != partition.PlanDigest {
		if err != nil {
			return nil, err
		}
		return nil, ErrConflict
	}
	generation, _ := integerMember(intent, "generation")
	grant, err := evaluationControlledWorkspaceOwnerLedgerGrantFor(
		records, stringMember(intent, "attemptId"), stringMember(intent, "grantDigest"), generation,
	)
	if err != nil || claimedAt.IsZero() || !claimedAt.UTC().Before(grant.ExpiresAt) {
		if err != nil {
			return nil, err
		}
		return nil, ErrConflict
	}
	useOrdinal := int64(1)
	for _, record := range records {
		if record.Operation != "operation.claim" {
			continue
		}
		facts, err := evaluationControlledWorkspaceOwnerLedgerResponseFacts(record)
		if err != nil {
			return nil, err
		}
		for _, fact := range facts {
			claim, ok := objectMember(fact, "claim")
			if !ok || stringMember(claim, "attemptId") != stringMember(intent, "attemptId") ||
				stringMember(claim, "grantDigest") != stringMember(intent, "grantDigest") {
				continue
			}
			if stringMember(claim, "intentDigest") == stringMember(intent, "intentDigest") {
				return nil, ErrConflict
			}
			useOrdinal++
		}
	}
	if useOrdinal > grant.MaximumUses {
		return map[string]any{"status": "denied"}, nil
	}
	claimBase := map[string]any{
		"claimId": "claim.controlled." + requestDigest[7:], "intentDigest": intent["intentDigest"],
		"operationId": intent["operationId"], "planDigest": intent["planDigest"],
		"attemptId": intent["attemptId"], "sessionId": intent["sessionId"],
		"grantDigest": intent["grantDigest"], "generation": intent["generation"],
		"useOrdinal": useOrdinal,
	}
	digest, err := canonicaljson.Digest(claimBase)
	if err != nil {
		return nil, err
	}
	claim := cloneEvaluationObject(claimBase)
	claim["claimReceiptDigest"] = digest
	return map[string]any{"status": "claimed", "claim": claim}, nil
}

func evaluationControlledWorkspaceOwnerStoredNestedFact(
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
	operation, nestedKey, digestKey, digest string,
) (map[string]any, error) {
	value, ok, err := evaluationControlledWorkspaceOwnerLedgerFindFact(records, operation, func(fact map[string]any) bool {
		nested, nestedOK := objectMember(fact, nestedKey)
		return nestedOK && stringMember(nested, digestKey) == digest
	})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotFound
	}
	nested, _ := objectMember(value, nestedKey)
	return nested, nil
}

func validateEvaluationControlledWorkspaceOwnerClaim(
	claim, intent map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) error {
	if !exactEvaluationKeys(claim, []string{
		"claimId", "intentDigest", "operationId", "planDigest", "attemptId", "sessionId",
		"grantDigest", "generation", "useOrdinal", "claimReceiptDigest",
	}, "priorCheckpoint") || !controlledWorkspaceReceiptDigestMatches(claim, "claimReceiptDigest") ||
		stringMember(claim, "intentDigest") != stringMember(intent, "intentDigest") ||
		stringMember(claim, "operationId") != stringMember(intent, "operationId") ||
		stringMember(claim, "planDigest") != stringMember(intent, "planDigest") ||
		stringMember(claim, "attemptId") != stringMember(intent, "attemptId") ||
		stringMember(claim, "sessionId") != stringMember(intent, "sessionId") ||
		stringMember(claim, "grantDigest") != stringMember(intent, "grantDigest") {
		return ErrConflict
	}
	stored, err := evaluationControlledWorkspaceOwnerStoredNestedFact(
		records, "operation.claim", "claim", "claimReceiptDigest", stringMember(claim, "claimReceiptDigest"),
	)
	if err != nil || !evaluationControlledWorkspaceCanonicalEqual(stored, claim) {
		if err != nil {
			return err
		}
		return ErrConflict
	}
	return nil
}

func evaluationControlledWorkspaceOwnerLedgerDispatch(
	payload map[string]any,
	requestDigest string,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	intent, intentOK := objectMember(payload, "intent")
	claim, claimOK := objectMember(payload, "claim")
	if !intentOK || !claimOK || validateEvaluationControlledWorkspaceOwnerOperationIntent(intent) != nil {
		return nil, ErrInvalid
	}
	if err := validateEvaluationControlledWorkspaceOwnerClaim(claim, intent, records); err != nil {
		return nil, err
	}
	base := map[string]any{
		"claimId": claim["claimId"], "intentDigest": intent["intentDigest"],
		"operationId": intent["operationId"], "planDigest": intent["planDigest"],
		"attemptId": intent["attemptId"], "sessionId": intent["sessionId"],
		"grantDigest": intent["grantDigest"], "generation": intent["generation"],
		"priorCheckpointDigest": intent["priorCheckpointDigest"],
		"stagingRef":            "staging.controlled." + requestDigest[7:],
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	base["dispatchReceiptDigest"] = digest
	return base, nil
}

func validateEvaluationControlledWorkspaceOwnerDispatch(
	dispatch, claim, intent map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) error {
	if !exactEvaluationKeys(dispatch, []string{
		"claimId", "intentDigest", "operationId", "planDigest", "attemptId", "sessionId", "grantDigest",
		"generation", "priorCheckpointDigest", "stagingRef", "dispatchReceiptDigest",
	}) || !controlledWorkspaceReceiptDigestMatches(dispatch, "dispatchReceiptDigest") ||
		stringMember(dispatch, "claimId") != stringMember(claim, "claimId") ||
		stringMember(dispatch, "intentDigest") != stringMember(intent, "intentDigest") ||
		stringMember(dispatch, "priorCheckpointDigest") != stringMember(intent, "priorCheckpointDigest") {
		return ErrConflict
	}
	stored, ok, err := evaluationControlledWorkspaceOwnerLedgerFindFact(records, "operation.dispatch", func(fact map[string]any) bool {
		return stringMember(fact, "dispatchReceiptDigest") == stringMember(dispatch, "dispatchReceiptDigest")
	})
	if err != nil || !ok || !evaluationControlledWorkspaceCanonicalEqual(stored, dispatch) {
		if err != nil {
			return err
		}
		return ErrNotFound
	}
	return nil
}

func validateEvaluationControlledWorkspaceOwnerToolExecution(
	output, intent map[string]any,
) error {
	if !exactEvaluationKeys(output, []string{"receipt", "result"}) {
		return ErrInvalid
	}
	receipt, ok := objectMember(output, "receipt")
	if !ok || validateEvaluationControlledToolCapabilityFact(receipt) != nil ||
		!controlledWorkspaceReceiptDigestMatches(receipt, "receiptDigest") ||
		stringMember(receipt, "planDigest") != stringMember(intent, "planDigest") ||
		stringMember(receipt, "attemptId") != stringMember(intent, "attemptId") ||
		stringMember(receipt, "descriptorDigest") != stringMember(intent, "descriptorDigest") ||
		stringMember(receipt, "caseId") != stringMember(intent, "caseId") ||
		stringMember(receipt, "materialDigest") != stringMember(intent, "materialDigest") ||
		stringMember(receipt, "loopPolicyDigest") != stringMember(intent, "loopPolicyDigest") ||
		stringMember(receipt, "grantDigest") != stringMember(intent, "grantDigest") ||
		stringMember(receipt, "toolRegistryDigest") != stringMember(intent, "toolRegistryDigest") ||
		stringMember(receipt, "toolDefinitionDigest") != stringMember(intent, "toolDefinitionDigest") ||
		stringMember(receipt, "inputSchemaDigest") != stringMember(intent, "inputSchemaDigest") ||
		stringMember(receipt, "idempotencyKey") != stringMember(intent, "idempotencyKey") ||
		stringMember(receipt, "operationIntentDigest") != stringMember(intent, "intentDigest") ||
		stringMember(receipt, "toolCallId") != stringMember(intent, "toolCallId") ||
		stringMember(receipt, "toolId") != stringMember(intent, "toolId") ||
		stringMember(receipt, "argumentsDigest") != stringMember(intent, "argumentsDigest") ||
		stringMember(receipt, "resultDigest") == "" {
		return ErrConflict
	}
	receiptGeneration, generationOK := integerMember(receipt, "generation")
	intentGeneration, intentGenerationOK := integerMember(intent, "generation")
	receiptTurn, turnOK := integerMember(receipt, "turnIndex")
	intentTurn, intentTurnOK := integerMember(intent, "turnIndex")
	if !generationOK || !intentGenerationOK || receiptGeneration != intentGeneration ||
		!turnOK || !intentTurnOK || receiptTurn != intentTurn {
		return ErrConflict
	}
	resultDigest, err := canonicaljson.Digest(output["result"])
	if err != nil || resultDigest != stringMember(receipt, "resultDigest") {
		return ErrConflict
	}
	return nil
}

func validateEvaluationControlledWorkspaceOwnerEffect(
	effect, intent, dispatch map[string]any,
) error {
	if stringMember(effect, "intentDigest") != stringMember(intent, "intentDigest") ||
		stringMember(effect, "dispatchReceiptDigest") != stringMember(dispatch, "dispatchReceiptDigest") ||
		stringMember(effect, "grantDigest") != stringMember(intent, "grantDigest") ||
		!controlledWorkspaceReceiptDigestMatches(effect, "effectReceiptDigest") ||
		effect["canonicalWriteObserved"] != false {
		return ErrConflict
	}
	checkpoint, ok := objectMember(effect, "checkpoint")
	if !ok {
		return ErrInvalid
	}
	expected, err := controlledWorkspaceExpectedFactBinding(
		stringMember(intent, "planDigest"), "operation.claim", intent,
	)
	if err != nil {
		return err
	}
	if err := validateControlledWorkspaceCheckpoint(checkpoint, expected); err != nil {
		return err
	}
	payload, err := canonicaljson.Bytes(map[string]any{
		"sessionId":   stringMember(intent, "sessionId"),
		"attemptId":   stringMember(intent, "attemptId"),
		"grantDigest": stringMember(intent, "grantDigest"),
		"generation":  mustEvaluationInteger(intent, "generation"),
		"value": map[string]any{
			"intentDigest":          stringMember(intent, "intentDigest"),
			"dispatchReceiptDigest": stringMember(dispatch, "dispatchReceiptDigest"),
		},
	})
	if err != nil {
		return err
	}
	source, err := evaluationControlledWorkspaceCanonicalRaw(effect)
	if err != nil {
		return err
	}
	return validateControlledWorkspaceFacts(
		stringMember(intent, "planDigest"), "session.execute", payload, []json.RawMessage{source},
	)
}

func evaluationControlledWorkspaceOwnerLedgerSeal(
	operation string,
	payload map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	intent, intentOK := objectMember(payload, "intent")
	claim, claimOK := objectMember(payload, "claim")
	output, outputOK := objectMember(payload, "output")
	checkpoint, checkpointOK := objectMember(payload, "checkpoint")
	if !intentOK || !claimOK || !outputOK || !checkpointOK ||
		validateEvaluationControlledWorkspaceOwnerOperationIntent(intent) != nil {
		return nil, ErrInvalid
	}
	if err := validateEvaluationControlledWorkspaceOwnerClaim(claim, intent, records); err != nil {
		return nil, err
	}
	if err := validateEvaluationControlledWorkspaceOwnerToolExecution(output, intent); err != nil {
		return nil, err
	}
	expected, err := controlledWorkspaceExpectedFactBinding(
		stringMember(intent, "planDigest"), "operation.claim", intent,
	)
	if err != nil {
		return nil, err
	}
	if err := validateControlledWorkspaceCheckpoint(checkpoint, expected); err != nil {
		return nil, err
	}
	authorityDigests, err := evaluationControlledWorkspaceSortedDigests(payload["authorityReceiptDigests"], 32, true)
	if err != nil {
		return nil, err
	}
	authoritySetDigest, err := canonicaljson.Digest(map[string]any{"authorityReceiptDigests": authorityDigests})
	if err != nil {
		return nil, err
	}
	receipt, _ := objectMember(output, "receipt")
	base := map[string]any{
		"intentDigest": intent["intentDigest"], "operationId": intent["operationId"],
		"planDigest": intent["planDigest"], "attemptId": intent["attemptId"],
		"sessionId": intent["sessionId"], "grantDigest": intent["grantDigest"],
		"generation": intent["generation"], "toolExecutionReceiptDigest": receipt["receiptDigest"],
		"authorityReceiptDigests": authorityDigests, "authorityReceiptSetDigest": authoritySetDigest,
		"checkpoint": checkpoint,
	}
	seal := map[string]any{
		"intentDigest": intent["intentDigest"], "operationId": intent["operationId"],
		"planDigest": intent["planDigest"], "attemptId": intent["attemptId"],
		"sessionId": intent["sessionId"], "grantDigest": intent["grantDigest"],
		"generation": intent["generation"], "toolExecution": output,
		"authorityReceiptDigests": authorityDigests, "authorityReceiptSetDigest": authoritySetDigest,
		"checkpoint": checkpoint,
	}
	if operation == "operation.seal-atomic" {
		dispatch, dispatchOK := objectMember(payload, "dispatch")
		effect, effectOK := objectMember(payload, "effect")
		if !dispatchOK || !effectOK || validateEvaluationControlledWorkspaceOwnerDispatch(dispatch, claim, intent, records) != nil {
			return nil, ErrConflict
		}
		if err := validateEvaluationControlledWorkspaceOwnerEffect(effect, intent, dispatch); err != nil {
			return nil, err
		}
		base["dispatchReceiptDigest"] = dispatch["dispatchReceiptDigest"]
		base["effectReceiptDigest"] = effect["effectReceiptDigest"]
		seal["dispatchReceiptDigest"] = dispatch["dispatchReceiptDigest"]
		seal["effect"] = effect
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	seal["sealReceiptDigest"] = digest
	return seal, nil
}

func evaluationControlledWorkspaceOwnerLedgerAttemptState(
	payload map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, bool, error) {
	attemptID, grantDigest := stringMember(payload, "attemptId"), stringMember(payload, "grantDigest")
	generation, generationOK := integerMember(payload, "generation")
	if !generationOK || generation < 1 {
		return nil, false, ErrInvalid
	}
	seals, err := evaluationControlledWorkspaceOwnerLedgerStoredSeals(records, attemptID, grantDigest, generation)
	if err != nil || len(seals) == 0 {
		return nil, false, err
	}
	receiptDigests := make([]string, 0, len(seals))
	turns := make([]int64, 0, len(seals))
	aggregateBytes, repairRounds := int64(0), int64(0)
	var currentCheckpoint map[string]any
	for _, seal := range seals {
		tool, _ := objectMember(seal, "toolExecution")
		receipt, _ := objectMember(tool, "receipt")
		receiptDigests = append(receiptDigests, stringMember(receipt, "receiptDigest"))
		turn, _ := integerMember(receipt, "turnIndex")
		turns = append(turns, turn)
		resultBytes, err := canonicaljson.Bytes(tool["result"])
		if err != nil {
			return nil, false, err
		}
		aggregateBytes += int64(len(resultBytes))
		if effect, ok := objectMember(seal, "effect"); ok && stringMember(effect, "effectKind") == "repair-transaction" {
			repairRounds++
		}
		currentCheckpoint, _ = objectMember(seal, "checkpoint")
	}
	sort.Strings(receiptDigests)
	sort.Slice(turns, func(left, right int) bool { return turns[left] < turns[right] })
	for index := 1; index < len(turns); index++ {
		if turns[index] == turns[index-1] {
			return nil, false, ErrConflict
		}
	}
	base := map[string]any{
		"attemptId": attemptID, "grantDigest": grantDigest, "generation": generation,
		"currentCheckpoint": currentCheckpoint, "toolExecutionReceiptDigests": receiptDigests,
		"aggregateToolResultBytes": aggregateBytes, "repairRoundCount": repairRounds,
		"completedTurnIndexes": turns,
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, false, err
	}
	base["stateReceiptDigest"] = digest
	return base, true, nil
}

func evaluationControlledWorkspaceOwnerLedgerLoadSeal(
	payload map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, bool, error) {
	generation, ok := integerMember(payload, "generation")
	if !ok {
		return nil, false, ErrInvalid
	}
	seals, err := evaluationControlledWorkspaceOwnerLedgerStoredSeals(
		records, stringMember(payload, "attemptId"), stringMember(payload, "grantDigest"), generation,
	)
	if err != nil {
		return nil, false, err
	}
	var matched map[string]any
	for _, seal := range seals {
		tool, _ := objectMember(seal, "toolExecution")
		receipt, _ := objectMember(tool, "receipt")
		if stringMember(receipt, "receiptDigest") != stringMember(payload, "receiptDigest") {
			continue
		}
		if matched != nil {
			return nil, false, ErrConflict
		}
		matched = seal
	}
	return matched, matched != nil, nil
}

func evaluationControlledWorkspaceOwnerLedgerListSeals(
	payload map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) ([]map[string]any, error) {
	generation, ok := integerMember(payload, "generation")
	if !ok {
		return nil, ErrInvalid
	}
	seals, err := evaluationControlledWorkspaceOwnerLedgerStoredSeals(
		records, stringMember(payload, "attemptId"), stringMember(payload, "grantDigest"), generation,
	)
	if err != nil {
		return nil, err
	}
	sort.Slice(seals, func(left, right int) bool {
		return stringMember(seals[left], "sealReceiptDigest") < stringMember(seals[right], "sealReceiptDigest")
	})
	return seals, nil
}

func evaluationControlledWorkspaceOwnerLedgerReconcile(
	payload map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	intent, intentOK := objectMember(payload, "intent")
	claim, claimOK := objectMember(payload, "claim")
	dispatch, dispatchOK := objectMember(payload, "dispatch")
	if !intentOK || !claimOK || !dispatchOK || validateEvaluationControlledWorkspaceOwnerOperationIntent(intent) != nil ||
		validateEvaluationControlledWorkspaceOwnerClaim(claim, intent, records) != nil ||
		validateEvaluationControlledWorkspaceOwnerDispatch(dispatch, claim, intent, records) != nil ||
		stringMember(payload, "reason") != "seal-ack-loss" {
		return nil, ErrConflict
	}
	seals, err := evaluationControlledWorkspaceOwnerLedgerStoredSeals(
		records, stringMember(intent, "attemptId"), stringMember(intent, "grantDigest"), mustEvaluationInteger(intent, "generation"),
	)
	if err != nil {
		return nil, err
	}
	for _, seal := range seals {
		if stringMember(seal, "intentDigest") == stringMember(intent, "intentDigest") &&
			stringMember(seal, "dispatchReceiptDigest") == stringMember(dispatch, "dispatchReceiptDigest") {
			return map[string]any{"status": "sealed", "seal": seal}, nil
		}
	}
	base := map[string]any{
		"status": "unsealed", "intentDigest": intent["intentDigest"],
		"dispatchReceiptDigest": dispatch["dispatchReceiptDigest"], "reason": payload["reason"],
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	return map[string]any{"status": "unsealed", "reconciliationReceiptDigest": digest}, nil
}

func mustEvaluationInteger(value map[string]any, key string) int64 {
	result, _ := integerMember(value, key)
	return result
}

func evaluationControlledWorkspaceOwnerLedgerCleanupClaim(
	intent map[string]any,
	requestDigest string,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	if err := validateEvaluationControlledWorkspaceOwnerCleanupIntent(intent); err != nil {
		return nil, err
	}
	base := map[string]any{
		"claimId": "claim.cleanup." + requestDigest[7:], "intentDigest": intent["intentDigest"],
		"attemptId": intent["attemptId"], "sessionId": intent["sessionId"],
		"grantDigest": intent["grantDigest"], "generation": intent["generation"],
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	base["claimReceiptDigest"] = digest
	return map[string]any{"status": "claimed", "claim": base}, nil
}

func validateEvaluationControlledWorkspaceOwnerCleanupClaim(
	claim, intent map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) error {
	if !exactEvaluationKeys(claim, []string{
		"claimId", "intentDigest", "attemptId", "sessionId", "grantDigest", "generation", "claimReceiptDigest",
	}) || !controlledWorkspaceReceiptDigestMatches(claim, "claimReceiptDigest") ||
		stringMember(claim, "intentDigest") != stringMember(intent, "intentDigest") {
		return ErrConflict
	}
	stored, err := evaluationControlledWorkspaceOwnerStoredNestedFact(
		records, "operation.cleanup.claim", "claim", "claimReceiptDigest", stringMember(claim, "claimReceiptDigest"),
	)
	if err != nil || !evaluationControlledWorkspaceCanonicalEqual(stored, claim) {
		if err != nil {
			return err
		}
		return ErrConflict
	}
	return nil
}

func evaluationControlledWorkspaceOwnerLedgerCleanupDispatch(
	payload map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	intent, intentOK := objectMember(payload, "intent")
	claim, claimOK := objectMember(payload, "claim")
	if !intentOK || !claimOK || validateEvaluationControlledWorkspaceOwnerCleanupIntent(intent) != nil {
		return nil, ErrInvalid
	}
	if err := validateEvaluationControlledWorkspaceOwnerCleanupClaim(claim, intent, records); err != nil {
		return nil, err
	}
	base := map[string]any{
		"claimId": claim["claimId"], "intentDigest": intent["intentDigest"],
		"attemptId": intent["attemptId"], "sessionId": intent["sessionId"],
		"grantDigest": intent["grantDigest"], "generation": intent["generation"],
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	base["dispatchReceiptDigest"] = digest
	return base, nil
}

func validateEvaluationControlledWorkspaceOwnerCleanupDispatch(
	dispatch, claim, intent map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) error {
	if !exactEvaluationKeys(dispatch, []string{
		"claimId", "intentDigest", "attemptId", "sessionId", "grantDigest", "generation", "dispatchReceiptDigest",
	}) || !controlledWorkspaceReceiptDigestMatches(dispatch, "dispatchReceiptDigest") ||
		stringMember(dispatch, "claimId") != stringMember(claim, "claimId") ||
		stringMember(dispatch, "intentDigest") != stringMember(intent, "intentDigest") {
		return ErrConflict
	}
	stored, ok, err := evaluationControlledWorkspaceOwnerLedgerFindFact(records, "operation.cleanup.dispatch", func(fact map[string]any) bool {
		return stringMember(fact, "dispatchReceiptDigest") == stringMember(dispatch, "dispatchReceiptDigest")
	})
	if err != nil || !ok || !evaluationControlledWorkspaceCanonicalEqual(stored, dispatch) {
		if err != nil {
			return err
		}
		return ErrNotFound
	}
	return nil
}

func evaluationControlledWorkspaceOwnerLedgerCleanupSeal(
	payload map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	intent, intentOK := objectMember(payload, "intent")
	claim, claimOK := objectMember(payload, "claim")
	dispatch, dispatchOK := objectMember(payload, "dispatch")
	cleanupReceipt, cleanupOK := objectMember(payload, "cleanupReceipt")
	if !intentOK || !claimOK || !dispatchOK || !cleanupOK ||
		validateEvaluationControlledWorkspaceOwnerCleanupIntent(intent) != nil {
		return nil, ErrInvalid
	}
	if err := validateEvaluationControlledWorkspaceOwnerCleanupClaim(claim, intent, records); err != nil {
		return nil, err
	}
	if err := validateEvaluationControlledWorkspaceOwnerCleanupDispatch(dispatch, claim, intent, records); err != nil {
		return nil, err
	}
	generation, _ := integerMember(intent, "generation")
	expected := evaluationControlledWorkspaceFactBinding{
		PlanDigest:       stringMember(intent, "planDigest"),
		AttemptID:        stringMember(intent, "attemptId"),
		DescriptorDigest: stringMember(intent, "descriptorDigest"),
		CaseID:           stringMember(intent, "caseId"),
		MaterialDigest:   stringMember(intent, "materialDigest"),
		GrantDigest:      stringMember(intent, "grantDigest"),
		Generation:       generation,
		SessionID:        stringMember(intent, "sessionId"),
	}
	if err := validateControlledWorkspaceCleanupReceipt(cleanupReceipt, expected); err != nil {
		return nil, err
	}
	base := map[string]any{
		"intentDigest": intent["intentDigest"], "attemptId": intent["attemptId"],
		"sessionId": intent["sessionId"], "grantDigest": intent["grantDigest"],
		"generation": intent["generation"], "dispatch": dispatch,
		"dispatchReceiptDigest": dispatch["dispatchReceiptDigest"],
		"cleanupReceiptDigest":  cleanupReceipt["cleanupReceiptDigest"],
	}
	digest, err := canonicaljson.Digest(base)
	if err != nil {
		return nil, err
	}
	seal := cloneEvaluationObject(base)
	delete(seal, "cleanupReceiptDigest")
	seal["cleanupReceipt"] = cleanupReceipt
	seal["sealReceiptDigest"] = digest
	return seal, nil
}

func evaluationControlledWorkspaceOwnerLedgerCleanupReconcile(
	payload map[string]any,
	records []EvaluationControlledWorkspaceOwnerLedgerRecord,
) (map[string]any, error) {
	intent, intentOK := objectMember(payload, "intent")
	claim, claimOK := objectMember(payload, "claim")
	dispatch, dispatchOK := objectMember(payload, "dispatch")
	if !intentOK || !claimOK || !dispatchOK || validateEvaluationControlledWorkspaceOwnerCleanupIntent(intent) != nil ||
		validateEvaluationControlledWorkspaceOwnerCleanupClaim(claim, intent, records) != nil ||
		validateEvaluationControlledWorkspaceOwnerCleanupDispatch(dispatch, claim, intent, records) != nil ||
		!oneOfString(stringMember(payload, "reason"), "resume", "destroy-failed", "seal-ack-loss") {
		return nil, ErrConflict
	}
	seal, ok, err := evaluationControlledWorkspaceOwnerLedgerFindFact(records, "operation.cleanup.seal", func(fact map[string]any) bool {
		return stringMember(fact, "intentDigest") == stringMember(intent, "intentDigest") &&
			stringMember(fact, "dispatchReceiptDigest") == stringMember(dispatch, "dispatchReceiptDigest")
	})
	if err != nil {
		return nil, err
	}
	if !ok {
		return nil, ErrNotFound
	}
	return map[string]any{"status": "sealed", "seal": seal}, nil
}
