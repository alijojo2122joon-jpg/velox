import { q } from '../db/index.ts';
import { forbidden, unauthorized, type AuthUser, type Handler, type Req } from '../lib/http.ts';
import { sha256 } from '../lib/util.ts';

export const SESSION_COOKIE = 'velox_session';

/** Resolve the session cookie (or Bearer token for API clients / future mobile apps) to a user. */
export function loadUser(req: Req): AuthUser | undefined {
  const header = req.raw.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.slice(7) : req.cookies[SESSION_COOKIE];
  if (!token) return undefined;
  const row = q.get<AuthUser & { expires_at: string }>(
    `SELECT u.id, u.email, u.role, u.status, s.expires_at FROM sessions s JOIN users u ON u.id = s.user_id
     WHERE s.token_hash = ?`, [sha256(token)]);
  if (!row || row.expires_at < new Date().toISOString()) return undefined;
  return { id: row.id, email: row.email, role: row.role, status: row.status };
}

export const requireAuth: Handler = (req) => {
  if (!req.user) throw unauthorized();
  if (req.user.status === 'suspended') throw forbidden('ACCOUNT_SUSPENDED');
};

/** Role-based access control. Admins pass every role check. */
export const requireRole = (...roles: AuthUser['role'][]): Handler => (req) => {
  if (!req.user) throw unauthorized();
  if (req.user.status === 'suspended') throw forbidden('ACCOUNT_SUSPENDED');
  if (req.user.role !== 'admin' && !roles.includes(req.user.role)) throw forbidden();
};
