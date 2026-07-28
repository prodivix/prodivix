package verification

import (
	"bytes"
	"encoding/json"
	"errors"
	"io"
	"unicode/utf8"

	"golang.org/x/text/unicode/norm"
)

const (
	maximumVerificationPlanWireBytes = 4 * 1024 * 1024
	maximumVerificationPlanDepth     = 48
	maximumVerificationPlanNodes     = 65_536
	maximumVerificationPlanString    = 64 * 1024
	maximumVerificationPlanKey       = 512
)

func validateVerificationPlanJSONObject(body []byte) error {
	if len(body) == 0 || len(body) > maximumVerificationPlanWireBytes ||
		!utf8.Valid(body) {
		return errors.New("VerificationPlan JSON is empty or exceeds its byte budget")
	}
	if err := validateJSONUnicodeEscapes(body); err != nil {
		return invalidJSONUnicodeEscapeError(err)
	}
	decoder := json.NewDecoder(bytes.NewReader(body))
	decoder.UseNumber()
	nodes := 0
	rootObject, err := validateVerificationPlanJSONValue(
		decoder,
		0,
		&nodes,
	)
	if err != nil {
		return err
	}
	if !rootObject {
		return errors.New("VerificationPlan JSON root must be an object")
	}
	if _, err := decoder.Token(); !errors.Is(err, io.EOF) {
		return errors.New("VerificationPlan JSON must contain exactly one value")
	}
	return nil
}

func validateVerificationPlanJSONValue(
	decoder *json.Decoder,
	depth int,
	nodes *int,
) (bool, error) {
	*nodes++
	if depth > maximumVerificationPlanDepth ||
		*nodes > maximumVerificationPlanNodes {
		return false, errors.New("VerificationPlan JSON exceeds its structural budget")
	}
	token, err := decoder.Token()
	if err != nil {
		return false, err
	}
	delim, isDelimiter := token.(json.Delim)
	if !isDelimiter {
		if value, ok := token.(string); ok &&
			(len([]byte(value)) > maximumVerificationPlanString ||
				!utf8.ValidString(value) ||
				!norm.NFC.IsNormalString(value)) {
			return false, errors.New(
				"VerificationPlan JSON string is non-canonical or over budget",
			)
		}
		return false, nil
	}
	switch delim {
	case '{':
		seen := make(map[string]struct{})
		for decoder.More() {
			keyToken, err := decoder.Token()
			if err != nil {
				return false, err
			}
			key, ok := keyToken.(string)
			if !ok ||
				len([]byte(key)) > maximumVerificationPlanKey ||
				!utf8.ValidString(key) ||
				!norm.NFC.IsNormalString(key) ||
				isUnsafeJSONKey(key) {
				return false, errors.New(
					"VerificationPlan JSON object member name is invalid",
				)
			}
			if _, duplicate := seen[key]; duplicate {
				return false, errors.New(
					"VerificationPlan JSON contains a duplicate object member",
				)
			}
			seen[key] = struct{}{}
			if _, err := validateVerificationPlanJSONValue(
				decoder,
				depth+1,
				nodes,
			); err != nil {
				return false, err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim('}') {
			return false, errors.New("VerificationPlan JSON object is not closed")
		}
		return true, nil
	case '[':
		for decoder.More() {
			if _, err := validateVerificationPlanJSONValue(
				decoder,
				depth+1,
				nodes,
			); err != nil {
				return false, err
			}
		}
		closing, err := decoder.Token()
		if err != nil || closing != json.Delim(']') {
			return false, errors.New("VerificationPlan JSON array is not closed")
		}
		return false, nil
	default:
		return false, errors.New("VerificationPlan JSON has an unexpected delimiter")
	}
}
