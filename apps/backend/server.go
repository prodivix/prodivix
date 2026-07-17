package backend

import (
	"database/sql"
	"fmt"
	"net/http"
	"os"

	backendapp "github.com/Prodivix/prodivix/apps/backend/internal/app"
	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backenddatabase "github.com/Prodivix/prodivix/apps/backend/internal/platform/database"
	backendmiddleware "github.com/Prodivix/prodivix/apps/backend/internal/platform/http/middleware"
	"github.com/gin-gonic/gin"
)

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

	router := gin.Default()
	if err := router.SetTrustedProxies(nil); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("disable untrusted proxy headers: %w", err)
	}
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
	server.router.StaticFS("/uploads", filesOnlyFS{FileSystem: http.Dir("./data/uploads")})
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
