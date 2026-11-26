import React, {useState} from 'react';
import {zodResolver} from '@hookform/resolvers/zod';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  Building2,
  Edit3,
  Instagram,
  MailPlus,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  Users,
  XCircle,
} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {useSearchParams} from 'react-router-dom';
import {z} from 'zod';
import {
  CLUB_CATEGORIES,
  CLUB_ROLE_LABELS,
  CORE_MEMBER_PERMISSIONS,
  PERMISSION_LABELS,
  type CoreMemberPermission,
} from '../../../shared/constants/permissions.ts';
import {createClubSchema, updateClubSchema} from '../../../shared/schemas/validation.ts';
import type {Club, ClubMembership, ClubRole, ClubStatus} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {ClubLogo, LoadingSkeleton, Modal, SafeExternalLink, StatusLabel} from '../../components/ui/Feedback.tsx';
import {Card, Input, Select, Textarea} from '../../components/ui/FormControls.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

type CreateClubValues = z.input<typeof createClubSchema>;
type EditClubValues = z.input<typeof updateClubSchema>;

export const AdminClubsPage: React.FC = () => {
  const {toast, confirm} = useToast();
  const {refreshSession} = useAuth();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [createOpen, setCreateOpen] = useState(false);
  const [selectedClub, setSelectedClub] = useState<Club | null>(null);
  const [editingClub, setEditingClub] = useState<Club | null>(null);
  const [managingClub, setManagingClub] = useState<Club | null>(null);

  const [leaderEmail, setLeaderEmail] = useState('');
  const [leaderRole, setLeaderRole] = useState<'president' | 'vice_president'>('president');
  const [leaderTitle, setLeaderTitle] = useState('Club President');
  const [replaceExisting, setReplaceExisting] = useState(true);

  const [coreEmail, setCoreEmail] = useState('');
  const [coreTitle, setCoreTitle] = useState('Core Coordinator');
  const [corePerms, setCorePerms] = useState<CoreMemberPermission[]>([
    'MANAGE_EVENTS',
    'VIEW_REGISTRATIONS',
    'SCAN_ATTENDANCE',
  ]);
  const [leaderError, setLeaderError] = useState<string | null>(null);

  const {data: clubs = [], isLoading} = useQuery({
    queryKey: ['admin-clubs'],
    queryFn: () => apiClient.listAdminClubs(),
  });

  const {data: analytics} = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => apiClient.getAdminAnalytics(),
  });

  const clubOverviewMap = new Map(
    (analytics?.clubs || []).map((item) => [item.club.id, item]),
  );

  const {data: managingTeam = [], isLoading: teamLoading} = useQuery({
    queryKey: ['club-team', managingClub?.id],
    queryFn: () => apiClient.getClubTeam(managingClub!.id),
    enabled: Boolean(managingClub?.id),
  });

  const {data: clubInvitations = [], isLoading: invitationsLoading} = useQuery({
    queryKey: ['club-invitations', managingClub?.id],
    queryFn: () => apiClient.listClubInvitations(managingClub!.id),
    enabled: Boolean(managingClub?.id),
  });

  const {
    register,
    handleSubmit,
    reset,
    formState: {errors, isSubmitting},
  } = useForm<CreateClubValues>({
    resolver: zodResolver(createClubSchema),
    defaultValues: {category: 'Technology', foundedYear: new Date().getFullYear()},
  });

  const {
    register: registerEdit,
    handleSubmit: handleEditSubmit,
    formState: {errors: editErrors, isSubmitting: isEditSubmitting},
  } = useForm<EditClubValues>({
    resolver: zodResolver(updateClubSchema),
    values: editingClub
      ? {
          name: editingClub.name,
          slug: editingClub.slug,
          category: editingClub.category,
          tagline: editingClub.tagline,
          description: editingClub.description,
          meetingSchedule: editingClub.meetingSchedule,
          contactEmail: editingClub.contactEmail,
          instagramUrl: editingClub.instagramUrl || '',
        }
      : undefined,
  });

  const invalidateClubCaches = async (clubId?: string) => {
    await Promise.all([
      queryClient.invalidateQueries({queryKey: ['admin-clubs']}),
      queryClient.invalidateQueries({queryKey: ['admin-analytics']}),
      queryClient.invalidateQueries({queryKey: ['admin-dashboard']}),
      queryClient.invalidateQueries({queryKey: ['admin-audit-logs']}),
      queryClient.invalidateQueries({queryKey: ['clubs']}),
      queryClient.invalidateQueries({queryKey: ['hall-of-fame']}),
      ...(clubId
        ? [
            queryClient.invalidateQueries({queryKey: ['club', clubId]}),
            queryClient.invalidateQueries({queryKey: ['club-team', clubId]}),
            queryClient.invalidateQueries({queryKey: ['club-invitations', clubId]}),
          ]
        : []),
    ]);
  };

  const createMutation = useMutation({
    mutationFn: (vals: CreateClubValues) => {
      const parsed = createClubSchema.parse(vals);
      return apiClient.createClub({
        ...parsed,
        slug: parsed.slug || undefined,
      });
    },
    onSuccess: async (club) => {
      setCreateOpen(false);
      reset();
      await invalidateClubCaches(club.id);
      toast.success('Club charter registered');
    },
    onError: (err) => {
      toast.error('Failed to register club', err instanceof Error ? err.message : undefined);
    },
  });

  const editMutation = useMutation({
    mutationFn: (vars: {clubId: string; values: EditClubValues}) => {
      const parsed = updateClubSchema.parse(vars.values);
      return apiClient.updateClub(vars.clubId, parsed);
    },
    onSuccess: async (updated) => {
      setEditingClub(null);
      await invalidateClubCaches(updated.id);
      toast.success(`Updated ${updated.name}`);
    },
    onError: (err) => {
      toast.error('Failed to update club', err instanceof Error ? err.message : undefined);
    },
  });

  const statusMutation = useMutation({
    mutationFn: (vars: {clubId: string; status: ClubStatus}) =>
      apiClient.updateClubStatus(vars.clubId, vars.status),
    onSuccess: async (updated) => {
      await invalidateClubCaches(updated.id);
      toast.success(`${updated.name} status set to ${updated.status}`);
    },
    onError: (err) => {
      toast.error('Status change failed', err instanceof Error ? err.message : undefined);
    },
  });

  const assignLeadershipMutation = useMutation({
    mutationFn: () =>
      apiClient.assignClubLeadership(managingClub!.id, {
        email: leaderEmail.trim(),
        role: leaderRole,
        title: leaderTitle.trim() || CLUB_ROLE_LABELS[leaderRole],
        replaceExisting,
        sendInvitation: true,
      }),
    onSuccess: async (result) => {
      setLeaderError(null);
      setLeaderEmail('');
      await Promise.all([refreshSession(), invalidateClubCaches(managingClub!.id)]);
      if (result.mode === 'assigned') {
        toast.success(
          `${CLUB_ROLE_LABELS[leaderRole]} assigned`,
          result.replacedUserId
            ? 'Previous officer role was deactivated while preserving their user account.'
            : undefined,
        );
      } else {
        toast.success(
          `${CLUB_ROLE_LABELS[leaderRole]} invitation sent`,
          'A tokenized onboarding link was dispatched to their institutional email.',
        );
      }
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to assign leadership';
      setLeaderError(msg);
      toast.error('Leadership assignment failed', msg);
    },
  });

  const assignCoreMutation = useMutation({
    mutationFn: () =>
      apiClient.createClubInvitation(managingClub!.id, {
        email: coreEmail.trim(),
        role: 'core_member',
        title: coreTitle.trim() || 'Core Member',
        permissions: corePerms,
      }),
    onSuccess: async () => {
      setLeaderError(null);
      setCoreEmail('');
      await invalidateClubCaches(managingClub!.id);
      toast.success('Core member invitation sent');
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to invite core member';
      setLeaderError(msg);
      toast.error('Invitation failed', msg);
    },
  });

  const updateMemberRoleMutation = useMutation({
    mutationFn: (vars: {member: ClubMembership; nextRole: ClubRole}) =>
      apiClient.updateMemberPermissions(managingClub!.id, vars.member.id, {
        role: vars.nextRole,
        permissions:
          vars.nextRole === 'core_member' ? vars.member.permissions : [...CORE_MEMBER_PERMISSIONS],
      }),
    onSuccess: async () => {
      await Promise.all([refreshSession(), invalidateClubCaches(managingClub!.id)]);
      toast.success('Membership role updated');
    },
    onError: (err) => {
      toast.error('Role update failed', err instanceof Error ? err.message : undefined);
    },
  });

  const removeMemberMutation = useMutation({
    mutationFn: (membershipId: string) =>
      apiClient.removeClubMember(managingClub!.id, membershipId),
    onSuccess: async () => {
      await Promise.all([refreshSession(), invalidateClubCaches(managingClub!.id)]);
      toast.info('Removed member from club leadership');
    },
    onError: (err) => {
      toast.error('Failed to remove member', err instanceof Error ? err.message : undefined);
    },
  });

  const resendInviteMutation = useMutation({
    mutationFn: (invitationId: string) =>
      apiClient.resendClubInvitation(managingClub!.id, invitationId),
    onSuccess: async () => {
      await invalidateClubCaches(managingClub!.id);
      toast.success('Invitation resent');
    },
    onError: (err) => {
      toast.error('Failed to resend', err instanceof Error ? err.message : undefined);
    },
  });

  const revokeInviteMutation = useMutation({
    mutationFn: (invitationId: string) =>
      apiClient.revokeClubInvitation(managingClub!.id, invitationId),
    onSuccess: async () => {
      await invalidateClubCaches(managingClub!.id);
      toast.info('Invitation revoked');
    },
    onError: (err) => {
      toast.error('Failed to revoke', err instanceof Error ? err.message : undefined);
    },
  });

  const handleStatusChange = async (club: Club, nextStatus: ClubStatus) => {
    const descriptions: Record<ClubStatus, string> = {
      active:
        'Activating this club makes it visible to all students for following, Hall of Fame ranking, and event registration.',
      inactive:
        'Deactivating this club hides it from student discovery and Hall of Fame while preserving existing history.',
      suspended:
        'Suspended clubs are hidden from student discovery and cannot publish new events or receive follows.',
      pending_review: 'Move club back into Student Affairs charter review queue.',
    };
    const confirmLabels: Record<ClubStatus, string> = {
      active: 'Approve & Activate',
      inactive: 'Deactivate Club',
      suspended: 'Suspend Club',
      pending_review: 'Move to Review',
    };
    const ok = await confirm({
      title: `Set ${club.name} to ${nextStatus.replace('_', ' ')}?`,
      description: descriptions[nextStatus],
      confirmLabel: confirmLabels[nextStatus],
      destructive: nextStatus === 'suspended' || nextStatus === 'inactive',
    });
    if (ok) statusMutation.mutate({clubId: club.id, status: nextStatus});
  };

  const filtered = clubs.filter((c) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      c.slug.toLowerCase().includes(q) ||
      c.category.toLowerCase().includes(q)
    );
  });

  const activePresident = managingTeam.find((m) => m.role === 'president');
  const activeVp = managingTeam.find((m) => m.role === 'vice_president');

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Club Directory &amp; Charter Administration
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Register clubs with unique slugs, assign Presidents &amp; Vice Presidents, and govern
            active/inactive/suspended status.
          </p>
        </div>

        <Button onClick={() => setCreateOpen(true)}>
          <Building2 className="h-4 w-4" />
          Charter New Club
        </Button>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search clubs by name, slug, or category..."
          className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900"
        />
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">Club</th>
                  <th className="px-5 py-3">Leadership &amp; Team</th>
                  <th className="px-5 py-3 text-right">Followers / Events</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((club) => {
                  const overview = clubOverviewMap.get(club.id);
                  return (
                  <tr key={club.id} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <ClubLogo name={club.name} logoUrl={club.logoUrl} size="sm" />
                        <div>
                          <button
                            type="button"
                            onClick={() => setSelectedClub(club)}
                            className="font-semibold text-slate-900 hover:text-violet-700 text-left"
                          >
                            {club.name}
                          </button>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono">{club.slug}</span>
                            <span>· {club.category}</span>
                            {club.instagramUrl && (
                              <SafeExternalLink
                                href={club.instagramUrl}
                                className="inline-flex items-center gap-1 font-medium text-pink-700 hover:underline"
                              >
                                <Instagram className="h-3 w-3" />
                                Instagram
                              </SafeExternalLink>
                            )}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-600">
                      <p>
                        <span className="font-medium text-slate-800">Pres:</span>{' '}
                        {overview?.presidentName || 'Vacant'}
                      </p>
                      <p className="mt-0.5">
                        <span className="font-medium text-slate-800">VP:</span>{' '}
                        {overview?.vicePresidentName || 'Vacant'} ·{' '}
                        <span className="font-mono">{overview?.activeCoreCount ?? 0} core</span>
                      </p>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-900 tabular-nums">
                      <div>{club.followerCount} followers</div>
                      <div className="text-slate-500">
                        {overview?.upcomingEventsCount ?? club.upcomingEventsCount} up ·{' '}
                        {overview?.completedEventsCount ?? 0} done
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusLabel status={club.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right">
                      <div className="inline-flex flex-wrap items-center justify-end gap-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingClub(club)}
                        >
                          <Edit3 className="h-3.5 w-3.5" />
                          Edit
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setLeaderError(null);
                            setManagingClub(club);
                          }}
                        >
                          <Users className="h-3.5 w-3.5" />
                          Leadership
                        </Button>
                        {club.status !== 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleStatusChange(club, 'active')}
                          >
                            Activate
                          </Button>
                        )}
                        {club.status === 'active' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleStatusChange(club, 'inactive')}
                          >
                            Deactivate
                          </Button>
                        )}
                        {club.status !== 'suspended' && (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void handleStatusChange(club, 'suspended')}
                          >
                            Suspend
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <Modal
        open={Boolean(selectedClub)}
        onClose={() => setSelectedClub(null)}
        title={selectedClub?.name || 'Club Details'}
        subtitle={
          selectedClub
            ? `${selectedClub.category} · /${selectedClub.slug} · Founded ${selectedClub.foundedYear}`
            : ''
        }
      >
        {selectedClub && (
          <div className="space-y-3 text-sm text-slate-600">
            <p className="font-medium text-slate-900">{selectedClub.tagline}</p>
            <p className="leading-relaxed">{selectedClub.description}</p>
            <p className="text-xs text-slate-500">
              Schedule: {selectedClub.meetingSchedule} · Contact: {selectedClub.contactEmail}
            </p>
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(editingClub)}
        onClose={() => setEditingClub(null)}
        title={`Edit ${editingClub?.name || 'Club'}`}
        subtitle="Update official club charter metadata, unique slug, and contact email"
      >
        {editingClub && (
          <form
            onSubmit={handleEditSubmit((vals) =>
              editMutation.mutate({clubId: editingClub.id, values: vals}),
            )}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-2">
              <Input label="Club Name" error={editErrors.name?.message} {...registerEdit('name')} />
              <Input
                label="Unique Slug"
                error={editErrors.slug?.message}
                hint="Lowercase letters, numbers, hyphens"
                {...registerEdit('slug')}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Select
                label="Category"
                error={editErrors.category?.message}
                options={CLUB_CATEGORIES.map((c) => ({label: c, value: c}))}
                {...registerEdit('category')}
              />
              <Input
                label="Contact Email"
                type="email"
                error={editErrors.contactEmail?.message}
                {...registerEdit('contactEmail')}
              />
            </div>
            <Input
              label="Tagline"
              error={editErrors.tagline?.message}
              {...registerEdit('tagline')}
            />
            <Textarea
              label="Charter Description"
              rows={3}
              error={editErrors.description?.message}
              {...registerEdit('description')}
            />
            <Input
              label="Meeting Schedule"
              error={editErrors.meetingSchedule?.message}
              {...registerEdit('meetingSchedule')}
            />
            <Input
              label="Instagram Profile (URL or @handle)"
              placeholder="https://www.instagram.com/clubhandle/"
              error={editErrors.instagramUrl?.message}
              {...registerEdit('instagramUrl')}
            />
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setEditingClub(null)}>
                Cancel
              </Button>
              <Button type="submit" loading={isEditSubmitting || editMutation.isPending}>
                Save Changes
              </Button>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={Boolean(managingClub)}
        onClose={() => setManagingClub(null)}
        title={`Club Leadership · ${managingClub?.name || ''}`}
        subtitle="Assign 1 President, 1 Vice President, and invite Core Members"
        maxWidth="max-w-3xl"
      >
        {managingClub && (
          <div className="space-y-6">
            {leaderError && (
              <div
                role="alert"
                className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800"
              >
                {leaderError}
              </div>
            )}

            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
                <p className="font-semibold text-slate-500">Current President (Max 1)</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {activePresident ? activePresident.userName : 'Vacant'}
                </p>
                {activePresident && (
                  <p className="text-slate-500">{activePresident.userEmail}</p>
                )}
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
                <p className="font-semibold text-slate-500">Current Vice President (Max 1)</p>
                <p className="mt-1 text-sm font-semibold text-slate-900">
                  {activeVp ? activeVp.userName : 'Vacant'}
                </p>
                {activeVp && <p className="text-slate-500">{activeVp.userEmail}</p>}
              </div>
            </div>

            {/* President / VP Leadership Assignment */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLeaderError(null);
                assignLeadershipMutation.mutate();
              }}
              className="space-y-3 rounded-xl border border-violet-200 bg-violet-50/30 p-4"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-violet-700" />
                <p className="text-xs font-semibold text-slate-900">
                  Assign or Replace President / Vice President
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-3">
                <Input
                  label="Institutional Email"
                  type="email"
                  required
                  value={leaderEmail}
                  onChange={(e) => setLeaderEmail(e.target.value)}
                  placeholder="president@vitbhopal.ac.in"
                />
                <Select
                  label="Executive Role"
                  value={leaderRole}
                  onChange={(e) => {
                    const next = e.target.value as 'president' | 'vice_president';
                    setLeaderRole(next);
                    setLeaderTitle(next === 'president' ? 'Club President' : 'Vice President');
                  }}
                  options={[
                    {label: 'President (Max 1)', value: 'president'},
                    {label: 'Vice President (Max 1)', value: 'vice_president'},
                  ]}
                />
                <Input
                  label="Official Title"
                  required
                  value={leaderTitle}
                  onChange={(e) => setLeaderTitle(e.target.value)}
                />
              </div>
              <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={replaceExisting}
                    onChange={(e) => setReplaceExisting(e.target.checked)}
                  />
                  <span>
                    Replace existing {CLUB_ROLE_LABELS[leaderRole]} if slot is occupied
                  </span>
                </label>
                <Button type="submit" size="sm" loading={assignLeadershipMutation.isPending}>
                  Assign {CLUB_ROLE_LABELS[leaderRole]}
                </Button>
              </div>
            </form>

            {/* Invite Core Member */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                setLeaderError(null);
                assignCoreMutation.mutate();
              }}
              className="space-y-3 rounded-xl border border-slate-200 bg-slate-50/60 p-4"
            >
              <div className="flex items-center gap-2">
                <MailPlus className="h-4 w-4 text-slate-700" />
                <p className="text-xs font-semibold text-slate-900">
                  Invite Core Member (Tokenized Email Onboarding)
                </p>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  label="Institutional Email"
                  type="email"
                  required
                  value={coreEmail}
                  onChange={(e) => setCoreEmail(e.target.value)}
                  placeholder="core.member@vitbhopal.ac.in"
                />
                <Input
                  label="Core Title"
                  required
                  value={coreTitle}
                  onChange={(e) => setCoreTitle(e.target.value)}
                />
              </div>
              <div className="grid gap-2 sm:grid-cols-3">
                {CORE_MEMBER_PERMISSIONS.map((perm) => (
                  <label
                    key={perm}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-800 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={corePerms.includes(perm)}
                      onChange={() =>
                        setCorePerms((prev) =>
                          prev.includes(perm) ? prev.filter((p) => p !== perm) : [...prev, perm],
                        )
                      }
                    />
                    <span>{PERMISSION_LABELS[perm]}</span>
                  </label>
                ))}
              </div>
              <div className="flex justify-end">
                <Button
                  type="submit"
                  size="sm"
                  variant="outline"
                  loading={assignCoreMutation.isPending}
                >
                  Send Core Member Invite
                </Button>
              </div>
            </form>

            {/* Active Roster */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Active Leadership Team ({managingTeam.length})
              </h3>
              {teamLoading ? (
                <LoadingSkeleton rows={2} />
              ) : managingTeam.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No leadership members assigned yet.</p>
              ) : (
                <div className="mt-3 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {managingTeam.map((member) => (
                    <div
                      key={member.id}
                      className="flex flex-col justify-between gap-3 px-4 py-3 sm:flex-row sm:items-center"
                    >
                      <div>
                        <p className="text-sm font-semibold text-slate-900">{member.userName}</p>
                        <p className="text-xs text-slate-500">
                          {member.userEmail} · {member.title} ·{' '}
                          <span className="font-medium text-violet-700">
                            {CLUB_ROLE_LABELS[member.role] || member.role}
                          </span>
                        </p>
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {member.role !== 'president' && (
                          <Button
                            size="sm"
                            variant="outline"
                            loading={updateMemberRoleMutation.isPending}
                            onClick={() =>
                              updateMemberRoleMutation.mutate({
                                member,
                                nextRole:
                                  member.role === 'vice_president'
                                    ? 'core_member'
                                    : 'vice_president',
                              })
                            }
                          >
                            {member.role === 'vice_president'
                              ? 'Move to Core'
                              : 'Promote to VP'}
                          </Button>
                        )}
                        <Button
                          size="sm"
                          variant="outline"
                          loading={removeMemberMutation.isPending}
                          onClick={() => removeMemberMutation.mutate(member.id)}
                        >
                          <Trash2 className="h-3.5 w-3.5 text-red-600" />
                          Remove
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Invitation Ledger */}
            <div>
              <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Invitations ({clubInvitations.length})
              </h3>
              {invitationsLoading ? (
                <LoadingSkeleton rows={2} />
              ) : clubInvitations.length === 0 ? (
                <p className="mt-2 text-xs text-slate-500">No invitations sent for this club.</p>
              ) : (
                <div className="mt-2 divide-y divide-slate-100 rounded-xl border border-slate-200">
                  {clubInvitations.map((inv) => (
                    <div
                      key={inv.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-2.5 text-xs"
                    >
                      <div>
                        <p className="font-semibold text-slate-900">{inv.inviteeEmail}</p>
                        <p className="text-slate-500">
                          {CLUB_ROLE_LABELS[inv.intendedRole]} · {inv.title} · Expires{' '}
                          {new Date(inv.expiresAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusLabel status={inv.status} />
                        {inv.status === 'pending' && (
                          <>
                            <Button
                              size="sm"
                              variant="outline"
                              loading={resendInviteMutation.isPending}
                              onClick={() => resendInviteMutation.mutate(inv.id)}
                            >
                              <RefreshCw className="h-3 w-3" />
                              Resend
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              loading={revokeInviteMutation.isPending}
                              onClick={() => revokeInviteMutation.mutate(inv.id)}
                            >
                              <XCircle className="h-3 w-3 text-red-600" />
                              Revoke
                            </Button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </Modal>

      <Modal
        open={createOpen}
        onClose={() => setCreateOpen(false)}
        title="Charter New Campus Club"
        subtitle="Create a new club record under institutional oversight"
      >
        <form
          onSubmit={handleSubmit((vals) => createMutation.mutate(vals))}
          className="space-y-4"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <Input label="Club Name" error={errors.name?.message} {...register('name')} />
            <Input
              label="Unique Slug (optional)"
              placeholder="auto-generated-from-name"
              error={errors.slug?.message}
              {...register('slug')}
            />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <Select
              label="Category"
              error={errors.category?.message}
              options={CLUB_CATEGORIES.map((c) => ({label: c, value: c}))}
              {...register('category')}
            />
            <Input
              label="Contact Email"
              type="email"
              error={errors.contactEmail?.message}
              {...register('contactEmail')}
            />
            <Input
              label="Founded Year"
              type="number"
              error={errors.foundedYear?.message}
              {...register('foundedYear')}
            />
          </div>
          <Input label="Tagline" error={errors.tagline?.message} {...register('tagline')} />
          <Textarea
            label="Charter Description"
            rows={3}
            error={errors.description?.message}
            {...register('description')}
          />
          <Input
            label="Meeting Schedule"
            error={errors.meetingSchedule?.message}
            {...register('meetingSchedule')}
          />
          <Input
            label="Instagram Profile (optional URL or @handle)"
            placeholder="https://www.instagram.com/clubhandle/"
            error={errors.instagramUrl?.message}
            {...register('instagramUrl')}
          />
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" loading={isSubmitting || createMutation.isPending}>
              <Building2 className="h-4 w-4" />
              Create Club
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
