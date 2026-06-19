---
name: docker
description: "Docker and container best practices: Dockerfiles, multi-stage builds, layer optimization, Compose, health checks, security, and debugging. Use when writing Dockerfiles, optimizing container images, setting up Docker Compose, or debugging container issues."
license: MIT
---

# Docker & Containers

Practical patterns for building lean, secure, and maintainable container images.

## Quick Reference

```bash
# Build
docker build -t myapp:latest .
docker build --no-cache -t myapp:latest .
docker build --build-arg VERSION=1.2.3 -t myapp:1.2.3 .

# Run
docker run -it --rm myapp:latest sh
docker run -d -p 8080:3000 --name myapp myapp:latest
docker run -v $(pwd)/data:/data myapp:latest

# Inspect & debug
docker ps                          # running containers
docker ps -a                       # all containers including stopped
docker logs -f myapp               # follow logs
docker exec -it myapp sh           # open shell in running container
docker inspect myapp               # full container metadata (JSON)
docker stats                       # live CPU/memory usage

# Images
docker images
docker image rm myapp:latest
docker system prune -af            # remove all unused images, containers, volumes
docker history myapp:latest        # show layer sizes
```

```bash
# Compose
docker compose up -d               # start in background
docker compose up --build          # rebuild images then start
docker compose down                # stop and remove containers
docker compose down -v             # also remove named volumes
docker compose logs -f web         # follow logs for one service
docker compose exec web sh         # shell into running service
docker compose build --no-cache    # force full rebuild
docker compose ps                  # service status
```

## Dockerfile Best Practices

### Layer Order — Deps Before Code

Put the slowest-changing layers first so cache survives code edits:

```dockerfile
FROM node:22-alpine

WORKDIR /app

# 1. Copy manifests only (cache layer until deps change)
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# 2. Copy source (busts cache on every code change)
COPY src/ ./src/

CMD ["node", "src/index.js"]
```

### Multi-Stage Builds

Separate build tooling from the final runtime image:

```dockerfile
# ── Build stage ──────────────────────────────────────────
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# ── Runtime stage ────────────────────────────────────────
FROM node:22-alpine AS runtime
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY --from=builder /app/dist ./dist
USER node
CMD ["node", "dist/index.js"]
```

### Non-Root User

Always drop privileges before `CMD`:

```dockerfile
# Many base images include a nobody/node/appuser — use it:
USER node

# Or create a dedicated user:
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
```

### HEALTHCHECK

```dockerfile
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -qO- http://localhost:3000/health || exit 1

# Or with curl:
HEALTHCHECK CMD curl -f http://localhost:8080/ || exit 1
```

### ARG vs ENV

```dockerfile
ARG VERSION=dev          # build-time only — not visible at runtime, safer for CI flags
ENV PORT=3000            # runtime — accessible in container, visible in `docker inspect`

# Never put secrets in ARG or ENV — they appear in image history
ARG API_KEY              # ❌ visible in docker history
```

### ENTRYPOINT vs CMD

```dockerfile
# ENTRYPOINT — fixed executable (use exec form, not shell form)
ENTRYPOINT ["node"]

# CMD — default arguments (overridable with `docker run myapp foo`)
CMD ["dist/index.js"]

# Together: docker run myapp dist/other.js  →  node dist/other.js

# Shell form (avoid — wraps in /bin/sh -c, no signal forwarding):
CMD node dist/index.js   # ❌ PID 1 is sh, not node
```

### COPY vs ADD

- **`COPY`** — always prefer; copies files/dirs verbatim
- **`ADD`** — only for extracting local `.tar` archives; auto-fetches URLs (use `curl` instead for clarity)

### .dockerignore

```
node_modules/
.git/
.env*
dist/
*.log
coverage/
.DS_Store
Dockerfile*
docker-compose*
README.md
```

## Language-Specific Patterns

### Node.js

```dockerfile
FROM node:22-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:22-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY package.json .
USER node
CMD ["node", "dist/index.js"]
```

### Python

