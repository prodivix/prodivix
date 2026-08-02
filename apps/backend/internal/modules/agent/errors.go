// Package agent owns the durable G4 Task/Run control plane. It persists
// transport-neutral @prodivix/ai facts and never owns Workspace mutations.
package agent

import "errors"

var (
	ErrInvalid      = errors.New("agent control request is invalid")
	ErrNotFound     = errors.New("agent control record was not found")
	ErrConflict     = errors.New("agent control identity conflicts with durable state")
	ErrUnauthorized = errors.New("agent control authority is stale or missing")
	ErrLeaseBusy    = errors.New("agent control lease is held by another worker")
	ErrTerminal     = errors.New("agent run is terminal")
)
