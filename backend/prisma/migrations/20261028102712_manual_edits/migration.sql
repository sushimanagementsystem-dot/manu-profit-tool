-- AlterEnum
ALTER TYPE "RevisionSource" ADD VALUE 'MANUAL';

-- AlterTable
ALTER TABLE "MenuItem" ADD COLUMN     "costOverride" DECIMAL(14,4);
