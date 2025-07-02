-- CreateTable
CREATE TABLE "Config" (
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
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ProductId" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "asin" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateTable
CREATE TABLE "Item" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "productId" INTEGER NOT NULL,
    "processedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Item_productId_fkey" FOREIGN KEY ("productId") REFERENCES "ProductId" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE UNIQUE INDEX "ProductId_asin_key" ON "ProductId"("asin");
