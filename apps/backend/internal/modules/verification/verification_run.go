package verification

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"sort"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/verificationcontract"
)

const (
	maximumVerificationRunBytes       = 64 * 1024 * 1024
	maximumVerificationRunJSONMembers = 250_000
	maximumVerificationEventBytes     = 1024 * 1024
)

type VerificationRunCellState struct {
	CellID          string `json:"cellId"`
	AttemptID       string `json:"attemptId"`
	Status          string `json:"status"`
	LastEventCursor int64  `json:"lastEventCursor"`
	StartedAt       string `json:"startedAt,omitempty"`
	CompletedAt     string `json:"completedAt,omitempty"`
	CandidateDigest string `json:"candidateDigest,omitempty"`
	EvidenceID      string `json:"evidenceId,omitempty"`
	DiagnosticCode  string `json:"diagnosticCode,omitempty"`
}

type VerificationRunSnapshot struct {
	RunID             string                     `json:"runId"`
	WorkspaceID       string                     `json:"workspaceId"`
	WorkspaceRevision int64                      `json:"workspaceRevision"`
	PlanDigest        string                     `json:"planDigest"`
	Surface           string                     `json:"surface"`
	Scope             string                     `json:"scope"`
	ProviderID        string                     `json:"providerId"`
	Origin            string                     `json:"origin"`
	CI                *CIRepositoryIdentity      `json:"ci,omitempty"`
	Status            string                     `json:"status"`
	Cursor            int64                      `json:"cursor"`
	CreatedAt         string                     `json:"createdAt"`
	UpdatedAt         string                     `json:"updatedAt"`
	SelectedCellIDs   []string                   `json:"selectedCellIds"`
	Cells             []VerificationRunCellState `json:"cells"`
	ClosureDigest     string                     `json:"closureDigest,omitempty"`
	ClosureVerdict    string                     `json:"closureVerdict,omitempty"`
	SnapshotDigest    string                     `json:"snapshotDigest"`
}

type VerificationRunSnapshotWire struct {
	WireVersion int `json:"wireVersion"`
	VerificationRunSnapshot
}

type VerificationRunEvent struct {
	EventID         string `json:"eventId"`
	RunID           string `json:"runId"`
	Cursor          int64  `json:"cursor"`
	OccurredAt      string `json:"occurredAt"`
	Kind            string `json:"kind"`
	CellID          string `json:"cellId,omitempty"`
	AttemptID       string `json:"attemptId,omitempty"`
	Outcome         string `json:"outcome,omitempty"`
	CandidateDigest string `json:"candidateDigest,omitempty"`
	DiagnosticCode  string `json:"diagnosticCode,omitempty"`
	EvidenceID      string `json:"evidenceId,omitempty"`
	Reason          string `json:"reason,omitempty"`
	ReasonCode      string `json:"reasonCode,omitempty"`
	ClosureDigest   string `json:"closureDigest,omitempty"`
	Verdict         string `json:"verdict,omitempty"`
	EventDigest     string `json:"eventDigest"`
}

type VerificationRunEventWire struct {
	WireVersion int `json:"wireVersion"`
	VerificationRunEvent
}

type VerificationRunRecord struct {
	Snapshot VerificationRunSnapshotWire `json:"snapshot"`
	Events   []VerificationRunEventWire  `json:"events"`
}

