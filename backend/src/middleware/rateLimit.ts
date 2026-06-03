import rateLimit from 'express-rate-limit';

/**
 * Standard rate limiter: 100 requests per minute per IP.
 * Applied to all API routes.
 */
export const standardLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many requests',
    message: 'Rate limit exceeded. Please wait before retrying.',
    retry_after_seconds: 60,
  },
  skip: (_req) => {
    // Skip rate limiting in test environment
    return process.env.NODE_ENV === 'test';
  },
});

/**
 * Strict limiter for auth endpoints: 10 requests per minute per IP.
 * Prevents brute-force attacks on login.
 */
export const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    error: 'Too many authentication attempts',
    message: 'Too many login attempts. Please wait before retrying.',
    retry_after_seconds: 60,
  },
  skip: (_req) => process.env.NODE_ENV === 'test',
});
