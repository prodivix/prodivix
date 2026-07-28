package verification

import (
	"errors"
	"fmt"
)

// validateJSONUnicodeEscapes rejects lone UTF-16 surrogate escapes before
// encoding/json can replace them with U+FFFD. Raw UTF-8 scalar values and
// correctly paired surrogate escapes remain valid.
func validateJSONUnicodeEscapes(body []byte) error {
	inString := false
	for index := 0; index < len(body); index++ {
		switch body[index] {
		case '"':
			inString = !inString
		case '\\':
			if !inString {
				continue
			}
			if index+1 >= len(body) {
				return errors.New("JSON string ends with an incomplete escape")
			}
			if body[index+1] != 'u' {
				index++
				continue
			}

			codeUnit, ok := decodeJSONUnicodeCodeUnit(body, index+2)
			if !ok {
				return errors.New("JSON string contains an invalid Unicode escape")
			}
			index += 5
			switch {
			case codeUnit >= 0xd800 && codeUnit <= 0xdbff:
				pairStart := index + 1
				if pairStart+5 >= len(body) ||
					body[pairStart] != '\\' ||
					body[pairStart+1] != 'u' {
					return errors.New("JSON string contains an unpaired high surrogate escape")
				}
				lowSurrogate, validPair := decodeJSONUnicodeCodeUnit(body, pairStart+2)
				if !validPair || lowSurrogate < 0xdc00 || lowSurrogate > 0xdfff {
					return errors.New("JSON string contains an unpaired high surrogate escape")
				}
				index = pairStart + 5
			case codeUnit >= 0xdc00 && codeUnit <= 0xdfff:
				return errors.New("JSON string contains an unpaired low surrogate escape")
			}
		}
	}
	return nil
}

func decodeJSONUnicodeCodeUnit(body []byte, start int) (uint16, bool) {
	if start+4 > len(body) {
		return 0, false
	}
	var codeUnit uint16
	for index := start; index < start+4; index++ {
		nibble, ok := jsonHexNibble(body[index])
		if !ok {
			return 0, false
		}
		codeUnit = codeUnit<<4 | uint16(nibble)
	}
	return codeUnit, true
}

func jsonHexNibble(value byte) (byte, bool) {
	switch {
	case value >= '0' && value <= '9':
		return value - '0', true
	case value >= 'a' && value <= 'f':
		return value - 'a' + 10, true
	case value >= 'A' && value <= 'F':
		return value - 'A' + 10, true
	default:
		return 0, false
	}
}

func invalidJSONUnicodeEscapeError(err error) error {
	return fmt.Errorf("JSON Unicode escape validation failed: %w", err)
}
