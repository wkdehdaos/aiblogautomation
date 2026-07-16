-- CreateTable
CREATE TABLE "BetaConfig" (
    "id" INTEGER NOT NULL PRIMARY KEY,
    "maxUsers" INTEGER NOT NULL DEFAULT 30
);

-- Seed initial record
INSERT INTO "BetaConfig" ("id", "maxUsers") VALUES (1, 30);
