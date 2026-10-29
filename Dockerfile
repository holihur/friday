# ---------- Frontend build ----------
FROM node:24-alpine AS web
WORKDIR /app/frontend
RUN npm install -g pnpm@12.15.0
COPY frontend/package.json frontend/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY frontend/ ./
RUN pnpm build

# ---------- Go build (SPA embedded) ----------
FROM golang:1.26-alpine AS api
WORKDIR /app
COPY backend/go.mod backend/go.sum ./
RUN go mod download
COPY backend/ ./
COPY --from=web /app/frontend/dist ./internal/web/dist
RUN GOFLAGS=-p=1 CGO_ENABLED=0 go build -trimpath -ldflags="-s -w" -o /friday-server ./cmd/server

# ---------- Runtime ----------
FROM alpine:3.21
RUN apk add --no-cache ca-certificates tzdata \
    && addgroup -S friday && adduser -S -G friday friday
WORKDIR /app
COPY --from=api /friday-server /usr/local/bin/friday-server
USER friday
EXPOSE 8090
ENV PORT=8090
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD wget -qO- http://127.0.0.1:8090/api/health >/dev/null || exit 1
ENTRYPOINT ["friday-server"]
