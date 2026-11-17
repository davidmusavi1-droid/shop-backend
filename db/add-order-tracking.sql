BEGIN;
CREATE TABLE IF NOT EXISTS "OrderTrackingChallenge" (
  "id" TEXT PRIMARY KEY,
  "orderId" TEXT NOT NULL,
  "phone" TEXT NOT NULL,
  "tokenHash" TEXT NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "consumedAt" TIMESTAMP(3),
  "attempts" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrderTrackingChallenge_createdAt_idx" ON "OrderTrackingChallenge"("createdAt");
CREATE INDEX IF NOT EXISTS "OrderTrackingChallenge_phone_createdAt_idx" ON "OrderTrackingChallenge"("phone", "createdAt");
COMMIT;
