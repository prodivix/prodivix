package animationcontract

import (
	"bytes"
	"encoding/json"
	"errors"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"testing"
)

func readSharedMigrationFixture(
	t *testing.T,
) (json.RawMessage, json.RawMessage) {
	t.Helper()
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve Animation migration fixture path")
	}
	payload, err := os.ReadFile(filepath.Join(
		filepath.Dir(currentFile),
		"..", "..", "..", "..", "..",
		"specs", "animation", "fixtures", "animation-v1-to-v2.json",
	))
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Source   json.RawMessage `json:"source"`
		Expected json.RawMessage `json:"expected"`
	}
	if err := json.Unmarshal(payload, &fixture); err != nil {
		t.Fatal(err)
	}
	return fixture.Source, fixture.Expected
}

func decodeComparableJSON(t *testing.T, payload json.RawMessage) any {
	t.Helper()
	var value any
	if err := json.Unmarshal(payload, &value); err != nil {
		t.Fatal(err)
	}
	return value
}

func TestUpgradeDocumentMatchesSharedDeterministicFixture(t *testing.T) {
	source, expected := readSharedMigrationFixture(t)
	first, err := UpgradeDocument(source)
	if err != nil {
		t.Fatal(err)
	}
	second, err := UpgradeDocument(source)
	if err != nil {
		t.Fatal(err)
	}
	if !first.Migrated || first.SourceVersion != 1 {
		t.Fatalf("unexpected migration result: %+v", first)
	}
	if !bytes.Equal(first.Document, second.Document) {
		t.Fatal("migration output must be deterministic")
	}
	if !reflect.DeepEqual(
		decodeComparableJSON(t, first.Document),
		decodeComparableJSON(t, expected),
	) {
		t.Fatalf(
			"migration output does not match shared fixture\nactual: %s\nexpected: %s",
			first.Document,
			expected,
		)
	}
	if err := ValidateDocument(first.Document); err != nil {
		t.Fatalf("migrated document must satisfy current schema: %v", err)
	}
}

func TestUpgradeDocumentLeavesCurrentWireUnchanged(t *testing.T) {
	source := json.RawMessage(
		`{"version":2,"target":{"kind":"pir-document","documentId":"page"},"timelines":[],"compositions":[]}`,
	)
	result, err := UpgradeDocument(source)
	if err != nil {
		t.Fatal(err)
	}
	if result.Migrated {
		t.Fatal("current wire must not be rewritten")
	}
	if !bytes.Equal(result.Document, source) {
		t.Fatal("current wire bytes must remain unchanged")
	}
}

func TestUpgradeDocumentFailsClosed(t *testing.T) {
	for name, payload := range map[string]json.RawMessage{
		"missing version": json.RawMessage(
			`{"target":{"kind":"pir-document","documentId":"page"},"timelines":[]}`,
		),
		"unsupported version": json.RawMessage(
			`{"version":3,"target":{"kind":"pir-document","documentId":"page"},"timelines":[]}`,
		),
		"unknown field": json.RawMessage(
			`{"version":1,"target":{"kind":"pir-document","documentId":"page"},"timelines":[],"metadata":{}}`,
		),
		"new field under old version": json.RawMessage(
			`{"version":1,"target":{"kind":"pir-document","documentId":"page"},"timelines":[{"id":"intro","name":"Intro","durationMs":1,"bindings":[],"markers":[]}]}`,
		),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := UpgradeDocument(payload); !errors.Is(
				err,
				ErrDocumentMigrationFailed,
			) {
				t.Fatalf("expected fail-closed migration error, got %v", err)
			}
		})
	}
}

func TestAllowedDocumentPatchRootsComeFromGeneratedSchema(t *testing.T) {
	for _, field := range []string{
		"target",
		"timelines",
		"compositions",
		"entryCompositionId",
		"svgFilters",
		"x-animationEditor",
	} {
		if !AllowsDocumentPatchRoot(field) {
			t.Fatalf("generated schema omitted patch root %q", field)
		}
	}
	if AllowsDocumentPatchRoot("version") || AllowsDocumentPatchRoot("unknown") {
		t.Fatal("wire version and unknown fields cannot be patched by current domain commands")
	}
}
