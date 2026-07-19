package workspace

import (
	"encoding/json"
	"strings"
)

const (
	maxDataCacheDurationMS    = 7 * 24 * 60 * 60 * 1000
	maxDataCacheKeyInputPaths = 64
	maxDataStreamReconnects   = 4
	maxDataStreamDelayMS      = 30 * 1000
	maxDataStreamItems        = 10 * 1000
)

func validateDataOperationPolicies(kind string, policies map[string]json.RawMessage, path string) error {
	switch kind {
	case "query":
		if _, exists := policies["stream"]; exists {
			return dataSourceValidationError("%s/stream is available only to subscriptions", path)
		}
		if _, exists := policies["optimistic"]; exists {
			return dataSourceValidationError("%s/optimistic is available only to mutations", path)
		}
		if _, exists := policies["idempotency"]; exists {
			return dataSourceValidationError("%s/idempotency is available only to mutations", path)
		}
	case "mutation":
		if _, exists := policies["stream"]; exists {
			return dataSourceValidationError("%s/stream is available only to subscriptions", path)
		}
		if _, exists := policies["cache"]; exists {
			return dataSourceValidationError("%s/cache is available only to queries", path)
		}
		if _, exists := policies["pagination"]; exists {
			return dataSourceValidationError("%s/pagination is available only to queries", path)
		}
		if retry, exists := policies["retry"]; exists {
			fields, err := decodeDataObject(retry, path+"/retry", []string{"maxAttempts", "backoff", "initialDelayMs"}, []string{"maxDelayMs"})
			if err != nil {
				return err
			}
			maxAttempts, err := decodeDataInteger(fields["maxAttempts"], path+"/retry/maxAttempts", 1)
			if err != nil {
				return err
			}
			if _, idempotent := policies["idempotency"]; maxAttempts > 1 && !idempotent {
				return dataSourceValidationError("%s/retry requires an explicit mutation idempotency contract", path)
			}
		}
	case "subscription":
		if len(policies) > 1 || (len(policies) == 1 && policies["stream"] == nil) {
			return dataSourceValidationError("%s subscription cannot declare finite invocation policies", path)
		}
	}
	if cache, exists := policies["cache"]; exists {
		if err := validateDataCachePolicy(cache, path+"/cache"); err != nil {
			return err
		}
	}
	if retry, exists := policies["retry"]; exists {
		if err := validateDataRetryPolicy(retry, path+"/retry"); err != nil {
			return err
		}
	}
	if idempotency, exists := policies["idempotency"]; exists {
		if err := validateDataIdempotencyPolicy(idempotency, path+"/idempotency"); err != nil {
			return err
		}
	}
	if pagination, exists := policies["pagination"]; exists {
		if err := validateDataPaginationPolicy(pagination, path+"/pagination"); err != nil {
			return err
		}
	}
	if optimistic, exists := policies["optimistic"]; exists {
		if err := validateDataOptimisticPolicy(optimistic, path+"/optimistic"); err != nil {
			return err
		}
	}
	if stream, exists := policies["stream"]; exists {
		if err := validateDataStreamPolicy(stream, path+"/stream"); err != nil {
			return err
		}
	}
	return nil
}

