package identity

import (
	"errors"
	"strings"
	"testing"
)

type failingReader struct{}

func (failingReader) Read([]byte) (int, error) {
	return 0, errors.New("entropy unavailable")
}

func TestNewRandomHexFailsClosedWhenEntropyIsUnavailable(t *testing.T) {
	original := randomReader
	randomReader = failingReader{}
	t.Cleanup(func() { randomReader = original })

	if value, err := NewRandomHex(16); err == nil || value != "" {
		t.Fatalf("expected empty fail-closed identity, got %q, %v", value, err)
	}
}

func TestNewIDUsesRequestedEntropySize(t *testing.T) {
	value, err := NewID("usr", 16)
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(value, "usr_") || len(value) != len("usr_")+32 {
		t.Fatalf("unexpected identity %q", value)
	}
}
