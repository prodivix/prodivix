package app

import (
	"context"
	"database/sql"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
	backendgithub "github.com/Prodivix/prodivix/apps/backend/internal/modules/integrations/github"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	backendremoteexecution "github.com/Prodivix/prodivix/apps/backend/internal/modules/remoteexecution"
	backendworkspace "github.com/Prodivix/prodivix/apps/backend/internal/modules/workspace"
	"github.com/gin-gonic/gin"
)

type RuntimeModules struct {
	Auth struct {
		Users    *backendauth.UserStore
		Sessions *backendauth.SessionStore
		Handler  *backendauth.Handler
	}
	GitHub struct {
		Store   *backendgithub.Store
		Handler *backendgithub.Handler
	}
	Project struct {
		Store   *backendproject.ProjectStore
		Handler *backendproject.Handler
	}
	Workspace struct {
		Store       *backendworkspace.WorkspaceStore
		Module      *backendworkspace.Module
		Handler     *backendworkspace.Handler
		Maintenance *WorkspaceAssetBlobMaintenance
	}
	RemoteExecution struct {
		Store   *backendremoteexecution.Store
		Handler *backendremoteexecution.Handler
	}
	Environment struct {
		Store       *backendenvironment.Store
		Handler     *backendenvironment.Handler
		Maintenance *EnvironmentSecretKeyRotationMaintenance
	}
}

func NewRuntimeModules(db *sql.DB, tokenTTL time.Duration, cfg backendconfig.Config) RuntimeModules {
	modules := RuntimeModules{}
	modules.Auth.Users = backendauth.NewUserStore(db)
	modules.Auth.Sessions = backendauth.NewSessionStore(db)
	modules.Auth.Handler = backendauth.NewHandler(modules.Auth.Users, modules.Auth.Sessions, tokenTTL)

	modules.Project.Store = backendproject.NewProjectStore(db)
	modules.GitHub.Store = backendgithub.NewStore(db)
	modules.Workspace.Store = backendworkspace.NewWorkspaceStore(db)
	modules.Workspace.Module = backendworkspace.NewModule(modules.Workspace.Store, modules.Project.Store)
	modules.Workspace.Handler = backendworkspace.NewHandler(modules.Workspace.Store, modules.Workspace.Module, cfg.AssetDelivery)
	modules.Workspace.Maintenance = NewWorkspaceAssetBlobMaintenance(modules.Workspace.Store, cfg.AssetBlobRetention)
	modules.Project.Handler = backendproject.NewHandler(modules.Project.Store, modules.Workspace.Module)
	modules.GitHub.Handler = backendgithub.NewHandler(modules.GitHub.Store, modules.Project.Store, cfg.GitHub, cfg.Environment)
	modules.RemoteExecution.Store = backendremoteexecution.NewStore(db)
	modules.Environment.Store = backendenvironment.NewStoreWithKeyRing(db, cfg.EnvironmentSecrets.MasterKey, cfg.EnvironmentSecrets.ActiveKeyID, cfg.EnvironmentSecrets.Keys)
	modules.Environment.Handler = backendenvironment.NewHandler(modules.Environment.Store)
	modules.Environment.Maintenance = NewEnvironmentSecretKeyRotationMaintenance(modules.Environment.Store, cfg.EnvironmentSecrets)
	modules.RemoteExecution.Handler = backendremoteexecution.NewHandler(modules.RemoteExecution.Store, cfg.RemoteRunner, cfg.RemotePreview, modules.Environment.Store)
	return modules
}

func (modules RuntimeModules) StartMaintenance(ctx context.Context) {
	modules.Workspace.Maintenance.Start(ctx)
	modules.Environment.Maintenance.Start(ctx)
}

func (modules RuntimeModules) CloseMaintenance() {
	modules.Environment.Maintenance.Close()
	modules.Workspace.Maintenance.Close()
}

func (modules RuntimeModules) RequireAuth() gin.HandlerFunc {
	return modules.Auth.Handler.RequireAuth()
}

func (modules RuntimeModules) Routes(requireAuth gin.HandlerFunc) Routes {
	return Routes{
		Ping: func(c *gin.Context) {
			c.JSON(200, gin.H{"message": "pong"})
		},
		Auth:            modules.Auth.Handler.Routes(requireAuth),
		GitHub:          modules.GitHub.Handler.Routes(requireAuth),
		Project:         modules.Project.Handler.Routes(requireAuth),
		Workspace:       modules.Workspace.Handler.Routes(requireAuth),
		RemoteExecution: modules.RemoteExecution.Handler.Routes(requireAuth),
		Environment:     modules.Environment.Handler.Routes(requireAuth),
	}
}