func validateDataStreamPolicy(payload json.RawMessage, path string) error {
	fields, err := decodeDataObject(payload, path, []string{"reconnect"}, []string{"credentialRenewal", "collection"})
	if err != nil {
		return err
	}
	reconnectPath := path + "/reconnect"
	reconnect, err := decodeDataObject(fields["reconnect"], reconnectPath, []string{"resume", "maxReconnectAttempts", "backoff", "initialDelayMs"}, []string{"maxDelayMs"})
	if err != nil {
		return err
	}
	resume, err := decodeDataCanonicalString(reconnect["resume"], reconnectPath+"/resume")
	if err != nil || resume != "sse-last-event-id" {
		return dataSourceValidationError("%s/resume must equal sse-last-event-id", reconnectPath)
	}
	backoff, err := decodeDataCanonicalString(reconnect["backoff"], reconnectPath+"/backoff")
	if err != nil || (backoff != "fixed" && backoff != "exponential") {
		return dataSourceValidationError("%s/backoff must be fixed or exponential", reconnectPath)
	}
	attempts, err := decodeDataInteger(reconnect["maxReconnectAttempts"], reconnectPath+"/maxReconnectAttempts", 1)
	if err != nil || attempts > maxDataStreamReconnects {
		return dataSourceValidationError("%s/maxReconnectAttempts exceeds the stream reconnect budget", reconnectPath)
	}
	initial, err := decodeDataInteger(reconnect["initialDelayMs"], reconnectPath+"/initialDelayMs", 0)
	if err != nil || initial > maxDataStreamDelayMS {
		return dataSourceValidationError("%s/initialDelayMs exceeds the stream reconnect budget", reconnectPath)
	}
	if raw, exists := reconnect["maxDelayMs"]; exists {
		maximum, decodeErr := decodeDataInteger(raw, reconnectPath+"/maxDelayMs", 0)
		if decodeErr != nil || maximum < initial || maximum > maxDataStreamDelayMS {
			return dataSourceValidationError("%s/maxDelayMs is outside the stream reconnect budget", reconnectPath)
		}
	}
	if raw, exists := fields["credentialRenewal"]; exists {
		value, decodeErr := decodeDataCanonicalString(raw, path+"/credentialRenewal")
		if decodeErr != nil || value != "per-connection" {
			return dataSourceValidationError("%s/credentialRenewal must equal per-connection", path)
		}
	}
	if raw, exists := fields["collection"]; exists {
		collectionPath := path + "/collection"
		collection, decodeErr := decodeDataObject(raw, collectionPath, []string{"kind", "entityIdPath", "maxItems"}, nil)
		if decodeErr != nil {
			return decodeErr
		}
		kind, decodeErr := decodeDataCanonicalString(collection["kind"], collectionPath+"/kind")
		if decodeErr != nil || kind != "keyed-event-v1" {
			return dataSourceValidationError("%s/kind must equal keyed-event-v1", collectionPath)
		}
		identityPath, decodeErr := decodeDataCanonicalString(collection["entityIdPath"], collectionPath+"/entityIdPath")
		if decodeErr != nil || !isDataJSONPointer(identityPath) {
			return dataSourceValidationError("%s/entityIdPath must be an RFC 6901 JSON Pointer", collectionPath)
		}
		items, decodeErr := decodeDataInteger(collection["maxItems"], collectionPath+"/maxItems", 1)
		if decodeErr != nil || items > maxDataStreamItems {
			return dataSourceValidationError("%s/maxItems exceeds the incremental collection budget", collectionPath)
		}
	}
	return nil
}

func validateDataIdempotencyPolicy(payload json.RawMessage, path string) error {
	fields, err := decodeDataObject(payload, path, []string{"kind"}, nil)
	if err != nil {
		return err
	}
	kind, err := decodeDataCanonicalString(fields["kind"], path+"/kind")
	if err != nil {
		return err
	}
	if kind != "invocation-key" {
		return dataSourceValidationError("%s/kind must equal invocation-key", path)
	}
	return nil
}

func validateDataCachePolicy(payload json.RawMessage, path string) error {
	fields, err := decodeDataObject(payload, path, []string{"strategy"}, []string{"ttlMs", "staleWhileRevalidateMs", "keyInputPaths"})
	if err != nil {
		return err
	}
	strategy, err := decodeDataCanonicalString(fields["strategy"], path+"/strategy")
	if err != nil {
		return err
	}
	if strategy != "no-store" && strategy != "cache-first" && strategy != "network-first" && strategy != "stale-while-revalidate" {
		return dataSourceValidationError("%s/strategy is unsupported", path)
	}
	if strategy == "no-store" {
		if len(fields) != 1 {
			return dataSourceValidationError("%s no-store cannot declare cache lifetime or key fields", path)
		}
		return nil
	}
	if _, exists := fields["ttlMs"]; !exists {
		return dataSourceValidationError("%s/ttlMs is required for stored cache policies", path)
	}
	ttl, err := decodeDataInteger(fields["ttlMs"], path+"/ttlMs", 1)
	if err != nil {
		return err
	}
	if ttl > maxDataCacheDurationMS {
		return dataSourceValidationError("%s/ttlMs exceeds the cache duration budget", path)
	}
	if stale, exists := fields["staleWhileRevalidateMs"]; exists {
		if strategy == "cache-first" {
			return dataSourceValidationError("%s/staleWhileRevalidateMs is not supported by cache-first", path)
		}
		staleDuration, err := decodeDataInteger(stale, path+"/staleWhileRevalidateMs", 1)
		if err != nil {
			return err
		}
		if staleDuration > maxDataCacheDurationMS {
			return dataSourceValidationError("%s/staleWhileRevalidateMs exceeds the cache duration budget", path)
		}
		if ttl+staleDuration > maxDataCacheDurationMS {
			return dataSourceValidationError("%s fresh and stale retention exceeds the cache duration budget", path)
		}
	} else if strategy == "stale-while-revalidate" {
		return dataSourceValidationError("%s/staleWhileRevalidateMs is required", path)
	}
	if paths, exists := fields["keyInputPaths"]; exists {
		if err := validateUniqueDataStringArray(paths, path+"/keyInputPaths"); err != nil {
			return err
		}
		var values []string
		if err := json.Unmarshal(paths, &values); err != nil {
			return dataSourceValidationError("%s/keyInputPaths must be an array", path)
		}
		if len(values) > maxDataCacheKeyInputPaths {
			return dataSourceValidationError("%s/keyInputPaths exceeds the cache key path budget", path)
		}
		for index, value := range values {
			if !isDataJSONPointer(value) {
				return dataSourceValidationError("%s/keyInputPaths/%d must be an RFC 6901 JSON Pointer", path, index)
			}
		}
	}
	return nil
}

