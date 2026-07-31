package canonicaljson

import (
	"strings"
	"testing"
)

func TestBytesMatchesSharedCanonicalOrderingAndEscaping(t *testing.T) {
	value := map[string]any{
		"😀": "雪",
		"a": "<&>",
		"B": float64(2),
	}
	encoded, err := Bytes(value)
	if err != nil {
		t.Fatal(err)
	}
	want := `{"B":2,"a":"<&>","😀":"雪"}`
	if string(encoded) != want {
		t.Fatalf("canonical JSON = %s, want %s", encoded, want)
	}
}

func TestValidateRawRejectsAmbiguousOrUnsafeInput(t *testing.T) {
	for _, source := range []string{
		`{"id":"first","id":"second"}`,
		`{"__proto__":{}}`,
		strings.Repeat(" ", 65),
	} {
		if err := ValidateRaw([]byte(source), 64); err == nil {
			t.Fatalf("ValidateRaw(%q) succeeded", source)
		}
	}
}
