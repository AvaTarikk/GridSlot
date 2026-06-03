/**
 * GridSlot Database Seed
 * Run: npx tsx prisma/seed.ts
 * Or via npm: npm run db:seed
 *
 * Seeds demo companies, congestion points, and sample SCUs for development.
 */

import { PrismaClient, UserRole, KybStatus, CongestionSeverity, ScuStatus } from '@prisma/client';
import bcrypt from 'bcryptjs';
import * as fs from 'fs';
import * as path from 'path';

const prisma = new PrismaClient();

// Load mock data from JSON files
const mockDataDir = path.join(__dirname, '../../mock-data');
const congestionPointsData = JSON.parse(
  fs.readFileSync(path.join(mockDataDir, 'congestion-points.json'), 'utf-8')
);
const demoCompaniesData = JSON.parse(
  fs.readFileSync(path.join(mockDataDir, 'demo-companies.json'), 'utf-8')
);

async function seedCongestionPoints() {
  console.warn('\n📍 Seeding congestion points...');

  for (const point of congestionPointsData) {
    await prisma.congestionPoint.upsert({
      where: { code: point.code },
      update: {
        name: point.name,
        operator: point.operator,
        region: point.region,
        latitude: point.latitude,
        longitude: point.longitude,
        severity: point.severity as CongestionSeverity,
      },
      create: {
        id: point.id,
        code: point.code,
        name: point.name,
        operator: point.operator,
        region: point.region,
        latitude: point.latitude,
        longitude: point.longitude,
        severity: point.severity as CongestionSeverity,
      },
    });
  }

  console.warn(`  ✅ ${congestionPointsData.length} congestion points seeded`);
}

async function seedCompanies() {
  console.warn('\n🏢 Seeding demo companies...');

  const createdCompanies: Record<string, string> = {};

  for (const company of demoCompaniesData) {
    const password_hash = await bcrypt.hash(company.password, 12);

    const created = await prisma.company.upsert({
      where: { email: company.email },
      update: {},
      create: {
        id: company.id,
        name: company.name,
        kvk_number: company.kvk_number,
        email: company.email,
        password_hash,
        role: company.role as UserRole,
        kyb_status: company.kyb_status as KybStatus,
        grid_operator: company.grid_operator ?? '',
        gto_reference: company.gto_reference ?? null,
        gto_capacity_mwh: company.gto_capacity_mwh ?? null,
        delivery_score: company.delivery_score,
      },
    });

    createdCompanies[company.id] = created.id;
  }

  console.warn(`  ✅ ${demoCompaniesData.length} companies seeded`);
  return createdCompanies;
}

async function seedSampleScus() {
  console.warn('\n⚡ Seeding sample SCUs...');

  // Get seeded companies and congestion points
  const seller1 = await prisma.company.findUnique({ where: { email: 'seller@portams.nl' } });
  const seller2 = await prisma.company.findUnique({ where: { email: 'both@nhsolar.nl' } });
  const cp1 = await prisma.congestionPoint.findUnique({ where: { code: 'NL_LIA_AMS_001' } });
  const cp2 = await prisma.congestionPoint.findUnique({ where: { code: 'NL_LIA_AMS_002' } });
  const cp3 = await prisma.congestionPoint.findUnique({ where: { code: 'NL_ENX_EIN_001' } });

  if (!seller1 || !seller2 || !cp1 || !cp2 || !cp3) {
    console.warn('  ⚠️  Could not find expected companies/points — skipping SCU seed');
    return;
  }

  const now = new Date();
  const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
  const dayAfter = new Date(now.getTime() + 48 * 60 * 60 * 1000);
  const nextWeek = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const sampleScus = [
    {
      id: 'scu_demo_001',
      company_id: seller1.id,
      congestion_point_id: cp1.id,
      time_window_start: tomorrow,
      time_window_end: new Date(tomorrow.getTime() + 4 * 60 * 60 * 1000), // 4h window
      mwh_amount: 50,
      ask_price_cents: 8500, // €85/MWh
      collateral_held_cents: 42500, // 10% of 50 * 8500
      status: 'ACTIVE' as ScuStatus,
    },
    {
      id: 'scu_demo_002',
      company_id: seller1.id,
      congestion_point_id: cp1.id,
      time_window_start: dayAfter,
      time_window_end: new Date(dayAfter.getTime() + 8 * 60 * 60 * 1000), // 8h window
      mwh_amount: 100,
      ask_price_cents: 7200, // €72/MWh
      collateral_held_cents: 72000, // 10% of 100 * 7200
      status: 'ACTIVE' as ScuStatus,
    },
    {
      id: 'scu_demo_003',
      company_id: seller2.id,
      congestion_point_id: cp2.id,
      time_window_start: tomorrow,
      time_window_end: new Date(tomorrow.getTime() + 6 * 60 * 60 * 1000),
      mwh_amount: 25,
      ask_price_cents: 6000, // €60/MWh — solar surplus, lower price
      collateral_held_cents: 15000, // 10% of 25 * 6000
      status: 'ACTIVE' as ScuStatus,
    },
    {
      id: 'scu_demo_004',
      company_id: seller1.id,
      congestion_point_id: cp3.id,
      time_window_start: nextWeek,
      time_window_end: new Date(nextWeek.getTime() + 12 * 60 * 60 * 1000),
      mwh_amount: 200,
      ask_price_cents: 9500, // €95/MWh — Eindhoven HTC, premium
      collateral_held_cents: 190000, // 10% of 200 * 9500
      status: 'ACTIVE' as ScuStatus,
    },
  ];

  for (const scu of sampleScus) {
    await prisma.scu.upsert({
      where: { id: scu.id },
      update: {},
      create: scu,
    });
  }

  console.warn(`  ✅ ${sampleScus.length} sample SCUs seeded`);
}

async function main() {
  console.warn('🌱 GridSlot database seed starting...');
  console.warn('   Environment:', process.env.NODE_ENV ?? 'development');

  await seedCongestionPoints();
  await seedCompanies();
  await seedSampleScus();

  console.warn('\n🎉 Seed complete!\n');
  console.warn('Demo login credentials:');
  console.warn('  Seller:  seller@portams.nl   / demo1234');
  console.warn('  Buyer:   buyer@sdc-holding.nl / demo1234');
  console.warn('  Both:    both@nhsolar.nl      / demo1234');
  console.warn('  Admin:   admin@gridslot.nl    / admin1234');
}

main()
  .catch((err) => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