func decodeVerificationRunSnapshotWire(
	payload json.RawMessage,
) (VerificationRunSnapshotWire, []byte, error) {
	if len(payload) < 1 || len(payload) > maximumVerificationRunBytes ||
		validateJSONObjectWithinBudget(
			payload,
			maximumVerificationRunBytes,
			maximumVerificationRunJSONMembers,
		) != nil ||
		verificationcontract.ValidateEvidenceTransport(
			"verification-run-snapshot",
			payload,
		) != nil {
		return VerificationRunSnapshotWire{}, nil, coded(
			"VER-5001",
			"Verification run snapshot is not strict bounded JSON.",
			ErrInvalid,
		)
	}
	var wire VerificationRunSnapshotWire
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return VerificationRunSnapshotWire{}, nil, coded(
			"VER-5001",
			"Verification run snapshot does not match the current wire contract.",
			ErrInvalid,
		)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return VerificationRunSnapshotWire{}, nil, ErrInvalid
	}
	if wire.WireVersion != 1 {
		return VerificationRunSnapshotWire{}, nil, ErrInvalid
	}
	if err := validateVerificationRunSnapshot(wire.VerificationRunSnapshot); err != nil {
		return VerificationRunSnapshotWire{}, nil, err
	}
	canonical, err := canonicalBytes(wire)
	if err != nil {
		return VerificationRunSnapshotWire{}, nil, ErrInvalid
	}
	return wire, canonical, nil
}

func decodeVerificationRunEventWire(
	payload json.RawMessage,
) (VerificationRunEventWire, []byte, error) {
	if len(payload) < 1 || len(payload) > maximumVerificationEventBytes ||
		validateJSONObject(payload) != nil ||
		verificationcontract.ValidateEvidenceTransport(
			"verification-run-event",
			payload,
		) != nil {
		return VerificationRunEventWire{}, nil, coded(
			"VER-5001",
			"Verification run event is not strict bounded JSON.",
			ErrInvalid,
		)
	}
	var wire VerificationRunEventWire
	decoder := json.NewDecoder(bytes.NewReader(payload))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(&wire); err != nil {
		return VerificationRunEventWire{}, nil, coded(
			"VER-5001",
			"Verification run event does not match the current wire contract.",
			ErrInvalid,
		)
	}
	if err := decoder.Decode(new(any)); !errors.Is(err, io.EOF) {
		return VerificationRunEventWire{}, nil, ErrInvalid
	}
	if wire.WireVersion != 1 {
		return VerificationRunEventWire{}, nil, ErrInvalid
	}
	if err := validateVerificationRunEvent(wire.VerificationRunEvent); err != nil {
		return VerificationRunEventWire{}, nil, err
	}
	canonical, err := canonicalBytes(wire)
	if err != nil {
		return VerificationRunEventWire{}, nil, ErrInvalid
	}
	return wire, canonical, nil
}

