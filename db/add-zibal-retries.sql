-- Additive, explicit deployment step. Never run from application startup.
BEGIN;
SET LOCAL lock_timeout = '5s';
CREATE TABLE IF NOT EXISTS "ZibalRetryGate" (
  "orderId" TEXT PRIMARY KEY REFERENCES "Order"("id"),
  "busyToken" TEXT,
  "blocked" BOOLEAN NOT NULL DEFAULT false
);
CREATE TABLE IF NOT EXISTS "ZibalPaymentAttempt" (
  "id" TEXT PRIMARY KEY,
  "paymentId" TEXT NOT NULL REFERENCES "Payment"("id"),
  "sequence" INTEGER NOT NULL CHECK ("sequence" BETWEEN 1 AND 3),
  "trackId" TEXT UNIQUE,
  "state" TEXT NOT NULL,
  "issuedAt" TIMESTAMP(3),
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE ("paymentId", "sequence")
);
CREATE TABLE IF NOT EXISTS "ZibalAttemptEvent" (
  "id" TEXT PRIMARY KEY,
  "attemptId" TEXT NOT NULL REFERENCES "ZibalPaymentAttempt"("id"),
  "operation" TEXT NOT NULL,
  "response" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "ZibalAttemptEvent_attemptId_createdAt_idx"
  ON "ZibalAttemptEvent"("attemptId", "createdAt");
-- A second chargeable attempt is forbidden, including indeterminate requests.
CREATE UNIQUE INDEX IF NOT EXISTS "ZibalPaymentAttempt_one_unresolved"
  ON "ZibalPaymentAttempt"("paymentId")
  WHERE "state" IN ('STARTING','OPEN','UNKNOWN','REVIEW');
-- Audit observations are append-only, including for the application DB owner.
CREATE OR REPLACE FUNCTION motif_zibal_event_immutable() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'Zibal audit events are append-only'; END $$;
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'motif_zibal_event_immutable') THEN
    CREATE TRIGGER motif_zibal_event_immutable BEFORE UPDATE OR DELETE ON "ZibalAttemptEvent"
      FOR EACH ROW EXECUTE FUNCTION motif_zibal_event_immutable();
  END IF;
END $$;
COMMIT;
