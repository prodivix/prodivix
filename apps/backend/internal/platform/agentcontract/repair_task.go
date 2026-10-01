package agentcontract

import (
	"encoding/json"
	"errors"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

// DecodeRepairTaskRequest validates the public AI wire, including its embedded
// current Task and normalized request digest rather than the wire wrapper.
func DecodeRepairTaskRequest(source json.RawMessage) (map[string]any, []byte, error) {
	value, err := validateWithSchema("agent-repair-task-request@1", source)
	if err != nil {
		return nil, nil, err
	}
	canonical, err := canonicaljson.Bytes(value)
	return value["value"].(map[string]any), canonical, err
}

func validateAgentRepairTaskRequest(envelope map[string]any) error {
	value := envelope["value"].(map[string]any)
	for _, field := range []string{"requestId", "parentTaskId", "parentRunId", "failedClosureReceiptId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	for _, field := range []string{"parentTaskDigest", "failedClosureDigest", "expectedParentSnapshotDigest", "expectedParentLedgerDigest", "requestDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	if err := requireInstant(value["requestedAt"], "/value/requestedAt"); err != nil {
		return err
	}
	if err := validateAgentWorkspaceRevision(value["currentRevision"], "/value/currentRevision"); err != nil {
		return err
	}
	wire := value["requestedTask"].(map[string]any)
	source, err := canonicaljson.Bytes(wire)
	if err != nil {
		return err
	}
	taskWire, err := validateWithSchema("agent-control-fact@1", source)
	if err != nil {
		return err
	}
	if taskWire["factType"] != "task-record" {
		return errors.New("repair child is not a Task")
	}
	task := taskWire["value"].(map[string]any)
	lineage, spec := task["lineage"].(map[string]any), task["spec"].(map[string]any)
	if lineage["reason"] != "intent-changed" || lineage["parentTaskId"] != value["parentTaskId"] || spec["mode"] != "apply" || spec["createdAt"] != value["requestedAt"] {
		return errors.New("repair child lineage or time drift")
	}
	left, err := canonicaljson.Digest(spec["baseRevision"])
	if err != nil {
		return err
	}
	right, err := canonicaljson.Digest(value["currentRevision"])
	if err != nil || left != right {
		return errors.New("repair child base revision drift")
	}
	counterexamples := value["counterexamples"].(map[string]any)
	if counterexamples["failedClosureDigest"] != value["failedClosureDigest"] {
		return errors.New("repair counterexamples bind another Closure")
	}
	if err := validateRepairCounterexampleSet(counterexamples); err != nil {
		return err
	}
	body := make(map[string]any, len(value))
	for key, field := range value {
		if key != "requestDigest" {
			body[key] = field
		}
	}
	body["requestedTask"] = task
	digest, err := canonicaljson.Digest(body)
	if err != nil || digest != value["requestDigest"] {
		return errors.New("repair request digest drift")
	}
	return nil
}

func validateRepairCounterexampleSet(value map[string]any) error {
	requirements := value["requirements"].([]any)
	digests := make([]any, 0, len(requirements))
	prior := ""
	for _, raw := range requirements {
		requirement := raw.(map[string]any)
		stable := stringValue(requirement["stableCellDigest"])
		if prior != "" && prior >= stable {
			return errors.New("repair required cells are not canonical")
		}
		prior = stable
		for _, field := range []string{"evidenceManifestDigests", "sourceTraceDigests", "diagnosticCodes"} {
			values := requirement[field].([]any)
			last := ""
			for _, raw := range values {
				text := raw.(string)
				if last != "" && last >= text {
					return errors.New("repair counterexample list is not canonical")
				}
				last = text
			}
		}
		if err := requireDigestMatch(requirement, "requirementDigest", "/value/counterexamples/requirements/requirementDigest"); err != nil {
			return err
		}
		digests = append(digests, requirement["requirementDigest"])
	}
	setDigest, err := canonicaljson.Digest(map[string]any{"failedClosureDigest": value["failedClosureDigest"], "requirements": requirements})
	if err != nil || setDigest != value["counterexampleSetDigest"] {
		return errors.New("repair counterexample set digest drift")
	}
	sort.Slice(digests, func(i, j int) bool { return digests[i].(string) < digests[j].(string) })
	regressionDigest, err := canonicaljson.Digest(digests)
	if err != nil || regressionDigest != value["regressionRequirementSetDigest"] {
		return errors.New("repair regression digest drift")
	}
	return nil
}