func isDataJSONPointer(value string) bool {
	if !strings.HasPrefix(value, "/") {
		return false
	}
	for index := 0; index < len(value); index++ {
		if value[index] != '~' {
			continue
		}
		if index+1 >= len(value) || (value[index+1] != '0' && value[index+1] != '1') {
			return false
		}
		index++
	}
	return true
}

func validateUniqueDataStringArray(payload json.RawMessage, path string) error {
	if err := validateDataStringArray(payload, path); err != nil {
		return err
	}
	var values []string
	if err := json.Unmarshal(payload, &values); err != nil {
		return dataSourceValidationError("%s must be an array", path)
	}
	seen := make(map[string]struct{}, len(values))
	for _, value := range values {
		if _, duplicate := seen[value]; duplicate {
			return dataSourceValidationError("%s values must be unique", path)
		}
		seen[value] = struct{}{}
	}
	return nil
}

func validateDataRetryPolicy(payload json.RawMessage, path string) error {
	fields, err := decodeDataObject(payload, path, []string{"maxAttempts", "backoff", "initialDelayMs"}, []string{"maxDelayMs"})
	if err != nil {
		return err
	}
	if _, err := decodeDataInteger(fields["maxAttempts"], path+"/maxAttempts", 1); err != nil {
		return err
	}
	backoff, err := decodeDataCanonicalString(fields["backoff"], path+"/backoff")
	if err != nil {
		return err
	}
	if backoff != "fixed" && backoff != "exponential" {
		return dataSourceValidationError("%s/backoff must be fixed or exponential", path)
	}
	initialDelay, err := decodeDataInteger(fields["initialDelayMs"], path+"/initialDelayMs", 0)
	if err != nil {
		return err
	}
	if maximum, exists := fields["maxDelayMs"]; exists {
		maxDelay, err := decodeDataInteger(maximum, path+"/maxDelayMs", 0)
		if err != nil {
			return err
		}
		if maxDelay < initialDelay {
			return dataSourceValidationError("%s/maxDelayMs must not be less than initialDelayMs", path)
		}
	}
	return nil
}

