package agent

import (
	"context"
	"net/http"

	"github.com/gin-gonic/gin"
)

func (handler *Handler) HandleFindTaskRun(c *gin.Context) {
	authority, ok := productAuthority(c)
	if !ok {
		return
	}
	finder, ok := handler.repository.(interface {
		FindTaskRun(context.Context, PrincipalAuthority, string) (string, error)
	})
	if !ok {
		respondAgentError(c, ErrNotFound)
		return
	}
	runID, err := finder.FindTaskRun(c.Request.Context(), authority, c.Param("taskId"))
	if err != nil {
		respondAgentError(c, err)
		return
	}
	c.Header("Cache-Control", "no-store")
	c.JSON(http.StatusOK, gin.H{"runId": runID})
}
