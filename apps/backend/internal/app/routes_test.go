package app

import (
	"net/http"
	"net/http/httptest"
	"reflect"
	"testing"

	"github.com/gin-gonic/gin"
)

func populateRouteHandlers(target any, handler gin.HandlerFunc) {
	value := reflect.ValueOf(target).Elem()
	for index := 0; index < value.NumField(); index++ {
		field := value.Field(index)
		if field.CanSet() && field.Type() == reflect.TypeOf(handler) {
			field.Set(reflect.ValueOf(handler))
		}
	}
}

func TestRegisterAPIRoutesUsesDefaultPingHandler(t *testing.T) {
	gin.SetMode(gin.TestMode)
	noop := gin.HandlerFunc(func(c *gin.Context) {})
	routes := Routes{}
	populateRouteHandlers(&routes.Auth, noop)
	populateRouteHandlers(&routes.GitHub, noop)
	populateRouteHandlers(&routes.Project, noop)
	populateRouteHandlers(&routes.Workspace, noop)
	populateRouteHandlers(&routes.RemoteExecution, noop)
	populateRouteHandlers(&routes.Environment, noop)
	router := gin.New()

	RegisterAPIRoutes(router, routes)
	response := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodGet, "/api/ping", nil)
	router.ServeHTTP(response, request)

	if response.Code != http.StatusOK || response.Body.String() != `{"message":"pong"}` {
		t.Fatalf("expected default ping response, got %d %s", response.Code, response.Body.String())
	}
}
