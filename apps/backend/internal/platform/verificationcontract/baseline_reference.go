package verificationcontract

import (
	"encoding/json"
	"sort"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
)

type BaselineReferenceSet struct {
	ID      string                   `json:"id"`
	Name    string                   `json:"name"`
	Entries []BaselineReferenceEntry `json:"entries"`
}
type BaselineReferenceEntry struct {
	ID              string `json:"id"`
	ScenarioID      string `json:"scenarioId"`
	StepID          string `json:"stepId"`
	TargetID        string `json:"targetId"`
	FrameworkTarget string `json:"frameworkTarget"`
	Surface         string `json:"surface"`
	BrowserEngine   string `json:"browserEngine,omitempty"`
	Viewport        struct {
		ID     string `json:"id"`
		Width  int64  `json:"width"`
		Height int64  `json:"height"`
	} `json:"viewport"`
	ColorScheme      string  `json:"colorScheme"`
	Motion           string  `json:"motion"`
	Locale           string  `json:"locale"`
	DevicePixelRatio float64 `json:"devicePixelRatio"`
	Asset            struct {
		AssetDocumentID string `json:"assetDocumentId"`
		Digest          string `json:"digest"`
		MediaType       string `json:"mediaType"`
	} `json:"asset"`
	NormalizerDigest           string `json:"normalizerDigest"`
	CompatibilityProfileDigest string `json:"compatibilityProfileDigest"`
	AdoptedAt                  string `json:"adoptedAt"`
	AdoptedBy                  string `json:"adoptedBy"`
}

// ReadBaselineReferences mirrors the public codec's current projection after
// the same generated schema and semantic admission used by Atomic Commit.
func ReadBaselineReferences(documentID string, payload json.RawMessage) (BaselineReferenceSet, string, error) {
	if err := canonicaljson.ValidateRaw(payload, 64*1024*1024); err != nil {
		return BaselineReferenceSet{}, "", err
	}
	if err := ValidateDocument("verification-baseline-set", documentID, payload); err != nil {
		return BaselineReferenceSet{}, "", err
	}
	var value BaselineReferenceSet
	if err := json.Unmarshal(payload, &value); err != nil {
		return BaselineReferenceSet{}, "", err
	}
	sort.Slice(value.Entries, func(i, j int) bool { return value.Entries[i].ID < value.Entries[j].ID })
	digest, err := canonicaljson.Digest(value)
	return value, digest, err
}
