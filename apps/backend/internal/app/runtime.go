package app

import (
	"context"
	"crypto/ed25519"
	"database/sql"
	"encoding/base64"
	"fmt"
	"strings"
	"time"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendenvironment "github.com/Prodivix/prodivix/apps/backend/internal/modules/environment"
	backendgithub "github.com/Prodivix/prodivix/apps/backend/internal/modules/integrations/github"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	backendremoteexecution "github.com/Prodivix/prodivix/apps/backend/internal/modules/remoteexecution"
	backendverification "github.com/Prodivix/prodivix/apps/backend/internal/modules/verification"
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
	Verification struct {
		Repository     *backendverification.Repository
		Store          *backendverification.FilesystemArtifactStore
		TargetPolicies *backendverification.PostgreSQLTargetPolicyAuthority
		AttemptGrants  *backendverification.PostgreSQLAttemptGrantAuthority
		Service        *backendverification.Service
		Handler        *backendverification.Handler
		Maintenance    *backendverification.Maintenance
	}
}

func NewRuntimeModules(db *sql.DB, tokenTTL time.Duration, cfg backendconfig.Config) (RuntimeModules, error) {
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
	switch cfg.EnvironmentSecrets.KMSProvider {
	case "", backendconfig.EnvironmentSecretKMSProviderStaticKeyRing:
		modules.Environment.Store = backendenvironment.NewStoreWithKeyRing(db, cfg.EnvironmentSecrets.MasterKey, cfg.EnvironmentSecrets.ActiveKeyID, cfg.EnvironmentSecrets.Keys)
	case backendconfig.EnvironmentSecretKMSProviderAWS:
		ctx, cancel := context.WithTimeout(context.Background(), cfg.EnvironmentSecrets.KMSOperationTimeout)
		defer cancel()
		store, err := backendenvironment.NewStoreWithAWSKMS(
			ctx,
			db,
			cfg.EnvironmentSecrets.MasterKey,
			cfg.EnvironmentSecrets.AWSRegion,
			cfg.EnvironmentSecrets.ActiveKeyID,
			cfg.EnvironmentSecrets.AWSKeyARNs,
			cfg.EnvironmentSecrets.Keys,
			cfg.EnvironmentSecrets.KMSOperationTimeout,
		)
		if err != nil {
			return RuntimeModules{}, fmt.Errorf("initialize managed Environment Secret KMS: %w", err)
		}
		modules.Environment.Store = store
	default:
		return RuntimeModules{}, fmt.Errorf("unsupported Environment Secret KMS provider %q", cfg.EnvironmentSecrets.KMSProvider)
	}
	modules.Environment.Handler = backendenvironment.NewHandler(modules.Environment.Store)
	modules.Environment.Maintenance = NewEnvironmentSecretKeyRotationMaintenance(modules.Environment.Store, cfg.EnvironmentSecrets)
	modules.RemoteExecution.Handler = backendremoteexecution.NewHandler(modules.RemoteExecution.Store, cfg.RemoteRunner, cfg.RemotePreview, modules.Environment.Store)
	verificationKeys := make([]backendverification.AttestationKey, 0, len(cfg.Verification.AttestationKeys))
	for keyID, configured := range cfg.Verification.AttestationKeys {
		publicKey, err := base64.StdEncoding.DecodeString(configured.PublicKey)
		if err != nil {
			publicKey, err = base64.RawStdEncoding.DecodeString(configured.PublicKey)
		}
		if err != nil || len(publicKey) != ed25519.PublicKeySize {
			return RuntimeModules{}, fmt.Errorf("decode Verification attestation key %q", keyID)
		}
		verificationKeys = append(verificationKeys, backendverification.AttestationKey{
			ID: keyID, PublicKey: ed25519.PublicKey(publicKey), Issuer: configured.Issuer,
			Audience: configured.Audience, Subject: configured.Subject,
			Trust: backendverification.TrustClass(configured.Trust),
		})
	}
	attestationVerifier, err := backendverification.NewEd25519AttestationVerifier(
		verificationKeys, int64(cfg.Verification.AttestationPolicyGeneration),
		cfg.Verification.AttestationMaxLifetime,
	)
	if err != nil {
		return RuntimeModules{}, fmt.Errorf("initialize Verification attestation verifier: %w", err)
	}
	artifactStore, err := backendverification.NewFilesystemArtifactStore(cfg.Verification.ArtifactRoot)
	if err != nil {
		return RuntimeModules{}, fmt.Errorf("initialize Verification artifact store: %w", err)
	}
	secretCanaries := append([]string(nil), cfg.Verification.SecretCanaries...)
	secretCanaries = append(secretCanaries,
		cfg.GitHub.ClientSecret, cfg.GitHub.WebhookSecret, cfg.RemoteRunner.ClientToken,
		cfg.RemoteRunner.SecretBrokerToken, cfg.RemotePreview.Token, cfg.AssetDelivery.Token,
		cfg.EnvironmentSecrets.MasterKey,
	)
	for _, key := range cfg.EnvironmentSecrets.Keys {
		secretCanaries = append(secretCanaries, key)
	}
	filteredCanaries := secretCanaries[:0]
	for _, canary := range secretCanaries {
		if strings.TrimSpace(canary) != "" {
			filteredCanaries = append(filteredCanaries, canary)
		}
	}
	verificationConfig := backendverification.ServiceConfig{
		PromotionTTL:            cfg.Verification.PromotionTTL,
		SessionRetention:        cfg.Verification.SessionRetention,
		TombstoneGrace:          cfg.Verification.TombstoneGrace,
		AttestationMaxLifetime:  cfg.Verification.AttestationMaxLifetime,
		RetentionSweepInterval:  cfg.Verification.SweepInterval,
		RetentionSweepBatchSize: cfg.Verification.SweepBatchSize,
		ResumeKey:               append([]byte(nil), cfg.Verification.ResumeKey...),
	}
	modules.Verification.Repository = backendverification.NewRepository(db)
	modules.Verification.Store = artifactStore
	modules.Verification.TargetPolicies = backendverification.NewPostgreSQLTargetPolicyAuthority(db)
	attemptGrants := backendverification.NewPostgreSQLAttemptGrantAuthority(db)
	modules.Verification.AttemptGrants = attemptGrants
	modules.Verification.Service, err = backendverification.NewService(
		modules.Verification.Repository, artifactStore, modules.RemoteExecution.Store,
		modules.Verification.TargetPolicies,
		attemptGrants,
		backendverification.NewCandidateValidator(filteredCanaries),
		attestationVerifier, verificationConfig,
	)
	if err != nil {
		return RuntimeModules{}, fmt.Errorf("initialize Verification service: %w", err)
	}
	modules.Verification.Handler = backendverification.NewHandler(modules.Verification.Service)
	modules.Verification.Maintenance = backendverification.NewMaintenance(
		modules.Verification.Service, verificationConfig,
	)
	return modules, nil
}

func (modules RuntimeModules) StartMaintenance(ctx context.Context) {
	modules.Workspace.Maintenance.Start(ctx)
	modules.Environment.Maintenance.Start(ctx)
	modules.Verification.Maintenance.Start(ctx)
}

func (modules RuntimeModules) CloseMaintenance() {
	modules.Verification.Maintenance.Close()
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
		Verification:    modules.Verification.Handler.Routes(requireAuth),
	}
}
