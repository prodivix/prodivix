package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"time"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

func (repository *Repository) StoreRuntimeTaskOutput(ctx context.Context, principal PrincipalAuthority, guard RuntimeLeaseGuard, source []byte) (bool, error) {
	if err := repository.available(); err != nil {
		return false, err
	}
	output, canonical, err := agentcontract.DecodeAgentTaskOutput(source)
	if err != nil {
		return false, ErrInvalid
	}
	if principal.Kind != "service" || principal.PrincipalID != RuntimePrincipalID {
		return false, ErrUnauthorized
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return false, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, principal); err != nil {
		return false, err
	}
	run, err := scanRunFactTx(ctx, tx, principal.WorkspaceID, output.RunID)
	if err != nil {
		return false, err
	}
	task, err := loadTaskTx(ctx, tx, principal.WorkspaceID, output.TaskID)
	if err != nil {
		return false, err
	}
	if run.TaskID != task.TaskID || output.ProjectPolicyDigest != task.PolicyDigest || run.PolicyDigest != task.PolicyDigest {
		return false, ErrUnauthorized
	}
	var existing []byte
	err = tx.QueryRowContext(ctx, `SELECT output_bytes FROM agent_task_outputs WHERE workspace_id=$1 AND (output_id=$2 OR (run_id=$3 AND model_invocation_id=$4))`, principal.WorkspaceID, output.OutputID, run.RunID, output.ModelInvocationID).Scan(&existing)
	if err == nil {
		if !bytes.Equal(existing, canonical) {
			return false, ErrConflict
		}
		return true, tx.Commit()
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return false, err
	}
	if output.Generation != run.Generation || (task.Mode != "explain" || output.Kind != "answer") && (task.Mode != "plan" || output.Kind != "plan") {
		return false, ErrUnauthorized
	}
	if err := authorizeRuntimeLeaseTx(ctx, tx, principal.WorkspaceID, run.RunID, &guard, run); err != nil {
		return false, err
	}
	runValue, _ := objectMember(run.Value, "run")
	if frozenContext := stringMember(runValue, "contextPackDigest"); frozenContext != "" && output.ContextPackDigest != frozenContext {
		return false, ErrUnauthorized
	}
	admission, err := scanAdmission(tx.QueryRowContext(ctx, `SELECT `+admissionColumns+` FROM agent_runtime_admissions WHERE workspace_id=$1 AND task_id=$2 AND status='admitted'`, principal.WorkspaceID, task.TaskID))
	if err != nil {
		return false, err
	}
	var result runtimeAdmissionResult
	if err := json.Unmarshal(admission.Result, &result); err != nil {
		return false, err
	}
	evaluation, _ := objectMember(result.EffectivePolicy, "evaluation")
	if output.EffectivePolicyDigest != stringMember(evaluation, "effectivePolicyDigest") {
		return false, ErrUnauthorized
	}
	var eventBytes []byte
	if err := tx.QueryRowContext(ctx, `SELECT event_bytes FROM agent_run_events WHERE workspace_id=$1 AND run_id=$2 AND generation=$3 AND type='model.completed'
AND event_json #>> '{value,sanitizedPayload,result,invocationId}'=$4 ORDER BY sequence DESC LIMIT 1`, principal.WorkspaceID, run.RunID, run.Generation, output.ModelInvocationID).Scan(&eventBytes); errors.Is(err, sql.ErrNoRows) {
		return false, ErrUnauthorized
	} else if err != nil {
		return false, err
	}
	event, err := decodeEventFact(eventBytes)
	if err != nil {
		return false, err
	}
	payload, _ := objectMember(event.Value, "sanitizedPayload")
	receipt, ok := objectMember(payload, "result")
	if !ok {
		return false, ErrUnauthorized
	}
	receiptGeneration, ok := integerMember(receipt, "generation")
	receiptAttempt, validAttempt := integerMember(receipt, "attempt")
	if !ok || !validAttempt || receiptAttempt != run.Attempt || receiptGeneration != run.Generation || stringMember(receipt, "invocationId") != output.ModelInvocationID || stringMember(receipt, "taskId") != task.TaskID || stringMember(receipt, "runId") != run.RunID || stringMember(receipt, "contextPackDigest") != output.ContextPackDigest || stringMember(receipt, "outcome") != "completed" {
		return false, ErrUnauthorized
	}
	base := make(map[string]any, len(receipt)-1)
	for key, value := range receipt {
		if key != "receiptDigest" {
			base[key] = value
		}
	}
	receiptDigest, err := canonicaljson.Digest(base)
	if err != nil || receiptDigest != stringMember(receipt, "receiptDigest") {
		return false, ErrUnauthorized
	}
	settledResultDigest, err := canonicaljson.Digest(receipt)
	if err != nil {
		return false, err
	}
	operation, operationExists := objectMember(event.Data, "operation")
	operationGeneration, validGeneration := integerMember(operation, "generation")
	if !operationExists || !validGeneration || operationGeneration != output.Generation || stringMember(operation, "operationId") != output.ModelInvocationID || stringMember(operation, "kind") != "model-stream" || stringMember(operation, "state") != "settled" || stringMember(operation, "resultDigest") != settledResultDigest || stringMember(payload, "operationId") != output.ModelInvocationID {
		return false, ErrUnauthorized
	}
	responseDigest, err := canonicaljson.Digest(map[string]any{output.Kind: output.Text})
	if err != nil || responseDigest != stringMember(receipt, "responseDigest") {
		return false, ErrUnauthorized
	}
	recordedAt, err := time.Parse("2006-01-02T15:04:05.000Z", output.RecordedAt)
	if err != nil || recordedAt.Before(event.OccurredAt) || recordedAt.Before(run.UpdatedAt) || guard.Clock == nil || recordedAt.After(guard.Clock().Add(5*time.Second)) {
		return false, ErrUnauthorized
	}
	if err := authorizeRuntimeLeaseTx(ctx, tx, principal.WorkspaceID, run.RunID, &guard, run); err != nil {
		return false, err
	}
	if _, err := tx.ExecContext(ctx, `INSERT INTO agent_task_outputs(workspace_id,run_id,task_id,output_id,generation,model_invocation_id,output_digest,output_bytes,recorded_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9)`, principal.WorkspaceID, run.RunID, task.TaskID, output.OutputID, output.Generation, output.ModelInvocationID, output.OutputDigest, canonical, recordedAt); err != nil {
		return false, err
	}
	return false, tx.Commit()
}

