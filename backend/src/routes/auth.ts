import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { prisma } from '../lib/prisma.js';
import type { Prisma } from '@prisma/client';
import { generateToken } from '../middleware/auth.js';
import {
  ValidationError,
  ConflictError,
  AuthenticationError,
} from '../middleware/errorHandler.js';
import { authLimiter } from '../middleware/rateLimit.js';
import { requireAuth } from '../middleware/auth.js';

export const authRouter = Router();

// ─── Validation schemas ───────────────────────────────────────────────────────

const RegisterSchema = z.object({
  name: z.string().min(2).max(200),
  kvk_number: z.string().regex(/^\d{8}$/, 'KVK number must be exactly 8 digits'),
  email: z.string().email(),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['SELLER', 'BUYER', 'BOTH']),
  grid_operator: z.enum(['Liander', 'Stedin', 'Enexis', 'TenneT']),
  gto_reference: z.string().optional(),
  gto_capacity_mwh: z.number().int().positive().optional(),
});

const LoginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

// ─── POST /api/auth/register ──────────────────────────────────────────────────

authRouter.post('/register', authLimiter, async (req, res, next) => {
  try {
    const parsed = RegisterSchema.safeParse(req.body);
    if (!parsed.success) {
      const fields = Object.fromEntries(
        parsed.error.errors.map((e) => [e.path.join('.'), e.message])
      );
      throw new ValidationError('Registration data is invalid', fields);
    }

    const data = parsed.data;

    // Check for existing email or KVK
    const existing = await prisma.company.findFirst({
      where: { OR: [{ email: data.email }, { kvk_number: data.kvk_number }] },
    });

    if (existing) {
      if (existing.email === data.email) {
        throw new ConflictError('A company with this email address is already registered');
      }
      throw new ConflictError('A company with this KVK number is already registered');
    }

    const password_hash = await bcrypt.hash(data.password, 12);

    const company = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
      const created = await tx.company.create({
        data: {
          name: data.name,
          kvk_number: data.kvk_number,
          email: data.email,
          password_hash,
          role: data.role,
          grid_operator: data.grid_operator,
          gto_reference: data.gto_reference ?? null,
          gto_capacity_mwh: data.gto_capacity_mwh ?? null,
          kyb_status: 'PENDING',
          delivery_score: 1.0,
        },
      });

      await tx.auditLog.create({
        data: {
          action: 'COMPANY_REGISTERED',
          company_id: created.id,
          metadata: { name: created.name, role: created.role },
        },
      });

      return created;
    });

    const token = generateToken(company.id, company.role);

    res.status(201).json({
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        role: company.role,
        kyb_status: company.kyb_status,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/auth/login ─────────────────────────────────────────────────────

authRouter.post('/login', authLimiter, async (req, res, next) => {
  try {
    const parsed = LoginSchema.safeParse(req.body);
    if (!parsed.success) {
      throw new ValidationError('Invalid login credentials');
    }

    const { email, password } = parsed.data;

    const company = await prisma.company.findUnique({ where: { email } });

    // Constant-time comparison even on miss (prevents timing attacks)
    const dummyHash = '$2b$12$invalidhashfortimingprotection00000000000000000000';
    const passwordValid = company
      ? await bcrypt.compare(password, company.password_hash)
      : await bcrypt.compare(password, dummyHash).then(() => false);

    if (!company || !passwordValid) {
      throw new AuthenticationError('Invalid email or password');
    }

    if (company.kyb_status === 'SUSPENDED') {
      throw new AuthenticationError('This account has been suspended. Please contact support.');
    }

    const token = generateToken(company.id, company.role);

    res.json({
      token,
      company: {
        id: company.id,
        name: company.name,
        email: company.email,
        role: company.role,
        kyb_status: company.kyb_status,
        delivery_score: company.delivery_score,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/auth/me ─────────────────────────────────────────────────────────

authRouter.get('/me', requireAuth, async (req, res, next) => {
  try {
    const company = await prisma.company.findUnique({
      where: { id: req.companyId },
      select: {
        id: true,
        name: true,
        email: true,
        kvk_number: true,
        role: true,
        kyb_status: true,
        grid_operator: true,
        gto_reference: true,
        gto_capacity_mwh: true,
        delivery_score: true,
        created_at: true,
      },
    });

    if (!company) {
      throw new AuthenticationError('Company not found');
    }

    res.json(company);
  } catch (err) {
    next(err);
  }
});
