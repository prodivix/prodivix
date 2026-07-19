package workspace

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	backendconfig "github.com/Prodivix/prodivix/apps/backend/internal/config"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	"github.com/gin-gonic/gin"
)

func workspaceAssetBlobTestRouter(store *WorkspaceStore, authenticated bool) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	authenticate := func(c *gin.Context) {
		if authenticated {
			c.Set("authUser", &backendauth.User{ID: "owner-1"})
		}
		c.Next()
	}
	api := router.Group("/api")
	RegisterRoutes(api, NewHandler(store, nil).Routes(authenticate))
	return router
}

func workspaceAssetDeliveryTestRouter(store *WorkspaceStore, config backendconfig.AssetDeliveryHostConfig) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	authenticate := func(c *gin.Context) {
		c.Set("authUser", &backendauth.User{ID: "owner-1"})
		c.Next()
	}
	api := router.Group("/api")
	RegisterRoutes(api, NewHandler(store, nil, config).Routes(authenticate))
	return router
}

func expectWorkspaceOwnerQuery(mock sqlmock.Sqlmock) {
	mock.ExpectQuery("SELECT 1").WithArgs("workspace-1", "owner-1").WillReturnRows(
		sqlmock.NewRows([]string{"marker"}).AddRow(1),
	)
}

