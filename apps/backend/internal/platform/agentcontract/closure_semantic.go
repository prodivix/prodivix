package agentcontract

import (
	"errors"
	"fmt"
	"sort"
)

var g4ClosureGateIDs = sortedStrings([]string{
	"verify:g4:boundaries", "verify:g4:context-policy", "verify:g4:provider-capabilities",
	"verify:g4:multimodal", "verify:g4:hosted-capabilities", "verify:g4:control-plane",
	"verify:g4:proposal-approval", "verify:g4:verification", "verify:g4:product",
	"verify:g4:security", "verify:g4:model-eval:contract",
})

var g4ClosureRecoveryIDs = sortedStrings([]string{
	"awaiting-approval-restart", "cancel-late-callback", "commit-ack-restart", "duplicate-request",
	"late-background-callback", "model-stream-restart", "tool-execute-restart", "verification-restart",
})

var g4ClosureNegativeIDs = sortedStrings([]string{
	"budget-exhaustion", "cherry-picked-evaluation", "computer-use-authoring", "cross-modal-injection",
	"failed-closure", "failed-repair", "fake-evidence", "hidden-tool-effect", "holdout-leak",
	"permission-escalation", "provider-state-memory", "rollback-conflict", "secret-leak",
	"stale-approval", "text-injection",
})

var g4ClosureProtocols = []string{"anthropic-messages", "gemini-interactions", "openai-responses"}
var g4ClosureProfiles = []string{"g4-core-text-tools", "g4-document-input", "g4-visual-input"}

func sortedStrings(values []string) []string {
	result := append([]string(nil), values...)
	sort.Strings(result)
	return result
}

func validateAgentG4ClosureSemantics(document map[string]any) error {
	if err := rejectUnsafeKeys(document, "/"); err != nil {
		return err
	}
	if err := requireExactObjectKeys(document, []string{"wireVersion", "factType", "value"}, nil); err != nil {
		return fmt.Errorf("G4 Closure envelope: %w", err)
	}
	if document["wireVersion"] != float64(1) || stringValue(document["factType"]) != "g4-golden-closure-manifest" {
		return errors.New("G4 Closure envelope identity is invalid")
	}
	value, ok := document["value"].(map[string]any)
	if !ok {
		return errors.New("G4 Closure value must be an object")
	}
	required := []string{
		"manifestId", "targetId", "repositoryCommit", "worktreeState", "journey", "verification",
		"recoveryVerdicts", "negativeVerdicts", "productParity", "deterministicGateEvidence",
		"modelEvaluation", "artifacts", "goldenVerdict", "closureVerdict", "completedAt", "manifestDigest",
	}
	if err := requireExactObjectKeys(value, required, nil); err != nil {
		return err
	}
	if err := requireIdentity(value["manifestId"], "/value/manifestId"); err != nil {
		return err
	}
	if stringValue(value["targetId"]) != "authenticated-catalog" ||
		!evaluationCommitPattern.MatchString(stringValue(value["repositoryCommit"])) ||
		!oneOf(stringValue(value["worktreeState"]), "clean", "dirty") {
		return errors.New("G4 Closure source identity is invalid")
	}
	if err := requireInstant(value["completedAt"], "/value/completedAt"); err != nil {
		return err
	}
	if err := validateG4ClosureJourney(value["journey"]); err != nil {
		return err
	}
	if err := validateG4ClosureVerification(value["verification"]); err != nil {
		return err
	}
	if err := validateG4ClosureVerdicts(value["recoveryVerdicts"], true); err != nil {
		return err
	}
	if err := validateG4ClosureVerdicts(value["negativeVerdicts"], false); err != nil {
		return err
	}
	if err := validateG4ClosureProduct(value["productParity"]); err != nil {
		return err
	}
	allDurable, err := validateG4ClosureGates(
		value["deterministicGateEvidence"],
		stringValue(value["repositoryCommit"]),
		value["completedAt"],
	)
	if err != nil {
		return err
	}
	evaluationStatus, evaluationExpired, err := validateG4ClosureModelEvaluation(value["modelEvaluation"], value["completedAt"])
	if err != nil {
		return err
	}
	if err := validateG4ClosureArtifacts(value["artifacts"]); err != nil {
		return err
	}
	if stringValue(value["goldenVerdict"]) != "satisfied" {
		return errors.New("G4 Closure deterministic Golden must be satisfied")
	}
	expectedClosure := "incomplete"
	if evaluationStatus == "satisfied" && evaluationExpired {
		expectedClosure = "expired"
	} else if evaluationStatus == "satisfied" && stringValue(value["worktreeState"]) == "clean" && allDurable {
		expectedClosure = "satisfied"
	}
	if stringValue(value["closureVerdict"]) != expectedClosure {
		return errors.New("G4 Closure verdict is inconsistent with durable evidence")
	}
	return requireDigestMatch(value, "manifestDigest", "/value/manifestDigest")
}

