-- GridSlot — Initial Migration

-- ─── Extensions ──────────────────────────────────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ─── Enums ───────────────────────────────────────────────────────────────────
CREATE TYPE "KybStatus" AS ENUM ('PENDING', 'VERIFIED', 'ACTIVE', 'SUSPENDED');
CREATE TYPE "UserRole" AS ENUM ('SELLER', 'BUYER', 'BOTH', 'ADMIN');
CREATE TYPE "ScuStatus" AS ENUM ('ACTIVE', 'MATCHED', 'WITHDRAWN', 'EXPIRED');
CREATE TYPE "BidStatus" AS ENUM ('OPEN', 'WON', 'LOST', 'WITHDRAWN');
CREATE TYPE "TradeStatus" AS ENUM ('ACTIVE', 'SETTLED', 'DISPUTED', 'CANCELLED');
CREATE TYPE "SettlementStatus" AS ENUM (
  'MATCHED',
  'PAYMENT_HELD',
  'DELIVERY_PENDING',
  'CONFIRMED',
  'SETTLED',
  'NON_DELIVERY',
  'REFUNDED'
);
CREATE TYPE "CongestionSeverity" AS ENUM ('GREEN', 'AMBER', 'RED');
CREATE TYPE "AuditAction" AS ENUM (
  'COMPANY_REGISTERED',
  'COMPANY_KYB_UPDATED',
  'SCU_LISTED',
  'SCU_WITHDRAWN',
  'SCU_EXPIRED',
  'BID_PLACED',
  'BID_WITHDRAWN',
  'BID_WON',
  'BID_LOST',
  'TRADE_MATCHED',
  'SETTLEMENT_PAYMENT_HELD',
  'SETTLEMENT_DELIVERY_PENDING',
  'SETTLEMENT_CONFIRMED',
  'SETTLEMENT_SETTLED',
  'SETTLEMENT_NON_DELIVERY',
  'SETTLEMENT_REFUNDED'
);

-- ─── Tables ───────────────────────────────────────────────────────────────────

