import { Request, Response, NextFunction } from 'express';
import crypto from 'node:crypto';
import { logger, type Logger } from '../utils/logger';

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      requestId?: string;
      log?: Logger;
    }
  }
}

export const requestContext = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const inbound = req.header('x-request-id');
  const requestId =
    inbound && inbound.length <= 128 ? inbound : crypto.randomUUID();
  req.requestId = requestId;
  res.setHeader('X-Request-Id', requestId);
  req.log = logger.child({
    requestId,
    method: req.method,
    path: req.path,
  });

  const start = Date.now();
  res.on('finish', () => {
    const durationMs = Date.now() - start;
    const tenantId = req.tenant?.id;
    req.log!.info(
      {
        status: res.statusCode,
        durationMs,
        ...(tenantId ? { tenantId } : {}),
      },
      'request',
    );
  });

  next();
};
