package github

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth         gin.HandlerFunc
	HandleWebhook       gin.HandlerFunc
	HandleDevEvent      gin.HandlerFunc
	BeginSetup          gin.HandlerFunc
	CompleteSetup       gin.HandlerFunc
	ListInstallations   gin.HandlerFunc
	ListRepositories    gin.HandlerFunc
	UpsertBinding       gin.HandlerFunc
	GetProjectBinding   gin.HandlerFunc
	GetProjectSyncState gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	api.POST("/integrations/github/webhook", handlers.HandleWebhook)
	api.POST("/integrations/github/dev/events", handlers.RequireAuth, handlers.HandleDevEvent)
	api.POST("/integrations/github/installations/setup", handlers.RequireAuth, handlers.BeginSetup)
	api.GET("/integrations/github/installations/setup/callback", handlers.CompleteSetup)
	api.GET("/integrations/github/installations", handlers.RequireAuth, handlers.ListInstallations)
	api.GET("/integrations/github/repositories", handlers.RequireAuth, handlers.ListRepositories)
	api.GET("/projects/:id/integrations/github/binding", handlers.RequireAuth, handlers.GetProjectBinding)
	api.POST("/projects/:id/integrations/github/binding", handlers.RequireAuth, handlers.UpsertBinding)
	api.GET("/projects/:id/integrations/github/sync-state", handlers.RequireAuth, handlers.GetProjectSyncState)
}
