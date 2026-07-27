package backend

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"

	backendapp "github.com/Prodivix/prodivix/apps/backend/internal/app"
	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	backendmiddleware "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/middleware"
	"github.com/gin-gonic/gin"
)

// gin falls back to debug mode whenever GIN_MODE is unset, and debug mode makes
// gin log framework internals a deployment never asked for. Only a development
// process opts into it.
func ginModeForEnvironment(environment string) string {
	if strings.TrimSpace(strings.ToLower(environment)) == "development" {
		return gin.DebugMode
	}
	return gin.ReleaseMode
}

// newBaseRouter builds the engine every request passes through, separated from
// NewServer so a test can exercise the real middleware chain without a
// database. Binding the safe Recovery here is the whole point: gin.Default()
// installs gin's own Recovery, which dumps live X-Auth-Token and
// X-Prodivix-Terminal-Token headers into the process log on any panic.
func newBaseRouter(cfg backendconfig.Config, errorWriter io.Writer) (*gin.Engine, error) {
	gin.SetMode(ginModeForEnvironment(cfg.Environment))
	router := gin.New()
	router.Use(gin.Logger(), backendmiddleware.Recovery(errorWriter))
	if err := router.SetTrustedProxies(nil); err != nil {
		return nil, fmt.Errorf("disable untrusted proxy headers: %w", err)
	}
	return router, nil
}

type filesOnlyFS struct {
	http.FileSystem
}

func (fs filesOnlyFS) Open(name string) (http.File, error) {
	file, err := fs.FileSystem.Open(name)
	if err != nil {
		return nil, err
	}
	info, err := file.Stat()
	if err != nil {
		_ = file.Close()
		return nil, err
	}
	if info.IsDir() {
		_ = file.Close()
		return nil, os.ErrNotExist
	}
	return file, nil
}

type Server struct {
	cfg     backendconfig.Config
	db      *sql.DB
	router  *gin.Engine
	modules backendapp.RuntimeModules
}

func NewServer(cfg backendconfig.Config) (*Server, error) {
	db, err := backenddatabase.OpenDatabase(cfg)
	if err != nil {
		return nil, fmt.Errorf("initialize database: %w", err)
	}

	router, err := newBaseRouter(cfg, gin.DefaultErrorWriter)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	modules, err := backendapp.NewRuntimeModules(db, cfg.TokenTTL, cfg)
	if err != nil {
		_ = db.Close()
		return nil, err
	}
	server := &Server{
		cfg:     cfg,
		db:      db,
		router:  router,
		modules: modules,
	}
	router.Use(backendmiddleware.CORS(cfg.AllowedOrigins))
	server.registerRoutes()
	return server, nil
}

func (server *Server) registerRoutes() {
	requireAuth := server.modules.RequireAuth()
	server.router.StaticFS("/uploads", filesOnlyFS{FileSystem: http.Dir("./data/uploads")})
	backendapp.RegisterAPIRoutes(server.router, server.modules.Routes(requireAuth))
}

func (server *Server) Run() error {
	server.modules.StartMaintenance(context.Background())
	return server.router.Run(server.cfg.Address)
}

func (server *Server) Close() error {
	server.modules.CloseMaintenance()
	if server.db == nil {
		return nil
	}
	return server.db.Close()
}
