import crypto from 'crypto';
import {env} from '../../config/env.ts';

export interface SignedSessionPayload {
  sub: string;
  iat: number;
  exp: number;
  mode: 'demo';
}

export function signSessionToken(userId: string): string {
  const now = Math.floor(Date.now() / 1000);
  const payload: SignedSessionPayload = {
    sub: userId,
    iat: now,
    exp: now + 60 * 60 * 12,
    mode: 'demo',
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', env.sessionSecret)
    .update(encoded)
    .digest('base64url');
  return `${encoded}.${sig}`;
}

export function verifySessionToken(token: string): SignedSessionPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [encoded, sig] = parts;
  if (!encoded || !sig) return null;

  const expected = crypto
    .createHmac('sha256', env.sessionSecret)
    .update(encoded)
    .digest('base64url');

  const sigBuf = Buffer.from(sig);
  const expBuf = Buffer.from(expected);
  if (sigBuf.length !== expBuf.length) return null;
  if (!crypto.timingSafeEqual(sigBuf, expBuf)) return null;

  try {
    const parsed = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as SignedSessionPayload;
    if (!parsed.sub || typeof parsed.exp !== 'number') return null;
    if (parsed.exp < Math.floor(Date.now() / 1000)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Generates an opaque, high-entropy non-PII QR verification token.
 * Contains zero student name, email, or personal identifiers.
 */
export function generateOpaqueQrToken(): string {
  return `CV-TCK-${crypto.randomBytes(16).toString('base64url').toUpperCase()}`;
}

export function generateTicketCode(): string {
  return `TCK-${crypto.randomBytes(5).toString('hex').toUpperCase()}`;
}

function getTicketCipherKey(): Buffer {
  return crypto.createHash('sha256').update(env.ticketEncryptionKey).digest();
}

export function sealTicketToken(rawToken: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', getTicketCipherKey(), iv);
  const encrypted = Buffer.concat([cipher.update(rawToken, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('base64url')}.${tag.toString('base64url')}.${encrypted.toString('base64url')}`;
}

export function unsealTicketToken(sealed: string | null | undefined): string {
  if (!sealed) return '';
  const parts = sealed.split('.');
  if (parts.length !== 3) return '';
  try {
    const [ivB64, tagB64, dataB64] = parts;
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      getTicketCipherKey(),
      Buffer.from(ivB64, 'base64url'),
    );
    decipher.setAuthTag(Buffer.from(tagB64, 'base64url'));
    const decrypted = Buffer.concat([
      decipher.update(Buffer.from(dataB64, 'base64url')),
      decipher.final(),
    ]);
    return decrypted.toString('utf8');
  } catch {
    return '';
  }
}

export function rupeesToMinorUnits(rupees: number | string): number {
  const num = typeof rupees === 'number' ? rupees : Number(rupees);
  if (!Number.isFinite(num) || num < 0) return 0;
  return Math.round(num * 100);
}

export function minorUnitsToRupees(minorUnits: number): number {
  return Math.trunc(minorUnits) / 100;
}

export function generateInvitationToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

export function hashInvitationToken(token: string): string {
  return crypto.createHash('sha256').update(token.trim()).digest('hex');
}

/**
 * Neutralizes spreadsheet CSV formula injection (Excel/Sheets/Calc)
 * by prefixing values starting with =, +, -, @, tab, or CR with a single quote.
 */
export function escapeCsvCell(value: unknown): string {
  const raw = value === null || value === undefined ? '' : String(value);
  const formulaSafe = /^[=+\-@\t\r]/.test(raw) ? `'${raw}` : raw;
  const escaped = formulaSafe.replace(/"/g, '""');
  return `"${escaped}"`;
}

