-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Config" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "url" TEXT NOT NULL,
    "apiKey" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT false,
    "checkInterval" INTEGER NOT NULL DEFAULT 60,
    "deleteAfterDays" INTEGER NOT NULL DEFAULT 7,
    "isAmazonOnly" BOOLEAN NOT NULL DEFAULT false,
    "isFBAOnly" BOOLEAN NOT NULL DEFAULT false,
    "minStarRating" REAL,
    "minReviewCount" INTEGER,
    "isFirstRun" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Config" ("apiKey", "checkInterval", "createdAt", "deleteAfterDays", "id", "isActive", "isAmazonOnly", "isFBAOnly", "minReviewCount", "minStarRating", "updatedAt", "url") SELECT "apiKey", "checkInterval", "createdAt", "deleteAfterDays", "id", "isActive", "isAmazonOnly", "isFBAOnly", "minReviewCount", "minStarRating", "updatedAt", "url" FROM "Config";
DROP TABLE "Config";
ALTER TABLE "new_Config" RENAME TO "Config";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
