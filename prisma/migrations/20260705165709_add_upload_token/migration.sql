-- AlterTable
ALTER TABLE "User" ADD COLUMN "uploadToken" TEXT;
ALTER TABLE "User" ADD COLUMN "uploadTokenExpiresAt" DATETIME;
