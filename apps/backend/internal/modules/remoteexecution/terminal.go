package remoteexecution

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	backendresponse "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/response"
	"github.com/gin-gonic/gin"
)

const maximumTerminalRequestBytes int64 = 64 * 1024
const maximumTerminalResponseBytes int64 = 1024 * 1024
const maximumTerminalTokenTTL = 15 * time.Minute

type terminalSessionResult struct {
	Protocol string `json:"protocol"`
	Version  int    `json:"version"`
	Snapshot struct {
		TerminalSessionID string `json:"terminalSessionId"`
		ExecutionID       string `json:"executionId"`
		JobID             string `json:"jobId"`
		ProviderID        string `json:"providerId"`
		ProviderVersion   string `json:"providerVersion"`
		Capability        string `json:"capability"`
		Status            string `json:"status"`
		LeaseExpiresAt    int64  `json:"leaseExpiresAt"`
	} `json:"snapshot"`
	Access struct {
		Token     string `json:"token"`
		ExpiresAt int64  `json:"expiresAt"`
	} `json:"access"`
}

func exactJSONRecord(value json.RawMessage, required []string, optional []string) (map[string]json.RawMessage, bool) {
	var record map[string]json.RawMessage
	if json.Unmarshal(value, &record) != nil || record == nil {
		return nil, false
	}
	allowed := make(map[string]struct{}, len(required)+len(optional))
	for _, key := range append(append([]string{}, required...), optional...) {
		allowed[key] = struct{}{}
	}
	for _, key := range required {
		if _, ok := record[key]; !ok {
			return nil, false
		}
	}
	for key := range record {
		if _, ok := allowed[key]; !ok {
			return nil, false
		}
	}
	return record, true
}

func canonicalTerminalToken(value string) bool {
	return value != "" && value == strings.TrimSpace(value) && len(value) <= 8192 && !strings.ContainsAny(value, "\r\n")
}

func positiveJSONInteger(value json.RawMessage, minimum int64, maximum int64) bool {
	var integer int64
	return json.Unmarshal(value, &integer) == nil && integer >= minimum && integer <= maximum
}

func validTerminalSize(value json.RawMessage) bool {
	record, ok := exactJSONRecord(value, []string{"columns", "rows"}, nil)
	return ok && positiveJSONInteger(record["columns"], 2, 500) && positiveJSONInteger(record["rows"], 1, 200)
}

func validTerminalActionBody(action string, body []byte) bool {
	record, ok := exactJSONRecord(body, nil, nil)
	switch action {
	case "resume", "close":
		return ok && len(record) == 0
	case "open", "resize":
		record, ok = exactJSONRecord(body, []string{"size"}, nil)
		return ok && validTerminalSize(record["size"])
	case "read":
		record, ok = exactJSONRecord(body, []string{"afterCursor"}, []string{"maximumRecords"})
		if !ok || !positiveJSONInteger(record["afterCursor"], 0, int64(^uint(0)>>1)) {
			return false
		}
		return record["maximumRecords"] == nil || positiveJSONInteger(record["maximumRecords"], 1, 250)
	case "write":
		record, ok = exactJSONRecord(body, []string{"data", "clientSequence"}, nil)
		if !ok || !positiveJSONInteger(record["clientSequence"], 1, int64(^uint(0)>>1)) {
			return false
		}
		var data string
		return json.Unmarshal(record["data"], &data) == nil && len([]byte(data)) <= 16*1024
	case "signal":
		record, ok = exactJSONRecord(body, []string{"signal"}, nil)
		if !ok {
			return false
		}
		var signal string
		return json.Unmarshal(record["signal"], &signal) == nil && (signal == "interrupt" || signal == "terminate")
	default:
		return false
	}
}

func jsonString(value json.RawMessage) (string, bool) {
	var result string
	if json.Unmarshal(value, &result) != nil {
		return "", false
	}
	return result, true
}

func jsonBoolean(value json.RawMessage) bool {
	var result bool
	return json.Unmarshal(value, &result) == nil
}

