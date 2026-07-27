package remoteexecution

import (
	"errors"
	"strings"
	"testing"
)

// The exponential backoff ceiling is projected with a loop bounded by
// MaximumAttempts, so that bound has to be validated before the loop runs.
// With initialDelayMs == 0 the accumulator never grows and the loop's own
// early return can never fire, which let an authored data-source document
// choose the iteration count.
func TestDataGatewayRetryPolicyBoundsAttemptsBeforeProjectingBackoff(t *testing.T) {
	document := []byte(strings.NewReplacer(
		`"policies": {}`,
		`"policies": {"retry":{"maxAttempts":9223372036854775807,"backoff":"exponential","initialDelayMs":0}}`,
	).Replace(string(remoteDataDocument())))

	_, _, err := parseDataGatewayDocument(document, "catalog", "list")

	if !errors.Is(err, ErrDataGatewayDenied) {
		t.Fatalf("expected an out-of-range attempt count to be denied: err=%v", err)
	}
}
