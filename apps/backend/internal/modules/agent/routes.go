package agent

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth             gin.HandlerFunc
	CreateTask              gin.HandlerFunc
	DecideProposal          gin.HandlerFunc
	StoreRunCommand         gin.HandlerFunc
	GetProduct              gin.HandlerFunc
	ExportAudit             gin.HandlerFunc
	ListDraftProviders      gin.HandlerFunc
	GenerateDraft           gin.HandlerFunc
	FindTaskRun             gin.HandlerFunc
	Runtime                 *RuntimeGateway
	CreateAdmission         gin.HandlerFunc
	GetAdmission            gin.HandlerFunc
	ReadTaskOutputs         gin.HandlerFunc
	CreateRepairTaskRequest gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	if handlers.Runtime != nil {
		handlers.Runtime.RegisterRoutes(api)
	}
	if handlers.ListDraftProviders != nil {
		api.GET("/agent/providers", handlers.RequireAuth, handlers.ListDraftProviders)
	}
	if handlers.GenerateDraft != nil {
		api.POST("/agent/drafts", handlers.RequireAuth, handlers.GenerateDraft)
	}
	base := "/projects/:id/workspaces/:workspaceId/agent"
	if handlers.CreateAdmission != nil {
		api.POST(base+"/task-admissions", handlers.RequireAuth, handlers.CreateAdmission)
	}
	if handlers.GetAdmission != nil {
		api.GET(base+"/task-admissions/:admissionId", handlers.RequireAuth, handlers.GetAdmission)
	}
	api.POST(base+"/tasks", handlers.RequireAuth, handlers.CreateTask)
	if handlers.FindTaskRun != nil {
		api.GET(base+"/tasks/:taskId/run", handlers.RequireAuth, handlers.FindTaskRun)
	}
	api.POST(base+"/approvals", handlers.RequireAuth, handlers.DecideProposal)
	api.GET(base+"/runs/:runId/product", handlers.RequireAuth, handlers.GetProduct)
	if handlers.ReadTaskOutputs != nil {
		api.GET(base+"/runs/:runId/task-outputs", handlers.RequireAuth, handlers.ReadTaskOutputs)
	}
	if handlers.CreateRepairTaskRequest != nil {
		api.POST(base+"/runs/:runId/repair-task-requests", handlers.RequireAuth, handlers.CreateRepairTaskRequest)
	}
	api.POST(base+"/runs/:runId/commands", handlers.RequireAuth, handlers.StoreRunCommand)
	api.GET(base+"/runs/:runId/audit", handlers.RequireAuth, handlers.ExportAudit)
}
