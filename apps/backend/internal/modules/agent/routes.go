package agent

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth     gin.HandlerFunc
	CreateTask      gin.HandlerFunc
	DecideProposal  gin.HandlerFunc
	StoreRunCommand gin.HandlerFunc
	GetProduct      gin.HandlerFunc
	ExportAudit     gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	base := "/projects/:id/workspaces/:workspaceId/agent"
	api.POST(base+"/tasks", handlers.RequireAuth, handlers.CreateTask)
	api.POST(base+"/approvals", handlers.RequireAuth, handlers.DecideProposal)
	api.GET(base+"/runs/:runId/product", handlers.RequireAuth, handlers.GetProduct)
	api.POST(base+"/runs/:runId/commands", handlers.RequireAuth, handlers.StoreRunCommand)
	api.GET(base+"/runs/:runId/audit", handlers.RequireAuth, handlers.ExportAudit)
}
