import crypto from 'node:crypto';
import type { Express, NextFunction, Request, Response } from 'express';
import { createBullBoard } from '@bull-board/api';
import { BullMQAdapter } from '@bull-board/api/bullMQAdapter';
import { ExpressAdapter } from '@bull-board/express';
import { Config } from '@/config';
import { REDIS_ENABLED } from '@/config/redis';
import { getBullMqQueues } from '@/workers/queues';

export const BULL_BOARD_BASE_PATH = '/admin/queues';

function timingSafeEqualString(a: string, b: string): boolean {
  const aBuf = Buffer.from(a);
  const bBuf = Buffer.from(b);
  if (aBuf.length !== bBuf.length) return false;
  return crypto.timingSafeEqual(aBuf, bBuf);
}

function bullBoardBasicAuth(req: Request, res: Response, next: NextFunction): void {
  const expectedUser = Config.bullBoard.user;
  const expectedPass = Config.bullBoard.password;
  const header = req.headers.authorization || '';

  if (!header.startsWith('Basic ')) {
    res.setHeader('WWW-Authenticate', 'Basic realm="PrintLoop Queues"');
    res.status(401).send('Authentication required');
    return;
  }

  let decoded = '';
  try {
    decoded = Buffer.from(header.slice(6), 'base64').toString('utf8');
  } catch {
    res.setHeader('WWW-Authenticate', 'Basic realm="PrintLoop Queues"');
    res.status(401).send('Invalid credentials');
    return;
  }

  const sep = decoded.indexOf(':');
  const user = sep === -1 ? decoded : decoded.slice(0, sep);
  const pass = sep === -1 ? '' : decoded.slice(sep + 1);

  if (
    timingSafeEqualString(user, expectedUser) &&
    timingSafeEqualString(pass, expectedPass)
  ) {
    next();
    return;
  }

  res.setHeader('WWW-Authenticate', 'Basic realm="PrintLoop Queues"');
  res.status(401).send('Invalid credentials');
}

/** Mount Bull Board when Redis is on and BULL_BOARD_PASSWORD is set. */
export function mountBullBoard(app: Express): boolean {
  if (!REDIS_ENABLED) return false;
  if (!Config.bullBoard.password) return false;

  const queues = getBullMqQueues();
  if (queues.length === 0) return false;

  const serverAdapter = new ExpressAdapter();
  serverAdapter.setBasePath(BULL_BOARD_BASE_PATH);

  createBullBoard({
    queues: queues.map((q) => new BullMQAdapter(q)),
    serverAdapter,
  });

  app.use(
    BULL_BOARD_BASE_PATH,
    (_req, res, next) => {
      // Bull Board ships its own assets; loosen the global helmet CSP for this UI only.
      res.setHeader(
        'Content-Security-Policy',
        "default-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; frame-src 'none'; object-src 'none'; base-uri 'self'",
      );
      next();
    },
    bullBoardBasicAuth,
    serverAdapter.getRouter(),
  );
  return true;
}
