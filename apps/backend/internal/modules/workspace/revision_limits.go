package workspace

import "fmt"

const (
	revisionLimitReasonOutOfRange = "REVISION_OUT_OF_RANGE"
	revisionLimitReasonCapacity   = "REVISION_CAPACITY_EXCEEDED"
)

type workspaceRevisionLimitError struct {
	Field   string
	Reason  string
	Message string
}

func (err *workspaceRevisionLimitError) Error() string {
	if err == nil {
		return "workspace revision limit violation"
	}
	return err.Message
}

func validateRequiredJSONSafeRevision(field string, value int64) error {
	if value > 0 && value <= maxJSONSafeInteger {
		return nil
	}
	return &workspaceRevisionLimitError{
		Field:   field,
		Reason:  revisionLimitReasonOutOfRange,
		Message: fmt.Sprintf("%s must be a positive JSON safe integer.", field),
	}
}

func validateOptionalJSONSafeRevision(field string, value int64) error {
	if value == 0 {
		return nil
	}
	return validateRequiredJSONSafeRevision(field, value)
}

func validateRevisionCanAdvance(field string, current int64) error {
	if current > 0 && current < maxJSONSafeInteger {
		return nil
	}
	return &workspaceRevisionLimitError{
		Field:   field,
		Reason:  revisionLimitReasonCapacity,
		Message: fmt.Sprintf("%s cannot advance beyond the JSON safe integer range.", field),
	}
}

func validateWorkspaceMutationCanAdvance(workspaceRev int64, opSeq int64) error {
	if err := validateRevisionCanAdvance("workspaceRev", workspaceRev); err != nil {
		return err
	}
	return validateRevisionCanAdvance("opSeq", opSeq)
}
