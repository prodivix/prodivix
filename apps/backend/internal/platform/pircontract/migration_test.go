package pircontract

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

func minimalPIRWireDocument(version string) json.RawMessage {
	return json.RawMessage(`{"version":"` + version + `","ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","kind":"element","type":"container"}},"childIdsById":{"root":[]}}}}`)
}

func decodeComparableJSON(t *testing.T, payload json.RawMessage) any {
	t.Helper()
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		t.Fatal(err)
	}
	return value
}

func readSharedPIRMigrationFixture(t *testing.T) (json.RawMessage, json.RawMessage) {
	t.Helper()
	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve migration fixture path")
	}
	payload, err := os.ReadFile(filepath.Join(
		filepath.Dir(currentFile),
		"..", "..", "..", "..", "..",
		"specs", "pir", "fixtures", "pir-v1.3-to-current.json",
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

func TestUpgradeDocumentPromotesAdditiveWireVersions(t *testing.T) {
	for _, sourceVersion := range []string{"1.4", "1.5"} {
		t.Run(sourceVersion, func(t *testing.T) {
			source := minimalPIRWireDocument(sourceVersion)
			result, err := UpgradeDocument(source)
			if err != nil {
				t.Fatal(err)
			}
			if !result.Migrated || result.SourceVersion != sourceVersion {
				t.Fatalf("unexpected migration result: %+v", result)
			}
			var migrated map[string]any
			if err := json.Unmarshal(result.Document, &migrated); err != nil {
				t.Fatal(err)
			}
			if migrated["version"] != CurrentVersion {
				t.Fatalf("expected version %s, got %v", CurrentVersion, migrated["version"])
			}
			if err := ValidateDocument(result.Document); err != nil {
				t.Fatalf("migrated document must satisfy current schema: %v", err)
			}
			if bytes.Contains(source, []byte(CurrentVersion)) {
				t.Fatal("source payload was unexpectedly modified")
			}
		})
	}
}

func TestUpgradeDocumentLeavesValidCurrentWireUnchanged(t *testing.T) {
	source := minimalPIRWireDocument(CurrentVersion)
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

func TestUpgradeDocumentMatchesSharedDeterministicFixture(t *testing.T) {
	source, expected := readSharedPIRMigrationFixture(t)
	first, err := UpgradeDocument(source)
	if err != nil {
		t.Fatal(err)
	}
	second, err := UpgradeDocument(source)
	if err != nil {
		t.Fatal(err)
	}
	if !bytes.Equal(first.Document, second.Document) {
		t.Fatal("migration output must be deterministic")
	}
	if !reflect.DeepEqual(
		decodeComparableJSON(t, first.Document),
		decodeComparableJSON(t, expected),
	) {
		t.Fatalf("migration output does not match shared fixture\nactual: %s\nexpected: %s", first.Document, expected)
	}
}

func TestUpgradeDocumentAcceptsEquivalentJSONGraphVersion(t *testing.T) {
	payload := json.RawMessage(`{"version":"1.3","ui":{"graph":{"version":1.0,"rootId":"root","nodesById":{"root":{"id":"root","type":"container"}},"childIdsById":{"root":[]}}}}`)
	if _, err := UpgradeDocument(payload); err != nil {
		t.Fatalf("JSON numeric equality must match the TypeScript migration: %v", err)
	}
}

func TestUpgradeDocumentFailsClosed(t *testing.T) {
	for name, payload := range map[string]json.RawMessage{
		"missing version":     json.RawMessage(`{"ui":{}}`),
		"unsupported version": json.RawMessage(`{"version":"1.2","ui":{}}`),
		"unsafe legacy data":  json.RawMessage(`{"version":"1.3","ui":{"graph":{"version":1,"rootId":"root","nodesById":{"root":{"id":"root","type":"container","props":{"value":{"$data":"items.title"}}}},"childIdsById":{"root":[]}}}}`),
	} {
		t.Run(name, func(t *testing.T) {
			if _, err := UpgradeDocument(payload); !errors.Is(err, ErrDocumentMigrationFailed) {
				t.Fatalf("expected fail-closed migration error, got %v", err)
			}
		})
	}
}
