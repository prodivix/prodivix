package workspace

import (
	"bytes"
	"encoding/json"
	"errors"
	"fmt"
	"mime/multipart"
	"net/http"
	"net/http/httptest"
	"net/textproto"
	"regexp"
	"testing"

	sqlmock "github.com/DATA-DOG/go-sqlmock"
	backendauth "github.com/Prodivix/prodivix/apps/backend/internal/modules/auth"
	backendproject "github.com/Prodivix/prodivix/apps/backend/internal/modules/project"
	"github.com/gin-gonic/gin"
)

func assetImportTree() json.RawMessage {
	return json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["page-node","asset-node"]},"page-node":{"id":"page-node","kind":"doc","name":"pir.json","parentId":"root","docId":"page"},"asset-node":{"id":"asset-node","kind":"doc","name":"logo.png","parentId":"root","docId":"asset"}}}`)
}

func assetImportDocumentContent(contents []byte) json.RawMessage {
	digest := computeWorkspaceAssetDigest(contents)
	return json.RawMessage(fmt.Sprintf(
		`{"kind":"asset","mime":"image/png","size":%d,"blob":{"kind":"workspace-blob","digest":"%s","byteLength":%d,"mediaType":"image/png"},"metadata":{"originalFileName":"logo.png"}}`,
		len(contents),
		digest,
		len(contents),
	))
}

func assetImportManifest(contents []byte, includeAsset bool) []byte {
	documents := []WorkspaceImportDocumentRecord{{
		ID:      "page",
		Type:    WorkspaceDocumentTypePIRPage,
		Path:    "/pir.json",
		Content: defaultPIRDocument,
	}}
	tree := json.RawMessage(`{"treeRootId":"root","treeById":{"root":{"id":"root","kind":"dir","name":"/","parentId":null,"children":["page-node"]},"page-node":{"id":"page-node","kind":"doc","name":"pir.json","parentId":"root","docId":"page"}}}`)
	if includeAsset {
		documents = append(documents, WorkspaceImportDocumentRecord{
			ID:      "asset",
			Type:    WorkspaceDocumentTypeAsset,
			Path:    "/logo.png",
			Content: assetImportDocumentContent(contents),
		})
		tree = assetImportTree()
	}
	payload, err := json.Marshal(importLocalProjectRequest{
		Name:         "Imported assets",
		ResourceType: backendproject.ResourceTypeProject,
		Workspace: importWorkspaceRequest{
			Tree:          tree,
			Documents:     documents,
			RouteManifest: defaultWorkspaceRouteManifest,
			Settings:      defaultWorkspaceSettings,
		},
	})
	if err != nil {
		panic(err)
	}
	return payload
}

func appendAssetImportPart(writer *multipart.Writer, name string, fileName string, mediaType string, payload []byte) {
	header := make(textproto.MIMEHeader)
	header.Set("Content-Disposition", fmt.Sprintf(`form-data; name="%s"; filename="%s"`, name, fileName))
	header.Set("Content-Type", mediaType)
	part, err := writer.CreatePart(header)
	if err != nil {
		panic(err)
	}
	if _, err := part.Write(payload); err != nil {
		panic(err)
	}
}

func createAssetImportMultipart(manifest []byte, assets ...WorkspaceAssetBlobImport) (*bytes.Buffer, string) {
	body := bytes.NewBuffer(nil)
	writer := multipart.NewWriter(body)
	if manifest != nil {
		appendAssetImportPart(writer, "manifest", "manifest.json", "application/json", manifest)
	}
	for _, asset := range assets {
		appendAssetImportPart(writer, "asset", asset.Reference.Digest, asset.Reference.MediaType, asset.Contents)
	}
	contentType := writer.FormDataContentType()
	if err := writer.Close(); err != nil {
		panic(err)
	}
	return body, contentType
}

func assetImportBlob(contents []byte) WorkspaceAssetBlobImport {
	reference, err := createWorkspaceAssetBlobReference(
		computeWorkspaceAssetDigest(contents),
		"image/png",
		int64(len(contents)),
	)
	if err != nil {
		panic(err)
	}
	return WorkspaceAssetBlobImport{Reference: reference, Contents: append([]byte(nil), contents...)}
}

func decodeAssetImportTestRequest(t *testing.T, body *bytes.Buffer, contentType string) (*decodedImportLocalProjectRequest, *RequestFailure) {
	t.Helper()
	context, _ := gin.CreateTestContext(httptest.NewRecorder())
	context.Request = httptest.NewRequest(http.MethodPost, "/api/workspaces/import-local-project", body)
	context.Request.Header.Set("Content-Type", contentType)
	return decodeImportLocalProjectRequest(context)
}

func TestDecodeAssetImportMultipartPreservesExactBoundedBytes(t *testing.T) {
	gin.SetMode(gin.TestMode)
	contents := []byte{137, 80, 78, 71, 13, 10, 26, 10}
	blob := assetImportBlob(contents)
	body, contentType := createAssetImportMultipart(assetImportManifest(contents, true), blob)
	decoded, failure := decodeAssetImportTestRequest(t, body, contentType)
	if failure != nil {
		t.Fatalf("unexpected import failure: %+v", failure)
	}
	if decoded == nil || !decoded.UploadAware || decoded.Request.Name != "Imported assets" || len(decoded.AssetBlobs) != 1 {
		t.Fatalf("unexpected decoded import: %#v", decoded)
	}
	if decoded.AssetBlobs[0].Reference != blob.Reference || !bytes.Equal(decoded.AssetBlobs[0].Contents, contents) {
		t.Fatalf("asset bytes or identity drifted: %#v", decoded.AssetBlobs[0])
	}
}

func TestAssetImportNormalizationAllowsOneExactBlobForSharedDocumentReferences(t *testing.T) {
	contents := []byte{1, 2, 3}
	blob := assetImportBlob(contents)
	documents := map[string]WorkspaceDocumentRecord{
		"asset-1": {ID: "asset-1", Type: WorkspaceDocumentTypeAsset, Content: assetImportDocumentContent(contents)},
		"asset-2": {ID: "asset-2", Type: WorkspaceDocumentTypeAsset, Content: assetImportDocumentContent(contents)},
	}
	normalized, err := normalizeWorkspaceAssetBlobImports([]WorkspaceAssetBlobImport{blob}, documents)
	if err != nil || len(normalized) != 1 || normalized[0].Reference != blob.Reference {
		t.Fatalf("expected one shared exact blob, got %#v %v", normalized, err)
	}
}

func TestDecodeAssetImportMultipartRejectsMalformedOrUnboundedParts(t *testing.T) {
	gin.SetMode(gin.TestMode)
	contents := []byte{1, 2, 3}
	blob := assetImportBlob(contents)
	tests := []struct {
		name   string
		make   func() (*bytes.Buffer, string)
		code   string
		status int
	}{
		{
			name: "missing manifest",
			make: func() (*bytes.Buffer, string) { return createAssetImportMultipart(nil, blob) },
			code: ErrorWorkspaceAssetBlobInvalid, status: http.StatusUnprocessableEntity,
		},
		{
			name: "digest drift",
			make: func() (*bytes.Buffer, string) {
				drifted := blob
				drifted.Reference.Digest = computeWorkspaceAssetDigest([]byte{9})
				return createAssetImportMultipart(assetImportManifest(contents, true), drifted)
			},
			code: ErrorWorkspaceAssetBlobInvalid, status: http.StatusUnprocessableEntity,
		},
		{
			name: "duplicate manifest",
			make: func() (*bytes.Buffer, string) {
				body := bytes.NewBuffer(nil)
				writer := multipart.NewWriter(body)
				manifest := assetImportManifest(contents, true)
				appendAssetImportPart(writer, "manifest", "manifest.json", "application/json", manifest)
				appendAssetImportPart(writer, "manifest", "manifest.json", "application/json", manifest)
				contentType := writer.FormDataContentType()
				_ = writer.Close()
				return body, contentType
			},
			code: ErrorWorkspaceAssetBlobInvalid, status: http.StatusUnprocessableEntity,
		},
		{
			name: "unknown manifest field",
			make: func() (*bytes.Buffer, string) {
				manifest := append(bytes.TrimSuffix(assetImportManifest(contents, true), []byte("}")), []byte(`,"inlineBytes":"forbidden"}`)...)
				return createAssetImportMultipart(manifest, blob)
			},
			code: ErrorInvalidPayload, status: http.StatusBadRequest,
		},
		{
			name: "oversized manifest",
			make: func() (*bytes.Buffer, string) {
				return createAssetImportMultipart(bytes.Repeat([]byte{'x'}, int(maxWorkspaceAssetImportManifestBytes)+1))
			},
			code: ErrorWorkspaceAssetBlobInvalid, status: http.StatusRequestEntityTooLarge,
		},
		{
			name: "too many asset parts",
			make: func() (*bytes.Buffer, string) {
				empty := assetImportBlob(nil)
				assets := make([]WorkspaceAssetBlobImport, MaxWorkspaceAssetImportBlobCount+1)
				for index := range assets {
					assets[index] = empty
				}
				return createAssetImportMultipart(assetImportManifest(nil, true), assets...)
			},
			code: ErrorWorkspaceAssetBlobInvalid, status: http.StatusRequestEntityTooLarge,
		},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			body, contentType := test.make()
			decoded, failure := decodeAssetImportTestRequest(t, body, contentType)
			if decoded != nil || failure == nil {
				t.Fatalf("expected closed import failure, got %#v %+v", decoded, failure)
			}
			if failure.Status != test.status {
				t.Fatalf("expected status %d, got %d", test.status, failure.Status)
			}
			encoded, err := json.Marshal(failure.Payload)
			if err != nil || !bytes.Contains(encoded, []byte(test.code)) {
				t.Fatalf("expected %s failure, got %s (%v)", test.code, encoded, err)
			}
		})
	}
}

func assetImportTestRouter(store *WorkspaceStore, module *Module) *gin.Engine {
	gin.SetMode(gin.TestMode)
	router := gin.New()
	authenticate := func(c *gin.Context) {
		c.Set("authUser", &backendauth.User{ID: "owner-1"})
		c.Next()
	}
	api := router.Group("/api")
	RegisterRoutes(api, NewHandler(store, module).Routes(authenticate))
	return router
}

func TestAssetImportHandlerAtomicallyPersistsProjectWorkspaceBlobAndDocuments(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	contents := []byte{137, 80, 78, 71, 13, 10, 26, 10}
	blob := assetImportBlob(contents)
	store := NewWorkspaceStore(db)
	module := NewModule(store, backendproject.NewProjectStore(db))

	mock.ExpectBegin()
	mock.ExpectExec(regexp.QuoteMeta(atomicInsertProjectQuery)).
		WithArgs(sqlmock.AnyArg(), "owner-1", "project", "Imported assets", "", nil, false, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertWorkspaceQuery)).
		WithArgs(sqlmock.AnyArg(), sqlmock.AnyArg(), "owner-1", "Imported assets", int64(1), int64(1), int64(1), "root", semanticJSONArgument{expected: assetImportTree()}, sqlmock.AnyArg(), sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertRouteQuery)).
		WithArgs(sqlmock.AnyArg(), semanticJSONArgument{expected: defaultWorkspaceRouteManifest}, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec("INSERT INTO workspace_asset_blobs").
		WithArgs(sqlmock.AnyArg(), blob.Reference.Digest, blob.Reference.MediaType, blob.Reference.ByteLength, contents).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery("SELECT media_type, byte_length").
		WithArgs(sqlmock.AnyArg(), blob.Reference.Digest).
		WillReturnRows(sqlmock.NewRows([]string{"media_type", "byte_length"}).AddRow(blob.Reference.MediaType, blob.Reference.ByteLength))
	mock.ExpectExec("UPDATE workspace_asset_blobs").
		WithArgs(sqlmock.AnyArg(), `["`+blob.Reference.Digest+`"]`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
		WithArgs(sqlmock.AnyArg(), "page", "pir-page", "pir.json", "/pir.json", int64(1), int64(1), semanticJSONArgument{expected: defaultPIRDocument}, `[]`, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
		WithArgs(sqlmock.AnyArg(), "asset", "asset", "logo.png", "/logo.png", int64(1), int64(1), semanticJSONArgument{expected: assetImportDocumentContent(contents)}, `[]`, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectCommit()

	body, contentType := createAssetImportMultipart(assetImportManifest(contents, true), blob)
	request := httptest.NewRequest(http.MethodPost, "/api/workspaces/import-local-project", body)
	request.Header.Set("Content-Type", contentType)
	response := httptest.NewRecorder()
	assetImportTestRouter(store, module).ServeHTTP(response, request)
	if response.Code != http.StatusCreated || !bytes.Contains(response.Body.Bytes(), []byte(blob.Reference.Digest)) {
		t.Fatalf("unexpected asset import response %d: %s", response.Code, response.Body.String())
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAssetImportTransactionRollsBackProjectAndBlobWhenDocumentInsertFails(t *testing.T) {
	db, mock, err := sqlmock.New()
	if err != nil {
		t.Fatal(err)
	}
	defer db.Close()
	contents := []byte{1, 2, 3, 4}
	blob := assetImportBlob(contents)
	module := atomicTestModule(db)
	project, err := module.projects.PrepareProject(backendproject.PrepareProjectParams{
		OwnerID:      "owner_1",
		Name:         "Rollback assets",
		ResourceType: backendproject.ResourceTypeProject,
	})
	if err != nil {
		t.Fatal(err)
	}
	insertErr := errors.New("asset document insert failed")
	mock.ExpectBegin()
	expectAtomicProjectInsert(mock, project.ID, "Rollback assets", backendproject.ResourceTypeProject)
	expectBootstrapWorkspaceAndRouteInserts(mock, project.ID, "Rollback assets", assetImportTree(), defaultWorkspaceRouteManifest)
	mock.ExpectExec("INSERT INTO workspace_asset_blobs").
		WithArgs(project.ID, blob.Reference.Digest, blob.Reference.MediaType, blob.Reference.ByteLength, contents).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectQuery("SELECT media_type, byte_length").
		WithArgs(project.ID, blob.Reference.Digest).
		WillReturnRows(sqlmock.NewRows([]string{"media_type", "byte_length"}).AddRow(blob.Reference.MediaType, blob.Reference.ByteLength))
	mock.ExpectExec("UPDATE workspace_asset_blobs").
		WithArgs(project.ID, `["`+blob.Reference.Digest+`"]`).
		WillReturnResult(sqlmock.NewResult(0, 1))
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
		WithArgs(project.ID, "page", "pir-page", "pir.json", "/pir.json", int64(1), int64(1), semanticJSONArgument{expected: defaultPIRDocument}, `[]`, sqlmock.AnyArg()).
		WillReturnResult(sqlmock.NewResult(1, 1))
	mock.ExpectExec(regexp.QuoteMeta(bootstrapInsertDocumentQuery)).
		WithArgs(project.ID, "asset", "asset", "logo.png", "/logo.png", int64(1), int64(1), semanticJSONArgument{expected: assetImportDocumentContent(contents)}, `[]`, sqlmock.AnyArg()).
		WillReturnError(insertErr)
	mock.ExpectRollback()

	_, err = module.importPreparedProjectWorkspace(t.Context(), project, ImportWorkspaceSnapshotParams{
		Tree:          assetImportTree(),
		RouteManifest: defaultWorkspaceRouteManifest,
		Documents: []WorkspaceImportDocumentRecord{
			{ID: "page", Type: WorkspaceDocumentTypePIRPage, Path: "/pir.json", Content: defaultPIRDocument},
			{ID: "asset", Type: WorkspaceDocumentTypeAsset, Path: "/logo.png", Content: assetImportDocumentContent(contents)},
		},
		AssetBlobs: []WorkspaceAssetBlobImport{blob},
	})
	if !errors.Is(err, insertErr) {
		t.Fatalf("expected document insert error, got %v", err)
	}
	if err := mock.ExpectationsWereMet(); err != nil {
		t.Fatal(err)
	}
}

func TestAssetImportHandlerRejectsMissingUnreferencedAndDuplicateBlobsBeforeWriting(t *testing.T) {
	contents := []byte{1, 2, 3}
	blob := assetImportBlob(contents)
	tests := []struct {
		name     string
		manifest []byte
		assets   []WorkspaceAssetBlobImport
		code     string
	}{
		{name: "missing", manifest: assetImportManifest(contents, true), code: ErrorWorkspaceAssetBlobNotFound},
		{name: "unreferenced", manifest: assetImportManifest(contents, false), assets: []WorkspaceAssetBlobImport{blob}, code: ErrorWorkspaceAssetBlobInvalid},
		{name: "duplicate", manifest: assetImportManifest(contents, true), assets: []WorkspaceAssetBlobImport{blob, blob}, code: ErrorWorkspaceAssetBlobConflict},
	}
	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			db, mock, err := sqlmock.New()
			if err != nil {
				t.Fatal(err)
			}
			defer db.Close()
			store := NewWorkspaceStore(db)
			module := NewModule(store, backendproject.NewProjectStore(db))
			body, contentType := createAssetImportMultipart(test.manifest, test.assets...)
			request := httptest.NewRequest(http.MethodPost, "/api/workspaces/import-local-project", body)
			request.Header.Set("Content-Type", contentType)
			response := httptest.NewRecorder()
			assetImportTestRouter(store, module).ServeHTTP(response, request)
			if response.Code < 400 || !bytes.Contains(response.Body.Bytes(), []byte(test.code)) {
				t.Fatalf("expected %s, got %d: %s", test.code, response.Code, response.Body.String())
			}
			if err := mock.ExpectationsWereMet(); err != nil {
				t.Fatalf("import reached persistence: %v", err)
			}
		})
	}
}