func validateVerificationRunSnapshot(snapshot VerificationRunSnapshot) error {
	for field, value := range map[string]string{
		"runId":       snapshot.RunID,
		"workspaceId": snapshot.WorkspaceID,
		"providerId":  snapshot.ProviderID,
	} {
		if validateIdentifier(value, field) != nil {
			return coded("VER-4002", "Verification run identity is invalid.", ErrInvalid)
		}
	}
	if !validRevision(snapshot.WorkspaceRevision) ||
		!validRevision(snapshot.Cursor) ||
		!digestPattern.MatchString(snapshot.PlanDigest) ||
		!digestPattern.MatchString(snapshot.SnapshotDigest) ||
		!validVerificationRunSurface(snapshot.Surface) ||
		!validVerificationRunScope(snapshot.Scope) ||
		!validVerificationRunOrigin(snapshot.Origin) ||
		!validVerificationRunStatus(snapshot.Status) {
		return coded("VER-4002", "Verification run coordinates are invalid.", ErrInvalid)
	}
	createdAt, createdErr := parseInstant(snapshot.CreatedAt)
	updatedAt, updatedErr := parseInstant(snapshot.UpdatedAt)
	if createdErr != nil || updatedErr != nil || updatedAt.Before(createdAt) {
		return coded("VER-4002", "Verification run timing is invalid.", ErrInvalid)
	}
	if (snapshot.Origin == "ci") != (snapshot.CI != nil) ||
		(snapshot.CI != nil && validateCIRepositoryIdentity(*snapshot.CI) != nil) {
		return coded("VER-5003", "Verification CI run identity is invalid.", ErrInvalid)
	}
	if len(snapshot.Cells) < 1 ||
		len(snapshot.Cells) > 10_000 ||
		len(snapshot.SelectedCellIDs) != len(snapshot.Cells) {
		return coded("VER-4002", "Verification run cell selection is invalid.", ErrInvalid)
	}
	attemptIDs := make(map[string]struct{}, len(snapshot.Cells))
	for index, cell := range snapshot.Cells {
		if validateIdentifier(cell.CellID, "cellId") != nil ||
			validateIdentifier(cell.AttemptID, "attemptId") != nil ||
			!validVerificationRunCellStatus(cell.Status) ||
			!validRevision(cell.LastEventCursor) ||
			cell.LastEventCursor > snapshot.Cursor ||
			(index > 0 && snapshot.Cells[index-1].CellID >= cell.CellID) ||
			snapshot.SelectedCellIDs[index] != cell.CellID {
			return coded("VER-4002", "Verification run cell identity is invalid.", ErrInvalid)
		}
		if index > 0 && snapshot.SelectedCellIDs[index-1] >= snapshot.SelectedCellIDs[index] {
			return coded("VER-4002", "Verification run cells must be sorted and unique.", ErrInvalid)
		}
		if _, duplicate := attemptIDs[cell.AttemptID]; duplicate {
			return coded("VER-4002", "Verification run attempt identities must be unique.", ErrInvalid)
		}
		attemptIDs[cell.AttemptID] = struct{}{}
		if cell.StartedAt != "" {
			if _, err := parseInstant(cell.StartedAt); err != nil {
				return ErrInvalid
			}
		}
		if cell.CompletedAt != "" {
			if _, err := parseInstant(cell.CompletedAt); err != nil {
				return ErrInvalid
			}
		}
		if cell.CandidateDigest != "" && !digestPattern.MatchString(cell.CandidateDigest) {
			return ErrInvalid
		}
		if cell.EvidenceID != "" &&
			(cell.CandidateDigest == "" || validateIdentifier(cell.EvidenceID, "evidenceId") != nil) {
			return ErrInvalid
		}
		if cell.DiagnosticCode != "" && !verificationDiagnosticCode(cell.DiagnosticCode) {
			return ErrInvalid
		}
	}
	if (snapshot.ClosureDigest == "") != (snapshot.ClosureVerdict == "") ||
		(snapshot.ClosureDigest != "" && !digestPattern.MatchString(snapshot.ClosureDigest)) ||
		(snapshot.ClosureVerdict != "" &&
			snapshot.ClosureVerdict != "satisfied" &&
			snapshot.ClosureVerdict != "unsatisfied" &&
			snapshot.ClosureVerdict != "stale") {
		return ErrInvalid
	}
	computed, _, err := digestWithoutField(snapshot, "snapshotDigest")
	if err != nil || computed != snapshot.SnapshotDigest {
		return coded("VER-5001", "Verification run snapshot digest does not match.", ErrInvalid)
	}
	return nil
}

func validateInitialVerificationRun(snapshot VerificationRunSnapshot) error {
	if err := validateVerificationRunSnapshot(snapshot); err != nil {
		return err
	}
	if snapshot.Cursor != 0 ||
		snapshot.CreatedAt != snapshot.UpdatedAt ||
		snapshot.ClosureDigest != "" ||
		snapshot.ClosureVerdict != "" {
		return coded("VER-4002", "Verification run must begin at cursor zero.", ErrInvalid)
	}
	hasQueued := false
	for _, cell := range snapshot.Cells {
		if cell.LastEventCursor != 0 ||
			cell.StartedAt != "" ||
			cell.CompletedAt != "" ||
			cell.CandidateDigest != "" ||
			cell.EvidenceID != "" ||
			cell.DiagnosticCode != "" {
			return coded("VER-4002", "Verification run initial cell state is invalid.", ErrInvalid)
		}
		switch cell.Status {
		case "queued":
			hasQueued = true
		case "blocked", "unsupported", "not-applicable":
		default:
			return coded("VER-4002", "Verification run initial status is invalid.", ErrInvalid)
		}
	}
	expectedStatus := "blocked"
	if hasQueued {
		expectedStatus = "queued"
	}
	if snapshot.Status != expectedStatus {
		return coded("VER-4002", "Verification run initial aggregate status is invalid.", ErrInvalid)
	}
	return nil
}

