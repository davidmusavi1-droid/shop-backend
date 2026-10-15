-- Additive deployment prerequisite. No existing measurements are converted.
ALTER TABLE "Variant" ADD COLUMN IF NOT EXISTS "waistWidthCm" DOUBLE PRECISION;