func validateG4ClosureJourney(raw any) error {
	value, ok := raw.(map[string]any)
	if !ok {
		return errors.New("G4 Closure journey must be an object")
	}
	required := []string{
		"projectId", "workspaceId", "baseRevisionDigest", "targetRevisionDigest", "taskDigest", "runDigest",
		"contextPackDigest", "proposalDigest", "previewDigest", "approvalDigest", "transactionDigest",
		"reverseTransactionDigest", "commitReceiptDigest", "verificationPlanDigest",
		"verificationEvidenceSetDigest", "verificationClosureDigest", "auditDigest", "productViewDigest", "journeyDigest",
	}
	if err := requireExactObjectKeys(value, required, nil); err != nil {
		return err
	}
	for _, field := range []string{"projectId", "workspaceId"} {
		if err := requireIdentity(value[field], "/value/journey/"+field); err != nil {
			return err
		}
	}
	for _, field := range required[2 : len(required)-1] {
		if err := requireDigest(value[field], "/value/journey/"+field); err != nil {
			return err
		}
	}
	return requireDigestMatch(value, "journeyDigest", "/value/journey/journeyDigest")
}

func validateG4ClosureVerification(raw any) error {
	value, ok := raw.(map[string]any)
	if !ok {
		return errors.New("G4 Closure verification must be an object")
	}
	required := []string{
		"planDigest", "g3ClosureManifestDigest", "matrixEvidenceDigest", "evidenceSetDigest", "closureDigest",
		"requiredCellCount", "totalAttemptCount", "evidenceCount", "frameworkTargets", "surfaces",
		"closureVerdict", "summaryDigest",
	}
	if err := requireExactObjectKeys(value, required, nil); err != nil {
		return err
	}
	for _, field := range required[:5] {
		if err := requireDigest(value[field], "/value/verification/"+field); err != nil {
			return err
		}
	}
	requiredCells, cellsOK := safeInteger(value["requiredCellCount"])
	attempts, attemptsOK := safeInteger(value["totalAttemptCount"])
	evidence, evidenceOK := safeInteger(value["evidenceCount"])
	if !cellsOK || requiredCells != 66 || !attemptsOK || attempts < 66 || !evidenceOK || evidence != 66 ||
		stringValue(value["closureVerdict"]) != "satisfied" {
		return errors.New("G4 Closure verification coverage is invalid")
	}
	if err := requireExactStrings(value["frameworkTargets"], []string{"react-vite", "vue-vite"}); err != nil {
		return err
	}
	if err := requireExactStrings(value["surfaces"], []string{"ci", "export", "preview"}); err != nil {
		return err
	}
	return requireDigestMatch(value, "summaryDigest", "/value/verification/summaryDigest")
}

func validateG4ClosureVerdicts(raw any, recovery bool) error {
	values, ok := raw.([]any)
	expected := g4ClosureNegativeIDs
	if recovery {
		expected = g4ClosureRecoveryIDs
	}
	if !ok || len(values) != len(expected) {
		return errors.New("G4 Closure verdict set is incomplete")
	}
	ids := make([]any, 0, len(values))
	for index, rawValue := range values {
		value, ok := rawValue.(map[string]any)
		if !ok {
			return fmt.Errorf("G4 Closure verdict %d must be an object", index)
		}
		if recovery {
			if err := requireExactObjectKeys(value, []string{"caseId", "evidenceDigest", "outcome", "sideEffectCount", "generationFenced", "workspaceUnchanged", "auditRecorded", "verdictDigest"}, nil); err != nil {
				return err
			}
			count, countOK := safeInteger(value["sideEffectCount"])
			if stringValue(value["outcome"]) != "reconciled" || !countOK || count != 1 ||
				value["generationFenced"] != true || value["workspaceUnchanged"] != true || value["auditRecorded"] != true {
				return errors.New("G4 Closure recovery verdict is invalid")
			}
		} else {
			if err := requireExactObjectKeys(value, []string{"caseId", "evidenceDigest", "outcome", "diagnosticCode", "workspaceUnchanged", "authorityUnexpanded", "auditRecorded", "sensitiveDataAbsent", "failurePreserved", "verdictDigest"}, nil); err != nil {
				return err
			}
			if !oneOf(stringValue(value["outcome"]), "blocked", "fenced", "reconciled") ||
				!agentControlDiagnosticPattern.MatchString(stringValue(value["diagnosticCode"])) ||
				value["workspaceUnchanged"] != true || value["authorityUnexpanded"] != true ||
				value["auditRecorded"] != true || value["sensitiveDataAbsent"] != true || value["failurePreserved"] != true {
				return errors.New("G4 Closure negative verdict is invalid")
			}
		}
		if err := requireDigest(value["evidenceDigest"], "/value/verdict/evidenceDigest"); err != nil {
			return err
		}
		if err := requireDigestMatch(value, "verdictDigest", "/value/verdict/verdictDigest"); err != nil {
			return err
		}
		ids = append(ids, value["caseId"])
	}
	return requireExactStrings(ids, expected)
}

