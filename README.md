# Pulse

A notification platform built as an **Nx monorepo** of polyglot microservices. An HTTP gateway accepts notification requests and dispatches them over **gRPC** to a worker that delivers asynchronously, while an admin API exposes read-only reporting. Postgres is the shared source of truth — services coordinate purely through a shared notification `id`.

> Note: the gateway project is spelled **`api-getway`** throughout the codebase (project name, folder, and package). This is intentional/historical — use that spelling in Nx and Docker commands.

---

## Architecture

![Pulse architecture](docs/architecture.svg)

**Request flow (`POST /api/notifications`)**

1. The gateway validates the payload and **saves a `PENDING` row** to Postgres, getting back an `id`.
2. It calls the notifications worker over gRPC `Send({ ...dto, id })`, which **acks immediately** (`ACCEPTED`) and delivers asynchronously.
3. The worker performs delivery, then **updates the same row** (`status = SENT`), coordinated only by the shared `id`.
4. Clients poll `GET /api/notifications/:id/status`; the gateway proxies to gRPC `GetStatus`.
5. `admin-api` reads the `notifications` table directly for listings and stats.

---

## Services & Libraries

### Apps

| Project | Type | Port | Purpose |
|---|---|---|---|
| `api-getway` | NestJS HTTP | `3000` (`/api`) | Public REST gateway; gRPC **client** of the notifications worker; writes the initial row. |
| `notifications` | NestJS gRPC | `4001` | TypeScript implementation of `NotificationService`. |
| `notifications-go` | Go gRPC | `4002` | Alternative Go implementation of the **same** proto (acks fast, delivers async). |
| `admin-api` | NestJS HTTP | `3002` (`/api`) | Read-only admin/reporting over the `notifications` table. |

> `notifications` and `notifications-go` are **interchangeable** gRPC implementations of `notification.proto`. Point the gateway at whichever one you run via `NOTIFICATION_GRPC_URL`.

### Libraries (`libs/`)

| Library | Contents |
|---|---|
| `@pulse/shared` | The `notification.proto` contract, generated gRPC types, `CreateNotificationDto`, the `NotificationChannel` enum (`EMAIL`/`SMS`/`PUSH`), and shared interfaces/messaging helpers. |
| `@pulse/database` | `PulseDatabaseModule` (TypeORM + Postgres) and `NotificationEntity`. Reads `DATABASE_URL`; `synchronize` is on when `NODE_ENV !== 'production'`. |
| `@pulse/auth` | Auth module scaffold. |

---

## Tech Stack

- **Monorepo:** Nx 22.7.5, npm workspaces (`apps/*`, `libs/*`)
- **Runtime:** Node.js 22, NestJS 11, TypeScript 5.9 — plus Go 1.26 (`notifications-go`)
- **Transport:** gRPC (`@grpc/grpc-js`, `@grpc/proto-loader`) with a shared `.proto`
- **Data:** PostgreSQL 16, TypeORM 0.3 (TS) / pgx (Go)
- **Validation:** `class-validator` / `class-transformer`
- **Build:** webpack via `NxAppWebpackPlugin` (`generatePackageJson: true`, proto assets copied into `dist/proto`)
- **Containers:** multi-stage `Dockerfile` (root, parameterized by `ARG APP`) + a dedicated Go `Dockerfile`; `docker-compose.yml`

---

## Prerequisites

- Node.js 22+ and npm
- Docker + Docker Compose (for the containerized stack)
- A PostgreSQL instance if running services outside Docker

---

## Quick Start (Docker Compose)

Builds and runs Postgres, the TypeScript notifications worker, the gateway, and the admin API:

```bash
docker compose up --build
```

| Service | URL |
|---|---|
| Gateway (REST) | http://localhost:3000/api |
| Admin API | http://localhost:3002/api |
| Postgres | `localhost:5433` → container `5432` |

> The host publishes Postgres on **5433** to avoid clashing with a local Postgres on 5432. Containers still talk to each other at `postgres:5432` over the Compose network. `notifications-go` is **not** wired into Compose by default — Compose runs the TypeScript worker.

Tear down:

```bash
docker compose down            # add -v to also drop the database volume
```

---

## Local Development (Nx)

