package app

import (
	"net/http"

	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
	backendgithub "github.com/Prodivix/prodivix/apps/backend/internal/modules/integrations/github"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	backendremoteexecution "github.com/Prodivix/prodivix/apps/backend/internal/modules/remoteexecution"
	backendworkspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/gin-gonic/gin"
)

type Routes struct {
	Ping gin.HandlerFunc

	Auth            backendauth.RouteHandlers
	GitHub          backendgithub.RouteHandlers
	Project         backendproject.RouteHandlers
	Workspace       backendworkspace.RouteHandlers
	RemoteExecution backendremoteexecution.RouteHandlers
	Environment     backendenvironment.RouteHandlers
}

func RegisterAPIRoutes(router *gin.Engine, routes Routes) {
	api := router.Group("/api")
	ping := routes.Ping
	if ping == nil {
		ping = func(c *gin.Context) {
			c.JSON(http.StatusOK, gin.H{"message": "pong"})
		}
	}
	api.GET("/ping", ping)
	backendauth.RegisterRoutes(api, routes.Auth)
	backendgithub.RegisterRoutes(api, routes.GitHub)
	backendproject.RegisterRoutes(api, routes.Project)
	backendworkspace.RegisterRoutes(api, routes.Workspace)
	backendremoteexecution.RegisterRoutes(api, routes.RemoteExecution)
	backendenvironment.RegisterRoutes(api, routes.Environment)
}