func validTerminalActionResponse(action string, body []byte, executionID string, terminalSessionID string) bool {
	record, ok := exactJSONRecord(body, nil, nil)
	switch action {
	case "write":
		record, ok = exactJSONRecord(body, []string{"status", "clientSequence"}, []string{"expectedClientSequence"})
		if !ok || !positiveJSONInteger(record["clientSequence"], 1, int64(^uint(0)>>1)) {
			return false
		}
		status, valid := jsonString(record["status"])
		if !valid || !map[string]bool{"accepted": true, "duplicate": true, "out-of-order": true, "stale": true, "conflict": true, "closed": true, "rejected": true}[status] {
			return false
		}
		return (status == "out-of-order") == (record["expectedClientSequence"] != nil) && (record["expectedClientSequence"] == nil || positiveJSONInteger(record["expectedClientSequence"], 1, int64(^uint(0)>>1)))
	case "resize":
		record, ok = exactJSONRecord(body, []string{"status", "size"}, nil)
		status, valid := jsonString(record["status"])
		return ok && valid && map[string]bool{"accepted": true, "unchanged": true, "closed": true, "rejected": true}[status] && validTerminalSize(record["size"])
	case "signal":
		record, ok = exactJSONRecord(body, []string{"status", "signal"}, nil)
		status, statusOK := jsonString(record["status"])
		signal, signalOK := jsonString(record["signal"])
		return ok && statusOK && signalOK && map[string]bool{"accepted": true, "closed": true, "rejected": true}[status] && (signal == "interrupt" || signal == "terminate")
	case "close":
		record, ok = exactJSONRecord(body, []string{"status"}, nil)
		status, valid := jsonString(record["status"])
		return ok && valid && map[string]bool{"closed": true, "already-closed": true, "rejected": true}[status]
	case "read":
		record, ok = exactJSONRecord(body, []string{"terminalSessionId", "executionId", "jobId", "status", "afterCursor", "nextCursor", "latestCursor", "earliestAvailableCursor", "gap", "hasMore", "records"}, nil)
		if !ok {
			return false
		}
		session, sessionOK := jsonString(record["terminalSessionId"])
		execution, executionOK := jsonString(record["executionId"])
		job, jobOK := jsonString(record["jobId"])
		status, statusOK := jsonString(record["status"])
		if !sessionOK || !executionOK || !jobOK || !statusOK || session != terminalSessionID || execution != executionID || job != executionID || !map[string]bool{"open": true, "closing": true, "closed": true}[status] || !positiveJSONInteger(record["afterCursor"], 0, int64(^uint(0)>>1)) || !positiveJSONInteger(record["nextCursor"], 0, int64(^uint(0)>>1)) || !positiveJSONInteger(record["latestCursor"], 0, int64(^uint(0)>>1)) || !positiveJSONInteger(record["earliestAvailableCursor"], 0, int64(^uint(0)>>1)) || !jsonBoolean(record["gap"]) || !jsonBoolean(record["hasMore"]) {
			return false
		}
		var records []json.RawMessage
		if json.Unmarshal(record["records"], &records) != nil || len(records) > 250 {
			return false
		}
		for _, output := range records {
			outputRecord, valid := exactJSONRecord(output, []string{"terminalSessionId", "executionId", "jobId", "cursor", "emittedAt", "stream", "data", "byteLength", "redacted", "truncated"}, nil)
			outputSession, sessionOK := jsonString(outputRecord["terminalSessionId"])
			outputExecution, executionOK := jsonString(outputRecord["executionId"])
			outputJob, jobOK := jsonString(outputRecord["jobId"])
			stream, streamOK := jsonString(outputRecord["stream"])
			data, dataOK := jsonString(outputRecord["data"])
			if !valid || !sessionOK || !executionOK || !jobOK || !streamOK || !dataOK || outputSession != terminalSessionID || outputExecution != executionID || outputJob != executionID || (stream != "stdout" && stream != "stderr") || len([]byte(data)) > 32*1024 || !positiveJSONInteger(outputRecord["cursor"], 1, int64(^uint(0)>>1)) || !positiveJSONInteger(outputRecord["emittedAt"], 0, int64(^uint(0)>>1)) || !positiveJSONInteger(outputRecord["byteLength"], 0, 32*1024) || !jsonBoolean(outputRecord["redacted"]) || !jsonBoolean(outputRecord["truncated"]) {
				return false
			}
		}
		return true
	default:
		return false
	}
}

