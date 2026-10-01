package verificationcontract

import (
	"encoding/json"
	"errors"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

// ReadClosureReference validates the existing public Closure wire and returns
// its normalized current projection, preserving the original evidence/issues.
func ReadClosureReference(payload json.RawMessage) (map[string]any, []byte, error) {
	if err := canonicaljson.ValidateRaw(payload, 64*1024*1024); err != nil {
		return nil, nil, err
	}
	if err := ValidateEvidenceTransport("verification-closure", payload); err != nil {
		return nil, nil, err
	}
	var current map[string]any
	if err := json.Unmarshal(payload, &current); err != nil {
		return nil, nil, err
	}
	delete(current, "wireVersion")
	for _, key := range []string{"policyEvaluationInstant", "closureEvaluationInstant"} {
		if _, err := time.Parse(time.RFC3339Nano, current[key].(string)); err != nil {
			return nil, nil, err
		}
	}
	for _, key := range []string{"baselineSetDigests", "evidenceDigests", "appliedExemptionIds"} {
		if !canonicalClosureStrings(current[key].([]any)) {
			return nil, nil, errors.New("noncanonical Closure array")
		}
	}
	issues := current["issues"].([]any)
	for i, raw := range issues {
		issue := raw.(map[string]any)
		if !canonicalClosureStrings(issue["evidenceIds"].([]any)) {
			return nil, nil, errors.New("noncanonical Closure issue evidence")
		}
		if i > 0 && compareClosureIssue(issues[i-1].(map[string]any), issue) > 0 {
			return nil, nil, errors.New("noncanonical Closure issues")
		}
	}
	digest := current["closureDigest"]
	delete(current, "closureDigest")
	expected, err := canonicaljson.Digest(current)
	current["closureDigest"] = digest
	if err != nil || expected != digest {
		return nil, nil, errors.New("Closure digest drift")
	}
	canonical, err := canonicaljson.Bytes(current)
	return current, canonical, err
}

func canonicalClosureStrings(values []any) bool {
	return sort.SliceIsSorted(values, func(i, j int) bool { return values[i].(string) < values[j].(string) })
}
func compareClosureIssue(left, right map[string]any) int {
	for _, key := range []string{"cellId", "status", "message"} {
		l, _ := left[key].(string)
		r, _ := right[key].(string)
		if l < r {
			return -1
		}
		if l > r {
			return 1
		}
	}
	return 0
}
