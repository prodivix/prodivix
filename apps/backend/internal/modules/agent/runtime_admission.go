package agent

import (
	"bytes"
	"context"
	"database/sql"
	"encoding/json"
	"errors"
	"net/http"
	"strings"
	"time"

	backendworkspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/agentcontract"
	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

type runtimeAdmission struct {
	AdmissionID              string          `json:"admissionId"`
	ChallengeDigest          string          `json:"challengeDigest"`
	Status                   string          `json:"status"`
	WorkspaceID              string          `json:"-"`
	ProjectID                string          `json:"-"`
	ActorID                  string          `json:"-"`
	ActorAuthorizationDigest string          `json:"actorAuthorizationDigest"`
	Task                     json.RawMessage `json:"task"`
	ObservedAt               time.Time       `json:"observedAt"`
	ExpiresAt                time.Time       `json:"expiresAt"`
	Result                   json.RawMessage `json:"-"`
}

type runtimeAdmissionResult struct {
	ChallengeDigest string          `json:"challengeDigest"`
	Task            json.RawMessage `json:"task"`
	EffectivePolicy map[string]any  `json:"effectivePolicy,omitempty"`
	Grant           map[string]any  `json:"grant,omitempty"`
	Status          string          `json:"status"`
	DiagnosticCodes []string        `json:"diagnosticCodes"`
	AdmissionDigest string          `json:"admissionDigest"`
}

const admissionColumns = `admission_id, challenge_digest, status, workspace_id, project_id, actor_id, actor_authorization_digest, task_bytes, observed_at, expires_at, result_bytes`

func scanAdmission(row interface{ Scan(...any) error }) (runtimeAdmission, error) {
	var value runtimeAdmission
	var task, result []byte
	err := row.Scan(&value.AdmissionID, &value.ChallengeDigest, &value.Status, &value.WorkspaceID, &value.ProjectID, &value.ActorID, &value.ActorAuthorizationDigest, &task, &value.ObservedAt, &value.ExpiresAt, &result)
	value.ObservedAt, value.ExpiresAt = canonicalTime(value.ObservedAt), canonicalTime(value.ExpiresAt)
	value.Task, value.Result = task, result
	if errors.Is(err, sql.ErrNoRows) {
		err = ErrNotFound
	}
	return value, err
}

// Admission is service state. Its challenge freezes authenticated identity and
// the entire canonical revision; the trusted worker owns policy evaluation.
func validateAdmissionWorkspaceTx(ctx context.Context, tx *sql.Tx, authority PrincipalAuthority, task taskFact) (string, error) {
	if authority.Kind != "user" || task.ActorKind != "user" || authority.PrincipalID != task.ActorID || authority.WorkspaceID != task.WorkspaceID || authority.ProjectID != task.ProjectID {
		return "", ErrUnauthorized
	}
	var ownerID string
	if err := tx.QueryRowContext(ctx, `SELECT owner_id FROM workspaces WHERE id=$1 AND project_id=$2 FOR SHARE`, authority.WorkspaceID, authority.ProjectID).Scan(&ownerID); errors.Is(err, sql.ErrNoRows) {
		return "", ErrNotFound
	} else if err != nil {
		return "", err
	}
	if ownerID != authority.PrincipalID {
		return "", ErrUnauthorized
	}
	revision, ok := objectMember(task.Spec, "baseRevision")
	if !ok {
		return "", ErrInvalid
	}
	matches, err := workspaceRevisionMatchesTx(ctx, tx, authority.WorkspaceID, revision)
	if err != nil {
		return "", err
	}
	if !matches {
		return "", ErrConflict
	}
	policyRef, ok := objectMember(task.Spec, "policyRef")
	if !ok {
		return "", ErrInvalid
	}
	var policy []byte
	if err := tx.QueryRowContext(ctx, `SELECT content_json FROM workspace_documents WHERE workspace_id=$1 AND id=$2 AND doc_type='agent-policy' FOR SHARE`, authority.WorkspaceID, stringMember(policyRef, "documentId")).Scan(&policy); errors.Is(err, sql.ErrNoRows) {
		return "", ErrUnauthorized
	} else if err != nil {
		return "", err
	}
	digest, err := agentcontract.CanonicalCurrentDigest(stringMember(policyRef, "documentId"), policy)
	if err != nil || digest != task.PolicyDigest {
		return "", ErrUnauthorized
	}
	return canonicaljson.Digest(map[string]any{"kind": "user", "principalId": authority.PrincipalID, "projectId": authority.ProjectID, "workspaceId": authority.WorkspaceID, "ownerId": ownerID})
}

func (repository *Repository) CreateRuntimeAdmission(ctx context.Context, authority PrincipalAuthority, source []byte, now time.Time) (runtimeAdmission, error) {
	if err := repository.available(); err != nil {
		return runtimeAdmission{}, err
	}
	task, err := decodeTaskFact(source)
	if err != nil {
		return runtimeAdmission{}, err
	}
	if stringMember(task.Lineage, "reason") != "initial" || strings.HasPrefix(task.TaskID, "task.repair.") {
		return runtimeAdmission{}, ErrUnauthorized
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return runtimeAdmission{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return runtimeAdmission{}, err
	}
	existing, err := scanAdmission(tx.QueryRowContext(ctx, `SELECT `+admissionColumns+` FROM agent_runtime_admissions WHERE workspace_id=$1 AND actor_id=$2 AND idempotency_key=$3 FOR SHARE`, authority.WorkspaceID, authority.PrincipalID, task.IdempotencyKey))
	if err == nil {
		if !bytes.Equal(existing.Task, task.Canonical) {
			return runtimeAdmission{}, ErrConflict
		}
		return existing, nil
	}
	if !errors.Is(err, ErrNotFound) {
		return runtimeAdmission{}, err
	}
	authDigest, err := validateAdmissionWorkspaceTx(ctx, tx, authority, task)
	if err != nil {
		return runtimeAdmission{}, err
	}
	value, err := createRuntimeAdmissionTx(ctx, tx, task, authDigest, now)
	if err != nil {
		return runtimeAdmission{}, err
	}
	if err := tx.Commit(); err != nil {
		return runtimeAdmission{}, err
	}
	return value, nil
}

func (repository *Repository) ReadRuntimeAdmission(ctx context.Context, authority PrincipalAuthority, id string) (runtimeAdmission, error) {
	if err := repository.available(); err != nil {
		return runtimeAdmission{}, err
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	tx, err := repository.db.BeginTx(ctx, nil)
	if err != nil {
		return runtimeAdmission{}, err
	}
	defer func() { _ = tx.Rollback() }()
	if err := authorizeProposalWorkspaceTx(ctx, tx, authority); err != nil {
		return runtimeAdmission{}, err
	}
	value, err := scanAdmission(tx.QueryRowContext(ctx, `SELECT `+admissionColumns+` FROM agent_runtime_admissions WHERE workspace_id=$1 AND admission_id=$2 FOR SHARE`, authority.WorkspaceID, id))
	if err != nil {
		return runtimeAdmission{}, err
	}
	if value.ActorID != authority.PrincipalID || value.ProjectID != authority.ProjectID {
		return runtimeAdmission{}, ErrUnauthorized
	}
	return value, nil
}

func validateAdmissionResult(value runtimeAdmission, result runtimeAdmissionResult) ([]byte, error) {
	original, err := decodeTaskFact(value.Task)
	if err != nil {
		return nil, err
	}
	task, err := decodeTaskFact(result.Task)
	if err != nil {
		return nil, err
	}
	if result.ChallengeDigest != value.ChallengeDigest || (result.Status != "admitted" && result.Status != "blocked") || result.DiagnosticCodes == nil || len(result.DiagnosticCodes) > 64 {
		return nil, ErrInvalid
	}
	for _, code := range result.DiagnosticCodes {
		if len(code) < 3 || len(code) > 64 {
			return nil, ErrInvalid
		}
	}
	left, right := map[string]any{}, map[string]any{}
	for key, member := range original.Spec {
		if key != "initialGrantRef" {
			left[key] = member
		}
	}
	for key, member := range task.Spec {
		if key != "initialGrantRef" {
			right[key] = member
		}
	}
	if !sameMember(left, right) {
		return nil, ErrUnauthorized
	}
	originalFact, err := decodeControlFact(value.Task, "task-record")
	if err != nil {
		return nil, err
	}
	resultFact, err := decodeControlFact(result.Task, "task-record")
	if err != nil {
		return nil, err
	}
	if !sameMember(originalFact.Value["lineage"], resultFact.Value["lineage"]) {
		return nil, ErrUnauthorized
	}
	var effectiveDigest, grantDigest any
	if result.EffectivePolicy != nil {
		evaluation, ok := objectMember(result.EffectivePolicy, "evaluation")
		if !ok || stringMember(evaluation, "projectPolicyDigest") != task.PolicyDigest || stringMember(evaluation, "actorAuthorizationDigest") != value.ActorAuthorizationDigest || !sameMember(evaluation["projectPolicyRef"], task.Spec["policyRef"]) || !canonicalDigestPattern.MatchString(stringMember(evaluation, "effectivePolicyDigest")) {
			return nil, ErrUnauthorized
		}
		effectiveDigest = stringMember(evaluation, "effectivePolicyDigest")
	}
	if result.Grant != nil {
		grant := result.Grant
		if stringMember(grant, "grantId") != "grant.runtime."+value.ChallengeDigest[7:] || task.InitialGrantID != stringMember(grant, "grantId") || stringMember(grant, "taskId") != task.TaskID || stringMember(grant, "workspaceId") != task.WorkspaceID || stringMember(grant, "policyDigest") != task.PolicyDigest || !sameMember(grant["subject"], task.Spec["actor"]) || !sameMember(grant["baseRevision"], task.Spec["baseRevision"]) || !sameMember(grant["targetScope"], task.Spec["targetScope"]) || !sameMember(grant["policyRef"], task.Spec["policyRef"]) {
			return nil, ErrUnauthorized
		}
		issued, err := instantMember(grant, "issuedAt")
		if err != nil || !issued.Equal(value.ObservedAt) {
			return nil, ErrUnauthorized
		}
		expires, err := instantMember(grant, "expiresAt")
		if err != nil || !expires.After(issued) || expires.After(value.ExpiresAt) {
			return nil, ErrUnauthorized
		}
		grantDigest, err = canonicaljson.Digest(grant)
		if err != nil {
			return nil, err
		}
	}
	if result.Status == "admitted" && (result.EffectivePolicy == nil || result.Grant == nil || len(result.DiagnosticCodes) != 0) {
		return nil, ErrInvalid
	}
	digest, err := canonicaljson.Digest(map[string]any{"admissionId": value.AdmissionID, "challengeDigest": value.ChallengeDigest, "taskDigest": task.TaskDigest, "effectivePolicyDigest": effectiveDigest, "grantDigest": grantDigest, "status": result.Status, "diagnosticCodes": result.DiagnosticCodes})
	if err != nil || digest != result.AdmissionDigest {
		return nil, ErrConflict
	}
	encoded, err := json.Marshal(result)
	if err != nil {
		return nil, err
	}
	var decoded any
	decoder := json.NewDecoder(bytes.NewReader(encoded))
	decoder.UseNumber()
	if err := decoder.Decode(&decoded); err != nil {
		return nil, err
	}
	if err := agentcontract.ValidateSanitizedAgentPayload(decoded); err != nil {
		return nil, ErrInvalid
	}
	return canonicaljson.Bytes(decoded)
}

func (repository *Repository) StoreRuntimeAdmissionResult(ctx context.Context, id string, result runtimeAdmissionResult, clock func() time.Time) error {
	if err := repository.available(); err != nil {
		return err
	}
	if clock == nil {
		return ErrUnauthorized
	}
	ctx, cancel := repositoryContext(ctx)
	defer cancel()
	// Resolve immutable challenge scope before acquiring locks in owner order.
	var workspaceID string
	if err := repository.db.QueryRowContext(ctx, `SELECT workspace_id FROM agent_runtime_admissions WHERE admission_id=$1`, id).Scan(&workspaceID); errors.Is(err, sql.ErrNoRows) {
		return ErrNotFound
	} else if err != nil {
		return err
	}
	tx, err := repository.db.BeginTx(ctx, &sql.TxOptions{Isolation: sql.LevelSerializable})
	if err != nil {
		return err
	}
	defer func() { _ = tx.Rollback() }()
	var owner string
	if err := tx.QueryRowContext(ctx, `SELECT owner_id FROM workspaces WHERE id=$1 FOR SHARE`, workspaceID).Scan(&owner); err != nil {
		return err
	}
	value, err := scanAdmission(tx.QueryRowContext(ctx, `SELECT `+admissionColumns+` FROM agent_runtime_admissions WHERE workspace_id=$1 AND admission_id=$2 FOR UPDATE`, workspaceID, id))
	if err != nil {
		return err
	}
	canonical, err := validateAdmissionResult(value, result)
	if err != nil {
		return err
	}
	if value.Status != "pending" {
		if !bytes.Equal(value.Result, canonical) {
			return ErrConflict
		}
		return nil
	}
	if !value.ExpiresAt.After(clock()) || value.ActorID != owner {
		return ErrUnauthorized
	}
	if result.Status == "admitted" {
		task, err := decodeTaskFact(value.Task)
		if err != nil {
			return err
		}
		authDigest, err := validateAdmissionWorkspaceTx(ctx, tx, PrincipalAuthority{Kind: "user", PrincipalID: value.ActorID, WorkspaceID: value.WorkspaceID, ProjectID: value.ProjectID}, task)
		if err != nil {
			return err
		}
		if authDigest != value.ActorAuthorizationDigest {
			return ErrUnauthorized
		}
		grantExpiry, err := instantMember(result.Grant, "expiresAt")
		if err != nil || !grantExpiry.After(clock()) || !value.ExpiresAt.After(clock()) {
			return ErrUnauthorized
		}
	}
	if _, err := tx.ExecContext(ctx, `UPDATE agent_runtime_admissions SET status=$3,result_bytes=$4 WHERE workspace_id=$1 AND admission_id=$2 AND status='pending'`, workspaceID, id, result.Status, canonical); err != nil {
		return err
	}
	return tx.Commit()
}

func (repository *Repository) CreateAdmittedTask(ctx context.Context, authority PrincipalAuthority, source []byte, id, digest string, clock func() time.Time) (TaskRecord, bool, error) {
	if id == "" || !canonicalDigestPattern.MatchString(digest) || clock == nil {
		return TaskRecord{}, false, ErrUnauthorized
	}
	return repository.createTask(ctx, authority, source, func(ctx context.Context, tx *sql.Tx, task taskFact) error {
		value, err := scanAdmission(tx.QueryRowContext(ctx, `SELECT `+admissionColumns+` FROM agent_runtime_admissions WHERE workspace_id=$1 AND admission_id=$2 FOR SHARE`, authority.WorkspaceID, id))
		if err != nil {
			return err
		}
		var result runtimeAdmissionResult
		if err := json.Unmarshal(value.Result, &result); err != nil {
			return ErrUnauthorized
		}
		admitted, err := decodeTaskFact(result.Task)
		if err != nil || value.Status != "admitted" || value.ActorID != authority.PrincipalID || value.ProjectID != authority.ProjectID || result.AdmissionDigest != digest || !bytes.Equal(task.Canonical, admitted.Canonical) {
			return ErrUnauthorized
		}
		var existing []byte
		err = tx.QueryRowContext(ctx, `SELECT task_bytes FROM agent_tasks WHERE workspace_id=$1 AND task_id=$2 FOR SHARE`, authority.WorkspaceID, task.TaskID).Scan(&existing)
		if err == nil {
			if bytes.Equal(existing, task.Canonical) {
				return nil
			}
			return ErrConflict
		}
		if !errors.Is(err, sql.ErrNoRows) {
			return err
		}
		if !value.ExpiresAt.After(clock()) {
			return ErrUnauthorized
		}
		_, err = validateAdmissionWorkspaceTx(ctx, tx, authority, task)
		if err != nil {
			return err
		}
		grantExpiry, err := instantMember(result.Grant, "expiresAt")
		if err != nil || !grantExpiry.After(clock()) || !value.ExpiresAt.After(clock()) {
			return ErrUnauthorized
		}
		return nil
	})
}

func (gateway *RuntimeGateway) admissionChallenges(c *gin.Context) {
	ctx, cancel := repositoryContext(c.Request.Context())
	defer cancel()
	rows, err := gateway.repository.db.QueryContext(ctx, `SELECT `+admissionColumns+` FROM agent_runtime_admissions WHERE status='pending' AND expires_at>$1 ORDER BY observed_at,admission_id COLLATE "C" LIMIT 20`, gateway.clock())
	if err != nil {
		respondAgentError(c, err)
		return
	}
	values := []runtimeAdmission{}
	for rows.Next() {
		value, err := scanAdmission(rows)
		if err != nil {
			_ = rows.Close()
			respondAgentError(c, err)
			return
		}
		values = append(values, value)
	}
	err = rows.Err()
	_ = rows.Close()
	if err != nil {
		respondAgentError(c, err)
		return
	}
	items := make([]gin.H, 0, len(values))
	for _, value := range values {
		snapshot, err := backendworkspace.NewWorkspaceStore(gateway.repository.db).GetSnapshotForOwner(ctx, value.ActorID, value.WorkspaceID)
		if err != nil {
			continue
		}
		items = append(items, gin.H{"admissionId": value.AdmissionID, "challengeDigest": value.ChallengeDigest, "task": value.Task, "workspace": backendworkspace.BuildSnapshotResponse(snapshot), "actorAuthorizationDigest": value.ActorAuthorizationDigest, "observedAt": value.ObservedAt.Format("2006-01-02T15:04:05.000Z"), "expiresAt": value.ExpiresAt.Format("2006-01-02T15:04:05.000Z")})
	}
	gateway.lastPoll.Store(gateway.clock().UnixMilli())
	c.JSON(http.StatusOK, gin.H{"items": items})
}

func (gateway *RuntimeGateway) admissionResult(c *gin.Context) {
	var result runtimeAdmissionResult
	if !readRuntimeRequest(c, &result) {
		return
	}
	if err := gateway.repository.StoreRuntimeAdmissionResult(c.Request.Context(), c.Param("admissionId"), result, gateway.clock); err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"admissionId": c.Param("admissionId"), "status": result.Status, "admissionDigest": result.AdmissionDigest})
}

func (handler *Handler) HandleCreateAdmission(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	if handler.runtime == nil || !handler.runtime.Ready() {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	var input struct {
		Task json.RawMessage `json:"task"`
	}
	if !readRuntimeRequest(c, &input) {
		return
	}
	value, err := handler.runtime.repository.CreateRuntimeAdmission(c.Request.Context(), authority, input.Task, handler.runtime.clock())
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusOK, gin.H{"admissionId": value.AdmissionID, "challengeDigest": value.ChallengeDigest, "status": value.Status})
}

func (handler *Handler) HandleGetAdmission(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	if handler.runtime == nil {
		c.Status(http.StatusServiceUnavailable)
		return
	}
	value, err := handler.runtime.repository.ReadRuntimeAdmission(c.Request.Context(), authority, c.Param("admissionId"))
	if err != nil {
		respondAgentError(c, err)
		return
	}
	if len(value.Result) > 0 {
		var result map[string]any
		if err := json.Unmarshal(value.Result, &result); err != nil {
			respondAgentError(c, err)
			return
		}
		result["admissionId"] = value.AdmissionID
		c.JSON(http.StatusOK, result)
		return
	}
	status := "pending"
	codes := []string{}
	if !value.ExpiresAt.After(handler.runtime.clock()) {
		status = "blocked"
		codes = []string{"AI-7001"}
	}
	c.JSON(http.StatusOK, gin.H{"admissionId": value.AdmissionID, "challengeDigest": value.ChallengeDigest, "status": status, "diagnosticCodes": codes})
}

func (repository *Repository) RuntimeTaskAdmission(ctx context.Context, workspaceID, taskID string) (map[string]any, error) {
	value, err := scanAdmission(repository.db.QueryRowContext(ctx, `SELECT `+admissionColumns+` FROM agent_runtime_admissions WHERE workspace_id=$1 AND task_id=$2 AND status='admitted'`, workspaceID, taskID))
	if err != nil {
		return nil, err
	}
	var result map[string]any
	if err := json.Unmarshal(value.Result, &result); err != nil {
		return nil, err
	}
	result["admissionId"] = value.AdmissionID
	return result, nil
}
