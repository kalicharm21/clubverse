import {and, desc, eq, inArray, or, sql} from 'drizzle-orm';
import {
  CORE_MEMBER_PERMISSIONS,
  MAX_CORE_SCANNERS_PER_CLUB,
  isClubOfficerRole,
  type CoreMemberPermission,
} from '../../../shared/constants/permissions.ts';
import type {
  ClubInvitation,
  ClubMembership,
  ClubRole,
  UserAccount,
} from '../../../shared/types/domain.ts';
import {env} from '../../config/env.ts';
import {isInstitutionalEmailAllowed} from '../../shared/auth/supabaseAuth.ts';
import {publicReadCache} from '../../shared/cache/publicReadCache.ts';
import {invitationMailer} from '../../shared/email/invitationMailer.ts';
import {
  BusinessRuleError,
  ConflictError,
  ForbiddenError,
  NotFoundError,
  ValidationError,
} from '../../shared/errors/AppError.ts';
import {generateInvitationToken, hashInvitationToken} from '../../shared/utils/crypto.ts';
import {withRlsTransaction, type DbTx} from '../index.ts';
import {clubInvitations, clubMemberships, clubs, notifications, users} from '../schema.ts';
import {
  getPgErrorMessage,
  isPgUniqueViolation,
  isUuid,
  mapInvitationRow,
  mapMembershipRow,
  mapUserRow,
} from './mappers.ts';

function defaultTitleForRole(role: ClubRole): string {
  if (role === 'president') return 'President';
  if (role === 'vice_president') return 'Vice President';
  return 'Core Member';
}

export class InvitationsRepository {
  private getExpiresAt(): Date {
    return new Date(Date.now() + env.invitationTtlHours * 60 * 60 * 1000);
  }

  private async checkCoreScannerLimitTx(
    tx: DbTx,
    clubId: string,
    excludeUserId?: string,
  ): Promise<void> {
    await tx.execute(
      sql`SELECT pg_advisory_xact_lock(hashtext(${`scanner_limit:${clubId}`}))`,
    );
    const activeScanners = await tx
      .select({id: clubMemberships.id, userId: clubMemberships.userId})
      .from(clubMemberships)
      .where(
        and(
          eq(clubMemberships.clubId, clubId),
          eq(clubMemberships.membershipRole, 'core_member'),
          eq(clubMemberships.status, 'active'),
          sql`${clubMemberships.permissions} @> '["SCAN_ATTENDANCE"]'::jsonb`,
        ),
      );
    const count = excludeUserId
      ? activeScanners.filter((s) => s.userId !== excludeUserId).length
      : activeScanners.length;

    if (count >= MAX_CORE_SCANNERS_PER_CLUB) {
      throw new BusinessRuleError(
        'SCANNER_SLOT_LIMIT_EXCEEDED',
        `Maximum ${MAX_CORE_SCANNERS_PER_CLUB} active Core Members with QR scanning permission allowed per club.`,
        {limit: MAX_CORE_SCANNERS_PER_CLUB, activeCoreScanners: count},
      );
    }
  }

  async assignClubLeadership(input: {
    clubId: string;
    email: string;
    role: 'president' | 'vice_president';
    title?: string;
    replaceExisting?: boolean;
    sendInvitation?: boolean;
    actorUserId: string;
  }): Promise<{
    mode: 'assigned' | 'invited';
    membership?: ClubMembership;
    invitation?: ClubInvitation;
    replacedUserId?: string | null;
  }> {
    if (!isUuid(input.clubId)) throw new NotFoundError('Club not found');
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail || !isInstitutionalEmailAllowed(normalizedEmail)) {
      throw new ValidationError(
        `Institutional email required (${env.institutionalEmailDomains.join(', ') || 'valid domain'})`,
      );
    }

    const title = input.title?.trim() || defaultTitleForRole(input.role);

