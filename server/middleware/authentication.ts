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

      // 2. Production / PostgreSQL Supabase JWT verification (single-transaction context resolution)
      const claims = await verifySupabaseAccessToken(token);
      let user: UserAccount;
      let memberships: ClubMembership[];
      let followedClubIds: string[];

      if (adapter.resolveAuthenticatedContext) {
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
      }

      if (user.status === 'suspended') {
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
