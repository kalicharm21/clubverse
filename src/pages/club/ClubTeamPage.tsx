import React, {useMemo, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  Edit3,
  MailPlus,
  QrCode,
  RefreshCw,
  ShieldAlert,
  Trash2,
  UserPlus,
  XCircle,
} from 'lucide-react';
import {
  CLUB_ROLE_LABELS,
  CORE_MEMBER_PERMISSIONS,
  isClubOfficerRole,
  MAX_CORE_SCANNERS_PER_CLUB,
  PERMISSION_LABELS,
  type CoreMemberPermission,
} from '../../../shared/constants/permissions.ts';
import type {ClubMembership} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {Card, Input, Select} from '../../components/ui/FormControls.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const ClubTeamPage: React.FC = () => {
  const {user, activeClubId, activeMembership} = useAuth();
  const {toast, confirm} = useToast();
  const queryClient = useQueryClient();

  const isPresidentOrSuper = Boolean(
    user?.isSuperAdmin || activeMembership?.role === 'president',
  );
  const isVicePresident = activeMembership?.role === 'vice_president' && !user?.isSuperAdmin;

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteError, setInviteError] = useState<string | null>(null);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<'core_member' | 'vice_president'>('core_member');
  const [title, setTitle] = useState('Operations Coordinator');
  const [permissions, setPermissions] = useState<CoreMemberPermission[]>([
    'VIEW_REGISTRATIONS',
    'SCAN_ATTENDANCE',
  ]);

  const [editingMember, setEditingMember] = useState<ClubMembership | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const {data: team = [], isLoading} = useQuery({
    queryKey: ['club-team', activeClubId],
    queryFn: () => apiClient.getClubTeam(activeClubId!),
    enabled: Boolean(activeClubId),
  });

  const {data: invitations = [], isLoading: invitationsLoading} = useQuery({
    queryKey: ['club-invitations', activeClubId],
    queryFn: () => apiClient.listClubInvitations(activeClubId!),
    enabled: Boolean(activeClubId),
  });

  const coreScannerCount = useMemo(
    () =>
      team.filter(
        (m) => m.role === 'core_member' && m.permissions.includes('SCAN_ATTENDANCE'),
      ).length,
    [team],
  );
  const scannerSlotsFull = coreScannerCount >= MAX_CORE_SCANNERS_PER_CLUB;

  const invalidateTeamCaches = async () => {
    await Promise.all([
      queryClient.invalidateQueries({queryKey: ['club-team', activeClubId]}),
      queryClient.invalidateQueries({queryKey: ['club-invitations', activeClubId]}),
      queryClient.invalidateQueries({queryKey: ['club', activeClubId]}),
      queryClient.invalidateQueries({queryKey: ['admin-clubs']}),
    ]);
  };

  const inviteMutation = useMutation({
    mutationFn: () =>
      apiClient.createClubInvitation(activeClubId!, {
        email: email.trim(),
        role: isPresidentOrSuper ? role : 'core_member',
        title: title.trim() || 'Core Member',
        permissions:
          isPresidentOrSuper && role === 'vice_president'
            ? [...CORE_MEMBER_PERMISSIONS]
            : permissions,
      }),
    onSuccess: async () => {
      setInviteOpen(false);
      setInviteError(null);
      setEmail('');
      setRole('core_member');
      await invalidateTeamCaches();
      toast.success(
        'Invitation sent',
        'A secure tokenized link has been dispatched to the institutional email.',
      );
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to send invitation';
      setInviteError(msg);
      toast.error('Invitation failed', msg);
    },
  });

  const updatePermsMutation = useMutation({
    mutationFn: (vars: {
      member: ClubMembership;
      nextPerms?: CoreMemberPermission[];
      nextTitle?: string;
    }) =>
      apiClient.updateMemberPermissions(activeClubId!, vars.member.id, {
        permissions: vars.nextPerms,
        title: vars.nextTitle,
      }),
    onSuccess: async (_data, vars) => {
      if (vars.nextTitle !== undefined) {
        setEditingMember(null);
      }
      await invalidateTeamCaches();
      toast.success(
        vars.nextTitle !== undefined ? 'Officer title updated' : 'Permissions updated',
      );
    },
    onError: (err) => {
      toast.error('Failed to update member', err instanceof Error ? err.message : undefined);
    },
  });

  const removeMutation = useMutation({
    mutationFn: (membershipId: string) => apiClient.removeClubMember(activeClubId!, membershipId),
    onSuccess: async () => {
      await invalidateTeamCaches();
      toast.info('Member removed from club team');
    },
    onError: (err) => {
      toast.error('Could not remove member', err instanceof Error ? err.message : undefined);
    },
  });

  const resendMutation = useMutation({
    mutationFn: (invitationId: string) =>
      apiClient.resendClubInvitation(activeClubId!, invitationId),
    onSuccess: async () => {
      await invalidateTeamCaches();
      toast.success('Invitation resent');
    },
    onError: (err) => {
      toast.error('Failed to resend', err instanceof Error ? err.message : undefined);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (invitationId: string) =>
      apiClient.revokeClubInvitation(activeClubId!, invitationId),
    onSuccess: async () => {
      await invalidateTeamCaches();
      toast.info('Invitation revoked');
    },
    onError: (err) => {
      toast.error('Failed to revoke', err instanceof Error ? err.message : undefined);
    },
  });

  const toggleNewPerm = (perm: CoreMemberPermission) => {
    setPermissions((prev) =>
      prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
    );
  };

  const toggleExistingPerm = (member: ClubMembership, perm: CoreMemberPermission) => {
    const nextPerms = member.permissions.includes(perm)
      ? member.permissions.filter((p) => p !== perm)
      : [...member.permissions, perm];
    updatePermsMutation.mutate({member, nextPerms});
  };

  const handleRemove = async (member: ClubMembership) => {
    const ok = await confirm({
      title: `Remove ${member.userName}?`,
      description: 'They will immediately lose scoped leadership permissions for this club.',
      confirmLabel: 'Remove Member',
      destructive: true,
    });
    if (ok) removeMutation.mutate(member.id);
  };

  const openInviteModal = () => {
    setInviteError(null);
    setRole('core_member');
    setPermissions(scannerSlotsFull ? ['VIEW_REGISTRATIONS'] : ['VIEW_REGISTRATIONS', 'SCAN_ATTENDANCE']);
    setInviteOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Team &amp; Permission Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Manage leadership roles, send tokenized Core Member invitations, and delegate scoped
            permissions for {activeMembership?.clubName}.
          </p>
        </div>

        <Button onClick={openInviteModal}>
          <UserPlus className="h-4 w-4" />
          Invite Team Member
        </Button>
      </div>

      {/* 4-Scanner Capacity Meter + VP Governance Info */}
      <div className="grid gap-4 lg:grid-cols-12">
        <Card className="p-5 lg:col-span-7">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <QrCode className="h-4 w-4 text-violet-700" />
              <span className="text-sm font-semibold text-slate-900">
                Core Member QR Scanner Quota
              </span>
            </div>
            <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
              {coreScannerCount} / {MAX_CORE_SCANNERS_PER_CLUB} slots used
            </span>
          </div>
          <div className="mt-2.5 h-2 w-full overflow-hidden rounded-full bg-slate-100">
            <div
              className={`h-full transition-all ${
                scannerSlotsFull ? 'bg-amber-600' : 'bg-violet-700'
              }`}
              style={{
                width: `${Math.min(100, (coreScannerCount / MAX_CORE_SCANNERS_PER_CLUB) * 100)}%`,
              }}
            />
          </div>
          <p className="mt-2 text-xs text-slate-500">
            Strictly up to {MAX_CORE_SCANNERS_PER_CLUB} Core Members per club may hold{' '}
            <span className="font-mono text-slate-700">SCAN_ATTENDANCE</span>. President and Vice
            President retain built-in gate access without consuming a Core Scanner slot.
          </p>
        </Card>

        {isVicePresident && (
          <Card className="border-amber-200 bg-amber-50/50 p-5 lg:col-span-5">
            <div className="flex items-start gap-2.5 text-xs text-amber-900">
              <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">Vice President Governance Scope</p>
                <p className="mt-1 text-amber-800 leading-relaxed">
                  You can invite and manage Core Members for this club, but President and Vice
                  President appointments are governed solely by the Super Admin or Club President.
                </p>
              </div>
            </div>
          </Card>
        )}
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : (
        <div className="space-y-4">
          {team.map((member) => {
            const isOfficer = isClubOfficerRole(member.role);
            const canModifyThisMember =
              user?.isSuperAdmin ||
              (activeMembership?.role === 'president' && member.role !== 'president') ||
              (!isOfficer && (isPresidentOrSuper || isVicePresident));

            return (
              <Card key={member.id} className="p-6">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <p className="font-display text-base font-semibold text-slate-900">
                      {member.userName}
                    </p>
                    <p className="text-xs text-slate-500">
                      {member.userEmail ? `${member.userEmail} · ` : ''}
                      {member.title} ·{' '}
                      <span className="font-medium text-violet-700">
                        {CLUB_ROLE_LABELS[member.role] || member.role}
                      </span>
                    </p>
                  </div>

                  {canModifyThisMember && (
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingMember(member);
                          setEditingTitle(member.title);
                        }}
                      >
                        <Edit3 className="h-3.5 w-3.5" />
                        Edit Title
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void handleRemove(member)}
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-600" />
                        Remove
                      </Button>
                    </div>
                  )}
                </div>

                <div className="mt-4 border-t border-slate-100 pt-4">
                  <p className="text-xs font-medium text-slate-500">
                    {isOfficer
                      ? `${CLUB_ROLE_LABELS[member.role]} holds full club operational permissions:`
                      : 'Delegated Core Member Permissions:'}
                  </p>
                  <div className="mt-2.5 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {CORE_MEMBER_PERMISSIONS.map((perm) => {
                      const checked = member.permissions.includes(perm);
                      const scannerBlocked =
                        perm === 'SCAN_ATTENDANCE' && !checked && scannerSlotsFull;
                      const disabled =
                        isOfficer ||
                        !canModifyThisMember ||
                        scannerBlocked ||
                        updatePermsMutation.isPending;

                      return (
                        <label
                          key={perm}
                          className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${
                            checked
                              ? 'border-violet-200 bg-violet-50/50 text-slate-900'
                              : 'border-slate-200 bg-white text-slate-600'
                          } ${disabled ? 'opacity-70 cursor-not-allowed' : 'cursor-pointer'}`}
                        >
                          <input
                            type="checkbox"
                            disabled={disabled}
                            checked={checked}
                            onChange={() => toggleExistingPerm(member, perm)}
                            className="h-3.5 w-3.5 rounded border-slate-300 text-violet-700"
                          />
                          <span>
                            {PERMISSION_LABELS[perm]}
                            {scannerBlocked ? ' (4/4 Full)' : ''}
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Pending & Historical Invitations */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 border-b border-slate-100 pb-4">
          <div className="flex items-center gap-2">
            <MailPlus className="h-4 w-4 text-violet-700" />
            <h2 className="font-display text-base font-semibold text-slate-900">
              Club Team Invitations ({invitations.length})
            </h2>
          </div>
          <span className="text-xs text-slate-500">
            Single-use SHA-256 tokenized links (72h TTL)
          </span>
        </div>

        {invitationsLoading ? (
          <div className="pt-4">
            <LoadingSkeleton rows={2} />
          </div>
        ) : invitations.length === 0 ? (
          <p className="pt-4 text-xs text-slate-500">
            No invitations dispatched yet. Use Invite Team Member above to onboard officers.
          </p>
        ) : (
          <div className="divide-y divide-slate-100">
            {invitations.map((inv) => (
              <div
                key={inv.id}
                className="flex flex-col justify-between gap-3 py-3.5 sm:flex-row sm:items-center"
              >
                <div>
                  <p className="text-sm font-semibold text-slate-900">{inv.inviteeEmail}</p>
                  <p className="text-xs text-slate-500">
                    {CLUB_ROLE_LABELS[inv.intendedRole]} · {inv.title} · Expires{' '}
                    {new Date(inv.expiresAt).toLocaleString()}
                  </p>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <StatusLabel status={inv.status} />
                  {inv.status === 'pending' && (
                    <>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={resendMutation.isPending}
                        onClick={() => resendMutation.mutate(inv.id)}
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Resend
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        loading={revokeMutation.isPending}
                        onClick={() => revokeMutation.mutate(inv.id)}
                      >
                        <XCircle className="h-3.5 w-3.5 text-red-600" />
                        Revoke
                      </Button>
                    </>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Modal
        open={inviteOpen}
        onClose={() => setInviteOpen(false)}
        title="Invite Club Team Member"
        subtitle="Dispatch a secure single-use invitation link to an institutional email address"
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setInviteError(null);
            inviteMutation.mutate();
          }}
          className="space-y-4"
        >
          {inviteError && (
            <div
              role="alert"
              className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
            >
              {inviteError}
            </div>
          )}

          <Input
            label="Institutional Email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="e.g. coordinator@vitbhopal.ac.in"
          />
          <div className="grid gap-4 sm:grid-cols-2">
            {isPresidentOrSuper ? (
              <Select
                label="Club Role"
                value={role}
                onChange={(e) =>
                  setRole(e.target.value as 'core_member' | 'vice_president')
                }
                options={[
                  {label: 'Core Member (Scoped)', value: 'core_member'},
                  {label: 'Vice President (Club Officer)', value: 'vice_president'},
                ]}
              />
            ) : (
              <div className="space-y-1.5">
                <span className="block text-xs font-medium text-slate-700">Club Role</span>
                <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-medium text-slate-700">
                  Core Member (Scoped)
                </div>
              </div>
            )}
            <Input
              label="Officer Title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>

          {(!isPresidentOrSuper || role === 'core_member') && (
            <div className="space-y-2">
              <p className="text-xs font-medium text-slate-700">
                Select Delegated Permissions ({coreScannerCount}/{MAX_CORE_SCANNERS_PER_CLUB}{' '}
                scanners used)
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                {CORE_MEMBER_PERMISSIONS.map((perm) => {
                  const disabled =
                    perm === 'SCAN_ATTENDANCE' &&
                    scannerSlotsFull &&
                    !permissions.includes(perm);
                  return (
                    <label
                      key={perm}
                      className={`flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs text-slate-800 ${
                        disabled ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'
                      }`}
                    >
                      <input
                        type="checkbox"
                        disabled={disabled}
                        checked={permissions.includes(perm)}
                        onChange={() => toggleNewPerm(perm)}
                      />
                      <span>
                        {PERMISSION_LABELS[perm]}
                        {disabled ? ' (4/4 Full)' : ''}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setInviteOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={inviteMutation.isPending}>
              Send Invitation
            </Button>
          </div>
        </form>
      </Modal>

      <Modal
        open={Boolean(editingMember)}
        onClose={() => setEditingMember(null)}
        title="Update Officer Title"
        subtitle={editingMember ? `Updating role title for ${editingMember.userName}` : ''}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!editingMember || !editingTitle.trim()) return;
            updatePermsMutation.mutate({
              member: editingMember,
              nextTitle: editingTitle.trim(),
            });
          }}
          className="space-y-4"
        >
          <Input
            label="Officer Title"
            required
            value={editingTitle}
            onChange={(e) => setEditingTitle(e.target.value)}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setEditingMember(null)}>
              Cancel
            </Button>
            <Button type="submit" loading={updatePermsMutation.isPending}>
              Save Title
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