```dockerfile
FROM python:3.12-slim AS builder
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir --prefix=/install -r requirements.txt

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /install /usr/local
COPY src/ ./src/
USER nobody
CMD ["python", "-m", "src.main"]
```

With `uv`:

```dockerfile
FROM ghcr.io/astral-sh/uv:python3.12-slim AS builder
WORKDIR /app
COPY pyproject.toml uv.lock ./
RUN uv sync --frozen --no-dev --no-editable

FROM python:3.12-slim
WORKDIR /app
COPY --from=builder /app/.venv ./.venv
COPY src/ ./src/
ENV PATH="/app/.venv/bin:$PATH"
USER nobody
CMD ["python", "-m", "src.main"]
```

### Go — Static Binary to Distroless

```dockerfile
FROM golang:1.23-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /app/server ./cmd/server

FROM gcr.io/distroless/static-debian12
COPY --from=builder /app/server /server
USER nonroot:nonroot
ENTRYPOINT ["/server"]
```

### Rust — cargo-chef for Cached Builds

```dockerfile
FROM lukemathwalker/cargo-chef:latest-rust-1 AS chef
WORKDIR /app

FROM chef AS planner
COPY . .
RUN cargo chef prepare --recipe-path recipe.json

FROM chef AS builder
COPY --from=planner /app/recipe.json recipe.json
RUN cargo chef cook --release --recipe-path recipe.json   # deps cached here
COPY . .
RUN cargo build --release --bin myapp

FROM gcr.io/distroless/cc-debian12
COPY --from=builder /app/target/release/myapp /myapp
ENTRYPOINT ["/myapp"]
```

## Layer Optimization

### BuildKit Cache Mounts

Skip re-downloading packages by caching the package manager's cache across builds:

```dockerfile
# syntax=docker/dockerfile:1
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN --mount=type=cache,target=/root/.npm \
    npm ci
```

```dockerfile
# Python with uv
RUN --mount=type=cache,target=/root/.cache/uv \
    uv sync --frozen
```

```dockerfile
# Go modules
RUN --mount=type=cache,target=/go/pkg/mod \
    go mod download
```

Enable BuildKit: `DOCKER_BUILDKIT=1 docker build .` (default in Docker 23+).

### Inspecting Layers

```bash
# Show layer sizes
docker history myapp:latest

# Interactive layer explorer (install separately)
dive myapp:latest
```

### Minimize Layer Count

Chain related `RUN` commands; clean up in the same layer:

```dockerfile
# ❌ Each RUN is a separate layer — apt cache persists
RUN apt-get update
RUN apt-get install -y curl
RUN rm -rf /var/lib/apt/lists/*

# ✅ Single layer, cache cleaned immediately
RUN apt-get update && apt-get install -y --no-install-recommends \
    curl \
    && rm -rf /var/lib/apt/lists/*
```

## Docker Compose

### Service Definition

```yaml
services:
  web:
    build:
      context: .
      dockerfile: Dockerfile
      args:
        VERSION: ${APP_VERSION:-dev}
    image: myapp:latest
    ports:
      - "3000:3000"
    environment:
      NODE_ENV: production
      DATABASE_URL: postgres://db/myapp
    env_file:
      - .env.local              # local overrides (gitignored)
    depends_on:
      db:
        condition: service_healthy
    restart: unless-stopped
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:3000/health"]
      interval: 30s
      timeout: 5s
      retries: 3
      start_period: 10s

  db:
    image: postgres:16-alpine
    volumes:
      - db-data:/var/lib/postgresql/data
      - ./init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    environment:
      POSTGRES_DB: myapp
      POSTGRES_USER: appuser
      POSTGRES_PASSWORD_FILE: /run/secrets/db_password
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U appuser -d myapp"]
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  db-data:

networks:
  default:
    name: myapp-network
```

### Bind Mounts vs Named Volumes

```yaml
volumes:
  - db-data:/var/lib/postgresql/data    # named volume — managed by Docker, best for DB data
  - ./src:/app/src                      # bind mount — syncs host dir, best for dev hot-reload
  - ./config.yml:/app/config.yml:ro     # read-only bind mount
```