func TestWorkspaceAssetBlobHandlersUploadAndReadExactBytes(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	router := workspaceAssetBlobTestRouter(store, true)
	contents := []byte{0, 255, 1, 2, 3}
	digest := computeWorkspaceAssetDigest(contents)

	expectWorkspaceOwnerQuery(mock)
	expectWorkspaceOwnerQuery(mock)
	mock.ExpectExec("INSERT INTO workspace_asset_blobs").
		WithArgs("workspace-1", digest, "image/png", int64(len(contents)), contents).
		WillReturnResult(sqlmock.NewResult(0, 1))
	put := httptest.NewRequest(
		http.MethodPut,
		"/api/workspaces/workspace-1/asset-blobs/"+digest,
		bytes.NewReader(contents),
	)
	put.Header.Set("Content-Type", "image/png")
	putResponse := httptest.NewRecorder()
	router.ServeHTTP(putResponse, put)
	if putResponse.Code != http.StatusCreated {
		t.Fatalf("expected 201, got %d: %s", putResponse.Code, putResponse.Body.String())
	}
	var upload struct {
		Status string                      `json:"status"`
		Blob   WorkspaceAssetBlobReference `json:"blob"`
	}
	if err := json.Unmarshal(putResponse.Body.Bytes(), &upload); err != nil {
		t.Fatal(err)
	}
	if upload.Status != "stored" || upload.Blob.Digest != digest || upload.Blob.ByteLength != int64(len(contents)) {
		t.Fatalf("unexpected upload response: %#v", upload)
	}
	if bytes.Contains(putResponse.Body.Bytes(), contents) {
		t.Fatal("upload response leaked blob contents")
	}

	expectWorkspaceOwnerQuery(mock)
	mock.ExpectQuery("SELECT media_type, byte_length, contents, created_at").
		WithArgs("workspace-1", digest).
		WillReturnRows(
			sqlmock.NewRows([]string{"media_type", "byte_length", "contents", "created_at"}).
				AddRow("image/png", len(contents), contents, time.Unix(1, 0).UTC()),
		)
	get := httptest.NewRequest(
		http.MethodGet,
		"/api/workspaces/workspace-1/asset-blobs/"+digest,
		nil,
	)
	getResponse := httptest.NewRecorder()
	router.ServeHTTP(getResponse, get)
	if getResponse.Code != http.StatusOK || !bytes.Equal(getResponse.Body.Bytes(), contents) {
		t.Fatalf("unexpected blob response %d: %v", getResponse.Code, getResponse.Body.Bytes())
	}
	if getResponse.Header().Get("Cache-Control") != "private, no-store" ||
		getResponse.Header().Get("X-Content-Type-Options") != "nosniff" ||
		getResponse.Header().Get("Content-Disposition") != `attachment; filename="asset"` {
		t.Fatalf("missing hardened download headers: %#v", getResponse.Header())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceAssetBlobHandlersFailClosedBeforePersistence(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	router := workspaceAssetBlobTestRouter(store, true)
	contents := []byte{1, 2, 3}
	digest := computeWorkspaceAssetDigest([]byte{9})

	expectWorkspaceOwnerQuery(mock)
	request := httptest.NewRequest(
		http.MethodPut,
		"/api/workspaces/workspace-1/asset-blobs/"+digest,
		bytes.NewReader(contents),
	)
	request.Header.Set("Content-Type", "image/png")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity {
		t.Fatalf("expected 422, got %d: %s", response.Code, response.Body.String())
	}

	expectWorkspaceOwnerQuery(mock)
	oversized := httptest.NewRequest(
		http.MethodPut,
		"/api/workspaces/workspace-1/asset-blobs/"+digest,
		bytes.NewReader(nil),
	)
	oversized.ContentLength = MaxWorkspaceAssetBlobBytes + 1
	oversized.Header.Set("Content-Type", "image/png")
	oversizedResponse := httptest.NewRecorder()
	router.ServeHTTP(oversizedResponse, oversized)
	if oversizedResponse.Code != http.StatusRequestEntityTooLarge ||
		!bytes.Contains(oversizedResponse.Body.Bytes(), []byte(ErrorWorkspaceAssetBlobInvalid)) {
		t.Fatalf("expected bounded AST-2001 response, got %d: %s", oversizedResponse.Code, oversizedResponse.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceAssetBlobHandlersRequireAuthentication(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	router := workspaceAssetBlobTestRouter(NewWorkspaceStore(db), false)
	request := httptest.NewRequest(
		http.MethodGet,
		"/api/workspaces/workspace-1/asset-blobs/sha256-"+string(bytes.Repeat([]byte{'0'}, 64)),
		nil,
	)
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401, got %d", response.Code)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceImportFailsClosedUntilBlobAwareImportIsAvailable(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	store := NewWorkspaceStore(db)
	module := NewModule(store, backendproject.NewProjectStore(db))
	gin.SetMode(gin.TestMode)
	router := gin.New()
	authenticate := func(c *gin.Context) {
		c.Set("authUser", &backendauth.User{ID: "owner-1"})
		c.Next()
	}
	api := router.Group("/api")
	RegisterRoutes(api, NewHandler(store, module).Routes(authenticate))
	body := []byte(`{
		"name":"Imported",
		"resourceType":"project",
		"workspace":{
			"documents":[
				{"id":"page","type":"pir-page","path":"/pir.json","content":{}},
				{"id":"asset","type":"asset","path":"/public/image.png","content":{}}
			]
		}
	}`)
	request := httptest.NewRequest(
		http.MethodPost,
		"/api/workspaces/import-local-project",
		bytes.NewReader(body),
	)
	request.Header.Set("Content-Type", "application/json")
	response := httptest.NewRecorder()
	router.ServeHTTP(response, request)
	if response.Code != http.StatusUnprocessableEntity ||
		!bytes.Contains(response.Body.Bytes(), []byte(ErrorWorkspaceAssetImportUnsupported)) {
		t.Fatalf("expected AST-2004, got %d: %s", response.Code, response.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestWorkspaceAssetDeliveryGatewayForwardsAuthorizedExactImageBytes(t *testing.T) {
	tests := []struct {
		name      string
		contents  []byte
		mediaType string
		transform string
		width     int
		height    int
	}{
		{name: "PNG", contents: []byte{137, 80, 78, 71, 1, 2, 3}, mediaType: "image/png", transform: "png-sanitize", width: 1, height: 1},
		{name: "baseline JPEG", contents: []byte{255, 216, 255, 224, 1, 2, 255, 217}, mediaType: "image/jpeg", transform: "jpeg-sanitize", width: 2, height: 3},
		{name: "PNG full raster", contents: []byte{137, 80, 78, 71, 4, 5, 6}, mediaType: "image/png", transform: "png-raster-reencode", width: 1, height: 1},
		{name: "JPEG full raster", contents: []byte{255, 216, 255, 224, 4, 5, 255, 217}, mediaType: "image/jpeg", transform: "jpeg-raster-reencode", width: 3, height: 2},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			digest := computeWorkspaceAssetDigest(test.contents)
			capability := strings.Repeat("b", 64)
			host := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, request *http.Request) {
				if request.URL.Path != "/internal/image-transform-delivery-sessions" || request.Header.Get("Authorization") != "Bearer delivery-token" || request.Header.Get("Content-Type") != test.mediaType || request.Header.Get("X-Prodivix-Asset-Digest") != digest || request.Header.Get("X-Prodivix-Delivery-Disposition") != "inline" || request.Header.Get("X-Prodivix-Image-Transform") != test.transform {
					t.Fatalf("unexpected delivery request: %s %#v", request.URL.Path, request.Header)
				}
				body, err := io.ReadAll(request.Body)
				if err != nil || !bytes.Equal(body, test.contents) {
					t.Fatalf("delivery gateway changed bytes: %v %v", body, err)
				}
				response.Header().Set("Content-Type", "application/json")
				response.WriteHeader(http.StatusCreated)
				_, _ = fmt.Fprintf(response, `{"deliveryUrl":"https://%s.asset.example.test/asset","expiresAt":%d,"digest":"sha256-%s","mediaType":"%s","byteLength":6,"disposition":"inline","deliveryClass":"static","recipeDigest":"sha256-%s","metadata":{"width":%d,"height":%d},"cacheStatus":"transformed"}`, capability, time.Now().Add(30*time.Second).UnixMilli(), strings.Repeat("c", 64), test.mediaType, strings.Repeat("d", 64), test.width, test.height)
			}))
			defer host.Close()

			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			expectWorkspaceOwnerQuery(mock)
			mock.ExpectQuery("SELECT media_type, byte_length, contents, created_at").
				WithArgs("workspace-1", digest).
				WillReturnRows(sqlmock.NewRows([]string{"media_type", "byte_length", "contents", "created_at"}).AddRow(test.mediaType, len(test.contents), test.contents, time.Unix(1, 0).UTC()))
			router := workspaceAssetDeliveryTestRouter(NewWorkspaceStore(db), backendconfig.AssetDeliveryHostConfig{
				BaseURL:       host.URL,
				PublicBaseURL: "https://asset.example.test",
				Token:         "delivery-token",
				Timeout:       time.Second,
				TTL:           time.Minute,
			})
			request := httptest.NewRequest(http.MethodPost, "/api/workspaces/workspace-1/asset-blobs/"+digest+"/delivery-sessions", strings.NewReader(fmt.Sprintf(`{"transform":%q,"disposition":"inline"}`, test.transform)))
			request.Header.Set("Content-Type", "application/json")
			response := httptest.NewRecorder()
			router.ServeHTTP(response, request)
			if response.Code != http.StatusCreated || !bytes.Contains(response.Body.Bytes(), []byte(capability)) || response.Header().Get("Cache-Control") != "private, no-store" {
				t.Fatalf("unexpected delivery response %d: %s", response.Code, response.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatal(err)
			}
		})
	}
}

func TestWorkspaceAssetDeliveryGatewayRejectsJPEGPolicyDriftBeforeHostAccess(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	router := workspaceAssetDeliveryTestRouter(NewWorkspaceStore(db), backendconfig.AssetDeliveryHostConfig{})

	invalidDisposition := httptest.NewRequest(http.MethodPost, "/api/workspaces/workspace-1/asset-blobs/sha256-"+strings.Repeat("a", 64)+"/delivery-sessions", strings.NewReader(`{"transform":"jpeg-sanitize","disposition":"attachment"}`))
	invalidDispositionResponse := httptest.NewRecorder()
	router.ServeHTTP(invalidDispositionResponse, invalidDisposition)
	if invalidDispositionResponse.Code != http.StatusBadRequest || !bytes.Contains(invalidDispositionResponse.Body.Bytes(), []byte(ErrorWorkspaceAssetDeliveryInvalid)) {
		t.Fatalf("expected invalid JPEG disposition to fail closed, got %d: %s", invalidDispositionResponse.Code, invalidDispositionResponse.Body.String())
	}

	contents := []byte{137, 80, 78, 71}
	digest := computeWorkspaceAssetDigest(contents)
	expectWorkspaceOwnerQuery(mock)
	mock.ExpectQuery("SELECT media_type, byte_length, contents, created_at").
		WithArgs("workspace-1", digest).
		WillReturnRows(sqlmock.NewRows([]string{"media_type", "byte_length", "contents", "created_at"}).AddRow("image/png", len(contents), contents, time.Unix(1, 0).UTC()))
	mismatchedMedia := httptest.NewRequest(http.MethodPost, "/api/workspaces/workspace-1/asset-blobs/"+digest+"/delivery-sessions", strings.NewReader(`{"transform":"jpeg-sanitize","disposition":"inline"}`))
	mismatchedMediaResponse := httptest.NewRecorder()
	router.ServeHTTP(mismatchedMediaResponse, mismatchedMedia)
	if mismatchedMediaResponse.Code != http.StatusUnprocessableEntity || !bytes.Contains(mismatchedMediaResponse.Body.Bytes(), []byte(ErrorWorkspaceAssetDeliveryRejected)) {
		t.Fatalf("expected mismatched JPEG media to fail closed, got %d: %s", mismatchedMediaResponse.Code, mismatchedMediaResponse.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAssetDeliveryHostResponseRejectsOriginalIdentityDrift(t *testing.T) {
	publicBaseURL, ok := validAssetDeliveryPublicBaseURL("https://asset.example.test")
	if !ok {
		t.Fatal("expected valid public base URL")
	}
	now := time.Unix(10, 0)
	source := WorkspaceAssetBlobReference{
		Kind:       "workspace-blob",
		Digest:     "sha256-" + strings.Repeat("a", 64),
		MediaType:  "application/pdf",
		ByteLength: 42,
	}
	result := assetDeliveryHostResponse{
		DeliveryURL:   "https://" + strings.Repeat("b", 64) + ".asset.example.test/asset",
		ExpiresAt:     now.Add(time.Minute).UnixMilli(),
		Digest:        source.Digest,
		MediaType:     source.MediaType,
		ByteLength:    source.ByteLength,
		Disposition:   "attachment",
		DeliveryClass: "download-only",
		CacheStatus:   "not-applicable",
	}
	request := createAssetDeliveryRequest{Transform: "original", Disposition: "attachment"}
	if !validAssetDeliveryHostResponse(result, request, source, publicBaseURL, now, 2*time.Minute) {
		t.Fatal("expected exact original identity to be accepted")
	}

	for name, mutate := range map[string]func(*assetDeliveryHostResponse){
		"class":  func(value *assetDeliveryHostResponse) { value.DeliveryClass = "static" },
		"digest": func(value *assetDeliveryHostResponse) { value.Digest = "sha256-" + strings.Repeat("c", 64) },
		"media":  func(value *assetDeliveryHostResponse) { value.MediaType = "application/zip" },
		"length": func(value *assetDeliveryHostResponse) { value.ByteLength++ },
	} {
		t.Run(name, func(t *testing.T) {
			drifted := result
			mutate(&drifted)
			if validAssetDeliveryHostResponse(drifted, request, source, publicBaseURL, now, 2*time.Minute) {
				t.Fatalf("expected original %s drift to fail closed", name)
			}
		})
	}
}

func TestWorkspaceAssetDeliveryGatewayRejectsRedirectedAndQuarantinedSessions(t *testing.T) {
	contents := []byte{137, 80, 78, 71}
	digest := computeWorkspaceAssetDigest(contents)
	responseMode := "redirect"
	host := httptest.NewServer(http.HandlerFunc(func(response http.ResponseWriter, _ *http.Request) {
		if responseMode == "quarantine" {
			response.WriteHeader(http.StatusUnprocessableEntity)
			_, _ = response.Write([]byte(`{"error":"asset-quarantined"}`))
			return
		}
		response.WriteHeader(http.StatusCreated)
		_, _ = fmt.Fprintf(response, `{"deliveryUrl":"https://%s.evil.example/asset","expiresAt":%d,"digest":"sha256-%s","mediaType":"image/png","byteLength":4,"disposition":"inline","deliveryClass":"static","recipeDigest":"sha256-%s","metadata":{"width":1,"height":1},"cacheStatus":"transformed"}`, strings.Repeat("b", 64), time.Now().Add(30*time.Second).UnixMilli(), strings.Repeat("c", 64), strings.Repeat("d", 64))
	}))
	defer host.Close()

	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	router := workspaceAssetDeliveryTestRouter(NewWorkspaceStore(db), backendconfig.AssetDeliveryHostConfig{BaseURL: host.URL, PublicBaseURL: "https://asset.example.test", Token: "delivery-token", Timeout: time.Second, TTL: time.Minute})
	callGateway := func() *httptest.ResponseRecorder {
		expectWorkspaceOwnerQuery(mock)
		mock.ExpectQuery("SELECT media_type, byte_length, contents, created_at").WithArgs("workspace-1", digest).WillReturnRows(sqlmock.NewRows([]string{"media_type", "byte_length", "contents", "created_at"}).AddRow("image/png", len(contents), contents, time.Unix(1, 0).UTC()))
		request := httptest.NewRequest(http.MethodPost, "/api/workspaces/workspace-1/asset-blobs/"+digest+"/delivery-sessions", strings.NewReader(`{"transform":"png-sanitize","disposition":"inline"}`))
		response := httptest.NewRecorder()
		router.ServeHTTP(response, request)
		return response
	}
	redirected := callGateway()
	if redirected.Code != http.StatusBadGateway || !bytes.Contains(redirected.Body.Bytes(), []byte(ErrorWorkspaceAssetDeliveryInvalid)) {
		t.Fatalf("expected AST-3103, got %d: %s", redirected.Code, redirected.Body.String())
	}
	responseMode = "quarantine"
	quarantined := callGateway()
	if quarantined.Code != http.StatusUnprocessableEntity || !bytes.Contains(quarantined.Body.Bytes(), []byte(ErrorWorkspaceAssetDeliveryRejected)) {
		t.Fatalf("expected AST-3102, got %d: %s", quarantined.Code, quarantined.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}
