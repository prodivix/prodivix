package pircontract

import "testing"

func TestDefaultDocumentConformsToCurrentSchema(t *testing.T) {
	if err := ValidateDocument(DefaultDocument()); err != nil {
		t.Fatalf("default PIR document must conform to the generated current schema: %v", err)
	}
}
