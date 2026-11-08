import type { IncomingMessage, ServerResponse } from 'node:http';
import { z, ZodError } from 'zod';

/**
 * Minimal, dependency-free HTTP layer with an Express-like API.
 * Kept deliberately small: routes, middleware, JSON bodies, typed errors.
 */

export interface AuthUser {
  id: number;
  email: string;
  role: 'renter' | 'owner' | 'admin';
  status: string;
}

export interface Req {
  raw: IncomingMessage;
  method: string;
  path: string;
  query: URLSearchParams;
  params: Record<string, string>;
  body: any;
  ip: string;
  cookies: Record<string, string>;
  user?: AuthUser;
}

export interface Res {
  raw: ServerResponse;
  status(code: number): Res;
  json(data: unknown): void;
  setHeader(name: string, value: string | string[]): Res;
  send(body: string | Buffer, contentType?: string): void;
}

/** Errors carry a stable machine code; the client translates codes via its locale files. */
export class ApiError extends Error {
  status: number;
  code: string;
  details?: unknown;
  constructor(status: number, code: string, details?: unknown) {
    super(code);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
export const badRequest = (code: string, details?: unknown) => new ApiError(400, code, details);
export const unauthorized = () => new ApiError(401, 'UNAUTHORIZED');
export const forbidden = (code = 'FORBIDDEN') => new ApiError(403, code);
export const notFound = (code = 'NOT_FOUND') => new ApiError(404, code);
export const conflict = (code: string, details?: unknown) => new ApiError(409, code, details);

export type Handler = (req: Req, res: Res) => unknown | Promise<unknown>;

interface Route {
  method: string;
  pattern: RegExp;
  keys: string[];
  handlers: Handler[];
}

export class Router {
  private routes: Route[] = [];

  private add(method: string, path: string, handlers: Handler[]) {
    const keys: string[] = [];
    const pattern = new RegExp(
      '^' + path.replace(/\/:([a-zA-Z_]+)/g, (_m, k) => { keys.push(k); return '/([^/]+)'; }) + '/?$',
    );
    this.routes.push({ method, pattern, keys, handlers });
  }
  get(p: string, ...h: Handler[]) { this.add('GET', p, h); }
  post(p: string, ...h: Handler[]) { this.add('POST', p, h); }
  put(p: string, ...h: Handler[]) { this.add('PUT', p, h); }
  patch(p: string, ...h: Handler[]) { this.add('PATCH', p, h); }
  delete(p: string, ...h: Handler[]) { this.add('DELETE', p, h); }

  match(method: string, path: string) {
    for (const r of this.routes) {
      if (r.method !== method) continue;
      const m = r.pattern.exec(path);
      if (m) {
        const params: Record<string, string> = {};
        r.keys.forEach((k, i) => (params[k] = decodeURIComponent(m[i + 1])));
        return { route: r, params };
      }
    }
    return null;
  }
}

export function parseCookies(header?: string): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  }
  return out;
}

export async function readBody(req: IncomingMessage, limit: number): Promise<any> {
  const type = req.headers['content-type'] ?? '';
  if (req.method === 'GET' || req.method === 'HEAD') return {};
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > limit) throw new ApiError(413, 'PAYLOAD_TOO_LARGE');
    chunks.push(chunk as Buffer);
  }
  if (!size) return {};
  if (!type.includes('application/json')) throw new ApiError(415, 'UNSUPPORTED_MEDIA_TYPE');
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw badRequest('INVALID_JSON');
  }
}

/** Validate with zod; field errors are returned as { field: code } so the client can translate them. */
export function validate<T extends z.ZodTypeAny>(schema: T, data: unknown): z.infer<T> {
  try {
    return schema.parse(data);
  } catch (e) {
    if (e instanceof ZodError) {
      const fields: Record<string, string> = {};
      for (const issue of e.issues) {
        const key = issue.path.join('.') || '_';
        if (fields[key]) continue;
        fields[key] = issue.message.startsWith('V_') ? issue.message : zodCode(issue);
      }
      throw badRequest('VALIDATION_FAILED', fields);
    }
    throw e;
  }
}

function zodCode(issue: z.ZodIssue): string {
  switch (issue.code) {
    case 'invalid_type': return issue.received === 'undefined' ? 'V_REQUIRED' : 'V_INVALID';
    case 'too_small': return 'V_TOO_SHORT';
    case 'too_big': return 'V_TOO_LONG';
    case 'invalid_string': return issue.validation === 'email' ? 'V_EMAIL' : 'V_INVALID';
    case 'invalid_enum_value': return 'V_INVALID';
    default: return 'V_INVALID';
  }
}

export function makeRes(raw: ServerResponse): Res {
  const res: Res = {
    raw,
    status(code) { raw.statusCode = code; return res; },
    setHeader(n, v) { raw.setHeader(n, v); return res; },
    json(data) {
      raw.setHeader('Content-Type', 'application/json; charset=utf-8');
      raw.end(JSON.stringify(data));
    },
    send(body, ct = 'text/plain; charset=utf-8') {
      raw.setHeader('Content-Type', ct);
      raw.end(body);
    },
  };
  return res;
}
