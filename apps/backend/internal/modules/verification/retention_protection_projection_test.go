package verification

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"testing"

	"github.com/DATA-DOG/go-sqlmock"
)

func TestLoadActiveRetentionProtectionsProjectsCanonicalReadModel(t *testing.T) {
	t.Parallel()
	database, mock, err := sqlmock.New()
	if err != nil {
		t.Fatalf("open mock database: %v", err)
	}
	defer database.Close()

	mock.ExpectQuery(`(?s)SELECT id, evidence_id, kind,.*verification_retention_protections.*workspace_id = \$1 AND evidence_id = \$2 AND active`).
		WithArgs("workspace-1", "evidence-1", maximumActiveRetentionProtections+1).
		WillReturnRows(sqlmock.NewRows([]string{
			"id", "evidence_id", "kind", "external_ref", "active", "version",
		}).
			AddRow("protection-z", "evidence-1", "legal-hold", "case-42", true, int64(2)).
			AddRow("protection-a", "evidence-1", "change", "change-42", true, int64(1)))

	protections, err := loadActiveRetentionProtections(
		context.Background(),
		database,
		"workspace-1",
		"evidence-1",
	)
	if err != nil {
		t.Fatalf("load protections: %v", err)
	}
	if len(protections) != 2 ||
		protections[0].ID != "protection-a" ||
		protections[1].Kind != "legal-hold" ||
		!protections[1].Active {
		t.Fatalf("active protections = %#v", protections)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatalf("database expectations: %v", err)
	}
}

func TestNormalizeActiveRetentionProtectionsFailsClosed(t *testing.T) {
	t.Parallel()
	valid := RetentionProtection{
		ID:          "protection-1",
		EvidenceID:  "evidence-1",
		Kind:        "change",
		ExternalRef: "change-42",
		Active:      true,
		Version:     1,
	}
	cases := map[string][]RetentionProtection{
		"duplicate id": {
			valid,
			{
				ID:          valid.ID,
				EvidenceID:  valid.EvidenceID,
				Kind:        "release",
				ExternalRef: "release-42",
				Active:      true,
				Version:     1,
			},
		},
		"duplicate storage tuple": {
			valid,
			{
				ID:          "protection-2",
				EvidenceID:  valid.EvidenceID,
				Kind:        valid.Kind,
				ExternalRef: valid.ExternalRef,
				Active:      true,
				Version:     1,
			},
		},
		"wrong evidence": {{
			ID: "protection-1", EvidenceID: "evidence-2", Kind: "change",
			ExternalRef: "change-42", Active: true, Version: 1,
		}},
		"inactive": {{
			ID: "protection-1", EvidenceID: "evidence-1", Kind: "change",
			ExternalRef: "change-42", Active: false, Version: 1,
		}},
		"unsupported kind": {{
			ID: "protection-1", EvidenceID: "evidence-1", Kind: "session",
			ExternalRef: "change-42", Active: true, Version: 1,
		}},
		"unsafe URL": {{
			ID: "protection-1", EvidenceID: "evidence-1", Kind: "change",
			ExternalRef: "https://example.test/change-42", Active: true, Version: 1,
		}},
		"unsafe query": {{
			ID: "protection-1", EvidenceID: "evidence-1", Kind: "change",
			ExternalRef: "change-42?token=unsafe", Active: true, Version: 1,
		}},
		"credential label": {{
			ID: "protection-1", EvidenceID: "evidence-1", Kind: "change",
			ExternalRef: "access-token", Active: true, Version: 1,
		}},
		"non canonical text": {{
			ID: "protection-1", EvidenceID: "evidence-1", Kind: "change",
			ExternalRef: "change-\u0065\u0301", Active: true, Version: 1,
		}},
		"oversized external ref": {{
			ID: "protection-1", EvidenceID: "evidence-1", Kind: "change",
			ExternalRef: "r" + strings.Repeat("a", 256), Active: true, Version: 1,
		}},
	}
	for name, protections := range cases {
		t.Run(name, func(t *testing.T) {
			t.Parallel()
			if _, err := normalizeActiveRetentionProtections(
				protections,
				"evidence-1",
			); !errors.Is(err, ErrConflict) {
				t.Fatalf("normalize error = %v, want conflict", err)
			}
		})
	}
}

func TestActiveRetentionProtectionDiagnosticDoesNotEchoUnsafeReference(t *testing.T) {
	t.Parallel()
	unsafeReference := "sk-this-value-must-never-be-echoed"
	_, err := normalizeActiveRetentionProtections([]RetentionProtection{{
		ID:          "protection-1",
		EvidenceID:  "evidence-1",
		Kind:        "release",
		ExternalRef: unsafeReference,
		Active:      true,
		Version:     1,
	}}, "evidence-1")
	var diagnostic *CodedError
	if !errors.As(err, &diagnostic) || diagnostic.Code != "VER-5002" {
		t.Fatalf("diagnostic = %#v, want VER-5002", err)
	}
	if strings.Contains(err.Error(), unsafeReference) {
		t.Fatal("unsafe retention reference was echoed by the diagnostic")
	}
}

func TestEvidenceRecordJSONRequiresActiveProtectionProjection(t *testing.T) {
	t.Parallel()
	encoded, err := json.Marshal(EvidenceRecord{
		ActiveProtections: []RetentionProtection{},
	})
	if err != nil {
		t.Fatalf("marshal EvidenceRecord: %v", err)
	}
	if !strings.Contains(string(encoded), `"activeProtections":[]`) {
		t.Fatalf("EvidenceRecord JSON = %s", encoded)
	}
}
