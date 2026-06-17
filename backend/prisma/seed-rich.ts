/**
 * GridSlot Rich Demo Seed
 * Run with: npx tsx prisma/seed-rich.ts
 *
 * Creates realistic demo data for pitch recording:
 * - 12 active SCU listings across different congestion points
 * - Multiple open bids per SCU
 * - 4 matched trades (in various settlement states)
 * - 1 settled trade, 1 non-delivery/refunded trade
 *
 * Safe to run multiple times (uses upsert). Does NOT delete existing data.
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.warn('🌱 Running rich demo seed...\n');

  // ── Get seeded companies and congestion points ─────────────────────────────
  const seller1 = await prisma.company.findUnique({ where: { email: 'seller@portams.nl' } });
  const seller2 = await prisma.company.findUnique({ where: { email: 'both@nhsolar.nl' } });
  const seller3 = await prisma.company.findUnique({ where: { email: 'wind@eemshaven.nl' } });
  const buyer1  = await prisma.company.findUnique({ where: { email: 'buyer@sdc-holding.nl' } });
  const buyer2  = await prisma.company.findUnique({ where: { email: 'logistics@tlp.nl' } });
  const buyerB  = await prisma.company.findUnique({ where: { email: 'both@nhsolar.nl' } });

  const allPoints = await prisma.congestionPoint.findMany();

  if (!seller1 || !seller2 || !buyer1 || !buyer2 || allPoints.length === 0) {
    console.error('❌ Base seed data not found. Run npm run db:seed first.');
    process.exit(1);
  }

  const cp = Object.fromEntries(allPoints.map(p => [p.code, p]));

  const now = new Date();
  const h = (n: number) => new Date(now.getTime() + n * 3600000);

  // ── Active SCU listings ────────────────────────────────────────────────────
  console.warn('⚡ Creating SCU listings...');

  const activeSCUs = [
    { id: 'scu_rich_001', company_id: seller1.id, congestion_point_id: cp['NL_LIA_AMS_001']?.id, time_window_start: h(2), time_window_end: h(6), mwh_amount: 80, ask_price_cents: 8800, collateral_held_cents: 70400 },
    { id: 'scu_rich_002', company_id: seller1.id, congestion_point_id: cp['NL_LIA_AMS_001']?.id, time_window_start: h(26), time_window_end: h(34), mwh_amount: 150, ask_price_cents: 7500, collateral_held_cents: 112500 },
    { id: 'scu_rich_003', company_id: seller2.id, congestion_point_id: cp['NL_LIA_AMS_002']?.id, time_window_start: h(4), time_window_end: h(10), mwh_amount: 40, ask_price_cents: 6200, collateral_held_cents: 24800 },
    { id: 'scu_rich_004', company_id: seller2.id, congestion_point_id: cp['NL_STE_RTD_001']?.id, time_window_start: h(48), time_window_end: h(60), mwh_amount: 200, ask_price_cents: 9200, collateral_held_cents: 184000 },
    { id: 'scu_rich_005', company_id: seller1.id, congestion_point_id: cp['NL_ENX_EIN_001']?.id, time_window_start: h(72), time_window_end: h(84), mwh_amount: 120, ask_price_cents: 9800, collateral_held_cents: 117600 },
    { id: 'scu_rich_006', company_id: seller3?.id ?? seller1.id, congestion_point_id: cp['NL_ENX_GRN_001']?.id, time_window_start: h(6), time_window_end: h(12), mwh_amount: 300, ask_price_cents: 5500, collateral_held_cents: 165000 },
    { id: 'scu_rich_007', company_id: seller1.id, congestion_point_id: cp['NL_STE_RTD_002']?.id, time_window_start: h(24), time_window_end: h(32), mwh_amount: 60, ask_price_cents: 7800, collateral_held_cents: 46800 },
    { id: 'scu_rich_008', company_id: seller2.id, congestion_point_id: cp['NL_ENX_TIL_001']?.id, time_window_start: h(8), time_window_end: h(16), mwh_amount: 90, ask_price_cents: 9500, collateral_held_cents: 85500 },
    { id: 'scu_rich_009', company_id: seller3?.id ?? seller1.id, congestion_point_id: cp['NL_LIA_HAA_001']?.id, time_window_start: h(12), time_window_end: h(20), mwh_amount: 50, ask_price_cents: 7100, collateral_held_cents: 35500 },
    { id: 'scu_rich_010', company_id: seller1.id, congestion_point_id: cp['NL_STE_DEN_001']?.id, time_window_start: h(36), time_window_end: h(44), mwh_amount: 75, ask_price_cents: 6800, collateral_held_cents: 51000 },
    { id: 'scu_rich_011', company_id: seller2.id, congestion_point_id: cp['NL_UTR_001'] ? cp['NL_UTR_001'].id : cp['NL_LIA_AMS_001']?.id, time_window_start: h(18), time_window_end: h(26), mwh_amount: 35, ask_price_cents: 7300, collateral_held_cents: 25550 },
    { id: 'scu_rich_012', company_id: seller1.id, congestion_point_id: cp['NL_ENX_EIN_001']?.id, time_window_start: h(96), time_window_end: h(108), mwh_amount: 180, ask_price_cents: 10200, collateral_held_cents: 183600 },
  ].filter(s => s.congestion_point_id);

  for (const scu of activeSCUs) {
    await prisma.scu.upsert({
      where: { id: scu.id },
      update: {},
      create: { ...scu, status: 'ACTIVE' },
    });
  }
  console.warn(`  ✅ ${activeSCUs.length} active SCUs`);

  // ── Open bids on active SCUs ───────────────────────────────────────────────
  console.warn('💰 Creating open bids...');

  const bids = [
    // scu_rich_001 — competitive bidding
    { id: 'bid_rich_001', scu_id: 'scu_rich_001', company_id: buyer1.id,  price_cents: 9200, status: 'OPEN' as const },
    { id: 'bid_rich_002', scu_id: 'scu_rich_001', company_id: buyer2.id,  price_cents: 9000, status: 'OPEN' as const },
    // scu_rich_002 — one bid
    { id: 'bid_rich_003', scu_id: 'scu_rich_002', company_id: buyer1.id,  price_cents: 7600, status: 'OPEN' as const },
    // scu_rich_003 — three bids, one well above ask
    { id: 'bid_rich_004', scu_id: 'scu_rich_003', company_id: buyer2.id,  price_cents: 6800, status: 'OPEN' as const },
    { id: 'bid_rich_005', scu_id: 'scu_rich_003', company_id: buyer1.id,  price_cents: 6500, status: 'OPEN' as const },
    // scu_rich_005 — high value, few bids
    { id: 'bid_rich_006', scu_id: 'scu_rich_005', company_id: buyer2.id,  price_cents: 10100, status: 'OPEN' as const },
    // scu_rich_006 — wind surplus, cheap
    { id: 'bid_rich_007', scu_id: 'scu_rich_006', company_id: buyer1.id,  price_cents: 5700, status: 'OPEN' as const },
    { id: 'bid_rich_008', scu_id: 'scu_rich_006', company_id: buyer2.id,  price_cents: 5600, status: 'OPEN' as const },
    { id: 'bid_rich_009', scu_id: 'scu_rich_006', company_id: buyerB?.id ?? buyer1.id, price_cents: 5500, status: 'OPEN' as const },
    // scu_rich_008 — Tilburg logistics (RED severity)
    { id: 'bid_rich_010', scu_id: 'scu_rich_008', company_id: buyer2.id,  price_cents: 9800, status: 'OPEN' as const },
    { id: 'bid_rich_011', scu_id: 'scu_rich_008', company_id: buyer1.id,  price_cents: 9600, status: 'OPEN' as const },
  ];

  for (const bid of bids) {
    await prisma.bid.upsert({
      where: { id: bid.id },
      update: {},
      create: bid,
    });
  }
  console.warn(`  ✅ ${bids.length} open bids`);

  // ── Matched trades (various settlement states) ─────────────────────────────
  console.warn('🤝 Creating trades and settlements...');

  // Trade 1: PAYMENT_HELD state — just matched
  await prisma.scu.upsert({ where:{id:'scu_settled_01'}, update:{}, create:{id:'scu_settled_01',company_id:seller1.id,congestion_point_id:allPoints[0].id,time_window_start:h(-6),time_window_end:h(-2),mwh_amount:100,ask_price_cents:8000,collateral_held_cents:80000,status:'MATCHED'}});
  await prisma.bid.upsert({where:{id:'bid_settled_01'},update:{},create:{id:'bid_settled_01',scu_id:'scu_settled_01',company_id:buyer1.id,price_cents:8500,status:'WON'}});
  const t1 = await prisma.trade.upsert({where:{id:'trade_rich_001'},update:{},create:{id:'trade_rich_001',scu_id:'scu_settled_01',winning_bid_id:'bid_settled_01',seller_id:seller1.id,buyer_id:buyer1.id,clearing_price_cents:8500,mwh_amount:100,total_value_cents:850000,status:'ACTIVE',matched_at:h(-1)}});
  await prisma.settlement.upsert({where:{id:'set_rich_001'},update:{},create:{id:'set_rich_001',trade_id:t1.id,status:'PAYMENT_HELD',delivery_window_opens_at:h(0),delivery_window_closes_at:h(4)}});

  // Trade 2: DELIVERY_PENDING — delivery window open
  await prisma.scu.upsert({where:{id:'scu_settled_02'},update:{},create:{id:'scu_settled_02',company_id:seller2.id,congestion_point_id:allPoints[2].id,time_window_start:h(-12),time_window_end:h(-8),mwh_amount:60,ask_price_cents:7200,collateral_held_cents:43200,status:'MATCHED'}});
  await prisma.bid.upsert({where:{id:'bid_settled_02'},update:{},create:{id:'bid_settled_02',scu_id:'scu_settled_02',company_id:buyer2.id,price_cents:7500,status:'WON'}});
  const t2 = await prisma.trade.upsert({where:{id:'trade_rich_002'},update:{},create:{id:'trade_rich_002',scu_id:'scu_settled_02',winning_bid_id:'bid_settled_02',seller_id:seller2.id,buyer_id:buyer2.id,clearing_price_cents:7500,mwh_amount:60,total_value_cents:450000,status:'ACTIVE',matched_at:h(-4)}});
  await prisma.settlement.upsert({where:{id:'set_rich_002'},update:{},create:{id:'set_rich_002',trade_id:t2.id,status:'DELIVERY_PENDING',delivery_window_opens_at:h(-2),delivery_window_closes_at:h(2)}});

  // Trade 3: CONFIRMED — seller confirmed, awaiting final settlement
  await prisma.scu.upsert({where:{id:'scu_settled_03'},update:{},create:{id:'scu_settled_03',company_id:seller1.id,congestion_point_id:allPoints[4].id,time_window_start:h(-30),time_window_end:h(-26),mwh_amount:200,ask_price_cents:9000,collateral_held_cents:180000,status:'MATCHED'}});
  await prisma.bid.upsert({where:{id:'bid_settled_03'},update:{},create:{id:'bid_settled_03',scu_id:'scu_settled_03',company_id:buyer1.id,price_cents:9400,status:'WON'}});
  const t3 = await prisma.trade.upsert({where:{id:'trade_rich_003'},update:{},create:{id:'trade_rich_003',scu_id:'scu_settled_03',winning_bid_id:'bid_settled_03',seller_id:seller1.id,buyer_id:buyer1.id,clearing_price_cents:9400,mwh_amount:200,total_value_cents:1880000,status:'ACTIVE',matched_at:h(-26)}});
  await prisma.settlement.upsert({where:{id:'set_rich_003'},update:{},create:{id:'set_rich_003',trade_id:t3.id,status:'CONFIRMED',delivery_window_opens_at:h(-24),delivery_window_closes_at:h(-20),delivery_confirmed_at:h(-21)}});

  // Trade 4: SETTLED — complete, successful
  await prisma.scu.upsert({where:{id:'scu_settled_04'},update:{},create:{id:'scu_settled_04',company_id:seller2.id,congestion_point_id:allPoints[1].id,time_window_start:h(-72),time_window_end:h(-68),mwh_amount:50,ask_price_cents:6500,collateral_held_cents:32500,status:'MATCHED'}});
  await prisma.bid.upsert({where:{id:'bid_settled_04'},update:{},create:{id:'bid_settled_04',scu_id:'scu_settled_04',company_id:buyer2.id,price_cents:6800,status:'WON'}});
  const t4 = await prisma.trade.upsert({where:{id:'trade_rich_004'},update:{},create:{id:'trade_rich_004',scu_id:'scu_settled_04',winning_bid_id:'bid_settled_04',seller_id:seller2.id,buyer_id:buyer2.id,clearing_price_cents:6800,mwh_amount:50,total_value_cents:340000,status:'SETTLED',matched_at:h(-70)}});
  await prisma.settlement.upsert({where:{id:'set_rich_004'},update:{},create:{id:'set_rich_004',trade_id:t4.id,status:'SETTLED',delivery_window_opens_at:h(-68),delivery_window_closes_at:h(-64),delivery_confirmed_at:h(-66),settled_at:h(-65)}});

  // Trade 5: REFUNDED — non-delivery, shows the penalty system
  await prisma.scu.upsert({where:{id:'scu_settled_05'},update:{},create:{id:'scu_settled_05',company_id:seller1.id,congestion_point_id:allPoints[3].id,time_window_start:h(-96),time_window_end:h(-92),mwh_amount:80,ask_price_cents:8200,collateral_held_cents:65600,status:'MATCHED'}});
  await prisma.bid.upsert({where:{id:'bid_settled_05'},update:{},create:{id:'bid_settled_05',scu_id:'scu_settled_05',company_id:buyer1.id,price_cents:8600,status:'WON'}});
  const t5 = await prisma.trade.upsert({where:{id:'trade_rich_005'},update:{},create:{id:'trade_rich_005',scu_id:'scu_settled_05',winning_bid_id:'bid_settled_05',seller_id:seller1.id,buyer_id:buyer1.id,clearing_price_cents:8600,mwh_amount:80,total_value_cents:688000,status:'CANCELLED',matched_at:h(-94)}});
  await prisma.settlement.upsert({where:{id:'set_rich_005'},update:{},create:{id:'set_rich_005',trade_id:t5.id,status:'REFUNDED',delivery_window_opens_at:h(-92),delivery_window_closes_at:h(-88),buyer_refund_cents:688000,collateral_forfeited_cents:34400,settled_at:h(-87)}});

  // ── Audit log entries ──────────────────────────────────────────────────────
  const auditEntries = [
    {action:'TRADE_MATCHED'as const, settlement_id:'set_rich_001', company_id:seller1.id, metadata:{trade_id:'trade_rich_001',clearing_price_cents:8500,mwh_amount:100,total_value_cents:850000}},
    {action:'SETTLEMENT_PAYMENT_HELD'as const, settlement_id:'set_rich_001', metadata:{from:'MATCHED',to:'PAYMENT_HELD'}},
    {action:'TRADE_MATCHED'as const, settlement_id:'set_rich_002', company_id:seller2.id, metadata:{trade_id:'trade_rich_002',clearing_price_cents:7500,mwh_amount:60,total_value_cents:450000}},
    {action:'SETTLEMENT_PAYMENT_HELD'as const, settlement_id:'set_rich_002', metadata:{from:'MATCHED',to:'PAYMENT_HELD'}},
    {action:'SETTLEMENT_DELIVERY_PENDING'as const, settlement_id:'set_rich_002', metadata:{from:'PAYMENT_HELD',to:'DELIVERY_PENDING'}},
    {action:'SETTLEMENT_CONFIRMED'as const, settlement_id:'set_rich_003', company_id:seller1.id, metadata:{from:'DELIVERY_PENDING',to:'CONFIRMED',confirmed_at:h(-21).toISOString()}},
    {action:'SETTLEMENT_SETTLED'as const, settlement_id:'set_rich_004', metadata:{from:'CONFIRMED',to:'SETTLED',total_value_cents:340000}},
    {action:'SETTLEMENT_NON_DELIVERY'as const, settlement_id:'set_rich_005', metadata:{from:'DELIVERY_PENDING',to:'NON_DELIVERY',collateral_forfeited_cents:34400}},
    {action:'SETTLEMENT_REFUNDED'as const, settlement_id:'set_rich_005', metadata:{from:'NON_DELIVERY',to:'REFUNDED',buyer_refund_cents:688000}},
  ];

  for (const entry of auditEntries) {
    await prisma.auditLog.create({ data: entry });
  }

  console.warn(`  ✅ 5 trades across all settlement states`);
  console.warn(`  ✅ ${auditEntries.length} audit log entries`);

  console.warn('\n🎉 Rich seed complete!\n');
  console.warn('Platform state:');
  console.warn('  • 12 active SCU listings across 8 congestion points');
  console.warn('  • 11 open bids (competitive on key listings)');
  console.warn('  • Trade in PAYMENT_HELD state  → trade_rich_001');
  console.warn('  • Trade in DELIVERY_PENDING    → trade_rich_002');
  console.warn('  • Trade in CONFIRMED state     → trade_rich_003');
  console.warn('  • Trade SETTLED successfully   → trade_rich_004');
  console.warn('  • Trade REFUNDED (non-delivery)→ trade_rich_005');
}

main()
  .catch(e => { console.error(e); process.exit(1); })
  .finally(() => prisma.$disconnect());
