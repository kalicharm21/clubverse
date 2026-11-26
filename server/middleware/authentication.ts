import type {NextFunction, Request, Response} from 'express';
import type {ClubMembership, EventItem, UserAccount} from '../../shared/types/domain.ts';
import type {DataAdapter} from '../adapters/DataAdapter.ts';
import {env} from '../config/env.ts';
import {dbRequestContext} from '../db/requestContext.ts';
import {verifySupabaseAccessToken} from '../shared/auth/supabaseAuth.ts';
import {ForbiddenError, UnauthorizedError} from '../shared/errors/AppError.ts';
import {verifySessionToken} from '../shared/utils/crypto.ts';

export interface AuthenticatedContext {
  user: UserAccount;
  authUserId?: string;
  memberships: ClubMembership[];
  followedClubIds?: string[];
  mode: 'demo' | 'supabase';
}

declare global {
  namespace Express {
    interface Request {
      auth?: AuthenticatedContext;
      requestId?: string;
      resolvedEvent?: EventItem;
    }
  }
}

interface CachedAuthContext {
  expiresAt: number;
  user: UserAccount;
  memberships: ClubMembership[];
  followedClubIds: string[];
}

const AUTH_CACHE_TTL_MS = 30_000;
const AUTH_CACHE_MAX_SIZE = 1000;
const authContextCache = new Map<string, CachedAuthContext>();

export function invalidateAuthContextCache(userOrAuthId?: string): void {
  if (!userOrAuthId) {
    authContextCache.clear();
    return;
  }
  authContextCache.delete(userOrAuthId);
  for (const [key, entry] of authContextCache.entries()) {
    if (entry.user.id === userOrAuthId) {
      authContextCache.delete(key);
    }
  }
}

function setCachedAuthContext(authUserId: string, entry: CachedAuthContext): void {
  if (authContextCache.size >= AUTH_CACHE_MAX_SIZE) {
    const oldestKey = authContextCache.keys().next().value;
    if (oldestKey) authContextCache.delete(oldestKey);
  }
  authContextCache.set(authUserId, entry);
}

export function createAuthenticationMiddleware(adapter: DataAdapter) {
  const isDemoAdapter = adapter.getPersistenceMode() === 'in_memory_demo';
  const isTestRunner = env.nodeEnv === 'test' || Boolean(process.env.VITEST);
  const allowDemoAuth =
    !env.isProduction && isDemoAdapter && (env.enableDemoMode || isTestRunner);

  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    const requestId = req.headers['x-request-id']
      ? String(req.headers['x-request-id'])
      : undefined;
    req.requestId = requestId;

    const runPublic = () =>
      dbRequestContext.run({userId: '', globalRole: 'public', requestId}, () => next());

    try {
      const authHeader = req.headers.authorization;
      if (!authHeader || !authHeader.startsWith('Bearer ')) {
        return runPublic();
      }

      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        return runPublic();
      }

      // 1. Isolated development/test Demo HMAC path (never active in production or PostgreSQL mode)
      if (allowDemoAuth) {
        const payload = verifySessionToken(token);
        if (!payload) {
          return next(new UnauthorizedError('Invalid or expired session token'));
        }
        const user = await adapter.getUserById(payload.sub);
        if (!user) {
          return next(new UnauthorizedError('Session user account not found'));
        }
        if (user.status === 'suspended') {
          return next(new ForbiddenError('Your account has been suspended by administration'));
        }
        const [memberships, follows] = await Promise.all([
          adapter.getMembershipsForUser(user.id),
          adapter.getFollowsForUser(user.id),
        ]);
        req.auth = {
          user,
          authUserId: user.id,
          memberships,
          followedClubIds: follows.map((f) => f.clubId),
          mode: 'demo',
        };
        return dbRequestContext.run(
          {
            userId: user.id,
            globalRole: user.isSuperAdmin ? 'super_admin' : 'user',
            requestId,
          },
          () => next(),
        );
      }

      // 2. Production / PostgreSQL Supabase JWT verification
      const claims = await verifySupabaseAccessToken(token);

      // Bypass cache on /auth/me or /auth/logout so explicit profile refreshes always fetch fresh DB state
      const bypassCache = req.path === '/api/v1/auth/me' || req.path === '/api/v1/auth/logout';
      const cached = !bypassCache ? authContextCache.get(claims.authUserId) : undefined;

      let user: UserAccount;
      let memberships: ClubMembership[];
      let followedClubIds: string[];

      if (cached && cached.expiresAt > Date.now()) {
        user = cached.user;
        memberships = cached.memberships;
        followedClubIds = cached.followedClubIds;
      } else if (adapter.resolveAuthenticatedContext) {
        const resolved = await adapter.resolveAuthenticatedContext({
          authUserId: claims.authUserId,
          email: claims.email,
          name: claims.name,
          department: claims.department,
          yearOfStudy: claims.yearOfStudy,
          emailVerified: claims.emailVerified,
          isBootstrapSuperAdmin: claims.isBootstrapSuperAdmin,
        });
        user = resolved.user;
        memberships = resolved.memberships;
        followedClubIds = resolved.followedClubIds;
        setCachedAuthContext(claims.authUserId, {
          expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
          user,
          memberships,
          followedClubIds,
        });
      } else {
        user = await adapter.provisionAuthenticatedUser({
          authUserId: claims.authUserId,
          email: claims.email,
          name: claims.name,
          department: claims.department,
          yearOfStudy: claims.yearOfStudy,
          emailVerified: claims.emailVerified,
          isBootstrapSuperAdmin: claims.isBootstrapSuperAdmin,
        });
        const [m, f] = await Promise.all([
          adapter.getMembershipsForUser(user.id),
          adapter.getFollowsForUser(user.id),
        ]);
        memberships = m;
        followedClubIds = f.map((x) => x.clubId);
        setCachedAuthContext(claims.authUserId, {
          expiresAt: Date.now() + AUTH_CACHE_TTL_MS,
          user,
          memberships,
          followedClubIds,
        });
      }

      if (req.path === '/api/v1/auth/logout') {
        invalidateAuthContextCache(claims.authUserId);
      }

      if (user.status === 'suspended') {
        invalidateAuthContextCache(claims.authUserId);
        return next(new ForbiddenError('Your account has been suspended by administration'));
      }

      req.auth = {
        user,
        authUserId: claims.authUserId,
        memberships,
        followedClubIds,
        mode: 'supabase',
      };

      return dbRequestContext.run(
        {
          userId: user.id,
          globalRole: user.isSuperAdmin ? 'super_admin' : 'user',
          requestId,
        },
        () => next(),
      );
    } catch (error) {
      next(error);
    }
  };
}