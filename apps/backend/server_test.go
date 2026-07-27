package backend

import (
	"bytes"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"

	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	"github.com/gin-gonic/gin"
)

func TestGinModeIsReleaseOutsideDevelopment(t *testing.T) {
	for _, environment := range []string{"production", "staging", "test", ""} {
		if mode := ginModeForEnvironment(environment); mode != gin.ReleaseMode {
			t.Fatalf("environment %q selected gin mode %q, want %q", environment, mode, gin.ReleaseMode)
		}
	}
	if mode := ginModeForEnvironment("development"); mode != gin.DebugMode {
		t.Fatalf("development selected gin mode %q, want %q", mode, gin.DebugMode)
	}
}

// The production engine — not a lookalike built inside the test — must recover
// panics without logging credential headers. Development matters as much as
// production here: gin's own Recovery only dumps the header block while gin is
// in debug mode, so a test that never constructs the debug-mode router would
// keep passing after a revert to gin.Default().
func TestBaseRouterRecoversPanicsWithoutLoggingCredentialHeaders(t *testing.T) {
	for environment, wantMode := range map[string]string{
		"production":  gin.ReleaseMode,
		"development": gin.DebugMode,
	} {
		var logged bytes.Buffer
		router, err := newBaseRouter(backendconfig.Config{Environment: environment}, &logged)
		if err != nil {
			t.Fatal(err)
		}
		if gin.Mode() != wantMode {
			t.Fatalf("environment %q left gin in mode %q, want %q", environment, gin.Mode(), wantMode)
		}
		router.GET("/panics", func(*gin.Context) { panic("boom") })

		request := httptest.NewRequest(http.MethodGet, "/panics", nil)
		request.Header.Set("X-Auth-Token", "live-session-token")
		request.Header.Set("X-Prodivix-Terminal-Token", "live-terminal-token")
		request.Header.Set("Authorization", "Bearer live-bearer-token")
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)

		if response.Code != http.StatusInternalServerError {
			t.Fatalf("%s: panic answered %d, want %d", environment, response.Code, http.StatusInternalServerError)
		}
		output := logged.String()
		if !strings.Contains(output, "panic recovered") {
			t.Fatalf("%s: recovery logged nothing about the panic: %q", environment, output)
		}
		for _, secret := range []string{"live-session-token", "live-terminal-token", "live-bearer-token"} {
			if strings.Contains(output, secret) {
				t.Fatalf("%s: recovery log leaked credential %q:\n%s", environment, secret, output)
			}
		}
	}
}

func TestFilesOnlyFSRejectsDirectoryListing(t *testing.T) {
	directory := t.TempDir()
	if err := os.WriteFile(filepath.Join(directory, "avatar.png"), []byte("image"), 0o600); err != nil {
		t.Fatal(err)
	}
	fs := filesOnlyFS{FileSystem: http.Dir(directory)}
	if file, err := fs.Open("/"); err == nil || file != nil {
		t.Fatal("expected directory access to be rejected")
	}
	file, err := fs.Open("/avatar.png")
	if err != nil {
		t.Fatal(err)
	}
	_ = file.Close()
}
