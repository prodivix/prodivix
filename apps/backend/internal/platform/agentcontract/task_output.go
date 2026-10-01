package agentcontract

import (
	"encoding/json"
	"errors"
	"strings"
	"unicode/utf16"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type AgentTaskOutputDTO struct {
	OutputID              string `json:"outputId"`
	TaskID                string `json:"taskId"`
	RunID                 string `json:"runId"`
	Generation            int64  `json:"generation"`
	ModelInvocationID     string `json:"modelInvocationId"`
	ContextPackDigest     string `json:"contextPackDigest"`
	ProjectPolicyDigest   string `json:"projectPolicyDigest"`
	EffectivePolicyDigest string `json:"effectivePolicyDigest"`
	Kind                  string `json:"kind"`
	Text                  string `json:"text"`
	ContentDigest         string `json:"contentDigest"`
	RecordedAt            string `json:"recordedAt"`
	OutputDigest          string `json:"outputDigest"`
}

// DecodeAgentTaskOutput mirrors the bounded public AI owner fact. Final user
// text has an independent publication boundary from model streams and reasoning.
func DecodeAgentTaskOutput(raw []byte) (AgentTaskOutputDTO, []byte, error) {
	var output AgentTaskOutputDTO
	if err := canonicaljson.ValidateRaw(raw, 524288); err != nil {
		return output, nil, err
	}
	envelope, err := validateWithSchema("agent-task-output@1", json.RawMessage(raw))
	if err != nil {
		return output, nil, err
	}
	encoded, err := json.Marshal(envelope["value"])
	if err != nil {
		return output, nil, err
	}
	if err := json.Unmarshal(encoded, &output); err != nil {
		return output, nil, err
	}
	canonical, err := canonicaljson.Bytes(envelope)
	return output, canonical, err
}

func validateAgentTaskOutputSemantics(envelope map[string]any) error {
	if err := requireExactObjectKeys(envelope, []string{"wireVersion", "factType", "value"}, nil); err != nil {
		return err
	}
	version, ok := safeInteger(envelope["wireVersion"])
	if !ok || version != 1 || stringValue(envelope["factType"]) != "task-output" {
		return errors.New("invalid task output envelope")
	}
	value, ok := envelope["value"].(map[string]any)
	if !ok {
		return errors.New("invalid task output value")
	}
	if err := requireExactObjectKeys(value, []string{"outputId", "taskId", "runId", "generation", "modelInvocationId", "contextPackDigest", "projectPolicyDigest", "effectivePolicyDigest", "kind", "text", "contentDigest", "recordedAt", "outputDigest"}, nil); err != nil {
		return err
	}
	for _, field := range []string{"outputId", "taskId", "runId", "modelInvocationId"} {
		if err := requireIdentity(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	generation, ok := safeInteger(value["generation"])
	if !ok || generation < 1 {
		return errors.New("invalid task output generation")
	}
	for _, field := range []string{"contextPackDigest", "projectPolicyDigest", "effectivePolicyDigest", "contentDigest", "outputDigest"} {
		if err := requireDigest(value[field], "/value/"+field); err != nil {
			return err
		}
	}
	text, ok := value["text"].(string)
	if !ok || strings.TrimSpace(text) == "" || len(utf16.Encode([]rune(text))) > 65536 || !oneOf(stringValue(value["kind"]), "answer", "plan") {
		return errors.New("invalid task output text")
	}
	if err := validateSanitizedAgentPayload(text, "/value/text"); err != nil {
		return err
	}
	if err := requireInstant(value["recordedAt"], "/value/recordedAt"); err != nil {
		return err
	}
	contentDigest, err := canonicaljson.Digest(text)
	if err != nil || contentDigest != stringValue(value["contentDigest"]) {
		return errors.New("task output content digest drift")
	}
	if err := requireDigestMatch(value, "outputDigest", "/value/outputDigest"); err != nil {
		return err
	}
	return nil
}
