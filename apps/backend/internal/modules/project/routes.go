package project

import "github.com/gin-gonic/gin"

type RouteHandlers struct {
	RequireAuth    gin.HandlerFunc
	ListProjects   gin.HandlerFunc
	CreateProject  gin.HandlerFunc
	GetProject     gin.HandlerFunc
	UpdateProject  gin.HandlerFunc
	GetProjectPIR  gin.HandlerFunc
	PublishProject gin.HandlerFunc
	DeleteProject  gin.HandlerFunc
	ListCommunity  gin.HandlerFunc
	GetCommunity   gin.HandlerFunc
}

func RegisterRoutes(api *gin.RouterGroup, handlers RouteHandlers) {
	api.GET("/community/projects", handlers.ListCommunity)
	api.GET("/community/projects/:id", handlers.GetCommunity)

	api.GET("/projects", handlers.RequireAuth, handlers.ListProjects)
	api.POST("/projects", handlers.RequireAuth, handlers.CreateProject)
	api.GET("/projects/:id", handlers.RequireAuth, handlers.GetProject)
	api.PATCH("/projects/:id", handlers.RequireAuth, handlers.UpdateProject)
	api.GET("/projects/:id/pir", handlers.RequireAuth, handlers.GetProjectPIR)
	api.POST("/projects/:id/publish", handlers.RequireAuth, handlers.PublishProject)
	api.DELETE("/projects/:id", handlers.RequireAuth, handlers.DeleteProject)
}
