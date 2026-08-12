package agent

import (
	"fmt"
	"sort"
	"testing"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

func TestEvaluationAttemptGradingDigestUsesCanonicalDigestOrder(t *testing.T) {
	digest := func(label string) string { return evaluationServiceTestDigest(t, label) }
	observation := func(metricID, graderID string) map[string]any {
		base := map[string]any{
			"metricId": metricID, "graderId": graderID, "graderKind": "deterministic-test",
			"authority": "deterministic", "verdict": "passed",
		}
		value := cloneEvaluationObject(base)
		observationDigest, err := canonicaljson.Digest(base)
		if err != nil {
			t.Fatalf("digest observation: %v", err)
		}
		value["observationDigest"] = observationDigest
		return value
	}
	first := observation("metric.a", "grader.a")
	var second map[string]any
	var metricOrder, digestOrder []string
	for index := 0; index < 256; index++ {
		second = observation("metric.b", fmt.Sprintf("grader.b.%03d", index))
		metricOrder = []string{stringMember(first, "observationDigest"), stringMember(second, "observationDigest")}
		digestOrder = append([]string(nil), metricOrder...)
		sort.Strings(digestOrder)
		if metricOrder[0] != digestOrder[0] {
			break
		}
	}
	if metricOrder[0] == digestOrder[0] {
		t.Fatal("test vector did not distinguish metric order from digest order")
	}
	execution := map[string]any{
		"modelInvocations": int64(1), "toolCalls": int64(0), "repairRounds": int64(0),
		"transactions": int64(0), "artifactBytes": int64(0),
		"capabilityExecutionReceiptSetDigest":      digest("grading-capability-set"),
		"verificationAttemptGrantReceiptSetDigest": digest("grading-grant-set"),
	}
	base := map[string]any{
		"descriptorDigest":                 digest("grading-descriptor"),
		"invocationTurnSetReceiptDigest":   digest("grading-turn-set"),
		"terminalTurnReceiptDigest":        digest("grading-terminal-turn"),
		"capabilityExecutionReceiptDigest": digest("grading-capability"),
		"observationDigests":               digestOrder,
		"execution":                        execution,
	}
	gradingDigest, err := canonicaljson.Digest(base)
	if err != nil {
		t.Fatalf("digest grading preimage: %v", err)
	}
	payload := map[string]any{
		"plan": map[string]any{
			"graderPlan": map[string]any{"graders": []any{
				map[string]any{"graderId": "grader.a", "kind": "deterministic-test", "authority": "deterministic"},
				map[string]any{"graderId": stringMember(second, "graderId"), "kind": "deterministic-test", "authority": "deterministic"},
			}},
			"thresholds": map[string]any{"metrics": []any{
				map[string]any{"metricId": "metric.a"}, map[string]any{"metricId": "metric.b"},
			}},
		},
		"status":                     "completed",
		"descriptor":                 map[string]any{"descriptorDigest": base["descriptorDigest"]},
		"invocationTurnSetReceipt":   map[string]any{"receiptDigest": base["invocationTurnSetReceiptDigest"]},
		"terminalTurnReceipt":        map[string]any{"evidenceDigest": base["terminalTurnReceiptDigest"]},
		"capabilityExecutionReceipt": map[string]any{"receiptDigest": base["capabilityExecutionReceiptDigest"]},
		"execution":                  execution,
	}
	value := map[string]any{
		"metricObservations": []any{first, second},
		"gradingDigest":      gradingDigest,
	}
	if err := validateEvaluationAttemptAuthorityGrading(payload, value); err != nil {
		t.Fatalf("validate digest-ordered grading authority: %v", err)
	}
	execution["artifactBytes"] = int64(16_777_217)
	if err := validateEvaluationAttemptAuthorityGrading(payload, value); err == nil {
		t.Fatal("grading authority accepted an out-of-bounds execution measurement")
	}
}