    const outcome = await withRlsTransaction('leadership.assign', async (tx) => {
      await tx.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext(${`club_leadership:${input.clubId}`}))`,
      );

      const [clubRow] = await tx.select().from(clubs).where(eq(clubs.id, input.clubId)).limit(1);
      if (!clubRow) throw new NotFoundError('Club not found');

      const [existingLeader] = await tx
        .select()
        .from(clubMemberships)
        .where(
          and(
            eq(clubMemberships.clubId, input.clubId),
            eq(clubMemberships.membershipRole, input.role),
            eq(clubMemberships.status, 'active'),
          ),
        )
        .limit(1);

      const [targetUser] = await tx
        .select()
        .from(users)
        .where(eq(users.normalizedEmail, normalizedEmail))
        .limit(1);

      if (existingLeader && existingLeader.userId !== targetUser?.id && !input.replaceExisting) {
        throw new ConflictError(
          `This club already has an active ${defaultTitleForRole(input.role)}. Enable replaceExisting to transfer leadership.`,
        );
      }

      let replacedUserId: string | null = null;
      if (existingLeader && existingLeader.userId !== targetUser?.id && input.replaceExisting) {
        await tx
          .update(clubMemberships)
          .set({status: 'inactive', updatedAt: new Date()})
          .where(eq(clubMemberships.id, existingLeader.id));
        replacedUserId = existingLeader.userId;
      }

      // If target account already exists AND caller wants direct assignment (`sendInvitation: false`)
      if (targetUser && input.sendInvitation === false) {
        const [upserted] = await tx
          .insert(clubMemberships)
          .values({
            clubId: input.clubId,
            userId: targetUser.id,
            membershipRole: input.role,
            title,
            permissions: [...CORE_MEMBER_PERMISSIONS],
            status: 'active',
            assignedBy: isUuid(input.actorUserId) ? input.actorUserId : null,
          })
          .onConflictDoUpdate({
            target: [clubMemberships.userId, clubMemberships.clubId],
            set: {
              membershipRole: input.role,
              title,
              permissions: [...CORE_MEMBER_PERMISSIONS],
              status: 'active',
              assignedBy: isUuid(input.actorUserId) ? input.actorUserId : null,
              updatedAt: new Date(),
            },
          })
          .returning();

        await tx.insert(notifications).values({
          userId: targetUser.id,
          type: 'club',
          title: `Leadership Assigned: ${clubRow.name}`,
          message: `You were assigned as ${title} (${defaultTitleForRole(input.role)}) for ${clubRow.name}.`,
          link: '/app/club-admin/profile',
        });

        return {
          mode: 'assigned' as const,
          membership: mapMembershipRow(upserted, {
            clubName: clubRow.name,
            userName: targetUser.displayName,
            userEmail: targetUser.email,
          }),
          replacedUserId,
        };
      }

      // Otherwise issue a secure SHA-256 tokenized invitation (inviter never creates/sets passwords)
      const now = new Date();
      await tx
        .update(clubInvitations)
        .set({status: 'revoked', revokedAt: now, updatedAt: now})
        .where(
          and(
            eq(clubInvitations.clubId, input.clubId),
            eq(clubInvitations.status, 'pending'),
            or(
              eq(clubInvitations.intendedRole, input.role),
              eq(clubInvitations.normalizedEmail, normalizedEmail),
            ),
          ),
        );

      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      const expiresAt = this.getExpiresAt();
      const deliveryMode = invitationMailer.getDeliveryMode();

      const [inserted] = await tx
        .insert(clubInvitations)
        .values({
          clubId: input.clubId,
          inviterUserId: isUuid(input.actorUserId) ? input.actorUserId : null,
          inviteeEmail: input.email.trim(),
          normalizedEmail,
          intendedRole: input.role,
          title,
          permissions: [...CORE_MEMBER_PERMISSIONS],
          tokenHash,
          status: 'pending',
          deliveryMode,
          expiresAt,
        })
        .returning();

      return {
        mode: 'invited' as const,
        invitation: mapInvitationRow(inserted, {clubName: clubRow.name}),
        rawToken,
        clubName: clubRow.name,
        replacedUserId,
      };
    });

    if (outcome.mode === 'invited' && outcome.invitation) {
      await invitationMailer.sendClubInvitation({
        invitationId: outcome.invitation.id,
        clubId: input.clubId,
        clubName: outcome.clubName,
        toEmail: outcome.invitation.inviteeEmail,
        intendedRole: outcome.invitation.intendedRole,
        title: outcome.invitation.title,
        token: outcome.rawToken,
        expiresAt: outcome.invitation.expiresAt,
      });
    }

    publicReadCache.invalidateClubs();
    return {
      mode: outcome.mode,
      membership: outcome.membership,
      invitation: outcome.invitation,
      replacedUserId: outcome.replacedUserId,
    };
  }

  async createClubInvitation(input: {
    clubId: string;
    email: string;
    role: ClubRole;
    title?: string;
    permissions: CoreMemberPermission[];
    inviterUserId: string;
    replaceExisting?: boolean;
  }): Promise<ClubInvitation> {
    if (!isUuid(input.clubId)) throw new NotFoundError('Club not found');
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!normalizedEmail || !isInstitutionalEmailAllowed(normalizedEmail)) {
      throw new ValidationError(
        `Institutional email required (${env.institutionalEmailDomains.join(', ') || 'valid domain'})`,
      );
    }

    const effectivePermissions: CoreMemberPermission[] = isClubOfficerRole(input.role)
      ? [...CORE_MEMBER_PERMISSIONS]
      : [...input.permissions];
    const title = input.title?.trim() || defaultTitleForRole(input.role);

    const created = await withRlsTransaction('invitations.create', async (tx) => {
      const [clubRow] = await tx.select().from(clubs).where(eq(clubs.id, input.clubId)).limit(1);
      if (!clubRow) throw new NotFoundError('Club not found');

      if (isClubOfficerRole(input.role)) {
        const [existingLeader] = await tx
          .select({id: clubMemberships.id})
          .from(clubMemberships)
          .where(
            and(
              eq(clubMemberships.clubId, input.clubId),
              eq(clubMemberships.membershipRole, input.role),
              eq(clubMemberships.status, 'active'),
            ),
          )
          .limit(1);
        if (existingLeader && !input.replaceExisting) {
          throw new ConflictError(
            `This club already has an active ${defaultTitleForRole(input.role)}. Replace existing leadership to issue a new invite.`,
          );
        }
      }

      if (
        input.role === 'core_member' &&
        effectivePermissions.includes('SCAN_ATTENDANCE')
      ) {
        await this.checkCoreScannerLimitTx(tx, input.clubId);
      }

      // Supersede any existing pending invite for this email & club (or leadership role)
      const now = new Date();
      await tx
        .update(clubInvitations)
        .set({status: 'revoked', revokedAt: now, updatedAt: now})
        .where(
          and(
            eq(clubInvitations.clubId, input.clubId),
            eq(clubInvitations.status, 'pending'),
            or(
              eq(clubInvitations.normalizedEmail, normalizedEmail),
              isClubOfficerRole(input.role)
                ? eq(clubInvitations.intendedRole, input.role)
                : sql`false`,
            ),
          ),
        );

      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      const expiresAt = this.getExpiresAt();
      const deliveryMode = invitationMailer.getDeliveryMode();

      const [inserted] = await tx
        .insert(clubInvitations)
        .values({
          clubId: input.clubId,
          inviterUserId: isUuid(input.inviterUserId) ? input.inviterUserId : null,
          inviteeEmail: input.email.trim(),
          normalizedEmail,
          intendedRole: input.role,
          title,
          permissions: effectivePermissions,
          tokenHash,
          status: 'pending',
          deliveryMode,
          expiresAt,
        })
        .returning();

      return {
        invitation: mapInvitationRow(inserted, {clubName: clubRow.name}),
        rawToken,
        clubName: clubRow.name,
      };
    });

    await invitationMailer.sendClubInvitation({
      invitationId: created.invitation.id,
      clubId: input.clubId,
      clubName: created.clubName,
      toEmail: created.invitation.inviteeEmail,
      intendedRole: created.invitation.intendedRole,
      title: created.invitation.title,
      token: created.rawToken,
      expiresAt: created.invitation.expiresAt,
    });

    return created.invitation;
  }

  async listClubInvitations(clubId: string): Promise<ClubInvitation[]> {
    if (!isUuid(clubId)) return [];
    return withRlsTransaction('invitations.listForClub', async (tx) => {
      const rows = await tx
        .select({
          inv: clubInvitations,
          clubName: clubs.name,
          inviterName: users.displayName,
        })
        .from(clubInvitations)
        .innerJoin(clubs, eq(clubInvitations.clubId, clubs.id))
        .leftJoin(users, eq(clubInvitations.inviterUserId, users.id))
        .where(eq(clubInvitations.clubId, clubId))
        .orderBy(desc(clubInvitations.createdAt));

      return rows.map((r) =>
        mapInvitationRow(r.inv, {
          clubName: r.clubName,
          inviterName: r.inviterName ?? undefined,
        }),
      );
    });
  }

  async resendClubInvitation(
    clubId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<ClubInvitation> {
    if (!isUuid(clubId) || !isUuid(invitationId)) {
      throw new NotFoundError('Invitation not found');
    }

    const updated = await withRlsTransaction('invitations.resend', async (tx) => {
      const [existing] = await tx
        .select()
        .from(clubInvitations)
        .where(and(eq(clubInvitations.id, invitationId), eq(clubInvitations.clubId, clubId)))
        .limit(1);

      if (!existing) throw new NotFoundError('Invitation not found');
      if (existing.status === 'accepted') {
        throw new ConflictError('Accepted invitations cannot be resent');
      }
      if (existing.status === 'revoked') {
        throw new BusinessRuleError('INVITATION_REVOKED', 'Revoked invitations cannot be resent');
      }

      const [clubRow] = await tx.select().from(clubs).where(eq(clubs.id, clubId)).limit(1);
      if (!clubRow) throw new NotFoundError('Club not found');

      const rawToken = generateInvitationToken();
      const tokenHash = hashInvitationToken(rawToken);
      const expiresAt = this.getExpiresAt();
      const deliveryMode = invitationMailer.getDeliveryMode();

      const [saved] = await tx
        .update(clubInvitations)
        .set({
          tokenHash,
          status: 'pending',
          deliveryMode,
          expiresAt,
          inviterUserId: isUuid(actorUserId) ? actorUserId : existing.inviterUserId,
          updatedAt: new Date(),
        })
        .where(eq(clubInvitations.id, invitationId))
        .returning();

      return {
        invitation: mapInvitationRow(saved, {clubName: clubRow.name}),
        rawToken,
        clubName: clubRow.name,
      };
    });

    await invitationMailer.sendClubInvitation({
      invitationId: updated.invitation.id,
      clubId,
      clubName: updated.clubName,
      toEmail: updated.invitation.inviteeEmail,
      intendedRole: updated.invitation.intendedRole,
      title: updated.invitation.title,
      token: updated.rawToken,
      expiresAt: updated.invitation.expiresAt,
    });

    return updated.invitation;
  }

  async revokeClubInvitation(
    clubId: string,
    invitationId: string,
    actorUserId: string,
  ): Promise<ClubInvitation | null> {
    if (!isUuid(clubId) || !isUuid(invitationId)) return null;
    return withRlsTransaction('invitations.revoke', async (tx) => {
      const [existing] = await tx
        .select()
        .from(clubInvitations)
        .where(and(eq(clubInvitations.id, invitationId), eq(clubInvitations.clubId, clubId)))
        .limit(1);
      if (!existing) return null;
      if (existing.status === 'accepted') {
        throw new ConflictError('An accepted invitation cannot be revoked');
      }

      const now = new Date();
      const [updated] = await tx
        .update(clubInvitations)
        .set({
          status: 'revoked',
          revokedAt: now,
          revokedBy: isUuid(actorUserId) ? actorUserId : null,
          updatedAt: now,
        })
        .where(eq(clubInvitations.id, invitationId))
        .returning();

      return mapInvitationRow(updated);
    });
  }

  async previewInvitation(token: string): Promise<{
    invitation: ClubInvitation;
    clubName: string;
    clubSlug: string;
    hasExistingAccount: boolean;
  }> {
    const tokenHash = hashInvitationToken(token);
    return withRlsTransaction(
      'invitations.preview',
      async (tx) => {
        const rows = await tx
          .select({
            inv: clubInvitations,
            clubName: clubs.name,
            clubSlug: clubs.slug,
          })
          .from(clubInvitations)
          .innerJoin(clubs, eq(clubInvitations.clubId, clubs.id))
          .where(eq(clubInvitations.tokenHash, tokenHash))
          .limit(1);

        const found = rows[0];
        if (!found) {
          throw new NotFoundError('Invitation link is invalid or has been replaced');
        }

        const mapped = mapInvitationRow(found.inv, {clubName: found.clubName});
        const [existingUser] = await tx
          .select({id: users.id})
          .from(users)
          .where(eq(users.normalizedEmail, found.inv.normalizedEmail))
          .limit(1);

        return {
          invitation: mapped,
          clubName: found.clubName,
          clubSlug: found.clubSlug,
          hasExistingAccount: Boolean(existingUser),
        };
      },
      {globalRole: 'invitation_activator'},
    );
  }

  async acceptInvitation(input: {
    token: string;
    authUserId: string;
    email: string;
    name?: string;
    department?: string;
    yearOfStudy?: string;
    emailVerified: boolean;
    isBootstrapSuperAdmin: boolean;
  }): Promise<{
    invitation: ClubInvitation;
    membership: ClubMembership;
    user: UserAccount;
  }> {
    if (!input.emailVerified) {
      throw new ForbiddenError('Verify your institutional email before accepting this invitation');
    }
    const normalizedEmail = input.email.trim().toLowerCase();
    if (!isInstitutionalEmailAllowed(normalizedEmail)) {
      throw new ForbiddenError('Only institutional accounts may accept club invitations');
    }

    const tokenHash = hashInvitationToken(input.token);

    const result = await withRlsTransaction(
      'invitations.accept',
      async (tx) => {
        const lockedInvites = await tx
          .select()
          .from(clubInvitations)
          .where(eq(clubInvitations.tokenHash, tokenHash))
          .for('update')
          .limit(1);

        const inv = lockedInvites[0];
        if (!inv) {
          throw new NotFoundError('Invitation link is invalid or has been superseded');
        }

        if (inv.status === 'revoked') {
          throw new BusinessRuleError('INVITATION_REVOKED', 'This invitation has been revoked');
        }
        if (inv.status === 'accepted') {
          throw new ConflictError('This invitation has already been accepted');
        }
        if (inv.expiresAt.getTime() <= Date.now() || inv.status === 'expired') {
          await tx
            .update(clubInvitations)
            .set({status: 'expired', updatedAt: new Date()})
            .where(eq(clubInvitations.id, inv.id));
          throw new BusinessRuleError('INVITATION_EXPIRED', 'This invitation link has expired');
        }

        if (inv.normalizedEmail !== normalizedEmail) {
          throw new ForbiddenError(
            `This invitation was issued to ${inv.inviteeEmail}. Sign in with that institutional email to accept.`,
          );
        }

        // Resolve existing user or provision once without duplicates
        const existingUsers = await tx
          .select()
          .from(users)
          .where(
            or(
              eq(users.authUserId, input.authUserId),
              eq(users.normalizedEmail, normalizedEmail),
            ),
          )
          .limit(1);

        let userRow: typeof users.$inferSelect;
        if (existingUsers[0]) {
          const row = existingUsers[0];
          const [updatedUser] = await tx
            .update(users)
            .set({
              authUserId: input.authUserId,
              displayName: input.name?.trim() || row.displayName,
              department: input.department?.trim() || row.department,
              yearOfStudy: input.yearOfStudy?.trim() || row.yearOfStudy,
              emailVerifiedAt: row.emailVerifiedAt || new Date(),
              updatedAt: new Date(),
            })
            .where(eq(users.id, row.id))
            .returning();
          userRow = updatedUser;
        } else {
          const displayName =
            input.name?.trim() ||
            normalizedEmail
              .split('@')[0]
              .replace(/[._-]+/g, ' ')
              .replace(/\b\w/g, (c) => c.toUpperCase());
          const studentCode = `STU-${new Date().getFullYear()}-${input.authUserId.slice(0, 6).toUpperCase()}`;
          const [insertedUser] = await tx
            .insert(users)
            .values({
              authUserId: input.authUserId,
              email: input.email.trim(),
              normalizedEmail,
              displayName,
              department: input.department?.trim() || 'Computer Science & Engineering',
              yearOfStudy: input.yearOfStudy?.trim() || 'Undergraduate',
              studentId: studentCode,
              globalRole: input.isBootstrapSuperAdmin ? 'super_admin' : 'user',
              accountStatus: 'active',
              emailVerifiedAt: new Date(),
            })
            .returning();
          userRow = insertedUser;
        }

        const [clubRow] = await tx.select().from(clubs).where(eq(clubs.id, inv.clubId)).limit(1);
        if (!clubRow) throw new NotFoundError('Club not found');

        await tx.execute(
          sql`SELECT pg_advisory_xact_lock(hashtext(${`club_invite_accept:${inv.clubId}`}))`,
        );

        const intendedRole = inv.intendedRole as ClubRole;
        if (isClubOfficerRole(intendedRole)) {
          // If an active leadership holder already occupies this seat, cleanly deactivate previous leadership role without deleting user
          const [currentHolder] = await tx
            .select()
            .from(clubMemberships)
            .where(
              and(
                eq(clubMemberships.clubId, inv.clubId),
                eq(clubMemberships.membershipRole, intendedRole),
                eq(clubMemberships.status, 'active'),
              ),
            )
            .limit(1);
          if (currentHolder && currentHolder.userId !== userRow.id) {
            await tx
              .update(clubMemberships)
              .set({status: 'inactive', updatedAt: new Date()})
              .where(eq(clubMemberships.id, currentHolder.id));
          }
        }

        const effectivePermissions: CoreMemberPermission[] = isClubOfficerRole(intendedRole)
          ? [...CORE_MEMBER_PERMISSIONS]
          : ((inv.permissions || []) as CoreMemberPermission[]);

        if (
          intendedRole === 'core_member' &&
          effectivePermissions.includes('SCAN_ATTENDANCE')
        ) {
          await this.checkCoreScannerLimitTx(tx, inv.clubId, userRow.id);
        }

        let membershipRow: typeof clubMemberships.$inferSelect;
        try {
          const [upserted] = await tx
            .insert(clubMemberships)
            .values({
              clubId: inv.clubId,
              userId: userRow.id,
              membershipRole: intendedRole,
              title: inv.title,
              permissions: effectivePermissions,
              status: 'active',
              assignedBy: inv.inviterUserId,
            })
            .onConflictDoUpdate({
              target: [clubMemberships.userId, clubMemberships.clubId],
              set: {
                membershipRole: intendedRole,
                title: inv.title,
                permissions: effectivePermissions,
                status: 'active',
                assignedBy: inv.inviterUserId,
                updatedAt: new Date(),
              },
            })
            .returning();
          membershipRow = upserted;
        } catch (err: unknown) {
          const msg = getPgErrorMessage(err);
          if (msg.includes('SCANNER_SLOT_LIMIT_EXCEEDED')) {
            throw new BusinessRuleError(
              'SCANNER_SLOT_LIMIT_EXCEEDED',
              `Maximum ${MAX_CORE_SCANNERS_PER_CLUB} active Core Members with QR scanning permission allowed per club.`,
            );
          }
          if (isPgUniqueViolation(err)) {
            throw new ConflictError('Role conflict while activating club membership');
          }
          throw err;
        }

        const now = new Date();
        const [acceptedInv] = await tx
          .update(clubInvitations)
          .set({
            status: 'accepted',
            acceptedAt: now,
            acceptedUserId: userRow.id,
            updatedAt: now,
          })
          .where(eq(clubInvitations.id, inv.id))
          .returning();

        await tx.insert(notifications).values({
          userId: userRow.id,
          type: 'club',
          title: `Invitation Accepted: ${clubRow.name}`,
          message: `You are now active as ${inv.title} (${defaultTitleForRole(intendedRole)}) for ${clubRow.name}.`,
          link: isClubOfficerRole(intendedRole)
            ? '/app/club-admin/profile'
            : '/app/core/overview',
        });

        return {
          invitation: mapInvitationRow(acceptedInv, {clubName: clubRow.name}),
          membership: mapMembershipRow(membershipRow, {
            clubName: clubRow.name,
            userName: userRow.displayName,
            userEmail: userRow.email,
          }),
          user: mapUserRow(userRow),
        };
      },
      {globalRole: 'invitation_activator'},
    );

    publicReadCache.invalidateClubs();
    return result;
  }
}
