import { Config } from '@/config';
import crypto from 'node:crypto';
import net from 'node:net';
import type { NextFunction, Request, Response } from 'express';

function secretMatches(given: string, expected: string): boolean {
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

export function edgeClientIp(req: Request, _res: Response, next: NextFunction): void {
  const expected = Config.edgeSecret;
  const given = req.header('x-pl-edge-secret');
  const clientIp = (req.header('x-pl-client-ip') || '').trim();
  if (expected && given && net.isIP(clientIp) && secretMatches(given, expected)) {
    Object.defineProperty(req, 'ip', { value: clientIp, configurable: true });
  }
  next();
}
