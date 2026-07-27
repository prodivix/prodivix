package middleware

import (
	"errors"
	"io"
	"log"
	"net"
	"net/http"
	"os"
	"runtime/debug"
	"strings"

	"github.com/gin-gonic/gin"
)

// Recovery replaces gin.Recovery because gin dumps the whole request header
// block on panic and redacts only "Authorization:". This service also carries
// bearer credentials in X-Auth-Token and X-Prodivix-Terminal-Token, so gin's
// dump would write a live session or terminal token to the process log. Only
// the method, the matched route template and the panic itself are recorded.
func Recovery(out io.Writer) gin.HandlerFunc {
	if out == nil {
		out = os.Stderr
	}
	logger := log.New(out, "", log.LstdFlags)
	return func(c *gin.Context) {
		defer func() {
			recovered := recover()
			if recovered == nil {
				return
			}
			route := c.FullPath()
			if route == "" {
				route = "<unmatched>"
			}
			if isBrokenPipe(recovered) {
				// The peer is already gone, so writing a status would panic again.
				logger.Printf("[recovery] %s %s connection lost: %v", c.Request.Method, route, recovered)
				c.Abort()
				return
			}
			logger.Printf(
				"[recovery] %s %s panic recovered: %v\n%s",
				c.Request.Method,
				route,
				recovered,
				debug.Stack(),
			)
			c.AbortWithStatus(http.StatusInternalServerError)
		}()
		c.Next()
	}
}

func isBrokenPipe(recovered any) bool {
	opError, ok := recovered.(*net.OpError)
	if !ok {
		return false
	}
	var syscallError *os.SyscallError
	if !errors.As(opError, &syscallError) {
		return false
	}
	message := strings.ToLower(syscallError.Error())
	return strings.Contains(message, "broken pipe") ||
		strings.Contains(message, "connection reset by peer")
}
