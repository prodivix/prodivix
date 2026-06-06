package backend

import (
	"database/sql"
	"fmt"

	backendapp "github.com/Prodivix/prodivix/apps/backend/internal/app"
	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	backendmiddleware "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/middleware"
	"github.com/gin-gonic/gin"
)

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

	router := gin.Default()
	server := &Server{
		cfg:     cfg,
		db:      db,
		router:  router,
		modules: backendapp.NewRuntimeModules(db, cfg.TokenTTL, cfg),
	}
	router.Use(backendmiddleware.CORS(cfg.AllowedOrigins))
	server.registerRoutes()
	return server, nil
}

func (server *Server) registerRoutes() {
	requireAuth := server.modules.RequireAuth()
	backendapp.RegisterAPIRoutes(server.router, server.modules.Routes(requireAuth))
}

func (server *Server) Run() error {
	return server.router.Run(server.cfg.Address)
}

func (server *Server) Close() error {
	if server.db == nil {
		return nil
	}
	return server.db.Close()
}
