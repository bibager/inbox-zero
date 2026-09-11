-- AlterTable
ALTER TABLE "EmailAccount" ADD COLUMN     "autoUnsubscribeLabelIds" TEXT[] DEFAULT ARRAY[]::TEXT[];