func validTerminalSessionResponse(body []byte, executionID string, terminalSessionID string, now time.Time) bool {
	root, ok := exactJSONRecord(body, []string{"protocol", "version", "snapshot", "access"}, nil)
	if !ok {
		return false
	}
	_, snapshotOK := exactJSONRecord(root["snapshot"], []string{
		"terminalSessionId", "executionId", "jobId", "providerId", "providerVersion", "capability", "status", "revision", "size", "openedAt", "updatedAt", "leaseExpiresAt", "latestOutputCursor", "earliestRetainedOutputCursor", "retainedOutputBytes", "droppedOutputRecords", "droppedOutputBytes", "latestClientSequence",
	}, []string{"closedAt", "closeReason", "exitCode"})
	_, accessOK := exactJSONRecord(root["access"], []string{"token", "expiresAt"}, nil)
	if !snapshotOK || !accessOK {
		return false
	}
	var result terminalSessionResult
	if json.Unmarshal(body, &result) != nil {
		return false
	}
	if result.Protocol != "prodivix.remote-terminal" || result.Version != 1 || result.Snapshot.ExecutionID != executionID || result.Snapshot.JobID != executionID || result.Snapshot.ProviderID != "prodivix.remote.preview" || strings.TrimSpace(result.Snapshot.ProviderVersion) == "" || result.Snapshot.Capability != "shell" || result.Snapshot.Status != "open" || result.Snapshot.LeaseExpiresAt <= now.UnixMilli() || !canonicalTerminalToken(result.Access.Token) || result.Access.ExpiresAt <= now.UnixMilli() || result.Access.ExpiresAt > now.Add(maximumTerminalTokenTTL).UnixMilli() {
		return false
	}
	return terminalSessionID == "" || result.Snapshot.TerminalSessionID == terminalSessionID
}

func readTerminalBody(body io.Reader) ([]byte, error) {
	contents, err := io.ReadAll(io.LimitReader(body, maximumTerminalRequestBytes+1))
	if err != nil {
		return nil, err
	}
	if int64(len(contents)) > maximumTerminalRequestBytes {
		return nil, errors.New("terminal request exceeds limit")
	}
	return contents, nil
}

func (handler *Handler) remoteTerminalRequest(ctx context.Context, terminalToken string, path string, body []byte) (*http.Response, error) {
	request, err := http.NewRequestWithContext(ctx, http.MethodPost, handler.baseURL+path, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	request.Header.Set("Authorization", "Bearer "+terminalToken)
	request.Header.Set("Accept", "application/json")
	request.Header.Set("Content-Type", "application/json")
	return handler.httpClient.Do(request)
}

func (handler *Handler) terminalExecution(c *gin.Context) (string, bool) {
	if !handler.available(c) {
		return "", false
	}
	user, session, ok := authIdentity(c)
	if !ok {
		return "", false
	}
	executionID := strings.TrimSpace(c.Param("executionId"))
	if executionID == "" || handler.store.VerifyExecutionOwner(c.Request.Context(), user.ID, session.ID, executionID) != nil {
		backendresponse.Error(c, http.StatusNotFound, "EXE-4004", "Remote Terminal execution was not found.")
		return "", false
	}
	return executionID, true
}

func proxyTerminalJSON(c *gin.Context, response *http.Response, body []byte) {
	c.Header("Cache-Control", "private, no-store")
	c.Header("X-Content-Type-Options", "nosniff")
	c.Data(response.StatusCode, "application/json", body)
}

func (handler *Handler) HandleTerminalOpen(c *gin.Context) {
	executionID, ok := handler.terminalExecution(c)
	if !ok {
		return
	}
	body, err := readTerminalBody(c.Request.Body)
	if err != nil || !validTerminalActionBody("open", body) {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote Terminal open request is invalid.")
		return
	}
	path := "/v1/executions/" + url.PathEscape(executionID) + "/terminal-sessions"
	response, err := handler.remoteRequest(c.Request.Context(), http.MethodPost, path, body, "application/json")
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal service is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumTerminalResponseBytes+1))
	if err != nil || int64(len(responseBody)) > maximumTerminalResponseBytes {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal response exceeded its limit.")
		return
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 && (!validTerminalSessionResponse(responseBody, executionID, "", time.Now()) || bytes.Contains(responseBody, []byte(handler.clientToken))) {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal service returned an invalid session.")
		return
	}
	proxyTerminalJSON(c, response, responseBody)
}

