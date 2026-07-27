package animationcontract

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
)

const CurrentVersion = 2

var ErrDocumentMigrationFailed = errors.New("Animation wire migration failed")

type UpgradeResult struct {
	Document      json.RawMessage
	SourceVersion int
	Migrated      bool
}

type wireRecord map[string]any

func migrationFailure(path string, format string, args ...any) error {
	return fmt.Errorf(
		"%w at %s: %s",
		ErrDocumentMigrationFailed,
		path,
		fmt.Sprintf(format, args...),
	)
}

func decodeWireDocument(payload json.RawMessage) (wireRecord, error) {
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.UseNumber()
	var value any
	if err := decoder.Decode(&value); err != nil {
		return nil, migrationFailure("/", "document is not valid JSON: %v", err)
	}
	if err := decoder.Decode(&struct{}{}); !errors.Is(err, io.EOF) {
		return nil, migrationFailure("/", "document must contain exactly one JSON value")
	}
	record, ok := value.(map[string]any)
	if !ok {
		return nil, migrationFailure("/", "document must be an object")
	}
	return wireRecord(record), nil
}

func sortedKeys(record wireRecord) []string {
	keys := make([]string, 0, len(record))
	for key := range record {
		keys = append(keys, key)
	}
	sort.Strings(keys)
	return keys
}

func assertAllowedKeys(
	record wireRecord,
	path string,
	allowed ...string,
) error {
	allowedKeys := make(map[string]struct{}, len(allowed))
	for _, key := range allowed {
		allowedKeys[key] = struct{}{}
	}
	for _, key := range sortedKeys(record) {
		if key == "__proto__" || key == "prototype" || key == "constructor" {
			return migrationFailure(path+"/"+key, "unsafe persisted field")
		}
		if _, ok := allowedKeys[key]; !ok {
			return migrationFailure(
				path+"/"+key,
				"field cannot be migrated without losing authoring semantics",
			)
		}
	}
	return nil
}

func readVersion(record wireRecord) (int, error) {
	version, ok := record["version"].(json.Number)
	if !ok {
		return 0, migrationFailure("/version", "wire version must be an integer")
	}
	value, err := version.Int64()
	if err != nil || value < 1 || value > 1_000_000 {
		return 0, migrationFailure("/version", "wire version must be an integer")
	}
	return int(value), nil
}

func migrateV1(source wireRecord) (json.RawMessage, error) {
	if err := assertAllowedKeys(
		source,
		"",
		"version",
		"target",
		"timelines",
		"svgFilters",
		"x-animationEditor",
	); err != nil {
		return nil, err
	}
	rawTimelines, ok := source["timelines"].([]any)
	if !ok {
		return nil, migrationFailure("/timelines", "value must be an array")
	}
	timelines := make([]any, 0, len(rawTimelines))
	for index, value := range rawTimelines {
		path := fmt.Sprintf("/timelines/%d", index)
		timeline, ok := value.(map[string]any)
		if !ok {
			return nil, migrationFailure(path, "value must be an object")
		}
		if err := assertAllowedKeys(
			wireRecord(timeline),
			path,
			"id",
			"name",
			"durationMs",
			"delayMs",
			"iterations",
			"direction",
			"fillMode",
			"easing",
			"codeSlots",
			"bindings",
		); err != nil {
			return nil, err
		}
		migrated := make(wireRecord, len(timeline)+3)
		for key, value := range timeline {
			migrated[key] = value
		}
		migrated["motionIntent"] = "decorative"
		migrated["reducedMotion"] = wireRecord{"kind": "final-state"}
		migrated["markers"] = []any{}
		timelines = append(timelines, migrated)
	}
	upgraded := wireRecord{
		"version":      CurrentVersion,
		"target":       source["target"],
		"timelines":    timelines,
		"compositions": []any{},
	}
	if value, exists := source["svgFilters"]; exists {
		upgraded["svgFilters"] = value
	}
	if value, exists := source["x-animationEditor"]; exists {
		upgraded["x-animationEditor"] = value
	}
	payload, err := json.Marshal(upgraded)
	if err != nil {
		return nil, migrationFailure("/", "encode upgraded document: %v", err)
	}
	if err := ValidateDocument(payload); err != nil {
		return nil, migrationFailure("/", "upgraded document violates current schema: %v", err)
	}
	return payload, nil
}

// UpgradeDocument deterministically promotes any supported persisted snapshot
// into the activated immutable wire version.
func UpgradeDocument(payload json.RawMessage) (UpgradeResult, error) {
	document, err := decodeWireDocument(payload)
	if err != nil {
		return UpgradeResult{}, err
	}
	version, err := readVersion(document)
	if err != nil {
		return UpgradeResult{}, err
	}
	switch version {
	case CurrentVersion:
		if err := ValidateDocument(payload); err != nil {
			return UpgradeResult{}, migrationFailure("/", "current document is invalid: %v", err)
		}
		return UpgradeResult{
			Document:      append(json.RawMessage(nil), payload...),
			SourceVersion: version,
			Migrated:      false,
		}, nil
	case 1:
		upgraded, err := migrateV1(document)
		if err != nil {
			return UpgradeResult{}, err
		}
		return UpgradeResult{
			Document:      upgraded,
			SourceVersion: version,
			Migrated:      true,
		}, nil
	default:
		return UpgradeResult{}, migrationFailure(
			"/version",
			"unsupported Animation wire version %d",
			version,
		)
	}
}
