-- AlterTable
ALTER TABLE "Config" ADD COLUMN "minProfitRate" REAL;

-- AlterTable
ALTER TABLE "Item" ADD COLUMN "averagePrice90Days" REAL;
ALTER TABLE "Item" ADD COLUMN "fbaFees" REAL;
ALTER TABLE "Item" ADD COLUMN "profitAmount" REAL;
ALTER TABLE "Item" ADD COLUMN "profitRate" REAL;
ALTER TABLE "Item" ADD COLUMN "referralFeePercentage" REAL;
