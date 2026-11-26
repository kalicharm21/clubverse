import crypto from 'crypto';
import {env} from '../../config/env.ts';
import {ForbiddenError, UnauthorizedError} from '../errors/AppError.ts';

interface JwkEntry extends crypto.JsonWebKey {
  kid?: string;
  alg?: string;
  kty: string;
}

interface VerifiedSupabaseClaims {
  authUserId: string;
  email: string;
  name?: string;
  department?: string;
  yearOfStudy?: string;
  emailVerified: boolean;
  isBootstrapSuperAdmin: boolean;
}

const JWKS_CACHE_TTL_MS = 15 * 60 * 1000;
let cachedJwks: {keys: JwkEntry[]; fetchedAt: number} | null = null;
const keyObjectCache = new Map<string, crypto.KeyObject>();

function decodeBase64Url(segment: string): Buffer {
  const padded = segment.replace(/-/g, '+').replace(/_/g, '/');
  const padLen = (4 - (padded.length % 4)) % 4;
  return Buffer.from(padded + '='.repeat(padLen), 'base64');
}

async function fetchSupabaseJwks(forceRefresh = false): Promise<JwkEntry[]> {
  if (!env.supabaseUrl) {
    throw new UnauthorizedError('SUPABASE_URL is not configured for JWT verification');
  }
  if (!forceRefresh && cachedJwks && Date.now() - cachedJwks.fetchedAt < JWKS_CACHE_TTL_MS) {
    return cachedJwks.keys;
  }

  const jwksUrl = `${env.supabaseUrl.replace(/\/$/, '')}/auth/v1/.well-known/jwks.json`;
  const res = await fetch(jwksUrl, {headers: {Accept: 'application/json'}});
  if (!res.ok) {
    throw new UnauthorizedError('Failed to fetch Supabase JWKS keys');
  }
  const body = (await res.json()) as {keys?: JwkEntry[]};
  const keys = Array.isArray(body.keys) ? body.keys : [];
  cachedJwks = {keys, fetchedAt: Date.now()};
  keyObjectCache.clear();
  return keys;
}

function getOrCreatePublicKey(jwk: JwkEntry): crypto.KeyObject {
  const cacheKey = jwk.kid || JSON.stringify(jwk);
  const cached = keyObjectCache.get(cacheKey);
  if (cached) return cached;
  const parsed = crypto.createPublicKey({key: jwk, format: 'jwk'});
  keyObjectCache.set(cacheKey, parsed);
  return parsed;
}

function verifySignatureWithJwk(
  alg: string,
  signingInput: string,
  signature: Buffer,
  jwk: JwkEntry,
): boolean {
  const publicKey = getOrCreatePublicKey(jwk);
  if (alg === 'ES256') {
    return crypto.verify(
      'sha256',
      Buffer.from(signingInput),
      {key: publicKey, dsaEncoding: 'ieee-p1363'},
      signature,
    );
  }
  if (alg === 'RS256') {
    return crypto.verify('sha256', Buffer.from(signingInput), publicKey, signature);
  }
  return false;
}

function verifyHs256(signingInput: string, signature: Buffer, secret: string): boolean {
  const expected = crypto.createHmac('sha256', secret).update(signingInput).digest();
  if (expected.length !== signature.length) return false;
  return crypto.timingSafeEqual(expected, signature);
}

export function isInstitutionalEmailAllowed(email: string): boolean {
  const normalized = email.trim().toLowerCase();
  if (!normalized.includes('@')) return false;
  if (env.superAdminBootstrapEmails.includes(normalized)) return true;
  if (env.institutionalEmailDomains.length === 0) return true;
  const domain = normalized.split('@')[1];
  return env.institutionalEmailDomains.includes(domain);
}

export async function verifySupabaseAccessToken(token: string): Promise<VerifiedSupabaseClaims> {
  const parts = token.split('.');
  if (parts.length !== 3) {
    throw new UnauthorizedError('Malformed bearer token');
  }

  const [encodedHeader, encodedPayload, encodedSig] = parts;
  let header: {alg?: string; kid?: string};
  let payload: {
    sub?: string;
    email?: string;
    exp?: number;
    iss?: string;
    email_confirmed_at?: string | null;
    user_metadata?: Record<string, unknown>;
    app_metadata?: Record<string, unknown>;
  };

  try {
    header = JSON.parse(decodeBase64Url(encodedHeader).toString('utf8'));
    payload = JSON.parse(decodeBase64Url(encodedPayload).toString('utf8'));
  } catch {
    throw new UnauthorizedError('Unreadable JWT payload');
  }

  const signingInput = `${encodedHeader}.${encodedPayload}`;
  const signature = decodeBase64Url(encodedSig);
  const alg = header.alg || '';

  let signatureValid = false;
  if (alg === 'HS256') {
    if (!env.supabaseJwtSecret) {
      throw new UnauthorizedError('HS256 JWT verification requires SUPABASE_JWT_SECRET');
    }
    signatureValid = verifyHs256(signingInput, signature, env.supabaseJwtSecret);
  } else if (alg === 'ES256' || alg === 'RS256') {
    let keys = await fetchSupabaseJwks(false);
    let matchingKey = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
    if (!matchingKey) {
      keys = await fetchSupabaseJwks(true);
      matchingKey = header.kid ? keys.find((k) => k.kid === header.kid) : keys[0];
    }
    if (!matchingKey) {
      throw new UnauthorizedError('No matching Supabase signing key found');
    }
    signatureValid = verifySignatureWithJwk(alg, signingInput, signature, matchingKey);
  } else {
    throw new UnauthorizedError(`Unsupported JWT signing algorithm: ${alg || 'unknown'}`);
  }

  if (!signatureValid) {
    throw new UnauthorizedError('Invalid Supabase token signature');
  }

  const nowSec = Math.floor(Date.now() / 1000);
  if (!payload.exp || payload.exp <= nowSec) {
    throw new UnauthorizedError('Session token has expired. Please sign in again.');
  }

  if (env.supabaseUrl && payload.iss) {
    const expectedPrefix = `${env.supabaseUrl.replace(/\/$/, '')}/auth/v1`;
    if (!payload.iss.startsWith(expectedPrefix)) {
      throw new UnauthorizedError('Invalid token issuer');
    }
  }

  const authUserId = payload.sub?.trim();
  const email = payload.email?.trim().toLowerCase();
  if (!authUserId || !email) {
    throw new UnauthorizedError('Authenticated token is missing subject or email claims');
  }

  if (!isInstitutionalEmailAllowed(email)) {
    throw new ForbiddenError(
      `Only institutional email domains (${env.institutionalEmailDomains.join(', ')}) are permitted`,
    );
  }

  const userMeta = payload.user_metadata || {};
  const emailVerified = Boolean(
    payload.email_confirmed_at || userMeta.email_verified === true,
  );

  if (!emailVerified) {
    throw new ForbiddenError(
      'Please verify your institutional email address before accessing CampusVerse',
    );
  }

  return {
    authUserId,
    email,
    name: typeof userMeta.full_name === 'string'
      ? userMeta.full_name
      : typeof userMeta.name === 'string'
        ? userMeta.name
        : undefined,
    department: typeof userMeta.department === 'string' ? userMeta.department : undefined,
    yearOfStudy: typeof userMeta.year_of_study === 'string' ? userMeta.year_of_study : undefined,
    emailVerified,
    isBootstrapSuperAdmin: env.superAdminBootstrapEmails.includes(email),
  };
}
