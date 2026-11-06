-- AlterTable
ALTER TABLE "Product" ADD COLUMN     "complementaryFabrics" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "defectImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "fabricNote" TEXT,
ADD COLUMN     "fabricTechnology" TEXT,
ADD COLUMN     "garmentDesign" TEXT,
ADD COLUMN     "hasHood" BOOLEAN,
ADD COLUMN     "mainFabric" TEXT,
ADD COLUMN     "seasons" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "technologyEvidence" TEXT,
ADD COLUMN     "technologyVerified" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "uses" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- AlterTable
ALTER TABLE "Variant" ADD COLUMN     "itemDefectImages" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "sleeveFromNeckCm" DOUBLE PRECISION;