-- Companies
CREATE TABLE "companies" (
  "id"                 TEXT         NOT NULL PRIMARY KEY,
  "name"               TEXT         NOT NULL,
  "kvk_number"         TEXT         NOT NULL UNIQUE,
  "email"              TEXT         NOT NULL UNIQUE,
  "password_hash"      TEXT         NOT NULL,
  "role"               "UserRole"   NOT NULL,
  "kyb_status"         "KybStatus"  NOT NULL DEFAULT 'PENDING',
  "grid_operator"      TEXT         NOT NULL,
  "gto_reference"      TEXT,
  "gto_capacity_mwh"   INTEGER,
  "delivery_score"     DOUBLE PRECISION NOT NULL DEFAULT 1.0,
  "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  "updated_at"         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX "companies_kvk_number_idx" ON "companies" ("kvk_number");
CREATE INDEX "companies_kyb_status_idx" ON "companies" ("kyb_status");

-- Congestion Points
CREATE TABLE "congestion_points" (
  "id"        TEXT                 NOT NULL PRIMARY KEY,
  "code"      TEXT                 NOT NULL UNIQUE,
  "name"      TEXT                 NOT NULL,
  "operator"  TEXT                 NOT NULL,
  "region"    TEXT                 NOT NULL,
  "latitude"  DOUBLE PRECISION     NOT NULL,
  "longitude" DOUBLE PRECISION     NOT NULL,
  "severity"  "CongestionSeverity" NOT NULL DEFAULT 'GREEN',
  "updated_at" TIMESTAMPTZ         NOT NULL DEFAULT NOW()
);

CREATE INDEX "congestion_points_severity_idx" ON "congestion_points" ("severity");
CREATE INDEX "congestion_points_operator_idx" ON "congestion_points" ("operator");

-- SCUs (Standardised Capacity Units)
CREATE TABLE "scus" (
  "id"                    TEXT        NOT NULL PRIMARY KEY,
  "company_id"            TEXT        NOT NULL REFERENCES "companies" ("id"),
  "congestion_point_id"   TEXT        NOT NULL REFERENCES "congestion_points" ("id"),
  "time_window_start"     TIMESTAMPTZ NOT NULL,
  "time_window_end"       TIMESTAMPTZ NOT NULL,
  "mwh_amount"            INTEGER     NOT NULL,
  "ask_price_cents"       INTEGER     NOT NULL,
  "collateral_held_cents" INTEGER     NOT NULL,
  "status"                "ScuStatus" NOT NULL DEFAULT 'ACTIVE',
  "created_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "scus_mwh_positive"            CHECK ("mwh_amount" > 0),
  CONSTRAINT "scus_ask_price_positive"      CHECK ("ask_price_cents" > 0),
  CONSTRAINT "scus_collateral_positive"     CHECK ("collateral_held_cents" >= 0),
  CONSTRAINT "scus_time_window_valid"       CHECK ("time_window_end" > "time_window_start")
);

CREATE INDEX "scus_company_id_idx"           ON "scus" ("company_id");
CREATE INDEX "scus_congestion_point_id_idx"  ON "scus" ("congestion_point_id");
CREATE INDEX "scus_status_idx"               ON "scus" ("status");
CREATE INDEX "scus_time_window_idx"          ON "scus" ("time_window_start", "time_window_end");
CREATE INDEX "scus_matching_idx"             ON "scus" ("status", "created_at")
  WHERE "status" = 'ACTIVE';

-- Bids
CREATE TABLE "bids" (
  "id"          TEXT        NOT NULL PRIMARY KEY,
  "scu_id"      TEXT        NOT NULL REFERENCES "scus" ("id"),
  "company_id"  TEXT        NOT NULL REFERENCES "companies" ("id"),
  "price_cents" INTEGER     NOT NULL,
  "status"      "BidStatus" NOT NULL DEFAULT 'OPEN',
  "created_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  "updated_at"  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

  CONSTRAINT "bids_price_positive" CHECK ("price_cents" > 0)
  -- Note: self-bid prevention is enforced at application level
);

CREATE INDEX "bids_scu_status_idx"    ON "bids" ("scu_id", "status");
CREATE INDEX "bids_company_id_idx"    ON "bids" ("company_id");
CREATE INDEX "bids_matching_idx"      ON "bids" ("scu_id", "price_cents" DESC, "created_at" ASC)
  WHERE "status" = 'OPEN';

-- Trades
CREATE TABLE "trades" (
  "id"                    TEXT          NOT NULL PRIMARY KEY,
  "scu_id"                TEXT          NOT NULL UNIQUE REFERENCES "scus" ("id"),
  "winning_bid_id"        TEXT          NOT NULL UNIQUE REFERENCES "bids" ("id"),
  "seller_id"             TEXT          NOT NULL REFERENCES "companies" ("id"),
  "buyer_id"              TEXT          NOT NULL REFERENCES "companies" ("id"),
  "clearing_price_cents"  INTEGER       NOT NULL,
  "mwh_amount"            INTEGER       NOT NULL,
  "total_value_cents"     INTEGER       NOT NULL,
  "status"                "TradeStatus" NOT NULL DEFAULT 'ACTIVE',
  "matched_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  "updated_at"            TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

  CONSTRAINT "trades_price_positive"       CHECK ("clearing_price_cents" > 0),
  CONSTRAINT "trades_mwh_positive"         CHECK ("mwh_amount" > 0),
  CONSTRAINT "trades_total_correct"        CHECK ("total_value_cents" = "clearing_price_cents" * "mwh_amount"),
  CONSTRAINT "trades_no_self_trade"        CHECK ("seller_id" != "buyer_id")
);

CREATE INDEX "trades_seller_id_idx" ON "trades" ("seller_id");
CREATE INDEX "trades_buyer_id_idx"  ON "trades" ("buyer_id");
CREATE INDEX "trades_status_idx"    ON "trades" ("status");

-- Settlements
CREATE TABLE "settlements" (
  "id"                          TEXT               NOT NULL PRIMARY KEY,
  "trade_id"                    TEXT               NOT NULL UNIQUE REFERENCES "trades" ("id"),
  "status"                      "SettlementStatus" NOT NULL DEFAULT 'MATCHED',
  "delivery_window_opens_at"    TIMESTAMPTZ,
  "delivery_window_closes_at"   TIMESTAMPTZ,
  "delivery_confirmed_at"       TIMESTAMPTZ,
  "settled_at"                  TIMESTAMPTZ,
  "buyer_refund_cents"          INTEGER,
  "collateral_forfeited_cents"  INTEGER,
  "created_at"                  TIMESTAMPTZ        NOT NULL DEFAULT NOW(),
  "updated_at"                  TIMESTAMPTZ        NOT NULL DEFAULT NOW()
);

CREATE INDEX "settlements_status_idx" ON "settlements" ("status");

-- Audit Log
CREATE TABLE "audit_log" (
  "id"            TEXT          NOT NULL PRIMARY KEY,
  "action"        "AuditAction" NOT NULL,
  "company_id"    TEXT          REFERENCES "companies" ("id"),
  "settlement_id" TEXT          REFERENCES "settlements" ("id"),
  "metadata"      JSONB,
  "created_at"    TIMESTAMPTZ   NOT NULL DEFAULT NOW()
);

CREATE INDEX "audit_log_company_id_idx"    ON "audit_log" ("company_id");
CREATE INDEX "audit_log_settlement_id_idx" ON "audit_log" ("settlement_id");
CREATE INDEX "audit_log_action_idx"        ON "audit_log" ("action");
CREATE INDEX "audit_log_created_at_idx"    ON "audit_log" ("created_at" DESC);

-- ─── updated_at Triggers ─────────────────────────────────────────────────────

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER companies_updated_at
  BEFORE UPDATE ON "companies"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER scus_updated_at
  BEFORE UPDATE ON "scus"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER bids_updated_at
  BEFORE UPDATE ON "bids"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trades_updated_at
  BEFORE UPDATE ON "trades"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER settlements_updated_at
  BEFORE UPDATE ON "settlements"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER congestion_points_updated_at
  BEFORE UPDATE ON "congestion_points"
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