### Compose Profiles

```yaml
services:
  web:
    image: myapp:latest
    # no profile → always starts

  mailhog:
    image: mailhog/mailhog
    profiles: [dev]             # only starts with: docker compose --profile dev up

  prometheus:
    image: prom/prometheus
    profiles: [monitoring]
```

```bash
docker compose --profile dev up
docker compose --profile dev --profile monitoring up
```

## Security

### Minimal Base Images

| Base | Size | Use When |
|------|------|----------|
| `alpine` | ~5 MB | Small footprint, musl libc, good shell access |
| `debian-slim` | ~70 MB | Need glibc/standard libs, occasional debugging |
| `distroless` | ~2 MB | Production Go/Rust/Java — no shell, no package manager |
| `scratch` | 0 B | Fully static binaries only |

### Read-Only Filesystem

```yaml
# docker-compose.yml
services:
  web:
    read_only: true
    tmpfs:
      - /tmp
      - /var/run
```

```bash
docker run --read-only --tmpfs /tmp myapp:latest
```

### BuildKit Secrets (Don't Leak into Layers)

```dockerfile
# syntax=docker/dockerfile:1
RUN --mount=type=secret,id=npmrc,target=/root/.npmrc \
    npm ci
```

```bash
docker build --secret id=npmrc,src=$HOME/.npmrc .
```

### Image Scanning

```bash
# Docker Scout (built in)
docker scout cves myapp:latest
docker scout recommendations myapp:latest

# Trivy (standalone, more comprehensive)
trivy image myapp:latest
trivy image --severity HIGH,CRITICAL myapp:latest
trivy fs .                         # scan local filesystem/Dockerfile
```

### Key Rules

- Never put credentials in `ENV`, `ARG`, or `COPY`ed files that stay in the image
- Use `--no-install-recommends` / `--no-cache` to avoid pulling unnecessary packages
- Pin base image digests in production: `FROM node:22-alpine@sha256:abc123...`
- Regularly rebuild to pull security patches

## Debugging

### Common Build Failures

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| `COPY failed: no source files` | Path doesn't match build context | Check path relative to `context`, fix `.dockerignore` |
| `npm ci` fails on clean build | `package-lock.json` not copied first | `COPY package.json package-lock.json ./` before `RUN npm ci` |
| Layer cache always busted | `COPY . .` before installing deps | Move `COPY . .` after dep install steps |
| Permission denied on `/app` | `WORKDIR` created as root, then `USER` changed | `WORKDIR` before `USER`, or `chown` the directory |
| `exec format error` | Built on arm64, running on amd64 (or vice versa) | `docker build --platform linux/amd64 .` |

### Common Runtime Issues

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Port not accessible | Missing `-p` / `ports:` mapping | Map host port: `-p 8080:3000` |
| `address already in use` | Port taken on host | Change host port: `-p 8081:3000` |
| Volume mounts empty | Bind mount path doesn't exist on host | Create directory first, check absolute path |
| `permission denied` on volume | Container user UID ≠ host file UID | Match UIDs or use named volumes |
| Container exits immediately | PID 1 exits (no foreground process) | Check `CMD`; use `tail -f /dev/null` for debug |
| DNS resolution fails | Custom network DNS issue | Check network config; try `--dns 8.8.8.8` |
| `depends_on` ignored | Old Compose v1 behavior | Add `condition: service_healthy` and define `healthcheck` |

### Debug Techniques

```bash
# Shell into a running container
docker exec -it <container> sh

# Shell into a stopped/failed container (override entrypoint)
docker run -it --entrypoint sh myapp:latest

# Dump full container config
docker inspect <container> | jq '.[0].Config'

# Monitor resource usage
docker stats --format "table {{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}"

# Follow logs with timestamps
docker logs -f --timestamps <container>

# Check compose service health
docker compose ps
docker inspect <container> | jq '.[0].State.Health'
```
