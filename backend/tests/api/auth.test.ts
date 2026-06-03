/**
 * Auth API Integration Tests
 * Uses supertest against the Express app with a mocked Prisma.
 */

import request from 'supertest';
import { mockDeep, mockReset } from 'jest-mock-extended';
import type { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';

const prismaMock = mockDeep<PrismaClient>();
jest.mock('../src/lib/prisma', () => ({ prisma: prismaMock }));

// Mock background services so they don't start during tests
jest.mock('../src/services/matching-engine', () => ({
  startMatchingEngine: jest.fn(),
  runMatchingCycle: jest.fn(),
}));
jest.mock('../src/services/settlement', () => ({
  startSettlementChecker: jest.fn(),
  runSettlementChecks: jest.fn(),
}));

import app from '../src/app';

const demoCompany = {
  id: 'co_001',
  name: 'Test BV',
  kvk_number: '12345678',
  email: 'test@test.nl',
  password_hash: '',
  role: 'BUYER' as const,
  kyb_status: 'ACTIVE' as const,
  grid_operator: 'Liander',
  gto_reference: null,
  gto_capacity_mwh: null,
  delivery_score: 1.0,
  created_at: new Date(),
  updated_at: new Date(),
};

beforeAll(async () => {
  demoCompany.password_hash = await bcrypt.hash('password123', 12);
});

beforeEach(() => mockReset(prismaMock));

describe('POST /api/auth/register', () => {
  it('should register a new company and return a JWT', async () => {
    prismaMock.company.findFirst.mockResolvedValue(null);
    prismaMock.$transaction.mockImplementation(async (fn) =>
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      fn(prismaMock as any)
    );
    prismaMock.company.create.mockResolvedValue(demoCompany);
    prismaMock.auditLog.create.mockResolvedValue({} as never);

    const res = await request(app).post('/api/auth/register').send({
      name: 'Test BV',
      kvk_number: '12345678',
      email: 'test@test.nl',
      password: 'password123',
      role: 'BUYER',
      grid_operator: 'Liander',
    });

    expect(res.status).toBe(201);
    expect(res.body.token).toBeDefined();
    expect(res.body.company.email).toBe('test@test.nl');
    expect(res.body.company).not.toHaveProperty('password_hash');
  });

  it('should return 400 for invalid KVK number', async () => {
    const res = await request(app).post('/api/auth/register').send({
      name: 'Test BV',
      kvk_number: '123', // too short
      email: 'test@test.nl',
      password: 'password123',
      role: 'BUYER',
      grid_operator: 'Liander',
    });

    expect(res.status).toBe(400);
    expect(res.body.code).toBe('VALIDATION_ERROR');
  });

  it('should return 409 when email already registered', async () => {
    prismaMock.company.findFirst.mockResolvedValue(demoCompany);

    const res = await request(app).post('/api/auth/register').send({
      name: 'Test BV',
      kvk_number: '12345678',
      email: 'test@test.nl',
      password: 'password123',
      role: 'BUYER',
      grid_operator: 'Liander',
    });

    expect(res.status).toBe(409);
  });
});

describe('POST /api/auth/login', () => {
  it('should login with correct credentials and return JWT', async () => {
    prismaMock.company.findUnique.mockResolvedValue(demoCompany);

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@test.nl',
      password: 'password123',
    });

    expect(res.status).toBe(200);
    expect(res.body.token).toBeDefined();
    expect(res.body.company.id).toBe('co_001');
  });

  it('should return 401 for wrong password', async () => {
    prismaMock.company.findUnique.mockResolvedValue(demoCompany);

    const res = await request(app).post('/api/auth/login').send({
      email: 'test@test.nl',
      password: 'wrongpassword',
    });

    expect(res.status).toBe(401);
  });

  it('should return 401 for non-existent email', async () => {
    prismaMock.company.findUnique.mockResolvedValue(null);

    const res = await request(app).post('/api/auth/login').send({
      email: 'nobody@test.nl',
      password: 'password123',
    });

    expect(res.status).toBe(401);
  });
});

describe('GET /api/auth/me', () => {
  it('should return 401 without Authorization header', async () => {
    const res = await request(app).get('/api/auth/me');
    expect(res.status).toBe(401);
  });

  it('should return company profile with valid JWT', async () => {
    // Login first to get a real JWT
    prismaMock.company.findUnique.mockResolvedValueOnce(demoCompany); // for login
    const loginRes = await request(app).post('/api/auth/login').send({
      email: 'test@test.nl',
      password: 'password123',
    });
    const token = loginRes.body.token;

    prismaMock.company.findUnique.mockResolvedValueOnce(demoCompany); // for /me
    const res = await request(app)
      .get('/api/auth/me')
      .set('Authorization', `Bearer ${token}`);

    expect(res.status).toBe(200);
    expect(res.body.email).toBe('test@test.nl');
    expect(res.body).not.toHaveProperty('password_hash');
  });
});

describe('GET /health', () => {
  it('should return 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('gridslot-api');
  });
});
