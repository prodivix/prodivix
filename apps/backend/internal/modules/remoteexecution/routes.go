package remoteexecution

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth     gin.HandlerFunc
	Envelope        gin.HandlerFunc
	ArtifactContent gin.HandlerFunc
	PreviewSession  gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	api.POST("/remote-executions", handlers.RequireAuth, handlers.Envelope)
	api.GET("/remote-executions/:executionId/artifacts/:artifactId/content", handlers.RequireAuth, handlers.ArtifactContent)
	api.POST("/remote-executions/:executionId/artifacts/:artifactId/preview-sessions", handlers.RequireAuth, handlers.PreviewSession)
}
