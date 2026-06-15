-- Dayliff 1000 Eyes — PostgreSQL initialisation script
-- Enables required extensions before Drizzle migrations run

-- pgvector for AI semantic search embeddings
CREATE EXTENSION IF NOT EXISTS vector;

-- TimescaleDB is pre-loaded in the timescaledb-ha image; ensure it is enabled
CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE;

-- pg_trgm for text similarity (optional, useful for copilot search)
CREATE EXTENSION IF NOT EXISTS pg_trgm;
