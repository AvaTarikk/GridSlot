/*
  Warnings:

  - Added the required column `buyer_fee_cents` to the `trades` table without a default value. This is not possible if the table is not empty.
  - Added the required column `seller_fee_cents` to the `trades` table without a default value. This is not possible if the table is not empty.

*/
-- DropForeignKey
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_company_id_fkey";

-- DropForeignKey
ALTER TABLE "audit_log" DROP CONSTRAINT "audit_log_settlement_id_fkey";

-- DropForeignKey
ALTER TABLE "bids" DROP CONSTRAINT "bids_company_id_fkey";

-- DropForeignKey
ALTER TABLE "bids" DROP CONSTRAINT "bids_scu_id_fkey";

-- DropForeignKey
ALTER TABLE "scus" DROP CONSTRAINT "scus_company_id_fkey";

-- DropForeignKey
ALTER TABLE "scus" DROP CONSTRAINT "scus_congestion_point_id_fkey";

-- DropForeignKey
ALTER TABLE "settlements" DROP CONSTRAINT "settlements_trade_id_fkey";

-- DropForeignKey
ALTER TABLE "trades" DROP CONSTRAINT "trades_buyer_id_fkey";

-- DropForeignKey
ALTER TABLE "trades" DROP CONSTRAINT "trades_scu_id_fkey";

-- DropForeignKey
ALTER TABLE "trades" DROP CONSTRAINT "trades_seller_id_fkey";

-- DropForeignKey
ALTER TABLE "trades" DROP CONSTRAINT "trades_winning_bid_id_fkey";

-- DropIndex
DROP INDEX "audit_log_created_at_idx";

-- AlterTable
ALTER TABLE "audit_log" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "bids" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "companies" ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "congestion_points" ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "scus" ALTER COLUMN "time_window_start" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "time_window_end" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "settlements" ALTER COLUMN "delivery_window_opens_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "delivery_window_closes_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "delivery_confirmed_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "settled_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "created_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- AlterTable
ALTER TABLE "trades" ADD COLUMN     "buyer_fee_cents" INTEGER NOT NULL,
ADD COLUMN     "seller_fee_cents" INTEGER NOT NULL,
ALTER COLUMN "matched_at" SET DATA TYPE TIMESTAMP(3),
ALTER COLUMN "updated_at" DROP DEFAULT,
ALTER COLUMN "updated_at" SET DATA TYPE TIMESTAMP(3);

-- CreateIndex
CREATE INDEX "audit_log_created_at_idx" ON "audit_log"("created_at");

-- CreateIndex
CREATE INDEX "bids_scu_id_price_cents_created_at_idx" ON "bids"("scu_id", "price_cents" DESC, "created_at" ASC);

-- AddForeignKey
ALTER TABLE "scus" ADD CONSTRAINT "scus_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "scus" ADD CONSTRAINT "scus_congestion_point_id_fkey" FOREIGN KEY ("congestion_point_id") REFERENCES "congestion_points"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_scu_id_fkey" FOREIGN KEY ("scu_id") REFERENCES "scus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "bids" ADD CONSTRAINT "bids_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_scu_id_fkey" FOREIGN KEY ("scu_id") REFERENCES "scus"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_winning_bid_id_fkey" FOREIGN KEY ("winning_bid_id") REFERENCES "bids"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_seller_id_fkey" FOREIGN KEY ("seller_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "trades" ADD CONSTRAINT "trades_buyer_id_fkey" FOREIGN KEY ("buyer_id") REFERENCES "companies"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlements" ADD CONSTRAINT "settlements_trade_id_fkey" FOREIGN KEY ("trade_id") REFERENCES "trades"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_log" ADD CONSTRAINT "audit_log_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- RenameIndex
ALTER INDEX "bids_scu_status_idx" RENAME TO "bids_scu_id_status_idx";

-- RenameIndex
ALTER INDEX "scus_time_window_idx" RENAME TO "scus_time_window_start_time_window_end_idx";
