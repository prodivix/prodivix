package verification

import (
	"context"
	"fmt"
	"regexp"
	"sort"
	"strings"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const maximumActiveRetentionProtections = 10_000

var (
	retentionExternalRefURLOrQueryPattern = regexp.MustCompile(
		`(?:^[A-Za-z][A-Za-z0-9+.-]*://)|[/?#&=@]`,
	)
	retentionExternalRefCredentialLabelPattern = regexp.MustCompile(
		`(?i)(?:^|[._:-])(?:authorization|bearer|cookie|set-cookie|api[-_]?key|access[-_]?token|auth[-_]?token|client[-_]?secret|password|passwd|private[-_]?key|secret)(?:$|[._:-])`,
	)
	retentionExternalRefCredentialValuePatterns = []*regexp.Regexp{
		regexp.MustCompile(`^AKIA[0-9A-Z]{16}$`),
		regexp.MustCompile(`^gh[pousr]_[A-Za-z0-9_]{20,}$`),
		regexp.MustCompile(`^eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}$`),
		regexp.MustCompile(`^sk-[A-Za-z0-9_-]{16,}$`),
	}
)

func loadActiveRetentionProtections(
	ctx context.Context,
	queryer readQueryer,
	workspaceID string,
	evidenceID string,
) ([]RetentionProtection, error) {
	rows, err := queryer.QueryContext(ctx, `SELECT id, evidence_id, kind,
	external_ref, active, version
FROM verification_retention_protections
WHERE workspace_id = $1 AND evidence_id = $2 AND active
ORDER BY id
LIMIT $3`, workspaceID, evidenceID, maximumActiveRetentionProtections+1)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	protections := make([]RetentionProtection, 0)
	for rows.Next() {
		var protection RetentionProtection
		if err := rows.Scan(
			&protection.ID,
			&protection.EvidenceID,
			&protection.Kind,
			&protection.ExternalRef,
			&protection.Active,
			&protection.Version,
		); err != nil {
			return nil, err
		}
		protections = append(protections, protection)
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}
	return normalizeActiveRetentionProtections(protections, evidenceID)
}

func normalizeActiveRetentionProtections(
	protections []RetentionProtection,
	expectedEvidenceID string,
) ([]RetentionProtection, error) {
	if len(protections) > maximumActiveRetentionProtections {
		return nil, invalidStoredRetentionProtection()
	}
	normalized := append(make([]RetentionProtection, 0, len(protections)), protections...)
	ids := make(map[string]struct{}, len(normalized))
	storageIdentities := make(map[string]struct{}, len(normalized))
	for _, protection := range normalized {
		if !canonicalRetentionProtectionIdentifier(protection.ID) ||
			!canonicalRetentionProtectionIdentifier(protection.EvidenceID) ||
			protection.EvidenceID != expectedEvidenceID ||
			(protection.Kind != "change" &&
				protection.Kind != "release" &&
				protection.Kind != "legal-hold") ||
			!protection.Active ||
			protection.Version < 1 ||
			protection.Version > 9_007_199_254_740_991 {
			return nil, invalidStoredRetentionProtection()
		}
		if err := validateRetentionProtectionExternalRef(protection.ExternalRef); err != nil {
			return nil, err
		}
		if _, duplicate := ids[protection.ID]; duplicate {
			return nil, invalidStoredRetentionProtection()
		}
		ids[protection.ID] = struct{}{}
		storageIdentity := fmt.Sprintf(
			"%s\x00%s\x00%s",
			protection.EvidenceID,
			protection.Kind,
			protection.ExternalRef,
		)
		if _, duplicate := storageIdentities[storageIdentity]; duplicate {
			return nil, invalidStoredRetentionProtection()
		}
		storageIdentities[storageIdentity] = struct{}{}
	}
	sort.Slice(normalized, func(left, right int) bool {
		if normalized[left].ID != normalized[right].ID {
			return normalized[left].ID < normalized[right].ID
		}
		if normalized[left].EvidenceID != normalized[right].EvidenceID {
			return normalized[left].EvidenceID < normalized[right].EvidenceID
		}
		if normalized[left].Kind != normalized[right].Kind {
			return normalized[left].Kind < normalized[right].Kind
		}
		return normalized[left].ExternalRef < normalized[right].ExternalRef
	})
	return normalized, nil
}

func canonicalRetentionProtectionIdentifier(value string) bool {
	return value == strings.TrimSpace(value) &&
		utf8.ValidString(value) &&
		norm.NFC.IsNormalString(value) &&
		identifierPattern.MatchString(value)
}

func validateRetentionProtectionExternalRef(value string) error {
	if value == "" ||
		value != strings.TrimSpace(value) ||
		len([]byte(value)) > 256 ||
		!utf8.ValidString(value) ||
		!norm.NFC.IsNormalString(value) {
		return invalidStoredRetentionProtection()
	}
	for _, character := range value {
		if character <= 0x1f || character == 0x7f {
			return invalidStoredRetentionProtection()
		}
	}
	if retentionExternalRefURLOrQueryPattern.MatchString(value) ||
		retentionExternalRefCredentialLabelPattern.MatchString(value) {
		return unsafeStoredRetentionProtection()
	}
	for _, pattern := range retentionExternalRefCredentialValuePatterns {
		if pattern.MatchString(value) {
			return unsafeStoredRetentionProtection()
		}
	}
	if !digestPattern.MatchString(value) && !identifierPattern.MatchString(value) {
		return invalidStoredRetentionProtection()
	}
	return nil
}

func invalidStoredRetentionProtection() error {
	return coded(
		"VER-5001",
		"Stored retention protection projection is invalid.",
		ErrConflict,
	)
}

func unsafeStoredRetentionProtection() error {
	return coded(
		"VER-5002",
		"Stored retention protection contains unsafe external reference material.",
		ErrConflict,
	)
}
