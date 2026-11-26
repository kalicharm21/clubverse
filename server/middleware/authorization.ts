import type {NextFunction, Request, Response} from 'express';
import {
  isClubOfficerRole,
  type CoreMemberPermission,
} from '../../shared/constants/permissions.ts';
import type {DataAdapter} from '../adapters/DataAdapter.ts';
import {ForbiddenError, NotFoundError, UnauthorizedError} from '../shared/errors/AppError.ts';

export function requireAuth(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth?.user) {
    return next(new UnauthorizedError('Sign in is required to access this resource'));
  }
  next();
}

export function requireSuperAdmin(req: Request, _res: Response, next: NextFunction): void {
  if (!req.auth?.user) {
    return next(new UnauthorizedError('Sign in is required'));
  }
  if (!req.auth.user.isSuperAdmin) {
    return next(new ForbiddenError('Super Admin access is required for institution-wide controls'));
  }
  next();
}

export function hasClubPermission(
  req: Request,
  clubId: string,
  requiredPermission?: CoreMemberPermission,
): boolean {
  if (!req.auth) return false;
  if (req.auth.user.isSuperAdmin) return true;

  const membership = req.auth.memberships.find((m) => m.clubId === clubId);
  if (!membership) return false;
  if (isClubOfficerRole(membership.role)) return true;
  if (!requiredPermission) return true;
  return membership.permissions.includes(requiredPermission);
}

export function requireClubAdmin(clubIdParam = 'clubId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth?.user) {
      return next(new UnauthorizedError('Sign in is required'));
    }
    const clubId = req.params[clubIdParam];
    if (!clubId) {
      return next(new ForbiddenError('Missing club context'));
    }
    if (req.auth.user.isSuperAdmin) return next();

    const membership = req.auth.memberships.find((m) => m.clubId === clubId);
    if (!membership || !isClubOfficerRole(membership.role)) {
      return next(
        new ForbiddenError('Club President or Vice President privileges for this club are required'),
      );
    }
    next();
  };
}

export function requireClubPresident(clubIdParam = 'clubId') {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth?.user) {
      return next(new UnauthorizedError('Sign in is required'));
    }
    const clubId = req.params[clubIdParam];
    if (!clubId) {
      return next(new ForbiddenError('Missing club context'));
    }
    if (req.auth.user.isSuperAdmin) return next();

    const membership = req.auth.memberships.find((m) => m.clubId === clubId);
    if (!membership || membership.role !== 'president') {
      return next(new ForbiddenError('Club President or Super Admin privileges are required'));
    }
    next();
  };
}

export function requireClubPermission(
  requiredPermission: CoreMemberPermission,
  clubIdParam = 'clubId',
) {
  return (req: Request, _res: Response, next: NextFunction): void => {
    if (!req.auth?.user) {
      return next(new UnauthorizedError('Sign in is required'));
    }
    const clubId = req.params[clubIdParam];
    if (!clubId) {
      return next(new ForbiddenError('Missing club context'));
    }
    if (!hasClubPermission(req, clubId, requiredPermission)) {
      return next(
        new ForbiddenError(`Missing required club permission: ${requiredPermission}`),
      );
    }
    next();
  };
}

export function requireEventPermission(
  adapter: DataAdapter,
  requiredPermission: CoreMemberPermission,
  eventIdParam = 'eventId',
) {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    try {
      if (!req.auth?.user) {
        return next(new UnauthorizedError('Sign in is required'));
      }
      const eventId = req.params[eventIdParam];
      const event = req.resolvedEvent || (await adapter.getEventById(eventId));
      if (!event) {
        return next(new NotFoundError('Event not found'));
      }
      req.resolvedEvent = event;
      if (!hasClubPermission(req, event.clubId, requiredPermission)) {
        return next(
          new ForbiddenError(
            `You do not have ${requiredPermission} permission for ${event.clubName}`,
          ),
        );
      }
      next();
    } catch (error) {
      next(error);
    }
  };
}
