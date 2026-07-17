package backend

import (
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

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