func (repository *Repository) ReadTaskOutputs(ctx context.Context, authority PrincipalAuthority, runID string) ([]json.RawMessage, error) {
	if err := repository.available(); err != nil {
		return nil, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{ReadOnly: true, Isolation: sql.LevelRepeatableRead})
	if err != nil {
		return nil, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProductWorkspaceReadTx(ctx, tx, authority); err != nil {
		return nil, err
	}
	run, err := loadRunFactReadTx(ctx, tx, authority.WorkspaceID, runID)
	if err != nil {
		return nil, err
	}
	task, err := loadTaskReadTx(ctx, tx, authority.WorkspaceID, run.TaskID)
	if err != nil {
		return nil, err
	}
	if authority.Kind != "user" || task.ActorID != authority.PrincipalID {
		return nil, ErrUnauthorized
	}
	items, err := queryFactBytes(ctx, tx, `SELECT output_bytes FROM agent_task_outputs WHERE workspace_id=$1 AND run_id=$2 ORDER BY recorded_at,output_id COLLATE "C" LIMIT 33`, authority.WorkspaceID, runID)
	if err != nil {
		return nil, err
	}
	if len(items) > 32 {
		return nil, ErrConflict
	}
	for _, item := range items {
		if _, _, err := agentcontract.DecodeAgentTaskOutput(item); err != nil {
			return nil, err
		}
	}
	if err := tx.Commit(); err != nil {
		return nil, err
	}
	if items == nil {
		items = []json.RawMessage{}
	}
	return items, nil
}

func (gateway *RuntimeGateway) taskOutput(c *gin.Context) {
	var input struct {
		runtimeAuthorityRequest
		Output json.RawMessage `json:"output"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	lease, err := gateway.authority(input.runtimeAuthorityRequest)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	output, _, err := agentcontract.DecodeAgentTaskOutput(input.Output)
	if err != nil || output.RunID != c.Param("runId") {
		respondAgentError(c, ErrInvalid)
		return
	}
	principal, err := gateway.serviceAuthority(c)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	replayed, err := gateway.repository.StoreRuntimeTaskOutput(c.Request.Context(), principal, RuntimeLeaseGuard{Authority: lease, Clock: gateway.clock}, input.Output)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"outputDigest": output.OutputDigest, "replayed": replayed})
}

func (handler *Handler) HandleReadTaskOutputs(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	reader, ok := handler.repository.(interface {
		ReadTaskOutputs(context.Context, PrincipalAuthority, string) ([]json.RawMessage, error)
	})
	if !ok {
		respondAgentError(c, ErrNotFound)
		return
	}
	items, err := reader.ReadTaskOutputs(c.Request.Context(), authority, c.Param("runId"))
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"items": items})
}