func validateVerificationRunEvent(event VerificationRunEvent) error {
	if validateIdentifier(event.EventID, "eventId") != nil ||
		validateIdentifier(event.RunID, "runId") != nil ||
		!validRevision(event.Cursor) ||
		event.Cursor < 1 ||
		!digestPattern.MatchString(event.EventDigest) {
		return coded("VER-4002", "Verification run event identity is invalid.", ErrInvalid)
	}
	if _, err := parseInstant(event.OccurredAt); err != nil {
		return coded("VER-4002", "Verification run event timing is invalid.", ErrInvalid)
	}
	switch event.Kind {
	case "run-started", "run-completed":
	case "cell-started":
		if validateIdentifier(event.CellID, "cellId") != nil ||
			validateIdentifier(event.AttemptID, "attemptId") != nil {
			return ErrInvalid
		}
	case "cell-reported":
		if validateIdentifier(event.CellID, "cellId") != nil ||
			validateIdentifier(event.AttemptID, "attemptId") != nil ||
			!digestPattern.MatchString(event.CandidateDigest) ||
			!validVerificationAttemptOutcome(event.Outcome) ||
			(event.DiagnosticCode != "" && !verificationDiagnosticCode(event.DiagnosticCode)) {
			return ErrInvalid
		}
	case "cell-promoted":
		if validateIdentifier(event.CellID, "cellId") != nil ||
			validateIdentifier(event.AttemptID, "attemptId") != nil ||
			!digestPattern.MatchString(event.CandidateDigest) ||
			validateIdentifier(event.EvidenceID, "evidenceId") != nil {
			return ErrInvalid
		}
	case "run-cancel-requested":
		if validateCanonicalText(event.Reason, "reason", 4096) != nil ||
			len([]rune(event.Reason)) > 1024 {
			return ErrInvalid
		}
	case "run-interrupted":
		if !verificationDiagnosticCode(event.ReasonCode) {
			return ErrInvalid
		}
	case "closure-evaluated":
		if !digestPattern.MatchString(event.ClosureDigest) ||
			(event.Verdict != "satisfied" &&
				event.Verdict != "unsatisfied" &&
				event.Verdict != "stale") {
			return ErrInvalid
		}
	default:
		return ErrInvalid
	}
	computed, _, err := digestWithoutField(event, "eventDigest")
	if err != nil || computed != event.EventDigest {
		return coded("VER-5001", "Verification run event digest does not match.", ErrInvalid)
	}
	return nil
}

