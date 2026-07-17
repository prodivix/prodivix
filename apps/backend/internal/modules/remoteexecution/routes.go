package remoteexecution

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth     gin.HandlerFunc
	Envelope        gin.HandlerFunc
	ArtifactContent gin.HandlerFunc
	PreviewSession  gin.HandlerFunc
	DataOperation   gin.HandlerFunc
	TerminalOpen    gin.HandlerFunc
	TerminalResume  gin.HandlerFunc
	TerminalAction  gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	api.POST("/remote-executions", handlers.RequireAuth, handlers.Envelope)
	api.GET("/remote-executions/:executionId/artifacts/:artifactId/content", handlers.RequireAuth, handlers.ArtifactContent)
	api.POST("/remote-executions/:executionId/artifacts/:artifactId/preview-sessions", handlers.RequireAuth, handlers.PreviewSession)
	api.POST("/remote-executions/:executionId/data-sources/:documentId/operations/:operationId/invoke", handlers.RequireAuth, handlers.DataOperation)
	api.POST("/remote-executions/:executionId/terminal-sessions", handlers.RequireAuth, handlers.TerminalOpen)
	api.POST("/remote-executions/:executionId/terminal-sessions/:terminalSessionId/resume", handlers.RequireAuth, handlers.TerminalResume)
	for _, action := range []string{"read", "write", "resize", "signal", "close"} {
		api.POST("/remote-executions/:executionId/terminal-sessions/:terminalSessionId/"+action, handlers.RequireAuth, handlers.TerminalAction)
	}
}
