-- Additive and idempotent: no products, inventory or orders are changed.
CREATE TABLE IF NOT EXISTS "SiteContent" (
  "id" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 0,
  "draft" JSONB NOT NULL,
  "published" JSONB NOT NULL,
  "history" JSONB NOT NULL,
  "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
