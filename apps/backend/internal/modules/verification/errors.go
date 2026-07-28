package verification

import "errors"

var (
	ErrInvalid               = errors.New("verification request is invalid")
	ErrUnauthorized          = errors.New("verification workspace access denied")
	ErrNotFound              = errors.New("verification record not found")
	ErrConflict              = errors.New("verification identity conflict")
	ErrExpired               = errors.New("verification operation expired")
	ErrArtifactMissing       = errors.New("verification artifact is missing")
	ErrArtifactRejected      = errors.New("verification artifact was rejected")
	ErrAttestationRejected   = errors.New("verification attestation was rejected")
	ErrAttestationRequired   = errors.New("verification attestation is required")
	ErrRetentionProtected    = errors.New("verification evidence is retention protected")
	ErrPreconditionRequired  = errors.New("verification mutation precondition is required")
	errArtifactPromotionBusy = errors.New("verification artifact promotion lease is busy")
	errArtifactDeletionBusy  = errors.New("verification artifact deletion lease is busy")
)

type AttestationChallengeError struct {
	Promotion CreatePromotionResult
}

func (err *AttestationChallengeError) Error() string {
	return "verification attestation challenge is ready"
}

func (err *AttestationChallengeError) Unwrap() error {
	return ErrAttestationRequired
}

type CodedError struct {
	Code    string
	Message string
	Err     error
}

func (err *CodedError) Error() string {
	if err == nil {
		return ""
	}
	return err.Message
}

func (err *CodedError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Err
}

func coded(code string, message string, cause error) error {
	return &CodedError{Code: code, Message: message, Err: cause}
}

func diagnosticCode(err error, fallback string) string {
	var codedError *CodedError
	if errors.As(err, &codedError) && codedError.Code != "" {
		return codedError.Code
	}
	return fallback
}
