import type { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { AuthenticationError, AuthorisationError } from './errorHandler';
import type { UserRole } from '@prisma/client';

// ─── Type augmentation ────────────────────────────────────────────────────────

declare global {
  namespace Express {
    interface Request {
      companyId?: string;
      companyRole?: UserRole;
    }
  }
}

// ─── JWT payload type ─────────────────────────────────────────────────────────

export interface JwtPayload {
  sub: string;      // company ID
  role: UserRole;
  iat: number;
  exp: number;
}

// ─── Middleware ───────────────────────────────────────────────────────────────

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('JWT_SECRET environment variable is not set');
  return secret;
}

/**
 * Authenticates the request by verifying the JWT in the Authorization header.
 * Sets req.companyId and req.companyRole on success.
 * Throws AuthenticationError on failure.
 */
export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  const header = req.headers.authorization;

  if (!header || !header.startsWith('Bearer ')) {
    return next(new AuthenticationError('Missing or malformed Authorization header'));
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, getJwtSecret()) as JwtPayload;
    req.companyId = payload.sub;
    req.companyRole = payload.role;
    next();
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) {
      return next(new AuthenticationError('Token expired. Please log in again.'));
    }
    return next(new AuthenticationError('Invalid token'));
  }
}

/**
 * Requires the authenticated company to have one of the specified roles.
 * Must be used after requireAuth.
 */
export function requireRole(...roles: UserRole[]) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.companyRole) {
      return next(new AuthenticationError());
    }

    // ADMIN can do everything
    if (req.companyRole === 'ADMIN') {
      return next();
    }

    // BOTH role satisfies SELLER or BUYER requirements
    if (req.companyRole === 'BOTH' && (roles.includes('SELLER') || roles.includes('BUYER'))) {
      return next();
    }

    if (!roles.includes(req.companyRole)) {
      return next(
        new AuthorisationError(
          `This action requires one of the following roles: ${roles.join(', ')}`
        )
      );
    }

    next();
  };
}

/**
 * Middleware for internal-only endpoints.
 * Blocks access in production; requires INTERNAL_API_KEY in development.
 */
export function requireInternal(req: Request, _res: Response, next: NextFunction): void {
  if (process.env.NODE_ENV === 'production') {
    return next(new AuthorisationError('This endpoint is not available in production'));
  }

  const key = req.headers['x-internal-key'];
  const expectedKey = process.env.INTERNAL_API_KEY ?? 'dev-internal-key';

  if (key !== expectedKey) {
    return next(new AuthenticationError('Invalid internal API key'));
  }

  next();
}

// ─── Token generation ─────────────────────────────────────────────────────────

export function generateToken(companyId: string, role: UserRole): string {
  const expiresIn = process.env.JWT_EXPIRES_IN ?? '7d';
  return jwt.sign({ sub: companyId, role }, getJwtSecret(), {
    expiresIn,
    algorithm: 'HS256',
  } as jwt.SignOptions);
}