func validateG4ClosureProduct(raw any) error {
	value, ok := raw.(map[string]any)
	if !ok {
		return errors.New("G4 Closure product parity must be an object")
	}
	if err := requireExactObjectKeys(value, []string{"webViewDigest", "cliViewDigest", "auditEventCount", "auditHeadDigest", "sanitizedAuditDigest", "parity", "summaryDigest"}, nil); err != nil {
		return err
	}
	for _, field := range []string{"webViewDigest", "cliViewDigest", "auditHeadDigest", "sanitizedAuditDigest"} {
		if err := requireDigest(value[field], "/value/productParity/"+field); err != nil {
			return err
		}
	}
	count, countOK := safeInteger(value["auditEventCount"])
	if !countOK || count < 1 || value["webViewDigest"] != value["cliViewDigest"] || stringValue(value["parity"]) != "exact" {
		return errors.New("G4 Closure product parity is invalid")
	}
	return requireDigestMatch(value, "summaryDigest", "/value/productParity/summaryDigest")
}

func validateG4ClosureGates(raw any, commit string, completedRaw any) (bool, error) {
	values, ok := raw.([]any)
	if !ok || len(values) != len(g4ClosureGateIDs) {
		return false, errors.New("G4 Closure deterministic Gate set is incomplete")
	}
	completed, _ := parseInstant(completedRaw)
	ids := make([]any, 0, len(values))
	allDurable := true
	for index, rawValue := range values {
		value, ok := rawValue.(map[string]any)
		if !ok {
			return false, fmt.Errorf("G4 Closure Gate %d must be an object", index)
		}
		if err := requireExactObjectKeys(value, []string{"gateId", "command", "repositoryCommit", "executionMode", "status", "remoteModelUnits", "evidenceDigest", "completedAt", "refDigest"}, []string{"runId", "jobId"}); err != nil {
			return false, err
		}
		units, unitsOK := safeInteger(value["remoteModelUnits"])
		gateCompleted, timeErr := parseInstant(value["completedAt"])
		if requireIdentity(value["gateId"], "/value/gate/gateId") != nil ||
			stringValue(value["command"]) == "" || stringValue(value["repositoryCommit"]) != commit ||
			stringValue(value["status"]) != "passed" || !unitsOK || units != 0 || timeErr != nil || gateCompleted.After(completed) {
			return false, errors.New("G4 Closure deterministic Gate evidence is invalid")
		}
		if err := requireDigest(value["evidenceDigest"], "/value/gate/evidenceDigest"); err != nil {
			return false, err
		}
		mode := stringValue(value["executionMode"])
		if mode == "github-actions" {
			if requireIdentity(value["runId"], "/value/gate/runId") != nil || requireIdentity(value["jobId"], "/value/gate/jobId") != nil {
				return false, errors.New("durable G4 Gate requires run and job identities")
			}
		} else if mode == "local" {
			allDurable = false
			if _, exists := value["runId"]; exists {
				return false, errors.New("local G4 Gate cannot claim durable identities")
			}
		} else {
			return false, errors.New("G4 Gate execution mode is invalid")
		}
		if err := requireDigestMatch(value, "refDigest", "/value/gate/refDigest"); err != nil {
			return false, err
		}
		ids = append(ids, value["gateId"])
	}
	if err := requireExactStrings(ids, g4ClosureGateIDs); err != nil {
		return false, err
	}
	return allDurable, nil
}

