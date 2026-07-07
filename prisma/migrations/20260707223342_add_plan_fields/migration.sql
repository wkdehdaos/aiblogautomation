-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "name" TEXT,
    "naverBlogId" TEXT,
    "naverSession" TEXT,
    "sessionUploadedAt" DATETIME,
    "uploadToken" TEXT,
    "uploadTokenExpiresAt" DATETIME,
    "plan" TEXT NOT NULL DEFAULT 'free',
    "billingKey" TEXT,
    "billingCustomerKey" TEXT,
    "planExpiresAt" DATETIME,
    "postCount" INTEGER NOT NULL DEFAULT 0,
    "postCountResetAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "naverBlogId", "naverSession", "password", "sessionUploadedAt", "updatedAt", "uploadToken", "uploadTokenExpiresAt") SELECT "createdAt", "email", "id", "name", "naverBlogId", "naverSession", "password", "sessionUploadedAt", "updatedAt", "uploadToken", "uploadTokenExpiresAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
