import jwt from 'jsonwebtoken';
import { JWT_SECRET } from '@/core/utils/jwt';

export type EditorRole = 'shop' | 'customer';

export interface EditorTokenClaims {
  sessionId: string;
  editId: string;
  userId: string;
  role: EditorRole;
}

export function signEditorToken(claims: EditorTokenClaims, ttlSeconds = 24 * 60 * 60): string {
  return jwt.sign(
    { kind: 'editor-session', sid: claims.sessionId, eid: claims.editId, uid: claims.userId, role: claims.role },
    JWT_SECRET,
    { expiresIn: ttlSeconds },
  );
}

export function verifyEditorToken(token: string): EditorTokenClaims {
  const p = jwt.verify(token, JWT_SECRET) as any;
  if (p?.kind !== 'editor-session' || typeof p.sid !== 'string' || typeof p.uid !== 'string') {
    throw new Error('Invalid editor token');
  }
  return { sessionId: p.sid, editId: p.eid, userId: p.uid, role: p.role === 'customer' ? 'customer' : 'shop' };
}