func validateG4ClosureModelEvaluation(raw any, completedRaw any) (string, bool, error) {
	value, ok := raw.(map[string]any)
	if !ok {
		return "", false, errors.New("G4 Closure model evaluation must be an object")
	}
	status := stringValue(value["status"])
	common := []string{"status", "planDigest", "requiredAttemptCount", "actualAttemptCount", "requiredProtocolFamilies", "requiredCapabilityProfileIds", "summaryDigest"}
	if status == "pending" {
		if err := requireExactObjectKeys(value, common, nil); err != nil {
			return "", false, err
		}
	} else if status == "satisfied" {
		extra := []string{"manifestRef", "manifestDigest", "providerConfigurationIds", "providerOperatorIds", "modelFamilyOwnerIds", "qualificationTargetDigests", "holdoutReceiptDigest", "metricReportDigest", "graderReportDigest", "humanReviewReportDigest", "completedAt", "expiresAt"}
		if err := requireExactObjectKeys(value, append(append([]string(nil), common...), extra...), nil); err != nil {
			return "", false, err
		}
	} else {
		return "", false, errors.New("G4 Closure model evaluation status is invalid")
	}
	if err := requireDigest(value["planDigest"], "/value/modelEvaluation/planDigest"); err != nil {
		return "", false, err
	}
	required, requiredOK := safeInteger(value["requiredAttemptCount"])
	actual, actualOK := safeInteger(value["actualAttemptCount"])
	if !requiredOK || required != 11_640 || !actualOK || (status == "pending" && actual != 0) || (status == "satisfied" && actual < required) {
		return "", false, errors.New("G4 Closure model evaluation attempt floor is invalid")
	}
	if err := requireExactStrings(value["requiredProtocolFamilies"], g4ClosureProtocols); err != nil {
		return "", false, err
	}
	if err := requireExactStrings(value["requiredCapabilityProfileIds"], g4ClosureProfiles); err != nil {
		return "", false, err
	}
	expired := false
	if status == "satisfied" {
		for _, field := range []string{"manifestDigest", "holdoutReceiptDigest", "metricReportDigest", "graderReportDigest", "humanReviewReportDigest"} {
			if err := requireDigest(value[field], "/value/modelEvaluation/"+field); err != nil {
				return "", false, err
			}
		}
		for _, field := range []string{"providerConfigurationIds", "providerOperatorIds", "modelFamilyOwnerIds", "qualificationTargetDigests"} {
			if err := requireCanonicalStrings(value[field]); err != nil {
				return "", false, fmt.Errorf("/value/modelEvaluation/%s: %w", field, err)
			}
		}
		completed, completedErr := parseInstant(value["completedAt"])
		expires, expiresErr := parseInstant(value["expiresAt"])
		manifestCompleted, manifestErr := parseInstant(completedRaw)
		if completedErr != nil || expiresErr != nil || manifestErr != nil || !expires.After(completed) {
			return "", false, errors.New("G4 Closure model evaluation time window is invalid")
		}
		expired = !manifestCompleted.Before(expires)
	}
	if err := requireDigestMatch(value, "summaryDigest", "/value/modelEvaluation/summaryDigest"); err != nil {
		return "", false, err
	}
	return status, expired, nil
}

func validateG4ClosureArtifacts(raw any) error {
	values, ok := raw.([]any)
	if !ok || len(values) < 3 {
		return errors.New("G4 Closure requires at least three artifacts")
	}
	ids := make([]any, 0, len(values))
	for index, rawValue := range values {
		value, ok := rawValue.(map[string]any)
		if !ok || requireExactObjectKeys(value, []string{"artifactId", "digest", "size", "mediaType", "availability", "artifactDigest"}, nil) != nil {
			return fmt.Errorf("G4 Closure artifact %d is invalid", index)
		}
		size, sizeOK := safeInteger(value["size"])
		if requireIdentity(value["artifactId"], "/value/artifact/artifactId") != nil || !sizeOK || size < 1 ||
			stringValue(value["mediaType"]) == "" || stringValue(value["availability"]) != "available" {
			return errors.New("G4 Closure artifact identity is invalid")
		}
		if err := requireDigest(value["digest"], "/value/artifact/digest"); err != nil {
			return err
		}
		if err := requireDigestMatch(value, "artifactDigest", "/value/artifact/artifactDigest"); err != nil {
			return err
		}
		ids = append(ids, value["artifactId"])
	}
	return requireCanonicalStrings(ids)
}

func requireExactStrings(raw any, expected []string) error {
	values, ok := raw.([]any)
	if !ok || len(values) != len(expected) {
		return errors.New("string identity set is incomplete")
	}
	for index, value := range values {
		if stringValue(value) != expected[index] {
			return errors.New("string identity set is not exact or canonical")
		}
	}
	return nil
}
