import type { Request, Response, NextFunction } from 'express';

interface RequestLog {
  method: string;
  path: string;
  status: number;
  duration_ms: number;
  ip: string;
  company_id?: string;
}

/**
 * HTTP request logger middleware.
 * Logs method, path, status, duration, and authenticated company ID.
 * Does NOT log request/response bodies to avoid leaking sensitive data.
 */
export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const start = Date.now();

  res.on('finish', () => {
    const log: RequestLog = {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration_ms: Date.now() - start,
      ip: req.ip ?? 'unknown',
    };

    // Include company ID if authenticated (set by auth middleware)
    if (req.companyId) {
      log.company_id = req.companyId;
    }

    // Use console.warn so it doesn't get mistaken for error in CI
    console.warn(JSON.stringify(log));
  });

  next();
}
