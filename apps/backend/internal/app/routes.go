package app

import (
	"net/http"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendgithub "github.com/Prodivix/prodivix/apps/backend/internal/modules/integrations/github"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	backendworkspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/gin-gonic/gin"
)

type Routes struct {
	Ping gin.HandlerFunc

	Auth      backendauth.RouteHandlers
	GitHub    backendgithub.RouteHandlers
	Project   backendproject.RouteHandlers
	Workspace backendworkspace.RouteHandlers
}

func RegisterAPIRoutes(router *gin.Engine, routes Routes) {
	api := router.Group("/api")
	api.GET("/ping", routes.Ping)
	backendauth.RegisterRoutes(api, routes.Auth)
	backendgithub.RegisterRoutes(api, routes.GitHub)
	backendproject.RegisterRoutes(api, routes.Project)
	backendworkspace.RegisterRoutes(api, routes.Workspace)

	if routes.Ping == nil {
		api.GET("/ping", func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "pong"})
		})
	}
}