func (handler *Handler) HandleTerminalResume(c *gin.Context) {
	executionID, ok := handler.terminalExecution(c)
	if !ok {
		return
	}
	terminalSessionID := strings.TrimSpace(c.Param("terminalSessionId"))
	if terminalSessionID == "" || len(terminalSessionID) > 4096 {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote Terminal session identity is invalid.")
		return
	}
	path := "/v1/executions/" + url.PathEscape(executionID) + "/terminal-sessions/" + url.PathEscape(terminalSessionID) + "/resume"
	response, err := handler.remoteRequest(c.Request.Context(), http.MethodPost, path, []byte("{}"), "application/json")
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal service is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumTerminalResponseBytes+1))
	if err != nil || int64(len(responseBody)) > maximumTerminalResponseBytes {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal response exceeded its limit.")
		return
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 && (!validTerminalSessionResponse(responseBody, executionID, terminalSessionID, time.Now()) || bytes.Contains(responseBody, []byte(handler.clientToken))) {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal service returned an invalid session.")
		return
	}
	proxyTerminalJSON(c, response, responseBody)
}

func (handler *Handler) HandleTerminalAction(c *gin.Context) {
	executionID, ok := handler.terminalExecution(c)
	if !ok {
		return
	}
	terminalSessionID := strings.TrimSpace(c.Param("terminalSessionId"))
	pathParts := strings.Split(strings.TrimRight(c.Request.URL.Path, "/"), "/")
	action := pathParts[len(pathParts)-1]
	terminalToken := c.GetHeader("X-Prodivix-Terminal-Token")
	if terminalSessionID == "" || len(terminalSessionID) > 4096 || !canonicalTerminalToken(terminalToken) {
		backendresponse.Error(c, http.StatusUnauthorized, "EXE-4003", "Remote Terminal access expired.")
		return
	}
	body, err := readTerminalBody(c.Request.Body)
	if err != nil || !validTerminalActionBody(action, body) {
		backendresponse.Error(c, http.StatusBadRequest, "EXE-4001", "Remote Terminal request is invalid.")
		return
	}
	path := "/v1/executions/" + url.PathEscape(executionID) + "/terminal-sessions/" + url.PathEscape(terminalSessionID) + "/" + action
	response, err := handler.remoteTerminalRequest(c.Request.Context(), terminalToken, path, body)
	if err != nil {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal service is unavailable.", backendresponse.WithRetryable(true))
		return
	}
	defer response.Body.Close()
	responseBody, err := io.ReadAll(io.LimitReader(response.Body, maximumTerminalResponseBytes+1))
	if err != nil || int64(len(responseBody)) > maximumTerminalResponseBytes {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal response exceeded its limit.")
		return
	}
	if response.StatusCode >= 200 && response.StatusCode < 300 && (!validTerminalActionResponse(action, responseBody, executionID, terminalSessionID) || bytes.Contains(responseBody, []byte(handler.clientToken)) || bytes.Contains(responseBody, []byte(terminalToken))) {
		backendresponse.Error(c, http.StatusBadGateway, "EXE-5001", "Remote Terminal service returned an invalid response.")
		return
	}
	proxyTerminalJSON(c, response, responseBody)
}
