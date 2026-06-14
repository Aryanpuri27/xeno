-- Migration: Add pgvector embedding columns
-- Run AFTER: prisma migrate dev --name init
-- This adds the vector columns that Prisma can't generate natively

-- Enable pgvector extension (in case it's not already enabled)
CREATE EXTENSION IF NOT EXISTS vector;

-- Add embedding column to CampaignMemory
ALTER TABLE "CampaignMemory"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

-- HNSW index for fast approximate nearest-neighbor search
-- m=16, ef_construction=64 is the standard starting config for 1536-dim ada-002 embeddings
CREATE INDEX IF NOT EXISTS campaign_memory_embedding_idx
  ON "CampaignMemory"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);

-- Add embedding column to Product table for semantic product search
ALTER TABLE "Product"
  ADD COLUMN IF NOT EXISTS embedding vector(1536);

CREATE INDEX IF NOT EXISTS product_embedding_idx
  ON "Product"
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
