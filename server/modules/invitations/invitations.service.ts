import {
  CORE_MEMBER_PERMISSIONS,
  isClubOfficerRole,
} from '../../../shared/constants/permissions.ts';
import type {
  ClubInvitation,
  ClubMembership,
  ClubRole,
  CoreMemberPermission,
  UserAccount,
} from '../../../shared/types/domain.ts';
import type {DataAdapter} from '../../adapters/DataAdapter.ts';
import {
  BusinessRuleError,
  ForbiddenError,
  NotFoundError,
} from '../../shared/errors/AppError.ts';

export class InvitationsService {
  constructor(private readonly adapter: DataAdapter) {}

  async assignLeadership(
    clubId: string,
    actor: {id: string; name: string},
    input: {
      email: string;
      role: 'president' | 'vice_president';
      title?: string;
      replaceExisting?: boolean;
      sendInvitation?: boolean;
    },
  ): Promise<{
    mode: 'assigned' | 'invited';
    membership?: ClubMembership;
    invitation?: ClubInvitation;
    replacedUserId?: string | null;
  }> {
    const result = await this.adapter.assignClubLeadership({
      clubId,
      email: input.email,
      role: input.role,
      title: input.title,
      replaceExisting: input.replaceExisting,
      sendInvitation: input.sendInvitation,
      actorUserId: actor.id,
    });

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: 'Super Admin',
      action:
        result.mode === 'assigned'
          ? 'ASSIGNED_CLUB_LEADERSHIP'
          : 'INVITED_CLUB_LEADERSHIP',
      targetType: 'invitation',
      targetId: result.invitation?.id || result.membership?.id || clubId,
      targetLabel: `${input.email} (${input.role})`,
      details:
        result.mode === 'assigned'
          ? `Assigned ${input.email} as ${input.role} for club ${clubId}${result.replacedUserId ? ' (replaced prior holder)' : ''}.`
          : `Issued tokenized leadership invitation to ${input.email} as ${input.role}.`,
    });

    return result;
  }

  async listClubInvitations(clubId: string): Promise<ClubInvitation[]> {
    const club = await this.adapter.getClubDetail(clubId);
    if (!club) throw new NotFoundError('Club not found');
    return this.adapter.listClubInvitations(club.id);
  }

  async createInvitation(
    clubId: string,
    actor: {id: string; name: string; isSuperAdmin: boolean; memberships: ClubMembership[]},
    input: {
      email: string;
      role: ClubRole;
      title?: string;
      permissions: CoreMemberPermission[];
      replaceExisting?: boolean;
    },
  ): Promise<ClubInvitation> {
    if (!actor.isSuperAdmin && isClubOfficerRole(input.role)) {
      throw new ForbiddenError(
        'Only a Super Admin can invite or assign Club President or Vice President roles',
      );
    }

    const effectivePermissions = isClubOfficerRole(input.role)
      ? [...CORE_MEMBER_PERMISSIONS]
      : input.permissions;

    const invitation = await this.adapter.createClubInvitation({
      clubId,
      email: input.email,
      role: input.role,
      title: input.title,
      permissions: effectivePermissions,
      inviterUserId: actor.id,
      replaceExisting: actor.isSuperAdmin ? input.replaceExisting : false,
    });

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: actor.isSuperAdmin
        ? 'Super Admin'
        : `Club Officer · ${invitation.clubName || clubId}`,
      action: 'CREATED_CLUB_INVITATION',
      targetType: 'invitation',
      targetId: invitation.id,
      targetLabel: `${invitation.inviteeEmail} (${invitation.intendedRole})`,
      details: `Issued ${invitation.deliveryMode || 'token'} invitation for ${invitation.title}.`,
    });

    return invitation;
  }

  async resendInvitation(
    clubId: string,
    invitationId: string,
    actor: {id: string; name: string; isSuperAdmin: boolean},
  ): Promise<ClubInvitation> {
    const existingList = await this.adapter.listClubInvitations(clubId);
    const target = existingList.find((i) => i.id === invitationId);
    if (!target) throw new NotFoundError('Invitation not found');

    if (!actor.isSuperAdmin && isClubOfficerRole(target.intendedRole)) {
      throw new ForbiddenError('Only a Super Admin can resend leadership invitations');
    }

    const resent = await this.adapter.resendClubInvitation(clubId, invitationId, actor.id);
    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: actor.isSuperAdmin ? 'Super Admin' : `Club Officer · ${clubId}`,
      action: 'RESENT_CLUB_INVITATION',
      targetType: 'invitation',
      targetId: resent.id,
      targetLabel: resent.inviteeEmail,
      details: `Regenerated invitation token and refreshed expiration.`,
    });
    return resent;
  }

  async revokeInvitation(
    clubId: string,
    invitationId: string,
    actor: {id: string; name: string; isSuperAdmin: boolean},
  ): Promise<ClubInvitation> {
    const existingList = await this.adapter.listClubInvitations(clubId);
    const target = existingList.find((i) => i.id === invitationId);
    if (!target) throw new NotFoundError('Invitation not found');

    if (!actor.isSuperAdmin && isClubOfficerRole(target.intendedRole)) {
      throw new ForbiddenError('Only a Super Admin can revoke leadership invitations');
    }

    const revoked = await this.adapter.revokeClubInvitation(clubId, invitationId, actor.id);
    if (!revoked) throw new NotFoundError('Invitation not found');

    await this.adapter.appendAuditLog({
      actorId: actor.id,
      actorName: actor.name,
      actorContext: actor.isSuperAdmin ? 'Super Admin' : `Club Officer · ${clubId}`,
      action: 'REVOKED_CLUB_INVITATION',
      targetType: 'invitation',
      targetId: revoked.id,
      targetLabel: revoked.inviteeEmail,
      details: 'Revoked pending club invitation.',
    });
    return revoked;
  }

  async previewInvitation(token: string) {
    if (!token || token.trim().length < 12) {
      throw new BusinessRuleError('INVALID_TOKEN', 'A valid invitation token is required');
    }
    return this.adapter.previewInvitation(token.trim());
  }

  async acceptInvitation(input: {
    token: string;
    authUserId: string;
    user: UserAccount;
    name?: string;
    department?: string;
    yearOfStudy?: string;
  }) {
    const result = await this.adapter.acceptInvitation({
      token: input.token,
      authUserId: input.authUserId,
      email: input.user.email,
      name: input.name || input.user.name,
      department: input.department || input.user.department,
      yearOfStudy: input.yearOfStudy || input.user.yearOfStudy,
      emailVerified: input.user.emailVerified,
      isBootstrapSuperAdmin: input.user.isSuperAdmin,
    });

    await this.adapter.appendAuditLog({
      actorId: result.user.id,
      actorName: result.user.name,
      actorContext: 'Invitation Acceptance',
      action: 'ACCEPTED_CLUB_INVITATION',
      targetType: 'membership',
      targetId: result.membership.id,
      targetLabel: `${result.user.email} → ${result.membership.clubName || result.membership.clubId}`,
      details: `Activated ${result.membership.role} (${result.membership.title}) membership.`,
    });

    return result;
  }
}
