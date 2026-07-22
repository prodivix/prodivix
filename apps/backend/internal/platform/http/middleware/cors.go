package middleware

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

func CORS(allowed []string) gin.HandlerFunc {
	allowedMap := make(map[string]struct{}, len(allowed))
	for _, origin := range allowed {
		allowedMap[origin] = struct{}{}
	}

	return func(c *gin.Context) {
		origin := c.GetHeader("Origin")
		if origin != "" {
			c.Header("Vary", "Origin")
			if _, ok := allowedMap[origin]; !ok {
				c.AbortWithStatus(http.StatusForbidden)
				return
			}
			c.Header("Access-Control-Allow-Origin", origin)
		}
		c.Header("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization,Content-Type,X-Auth-Token,X-Prodivix-Terminal-Token,X-Prodivix-Server-Function-Intent")
		c.Header("Access-Control-Expose-Headers", "Authorization,Content-Type")

		if c.Request.Method == http.MethodOptions {
			c.AbortWithStatus(http.StatusNoContent)
			return
		}
		c.Next()
	}
}
