package workspace

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth              gin.HandlerFunc
	GetWorkspace             gin.HandlerFunc
	GetWorkspaceCapabilities gin.HandlerFunc
	ImportLocalProject       gin.HandlerFunc
	PatchWorkspaceDocument   gin.HandlerFunc
	ApplyWorkspaceIntent     gin.HandlerFunc
	CommitWorkspaceOperation gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	api.GET("/workspaces/:workspaceId", handlers.RequireAuth, handlers.GetWorkspace)
	api.GET("/workspaces/:workspaceId/capabilities", handlers.RequireAuth, handlers.GetWorkspaceCapabilities)
	api.POST("/workspaces/import-local-project", handlers.RequireAuth, handlers.ImportLocalProject)
	api.PATCH("/workspaces/:workspaceId/documents/:documentId", handlers.RequireAuth, handlers.PatchWorkspaceDocument)
	api.POST("/workspaces/:workspaceId/intents", handlers.RequireAuth, handlers.ApplyWorkspaceIntent)
	api.POST("/workspaces/:workspaceId/operations/commit", handlers.RequireAuth, handlers.CommitWorkspaceOperation)
}
