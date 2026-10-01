FROM golang:1.25-alpine AS builder

WORKDIR /src

COPY apps/backend/go.mod apps/backend/go.sum ./apps/backend/
RUN cd apps/backend && go mod download

COPY apps/backend ./apps/backend

RUN cd apps/backend && CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/backend ./cmd/server

FROM alpine:3.21

RUN addgroup -S app && adduser -S -G app app \
    && mkdir -p /app/data/verification && chown -R app:app /app/data
USER app
WORKDIR /app

COPY --from=builder /out/backend /app/backend

EXPOSE 8080
ENTRYPOINT ["/app/backend"]
