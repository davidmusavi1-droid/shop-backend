-- Manual additive upgrade. Requires owner-approved production rollout.
BEGIN;
ALTER TABLE "CardTransfer" ALTER COLUMN "receipt" DROP NOT NULL;
ALTER TABLE "CardTransfer" ADD COLUMN IF NOT EXISTS "bankTrackingCode" TEXT;
ALTER TABLE "CardTransfer" ADD COLUMN IF NOT EXISTS "receiptDigest" TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS "CardTransfer_bankTrackingCode_key" ON "CardTransfer"("bankTrackingCode");
CREATE UNIQUE INDEX IF NOT EXISTS "CardTransfer_receiptDigest_key" ON "CardTransfer"("receiptDigest");
ALTER TABLE "CardTransfer" DROP CONSTRAINT IF EXISTS "CardTransfer_evidence_check";
ALTER TABLE "CardTransfer" ADD CONSTRAINT "CardTransfer_evidence_check" CHECK (
 ("receipt" IS NOT NULL AND octet_length("receipt")>0) OR
 ("bankTrackingCode" IS NOT NULL AND "bankTrackingCode" ~ '^[0-9]{6,40}$')
);
COMMIT;
