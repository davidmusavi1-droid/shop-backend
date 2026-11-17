CREATE TABLE IF NOT EXISTS "SmartDossier" (
  "id" TEXT PRIMARY KEY,
  "version" INTEGER NOT NULL DEFAULT 0,
  "phase" TEXT NOT NULL DEFAULT 'draft' CHECK ("phase" IN ('draft', 'review', 'approved')),
  "proposedCode" TEXT CHECK (char_length("proposedCode") <= 32),
  "approvedVersion" INTEGER,
  "productId" TEXT UNIQUE,
  "payload" JSONB NOT NULL,
  "archivedAt" TIMESTAMP(3),
  "retiredReason" TEXT CHECK ("retiredReason" IN ('archived', 'deleted')),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL
);

CREATE TABLE IF NOT EXISTS "SmartCode" (
  "code" TEXT PRIMARY KEY CHECK ("code" ~ '^MOTIF-[0-9]{3}$'),
  "dossierId" TEXT UNIQUE REFERENCES "SmartDossier"("id") ON DELETE SET NULL,
  "reservedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS "SmartImage" (
  "id" TEXT PRIMARY KEY,
  "dossierId" TEXT NOT NULL REFERENCES "SmartDossier"("id") ON DELETE RESTRICT,
  "name" TEXT NOT NULL,
  "size" INTEGER NOT NULL CHECK ("size" BETWEEN 1 AND 3000000),
  "digest" TEXT NOT NULL,
  "bytes" BYTEA,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SmartImage_dossierId_idx" ON "SmartImage"("dossierId");

CREATE TABLE IF NOT EXISTS "SmartApproval" (
  "dossierId" TEXT NOT NULL REFERENCES "SmartDossier"("id") ON DELETE RESTRICT,
  "version" INTEGER NOT NULL,
  "snapshot" JSONB NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY ("dossierId", "version")
);

CREATE TABLE IF NOT EXISTS "SmartEvent" (
  "id" TEXT PRIMARY KEY,
  "dossierId" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "actor" TEXT NOT NULL,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "SmartEvent_dossierId_at_idx" ON "SmartEvent"("dossierId", "at");

CREATE TABLE IF NOT EXISTS "SmartAiRun" (
  "id" TEXT PRIMARY KEY,
  "operation" TEXT NOT NULL CHECK ("operation" IN ('analyze', 'research')),
  "scope" TEXT NOT NULL DEFAULT 'pilot',
  "dossierId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "status" TEXT NOT NULL CHECK ("status" IN ('pending', 'completed', 'failed')),
  "model" TEXT NOT NULL,
  "usage" JSONB,
  "result" JSONB,
  "errorCode" TEXT,
  "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

ALTER TABLE "SmartAiRun" ADD COLUMN IF NOT EXISTS "rawResponse" TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS "SmartAiRun_operation_scope_key" ON "SmartAiRun"("operation", "scope");
CREATE INDEX IF NOT EXISTS "SmartAiRun_at_idx" ON "SmartAiRun"("at");
