import {isClubOfficerRole} from '../../../shared/constants/permissions.ts';
import type {
  ClubFollow,
  ClubMembership,
  CoreMemberPermission,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {ForbiddenError, NotFoundError} from '../../shared/errors/AppError.ts';

export class MembershipsService {
  constructor(private readonly adapter: DataAdapter) {}

  async getMyMembershipsAndFollows(userId: string): Promise<{
    memberships: ClubMembership[];
    follows: ClubFollow[];
  }> {
    const [memberships, follows] = await Promise.all([
      this.adapter.getMembershipsForUser(userId),
      this.adapter.getFollowsForUser(userId),
    ]);
    return {memberships, follows};
  }

  async followClub(
    actor: {id: string; name: string},
    clubId: string,
  ): Promise<ClubFollow> {
    const follow = await this.adapter.followClub(actor.id, clubId);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Student',
      action: 'FOLLOWED_CLUB',
      targetType: 'club',
      targetId: clubId,
      targetLabel: clubId,
      details: 'Followed club toward active 2-club limit.',
    });
    return follow;
  }

  async unfollowClub(
    actor: {id: string; name: string},
    clubId: string,
  ): Promise<void> {
    const removed = await this.adapter.unfollowClub(actor.id, clubId);
    if (!removed) throw new NotFoundError('Follow record not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Student',
      action: 'UNFOLLOWED_CLUB',
      targetType: 'club',
      targetId: clubId,
      targetLabel: clubId,
      details: 'Unfollowed club and released follow slot.',
    });
  }

  async getClubTeam(clubId: string): Promise<ClubMembership[]> {
    return this.adapter.getClubMemberships(clubId);
  }

  async upsertClubMember(
    clubId: string,
    actor: {id: string; name: string; isSuperAdmin: boolean},
    input: {
      email?: string;
      userId?: string;
      role: ClubMembership['role'];
      title: string;
      permissions: CoreMemberPermission[];
    },
  ): Promise<ClubMembership> {
    if (isClubOfficerRole(input.role) && !actor.isSuperAdmin) {
      throw new ForbiddenError(
        'Only a Super Admin can assign Club President or Vice President roles',
      );
    }

    const user = input.userId
      ? await this.adapter.getUserById(input.userId)
      : input.email
        ? await this.adapter.getUserByEmail(input.email)
        : null;
    if (!user) {
      throw new NotFoundError(
        input.email
          ? `No user found with institutional email ${input.email}`
          : 'Target user account not found',
      );
    }

    const membership = await this.adapter.upsertClubMembership({
      clubId,
      userId: user.id,
      role: input.role,
      title: input.title,
      permissions: input.permissions,
      assignedByUserId: actor.id,
      strictInsert: true,
    });
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: actor.isSuperAdmin
        ? 'Super Admin'
        : `Club Leadership · ${membership.clubName || clubId}`,
      action: 'UPSERT_CLUB_MEMBER',
      targetType: 'membership',
      targetId: membership.id,
      targetLabel: `${user.name} (${input.role})`,
      details: `Assigned ${input.title} with ${membership.permissions.length} permissions.`,
    });
    return membership;
  }

  async updateMemberPermissions(
    clubId: string,
    membershipId: string,
    actor: {id: string; name: string; isSuperAdmin: boolean},
    updates: {
      role?: ClubMembership['role'];
      title?: string;
      permissions?: CoreMemberPermission[];
    },
  ): Promise<ClubMembership> {
    const existingTeam = await this.adapter.getClubMemberships(clubId);
    const existing = existingTeam.find((m) => m.id === membershipId);
    if (!existing) throw new NotFoundError('Club membership not found');

    if (
      !actor.isSuperAdmin &&
      (isClubOfficerRole(existing.role) || (updates.role && isClubOfficerRole(updates.role)))
    ) {
      throw new ForbiddenError(
        'Only a Super Admin can assign, promote to, or modify President and Vice President memberships',
      );
    }

    const updated = await this.adapter.updateMembershipPermissions(clubId, membershipId, updates);
    if (!updated) throw new NotFoundError('Club membership not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: actor.isSuperAdmin ? 'Super Admin' : `Club Leadership · ${clubId}`,
      action: 'UPDATED_MEMBER_PERMISSIONS',
      targetType: 'membership',
      targetId: membershipId,
      targetLabel: updated.userName || membershipId,
      details: `Updated ${updated.role} (${updated.title}) with permissions [${updated.permissions.join(', ')}].`,
    });
    return updated;
  }

  async removeClubMember(
    clubId: string,
    membershipId: string,
    actor: {id: string; name: string; isSuperAdmin: boolean},
  ): Promise<void> {
    const existingTeam = await this.adapter.getClubMemberships(clubId);
    const existing = existingTeam.find((m) => m.id === membershipId);
    if (!existing) throw new NotFoundError('Club membership not found');

    if (!actor.isSuperAdmin && isClubOfficerRole(existing.role)) {
      throw new ForbiddenError(
        'Only a Super Admin can remove a Club President or Vice President',
      );
    }

    const removed = await this.adapter.removeClubMembership(clubId, membershipId);
    if (!removed) throw new NotFoundError('Club membership not found');
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: actor.isSuperAdmin ? 'Super Admin' : `Club Leadership · ${clubId}`,
      action: 'REMOVED_CLUB_MEMBER',
      targetType: 'membership',
      targetId: membershipId,
      targetLabel: existing.userName || membershipId,
      details: `Removed ${existing.role} (${existing.title}) from club leadership team.`,
    });
  }
}
