CREATE TABLE "AdminSession" (
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "absoluteExpiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AdminSession_pkey" PRIMARY KEY ("tokenHash")
);
CREATE INDEX "AdminSession_expiresAt_idx" ON "AdminSession"("expiresAt");
