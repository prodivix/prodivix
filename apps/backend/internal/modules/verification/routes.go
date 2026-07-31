package verification

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth       gin.HandlerFunc
	CreatePromotion   gin.HandlerFunc
	CreateRun         gin.HandlerFunc
	ListRuns          gin.HandlerFunc
	GetRun            gin.HandlerFunc
	AppendRunEvent    gin.HandlerFunc
	UploadArtifact    gin.HandlerFunc
	FinalizePromotion gin.HandlerFunc
	ListEvidence      gin.HandlerFunc
	GetEvidence       gin.HandlerFunc
	GetArtifact       gin.HandlerFunc
	CompareEvidence   gin.HandlerFunc
	SupersedeEvidence gin.HandlerFunc
	MutateRetention   gin.HandlerFunc
	DeleteEvidence    gin.HandlerFunc
	CreateRevocation  gin.HandlerFunc
	GetClosure        gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	base := "/workspaces/:workspaceId/verification"
	api.POST(base+"/promotions", handlers.RequireAuth, handlers.CreatePromotion)
	api.POST(base+"/runs", handlers.RequireAuth, handlers.CreateRun)
	api.GET(base+"/runs", handlers.RequireAuth, handlers.ListRuns)
	api.GET(base+"/runs/:runId", handlers.RequireAuth, handlers.GetRun)
	api.POST(base+"/runs/:runId/events", handlers.RequireAuth, handlers.AppendRunEvent)
	api.PUT(base+"/promotions/:promotionId/artifacts/:artifactId", handlers.RequireAuth, handlers.UploadArtifact)
	api.POST(base+"/promotions/:promotionId/finalize", handlers.RequireAuth, handlers.FinalizePromotion)
	api.GET(base+"/evidence", handlers.RequireAuth, handlers.ListEvidence)
	api.GET(base+"/evidence/:evidenceId", handlers.RequireAuth, handlers.GetEvidence)
	api.GET(base+"/evidence/:evidenceId/artifacts/:artifactId/content", handlers.RequireAuth, handlers.GetArtifact)
	api.POST(base+"/evidence/:evidenceId/compare", handlers.RequireAuth, handlers.CompareEvidence)
	api.POST(base+"/evidence/:evidenceId/supersede", handlers.RequireAuth, handlers.SupersedeEvidence)
	api.POST(base+"/evidence/:evidenceId/retention", handlers.RequireAuth, handlers.MutateRetention)
	api.DELETE(base+"/evidence/:evidenceId", handlers.RequireAuth, handlers.DeleteEvidence)
	api.POST(base+"/revocations", handlers.RequireAuth, handlers.CreateRevocation)
	api.GET(base+"/closure", handlers.RequireAuth, handlers.GetClosure)
}