Run any service against a Postgres you provide via `DATABASE_URL`:

```bash
# HTTP gateway (http://localhost:3000/api)
npx nx serve api-getway

# TypeScript gRPC worker (0.0.0.0:4001)
npx nx serve notifications

# Admin API (http://localhost:3002/api)
npx nx serve admin-api
```

Other common tasks:

```bash
npx nx build <project>          # production build -> apps/<project>/dist
npx nx run-many -t build        # build everything
npx nx graph                    # visualize the project graph
npx nx sync                     # sync TS project references after adding deps
```

Run the Go worker directly:

```bash
cd apps/notifications-go
DATABASE_URL=postgres://postgres:pulse@localhost:5432/pulse GRPC_PORT=4002 go run ./cmd
```

---

## API Reference

All NestJS HTTP apps use the global prefix `/api`.

### Gateway — `api-getway` (`:3000`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api` | Service hello. |
| `GET` | `/api/health` | Health/uptime probe. |
| `POST` | `/api/notifications` | Create & dispatch a notification. |
| `GET` | `/api/notifications/:id/status` | Current delivery status. |

**Create a notification**

```bash
curl -X POST http://localhost:3000/api/notifications \
  -H 'Content-Type: application/json' \
  -d '{
    "channel": "EMAIL",
    "recipient": "user@example.com",
    "subject": "Welcome",
    "body": "Thanks for signing up!"
  }'
# -> { "id": "<uuid>", "status": "ACCEPTED" }
```

```bash
curl http://localhost:3000/api/notifications/<uuid>/status
# -> { "id": "<uuid>", "status": "PENDING" | "SENT" | "FAILED" }
```

`channel` must be one of `EMAIL`, `SMS`, `PUSH`. `subject` is capped at 120 chars; `recipient` and `body` are required.

### Admin — `admin-api` (`:3002`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/api/admin/notifications` | Most recent 100 notifications (newest first). |
| `GET` | `/api/admin/notifications/stats` | Counts by status: `{ pending, sent, failed }`. |

---

## gRPC Contract

`libs/shared/proto/notification.proto`:

```proto
service NotificationService {
  rpc Send      (SendRequest)      returns (SendResponse);
  rpc GetStatus (GetStatusRequest) returns (GetStatusResponse);
}
```

Statuses flow `PENDING → SENT` (or `FAILED`). The `.proto` is the single source of truth for both the TypeScript and Go workers; it is copied into each build's `dist/proto/` so containers ship with it.

---

## Environment Variables

| Variable | Used by | Default | Notes |
|---|---|---|---|
| `DATABASE_URL` | all DB-touching services | — (required) | e.g. `postgres://postgres:pulse@postgres:5432/pulse` |
| `NODE_ENV` | NestJS services | — | `development` enables TypeORM `synchronize` (auto-creates schema). |
| `NOTIFICATION_GRPC_URL` | `api-getway` | `127.0.0.1:4001` | Address of the gRPC worker (e.g. `notifications:4001` in Compose). |
| `PORT` | `api-getway` | `3333` | Gateway HTTP port (set to `3000` in the container). |
| `JWT_SECRET` | `api-getway` | — | Dev-only placeholder; do not ship the committed value. |
| `GRPC_PORT` | `notifications-go` | `4002` | Go worker listen port. |

> `admin-api` listens on a **hard-coded** `3002` and does not read `PORT`.

---

## Database

The schema is managed by TypeORM `synchronize` in development (`NODE_ENV=development`), which auto-creates the `notifications` table on boot. This is convenient for local/dev but **unsafe for production** — there are currently no migrations. Before deploying, add explicit migrations and disable `synchronize`.

---

## Building Docker Images

The root `Dockerfile` is parameterized by the Nx project name:

```bash
docker build --build-arg APP=api-getway     -t pulse/api-getway .
docker build --build-arg APP=notifications  -t pulse/notifications .
docker build --build-arg APP=admin-api      -t pulse/admin-api .
```

It builds the app with Nx, then runs a pruned `npm ci --omit=dev` against the per-app `package.json`/lockfile that `generatePackageJson` emits into `dist/`. The Go worker has its own `apps/notifications-go/Dockerfile`.

