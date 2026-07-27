// Package text holds the bounds for user-authored display strings that reach
// unconstrained TEXT columns. Body size limits alone do not bound them: one
// 64 KiB request can still store a 64 KiB display name.
package text

import (
	"strings"
	"unicode/utf8"
)

const (
	MaxDisplayNameRunes        = 200
	MaxDisplayDescriptionRunes = 2000
)

// WithinDisplayBound reports whether a trimmed user-authored string fits the
// given rune budget. Empty is always allowed; these fields are optional.
func WithinDisplayBound(value string, maxRunes int) bool {
	return utf8.RuneCountInString(strings.TrimSpace(value)) <= maxRunes
}