func validateDataPaginationPolicy(payload json.RawMessage, path string) error {
	base, err := decodeDataObject(payload, path, []string{"kind"}, []string{"offsetInput", "cursorInput", "limitInput", "defaultLimit", "maxLimit", "totalPath", "nextCursorPath", "previousCursorPath"})
	if err != nil {
		return err
	}
	kind, err := decodeDataCanonicalString(base["kind"], path+"/kind")
	if err != nil {
		return err
	}
	var required []string
	var optional []string
	switch kind {
	case "offset":
		required = []string{"kind", "offsetInput", "limitInput", "defaultLimit"}
		optional = []string{"maxLimit", "totalPath"}
	case "cursor":
		required = []string{"kind", "cursorInput", "limitInput", "defaultLimit", "nextCursorPath"}
		optional = []string{"maxLimit", "previousCursorPath"}
	default:
		return dataSourceValidationError("%s/kind must be offset or cursor", path)
	}
	fields, err := decodeDataObject(payload, path, required, optional)
	if err != nil {
		return err
	}
	for _, field := range required[1:] {
		if field == "defaultLimit" {
			continue
		}
		if _, err := decodeDataCanonicalString(fields[field], path+"/"+field); err != nil {
			return err
		}
	}
	limitInput, err := decodeDataCanonicalString(fields["limitInput"], path+"/limitInput")
	if err != nil {
		return err
	}
	positionField := "offsetInput"
	if kind == "cursor" {
		positionField = "cursorInput"
	}
	positionInput, err := decodeDataCanonicalString(fields[positionField], path+"/"+positionField)
	if err != nil {
		return err
	}
	if positionInput == limitInput {
		return dataSourceValidationError("%s/%s and limitInput must be distinct", path, positionField)
	}
	for _, field := range optional {
		if field == "maxLimit" {
			continue
		}
		if _, exists := fields[field]; exists {
			if _, err := decodeDataCanonicalString(fields[field], path+"/"+field); err != nil {
				return err
			}
		}
	}
	defaultLimit, err := decodeDataInteger(fields["defaultLimit"], path+"/defaultLimit", 1)
	if err != nil {
		return err
	}
	if maximum, exists := fields["maxLimit"]; exists {
		maxLimit, err := decodeDataInteger(maximum, path+"/maxLimit", 1)
		if err != nil {
			return err
		}
		if maxLimit < defaultLimit {
			return dataSourceValidationError("%s/maxLimit must not be less than defaultLimit", path)
		}
	}
	return nil
}

func validateDataOptimisticPolicy(payload json.RawMessage, path string) error {
	fields, err := decodeDataObject(
		payload,
		path,
		[]string{"kind", "action", "target", "rollback"},
		[]string{"entityIdPath", "valueInputPath", "valueOutputPath", "placement"},
	)
	if err != nil {
		return err
	}
	var kind string
	if err := json.Unmarshal(fields["kind"], &kind); err != nil || kind != "crud" {
		return dataSourceValidationError("%s/kind must equal crud", path)
	}
	action, err := decodeDataCanonicalString(fields["action"], path+"/action")
	if err != nil {
		return err
	}
	if action != "create" && action != "update" && action != "delete" {
		return dataSourceValidationError("%s/action must be create, update, or delete", path)
	}
	target, err := decodeDataObject(fields["target"], path+"/target", []string{"documentId", "operationId"}, nil)
	if err != nil {
		return err
	}
	if _, err := decodeDataCanonicalString(target["documentId"], path+"/target/documentId"); err != nil {
		return err
	}
	if _, err := decodeDataCanonicalString(target["operationId"], path+"/target/operationId"); err != nil {
		return err
	}
	var rollback string
	if err := json.Unmarshal(fields["rollback"], &rollback); err != nil || rollback != "on-error" {
		return dataSourceValidationError("%s/rollback must equal on-error", path)
	}
	for _, field := range []string{"entityIdPath", "valueInputPath", "valueOutputPath"} {
		if _, exists := fields[field]; exists {
			value, err := decodeDataCanonicalString(fields[field], path+"/"+field)
			if err != nil {
				return err
			}
			if !isDataJSONPointer(value) {
				return dataSourceValidationError("%s/%s must be an RFC 6901 JSON Pointer", path, field)
			}
		}
	}
	if action == "create" || action == "update" {
		if _, exists := fields["valueInputPath"]; !exists {
			return dataSourceValidationError("%s/valueInputPath is required for create/update", path)
		}
		if _, exists := fields["valueOutputPath"]; !exists {
			return dataSourceValidationError("%s/valueOutputPath is required for create/update", path)
		}
	}
	if action == "update" || action == "delete" {
		if _, exists := fields["entityIdPath"]; !exists {
			return dataSourceValidationError("%s/entityIdPath is required for update/delete", path)
		}
	}
	if placement, exists := fields["placement"]; exists {
		if action != "create" {
			return dataSourceValidationError("%s/placement is available only to create", path)
		}
		value, err := decodeDataCanonicalString(placement, path+"/placement")
		if err != nil {
			return err
		}
		if value != "start" && value != "end" {
			return dataSourceValidationError("%s/placement must be start or end", path)
		}
	}
	return nil
}
