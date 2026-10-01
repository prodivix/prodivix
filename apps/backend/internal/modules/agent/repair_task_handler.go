package agent

import (
	"encoding/json"
	"io"
	"net/http"

	"github.com/Prodivix/prodivix/apps/backend/internal/platform/canonicaljson"
	"github.com/gin-gonic/gin"
)

// The server derives failure material and remaining budget before asking the
// ordinary admission lane for a fresh child Grant. The browser supplies no usage.
func (handler *Handler) HandleCreateRepairTaskRequest(c *gin.Context) {
	c.Header("Cache-Control", "no-store")
	principal, ok := productAuthority(c)
	if !ok {
		return
	}
	if handler.runtime == nil || !handler.runtime.Ready() {
		c.JSON(http.StatusServiceUnavailable, gin.H{"code": "AI-9001", "message": "The Agent runtime worker is unavailable."})
		return
	}
	source, err := io.ReadAll(http.MaxBytesReader(c.Writer, c.Request.Body, 4096))
	if err != nil || canonicaljson.ValidateRaw(source, 4096) != nil {
		respondAgentError(c, ErrInvalid)
		return
	}
	var input RuntimeRepairTaskInput
	if err := json.Unmarshal(source, &input); err != nil {
		respondAgentError(c, ErrInvalid)
		return
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(source, &fields); err != nil || len(fields) != 3 || fields["requestId"] == nil || fields["expectedParentSnapshotDigest"] == nil || fields["expectedClosureDigest"] == nil {
		respondAgentError(c, ErrInvalid)
		return
	}
	result, err := handler.runtime.repository.CreateRuntimeRepairAdmission(c.Request.Context(), principal, c.Param("runId"), input, handler.runtime.clock)
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.JSON(http.StatusAccepted, result)
}
