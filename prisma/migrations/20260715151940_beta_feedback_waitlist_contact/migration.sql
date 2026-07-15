-- CreateTable
CREATE TABLE "Feedback" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "userId" TEXT NOT NULL,
    "rating" INTEGER NOT NULL,
    "publishSuccess" BOOLEAN NOT NULL,
    "comment" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Feedback_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Waitlist" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "email" TEXT NOT NULL,
    "userId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Waitlist_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

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
    "betaCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("billingCustomerKey", "billingKey", "createdAt", "email", "id", "name", "naverBlogId", "naverSession", "password", "plan", "planExpiresAt", "postCount", "postCountResetAt", "sessionUploadedAt", "updatedAt", "uploadToken", "uploadTokenExpiresAt") SELECT "billingCustomerKey", "billingKey", "createdAt", "email", "id", "name", "naverBlogId", "naverSession", "password", "plan", "planExpiresAt", "postCount", "postCountResetAt", "sessionUploadedAt", "updatedAt", "uploadToken", "uploadTokenExpiresAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_email_key" ON "Waitlist"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Waitlist_userId_key" ON "Waitlist"("userId");
