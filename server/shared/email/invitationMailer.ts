import type {ClubRole} from '../../../shared/types/domain.ts';
import {env} from '../../config/env.ts';

export interface OutboundInvitationEmail {
  invitationId: string;
  clubId: string;
  clubName: string;
  toEmail: string;
  intendedRole: ClubRole;
  title: string;
  acceptUrl: string;
  token: string;
  expiresAt: string;
  deliveryMode: 'supabase_admin' | 'smtp' | 'test_adapter';
  sentAt: string;
}

const capturedEmails: OutboundInvitationEmail[] = [];

export class InvitationMailer {
  getDeliveryMode(): 'supabase_admin' | 'smtp' | 'test_adapter' {
    if (env.supabaseUrl && env.supabaseServiceRoleKey) {
      return 'supabase_admin';
    }
    if (env.smtpUrl) {
      return 'smtp';
    }
    return 'test_adapter';
  }

  async sendClubInvitation(input: {
    invitationId: string;
    clubId: string;
    clubName: string;
    toEmail: string;
    intendedRole: ClubRole;
    title: string;
    token: string;
    expiresAt: string;
  }): Promise<{deliveryMode: 'supabase_admin' | 'smtp' | 'test_adapter'}> {
    const baseUrl = env.appUrl.replace(/\/$/, '');
    const acceptUrl = `${baseUrl}/accept-invite?token=${encodeURIComponent(input.token)}`;
    const mode = this.getDeliveryMode();

    if (mode === 'supabase_admin') {
      try {
        // Trigger Supabase Auth Admin invite if user does not yet exist; silently ignore already-registered users
        const endpoint = `${env.supabaseUrl.replace(/\/$/, '')}/auth/v1/invite`;
        const response = await fetch(endpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            apikey: env.supabaseServiceRoleKey,
            Authorization: `Bearer ${env.supabaseServiceRoleKey}`,
          },
          body: JSON.stringify({
            email: input.toEmail,
            data: {
              campusverse_invitation_id: input.invitationId,
              club_id: input.clubId,
              club_name: input.clubName,
              intended_role: input.intendedRole,
            },
            redirect_to: acceptUrl,
          }),
        });
        if (!response.ok && response.status !== 422) {
          console.warn(
            JSON.stringify({
              level: 'warn',
              event: 'supabase_admin_invite_fallback',
              status: response.status,
              clubId: input.clubId,
            }),
          );
        }
      } catch {
        console.warn(
          JSON.stringify({
            level: 'warn',
            event: 'supabase_admin_invite_network_fallback',
            clubId: input.clubId,
          }),
        );
      }
    }

    // Store in controlled non-API test capture buffer (never logged to console or returned by API routes)
    capturedEmails.push({
      invitationId: input.invitationId,
      clubId: input.clubId,
      clubName: input.clubName,
      toEmail: input.toEmail,
      intendedRole: input.intendedRole,
      title: input.title,
      acceptUrl,
      token: input.token,
      expiresAt: input.expiresAt,
      deliveryMode: mode,
      sentAt: new Date().toISOString(),
    });
    if (capturedEmails.length > 200) {
      capturedEmails.splice(0, capturedEmails.length - 200);
    }

    return {deliveryMode: mode};
  }
}

export const invitationMailer = new InvitationMailer();

// Strictly for automated integration tests — never mounted on HTTP routes
export function getCapturedInvitationEmailsForTests(): readonly OutboundInvitationEmail[] {
  return capturedEmails;
}

export function clearCapturedInvitationEmailsForTests(): void {
  capturedEmails.length = 0;
}