func applyVerificationRunEvent(
	snapshot VerificationRunSnapshot,
	event VerificationRunEvent,
) (VerificationRunSnapshot, error) {
	if err := validateVerificationRunSnapshot(snapshot); err != nil {
		return VerificationRunSnapshot{}, err
	}
	if err := validateVerificationRunEvent(event); err != nil {
		return VerificationRunSnapshot{}, err
	}
	occurredAt, _ := parseInstant(event.OccurredAt)
	updatedAt, _ := parseInstant(snapshot.UpdatedAt)
	if event.RunID != snapshot.RunID ||
		event.Cursor != snapshot.Cursor+1 ||
		occurredAt.Before(updatedAt) {
		return VerificationRunSnapshot{}, coded(
			"VER-4002",
			"Verification run event cursor is stale or out of order.",
			ErrConflict,
		)
	}
	next := snapshot
	next.SelectedCellIDs = append([]string(nil), snapshot.SelectedCellIDs...)
	next.Cells = append([]VerificationRunCellState(nil), snapshot.Cells...)
	findCell := func() (int, *VerificationRunCellState) {
		for index := range next.Cells {
			cell := &next.Cells[index]
			if cell.CellID == event.CellID && cell.AttemptID == event.AttemptID {
				return index, cell
			}
		}
		return -1, nil
	}
	switch event.Kind {
	case "run-started":
		if snapshot.Status != "queued" || !runHasCellStatus(snapshot.Cells, "queued") {
			return VerificationRunSnapshot{}, invalidRunTransition()
		}
		next.Status = "running"
	case "cell-started":
		_, cell := findCell()
		if snapshot.Status != "running" || cell == nil || cell.Status != "queued" {
			return VerificationRunSnapshot{}, invalidRunTransition()
		}
		cell.Status = "running"
		cell.StartedAt = event.OccurredAt
		cell.LastEventCursor = event.Cursor
	case "cell-reported":
		_, cell := findCell()
		if (snapshot.Status != "running" && snapshot.Status != "cancelling") ||
			cell == nil ||
			cell.Status != "running" {
			return VerificationRunSnapshot{}, invalidRunTransition()
		}
		cell.Status = runCellStatusForOutcome(event.Outcome)
		cell.CompletedAt = event.OccurredAt
		cell.CandidateDigest = event.CandidateDigest
		cell.DiagnosticCode = event.DiagnosticCode
		cell.LastEventCursor = event.Cursor
	case "cell-promoted":
		_, cell := findCell()
		if cell == nil ||
			!terminalVerificationRunCellStatus(cell.Status) ||
			cell.CandidateDigest == "" ||
			cell.CandidateDigest != event.CandidateDigest ||
			cell.EvidenceID != "" {
			return VerificationRunSnapshot{}, invalidRunTransition()
		}
		cell.EvidenceID = event.EvidenceID
		cell.LastEventCursor = event.Cursor
	case "run-cancel-requested":
		if snapshot.Status != "queued" && snapshot.Status != "running" {
			return VerificationRunSnapshot{}, invalidRunTransition()
		}
		next.Status = "cancelling"
		for index := range next.Cells {
			if next.Cells[index].Status == "queued" {
				next.Cells[index].Status = "cancelled"
				next.Cells[index].CompletedAt = event.OccurredAt
				next.Cells[index].LastEventCursor = event.Cursor
			}
		}
	case "run-interrupted":
		if terminalVerificationRunStatus(snapshot.Status) {
			return VerificationRunSnapshot{}, invalidRunTransition()
		}
		next.Status = "interrupted"
		for index := range next.Cells {
			if next.Cells[index].Status == "queued" ||
				next.Cells[index].Status == "running" {
				next.Cells[index].Status = "interrupted"
				next.Cells[index].CompletedAt = event.OccurredAt
				next.Cells[index].DiagnosticCode = event.ReasonCode
				next.Cells[index].LastEventCursor = event.Cursor
			}
		}
	case "run-completed":
		if (snapshot.Status != "running" && snapshot.Status != "cancelling") ||
			runHasNonTerminalCell(snapshot.Cells) {
			return VerificationRunSnapshot{}, invalidRunTransition()
		}
		next.Status = deriveVerificationRunStatus(snapshot.Cells)
	case "closure-evaluated":
		if !terminalVerificationRunStatus(snapshot.Status) ||
			snapshot.ClosureDigest != "" ||
			snapshot.ClosureVerdict != "" {
			return VerificationRunSnapshot{}, invalidRunTransition()
		}
		next.ClosureDigest = event.ClosureDigest
		next.ClosureVerdict = event.Verdict
	}
	next.Cursor = event.Cursor
	next.UpdatedAt = event.OccurredAt
	next.SnapshotDigest = ""
	digest, _, err := digestWithoutField(next, "snapshotDigest")
	if err != nil {
		return VerificationRunSnapshot{}, err
	}
	next.SnapshotDigest = digest
	if err := validateVerificationRunSnapshot(next); err != nil {
		return VerificationRunSnapshot{}, err
	}
	return next, nil
}

func verificationRunSnapshotWire(snapshot VerificationRunSnapshot) (VerificationRunSnapshotWire, []byte, error) {
	wire := VerificationRunSnapshotWire{
		WireVersion:             1,
		VerificationRunSnapshot: snapshot,
	}
	bytes, err := canonicalBytes(wire)
	return wire, bytes, err
}

