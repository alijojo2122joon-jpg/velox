import fs from 'node:fs';
import path from 'node:path';
import { config } from '../config.ts';
import { badRequest, ApiError } from './http.ts';
import { randomToken } from './util.ts';

/**
 * Object storage abstraction.
 * LocalStorage writes to disk for development. In production implement the same interface with
 * S3-compatible storage (AWS S3, Cloudflare R2, Google Cloud Storage, or an Indonesian region provider).
 *  - 'public' bucket: vehicle photos, avatars (served via CDN)
 *  - 'private' bucket: identity / licence / registration documents (never publicly reachable)
 */
export interface ObjectStorage {
  put(bucket: 'public' | 'private', data: Buffer, ext: string): string; // returns key
  read(bucket: 'public' | 'private', key: string): Buffer | null;
  publicUrl(key: string): string;
}

const MIME: Record<string, string> = { jpg: 'image/jpeg', png: 'image/png', webp: 'image/webp', pdf: 'application/pdf', svg: 'image/svg+xml' };

/** Detect file type from magic bytes — never trust the client-declared MIME type. */
export function sniff(buf: Buffer): string | null {
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'png';
  if (buf.subarray(0, 4).toString() === 'RIFF' && buf.subarray(8, 12).toString() === 'WEBP') return 'webp';
  if (buf.subarray(0, 5).toString() === '%PDF-') return 'pdf';
  return null;
}

class LocalStorage implements ObjectStorage {
  constructor(private dir: string) {
    for (const b of ['public', 'private']) fs.mkdirSync(path.join(dir, b), { recursive: true });
  }
  put(bucket: 'public' | 'private', data: Buffer, ext: string) {
    const key = `${Date.now().toString(36)}-${randomToken(12)}.${ext}`;
    fs.writeFileSync(path.join(this.dir, bucket, key), data);
    return key;
  }
  read(bucket: 'public' | 'private', key: string) {
    if (!/^[\w.-]+$/.test(key)) return null;
    const f = path.join(this.dir, bucket, key);
    return fs.existsSync(f) ? fs.readFileSync(f) : null;
  }
  publicUrl(key: string) { return `/uploads/${key}`; }
}

export const storage: ObjectStorage = new LocalStorage(config.uploadsDir);
export const mimeFor = (key: string) => MIME[key.split('.').pop() ?? ''] ?? 'application/octet-stream';

/** Accepts a data URL / base64 string, validates size and type, stores it. */
export function storeUpload(base64: string, bucket: 'public' | 'private', allowPdf = false): string {
  const data = Buffer.from(base64.replace(/^data:[^;]+;base64,/, ''), 'base64');
  if (!data.length) throw badRequest('UPLOAD_EMPTY');
  if (data.length > config.maxUploadBytes) throw new ApiError(413, 'UPLOAD_TOO_LARGE');
  const ext = sniff(data);
  if (!ext || (ext === 'pdf' && !allowPdf)) throw badRequest('UPLOAD_TYPE');
  return storage.put(bucket, data, ext);
}
