# Dayliff 1000 Eyes

Enterprise Process Observability, Workflow Intelligence, and Operational Analytics Platform.

## Monorepo Structure

```
.
├── apps/
│   ├── api/          Node.js 20 + TypeScript + Fastify 4 backend
│   └── ml/           Python 3.11 + FastAPI ML microservice
├── packages/
│   └── types/        Shared TypeScript interfaces, enums, and Zod schemas
├── infra/
│   └── postgres/     PostgreSQL init scripts (extensions)
├── docker-compose.yml
├── tsconfig.base.json
└── package.json      npm workspaces root
```

## Prerequisites

- **Node.js 20 LTS** (`node -v` should report `v20.x.x`)
- **Python 3.11+** (for the ML microservice)
- **Docker + Docker Compose** (for local infrastructure)

## Quick Start

### 1. Start infrastructure

```bash
# Start PostgreSQL 16 + TimescaleDB + pgvector and Redis 7
docker compose up -d postgres redis
```

### 2. Install dependencies

```bash
npm install
```

### 3. Configure environment

```bash
cp .env.example apps/api/.env
# Edit .env and fill in JWT keys (see .env.example for instructions)
```

### 4. Run database migrations

```bash
npm run db:migrate --workspace=apps/api
```

### 5. Start the API

```bash
npm run dev --workspace=apps/api
```

### 6. Start the ML service

```bash
cd apps/ml
python -m venv .venv && source .venv/bin/activate  # or .venv\Scripts\activate on Windows
pip install -e ".[dev]"
uvicorn main:app --reload
```

## Running Tests

```bash
# All workspaces
npm test

# API only
npm test --workspace=apps/api

# ML service
cd apps/ml && pytest
```

## Docker (full stack)

```bash
docker compose --profile full up --build
```

## Key Technologies

| Layer | Technology |
|---|---|
| API | Node.js 20, TypeScript, Fastify 4, Drizzle ORM |
| Queue | BullMQ (Redis-backed) |
| Real-time | ws + Redis Pub/Sub |
| Auth | jose (RS256 JWT) |
| DB | PostgreSQL 16 + TimescaleDB + pgvector |
| Cache | Redis 7 |
| ML | Python FastAPI + XGBoost |
| Validation | Zod |
| Testing | Vitest + fast-check (TS), pytest + Hypothesis (Python) |
