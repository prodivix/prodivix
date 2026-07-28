package app

import (
	"bytes"
	"reflect"
	"testing"
	"time"

	"github.com/DATA-DOG/go-sqlmock"
	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
)

func TestRuntimeComposesPostgreSQLVerificationTargetPolicyAuthority(t *testing.T) {
	database, _, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()
	cfg := backendconfig.Config{}
	cfg.Verification.ArtifactRoot = t.TempDir()
	cfg.Verification.PromotionTTL = 15 * time.Minute
	cfg.Verification.SessionRetention = time.Hour
	cfg.Verification.TombstoneGrace = time.Minute
	cfg.Verification.SweepInterval = time.Hour
	cfg.Verification.SweepBatchSize = 100
	cfg.Verification.AttestationPolicyGeneration = 1
	cfg.Verification.AttestationMaxLifetime = 10 * time.Minute
	cfg.Verification.AttestationKeys = map[string]backendconfig.VerificationAttestationKeyConfig{}
	cfg.Verification.ResumeKey = bytes.Repeat([]byte{0x73}, 32)

	modules, err := NewRuntimeModules(database, time.Hour, cfg)
	if err != nil {
		t.Fatalf("compose runtime modules: %v", err)
	}
	if modules.Verification.TargetPolicies == nil ||
		modules.Verification.AttemptGrants == nil ||
		modules.Verification.Service == nil ||
		modules.Verification.Repository == nil {
		t.Fatalf("Verification runtime omitted the production policy authority: %+v", modules.Verification)
	}
	serviceAuthority := reflect.ValueOf(modules.Verification.Service).
		Elem().
		FieldByName("attemptGrants")
	if !serviceAuthority.IsValid() ||
		serviceAuthority.Kind() != reflect.Interface ||
		serviceAuthority.IsNil() ||
		serviceAuthority.Elem().Pointer() !=
			reflect.ValueOf(modules.Verification.AttemptGrants).Pointer() {
		t.Fatal("Verification runtime did not give Service the same in-process AttemptGrant authority exposed to the trusted coordinator")
	}
}
