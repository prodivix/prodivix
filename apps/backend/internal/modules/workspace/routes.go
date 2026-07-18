package workspace

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth              gin.HandlerFunc
	GetWorkspace             gin.HandlerFunc
	GetWorkspaceCapabilities gin.HandlerFunc
	ImportLocalProject       gin.HandlerFunc
	CommitWorkspaceOperation gin.HandlerFunc
	CommitWorkspaceSettings  gin.HandlerFunc
	PutWorkspaceAssetBlob    gin.HandlerFunc
	GetWorkspaceAssetBlob    gin.HandlerFunc
	CreateAssetDelivery      gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	api.GET("/workspaces/:workspaceId", handlers.RequireAuth, handlers.GetWorkspace)
	api.GET("/workspaces/:workspaceId/capabilities", handlers.RequireAuth, handlers.GetWorkspaceCapabilities)
	api.POST("/workspaces/import-local-project", handlers.RequireAuth, handlers.ImportLocalProject)
	api.POST("/workspaces/:workspaceId/operations/commit", handlers.RequireAuth, handlers.CommitWorkspaceOperation)
	api.POST("/workspaces/:workspaceId/settings/commit", handlers.RequireAuth, handlers.CommitWorkspaceSettings)
	api.PUT("/workspaces/:workspaceId/asset-blobs/:digest", handlers.RequireAuth, handlers.PutWorkspaceAssetBlob)
	api.GET("/workspaces/:workspaceId/asset-blobs/:digest", handlers.RequireAuth, handlers.GetWorkspaceAssetBlob)
	api.POST("/workspaces/:workspaceId/asset-blobs/:digest/delivery-sessions", handlers.RequireAuth, handlers.CreateAssetDelivery)
}