func verificationRunEventWire(event VerificationRunEvent) (VerificationRunEventWire, []byte, error) {
	wire := VerificationRunEventWire{
		WireVersion:          1,
		VerificationRunEvent: event,
	}
	bytes, err := canonicalBytes(wire)
	return wire, bytes, err
}

func validVerificationRunSurface(value string) bool {
	return value == "preview" || value == "export" || value == "ci"
}

func validVerificationRunScope(value string) bool {
	return value == "impacted" || value == "required" || value == "all" || value == "cell"
}

func validVerificationRunOrigin(value string) bool {
	return value == "web" || value == "cli" || value == "ci"
}

func validVerificationRunStatus(value string) bool {
	switch value {
	case "queued", "running", "cancelling", "completed", "failed",
		"blocked", "cancelled", "interrupted":
		return true
	default:
		return false
	}
}

func validVerificationRunCellStatus(value string) bool {
	switch value {
	case "queued", "running", "passed", "failed", "blocked", "unsupported",
		"unstable", "not-applicable", "cancelled", "interrupted":
		return true
	default:
		return false
	}
}

func terminalVerificationRunStatus(value string) bool {
	return value == "completed" || value == "failed" || value == "blocked" ||
		value == "cancelled" || value == "interrupted"
}

func terminalVerificationRunCellStatus(value string) bool {
	return value == "passed" || value == "failed" || value == "blocked" ||
		value == "unsupported" || value == "unstable" ||
		value == "not-applicable" || value == "cancelled" ||
		value == "interrupted"
}

func validVerificationAttemptOutcome(value string) bool {
	return value == "passed" || value == "failed" || value == "blocked" ||
		value == "cancelled" || value == "infrastructure-error"
}

func verificationDiagnosticCode(value string) bool {
	return len(value) == 8 &&
		(value[:4] == "BHV-" || value[:4] == "VER-") &&
		value[4] >= '0' && value[4] <= '9' &&
		value[5] >= '0' && value[5] <= '9' &&
		value[6] >= '0' && value[6] <= '9' &&
		value[7] >= '0' && value[7] <= '9'
}

func runCellStatusForOutcome(value string) string {
	switch value {
	case "passed":
		return "passed"
	case "blocked":
		return "blocked"
	case "cancelled":
		return "cancelled"
	default:
		return "failed"
	}
}

func runHasCellStatus(cells []VerificationRunCellState, status string) bool {
	for _, cell := range cells {
		if cell.Status == status {
			return true
		}
	}
	return false
}

func runHasNonTerminalCell(cells []VerificationRunCellState) bool {
	for _, cell := range cells {
		if !terminalVerificationRunCellStatus(cell.Status) {
			return true
		}
	}
	return false
}

func deriveVerificationRunStatus(cells []VerificationRunCellState) string {
	if runHasCellStatus(cells, "interrupted") {
		return "interrupted"
	}
	if runHasCellStatus(cells, "failed") || runHasCellStatus(cells, "unstable") {
		return "failed"
	}
	if runHasCellStatus(cells, "blocked") || runHasCellStatus(cells, "unsupported") {
		return "blocked"
	}
	if runHasCellStatus(cells, "cancelled") && !runHasCellStatus(cells, "passed") {
		return "cancelled"
	}
	return "completed"
}

func invalidRunTransition() error {
	return coded(
		"VER-4002",
		"Verification run event is invalid for the current state.",
		ErrConflict,
	)
}

func sortVerificationRunEvents(events []VerificationRunEventWire) {
	sort.Slice(events, func(left int, right int) bool {
		return events[left].Cursor < events[right].Cursor
	})
}

func verificationRunTimes(snapshot VerificationRunSnapshot) (time.Time, time.Time, error) {
	createdAt, createdErr := parseInstant(snapshot.CreatedAt)
	updatedAt, updatedErr := parseInstant(snapshot.UpdatedAt)
	if createdErr != nil || updatedErr != nil {
		return time.Time{}, time.Time{}, fmt.Errorf("decode verification run timing")
	}
	return createdAt, updatedAt, nil
}
