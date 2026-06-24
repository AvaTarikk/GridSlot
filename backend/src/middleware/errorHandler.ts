import type { Request, Response, NextFunction } from 'express';

// ─── Custom Error Classes ─────────────────────────────────────────────────────

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: string,
    message: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export class ValidationError extends AppError {
  constructor(message: string, public readonly fields?: Record<string, string>) {
    super(400, 'VALIDATION_ERROR', message);
    this.name = 'ValidationError';
  }
}

export class AuthenticationError extends AppError {
  constructor(message = 'Authentication required') {
    super(401, 'AUTHENTICATION_REQUIRED', message);
    this.name = 'AuthenticationError';
  }
}

export class AuthorisationError extends AppError {
  constructor(message = 'You do not have permission to perform this action') {
    super(403, 'FORBIDDEN', message);
    this.name = 'AuthorisationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, 'NOT_FOUND', `${resource} not found`);
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, 'CONFLICT', message);
    this.name = 'ConflictError';
  }
}

export class InsufficientCollateralError extends AppError {
  constructor(required_cents: number, available_cents: number) {
    super(
      422,
      'INSUFFICIENT_COLLATERAL',
      `Insufficient collateral. Required: ${required_cents} cents, available: ${available_cents} cents`
    );
    this.name = 'InsufficientCollateralError';
  }
}

export class InvalidStateTransitionError extends AppError {
  constructor(from: string, to: string) {
    super(422, 'INVALID_STATE_TRANSITION', `Cannot transition from ${from} to ${to}`);
    this.name = 'InvalidStateTransitionError';
  }
}

export class KybNotActiveError extends AppError {
  constructor() {
    super(403, 'KYB_NOT_ACTIVE', 'Your KYB verification is not yet complete');
    this.name = 'KybNotActiveError';
  }
}

export class CapacityExceededError extends AppError {
  constructor(requested_mwh: number, available_mwh: number) {
    super(
      422,
      'CAPACITY_EXCEEDED',
      `Requested ${requested_mwh} MWh exceeds GTO capacity of ${available_mwh} MWh`
    );
    this.name = 'CapacityExceededError';
  }
}

// ─── Error Handler Middleware ─────────────────────────────────────────────────

interface ErrorResponse {
  error: string;
  code: string;
  message: string;
  fields?: Record<string, string>;
  request_id?: string;
}

/**
 * Global error handling middleware.
 * Maps internal errors to safe, structured HTTP responses.
 * Never leaks stack traces or internal error details to clients.
 */
export function errorHandler(
  err: Error,
  req: Request,
  res: Response,
  _next: NextFunction
): void {
  // Known application errors — map directly to HTTP response
  if (err instanceof AppError) {
    const body: ErrorResponse = {
      error: err.name,
      code: err.code,
      message: err.message,
    };

    if (err instanceof ValidationError && err.fields) {
      body.fields = err.fields;
    }

    res.status(err.statusCode).json(body);
    return;
  }

  // Prisma unique constraint violation
  if (err.message?.includes('Unique constraint failed')) {
    res.status(409).json({
      error: 'ConflictError',
      code: 'DUPLICATE_RECORD',
      message: 'A record with these details already exists',
    });
    return;
  }

  // Prisma record not found
  if (err.message?.includes('Record to update not found') ||
      err.message?.includes('No record was found')) {
    res.status(404).json({
      error: 'NotFoundError',
      code: 'NOT_FOUND',
      message: 'The requested record was not found',
    });
    return;
  }

  // Unknown errors — log internally, return generic 500
  console.error('Unhandled error:', {
    name: err.name,
    message: err.message,
    path: req.path,
    method: req.method,
    // Stack only in non-production
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });

  res.status(500).json({
    error: 'InternalServerError',
    code: 'INTERNAL_ERROR',
    message: 'An unexpected error occurred. Please try again later.',
  });
}

/**
 * 404 handler for unmatched routes.
 */
export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    error: 'NotFoundError',
    code: 'ROUTE_NOT_FOUND',
    message: `Route ${req.method} ${req.path} not found`,
  });
}
