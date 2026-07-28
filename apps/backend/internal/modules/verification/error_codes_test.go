package verification

import (
	"os"
	"path/filepath"
	"regexp"
	"runtime"
	"testing"
)

func TestVerificationHTTPErrorCodesAreRegistered(t *testing.T) {
	registered := map[string]struct{}{
		"VER-1001": {}, "VER-1002": {},
		"VER-2001": {}, "VER-2002": {},
		"VER-3001": {}, "VER-3002": {}, "VER-3003": {}, "VER-3004": {},
		"VER-4001": {}, "VER-4002": {},
		"VER-5001": {}, "VER-5002": {}, "VER-5003": {}, "VER-5004": {},
		"VER-5005": {}, "VER-6001": {}, "VER-6002": {}, "VER-9001": {},
	}
	_, current, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("resolve Verification module source directory")
	}
	files, err := filepath.Glob(filepath.Join(filepath.Dir(current), "*.go"))
	if err != nil {
		t.Fatal(err)
	}
	pattern := regexp.MustCompile(`VER-[0-9]{4}`)
	for _, file := range files {
		if filepath.Ext(file) != ".go" || filepath.Base(file) == filepath.Base(current) {
			continue
		}
		body, err := os.ReadFile(file)
		if err != nil {
			t.Fatal(err)
		}
		for _, code := range pattern.FindAllString(string(body), -1) {
			if _, exists := registered[code]; !exists {
				t.Errorf("%s uses unregistered Verification diagnostic %s", filepath.Base(file), code)
			}
		}
	}
}
