import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowRight, Calendar, FileSpreadsheet, Instagram, QrCode, Users} from 'lucide-react';
import {Link} from 'react-router-dom';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {ClubLogo, LoadingSkeleton, SafeExternalLink, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';

export const ClubAdminDashboardPage: React.FC = () => {
  const {activeClubId} = useAuth();

  const {data: club, isLoading: clubLoading} = useQuery({
    queryKey: ['club', activeClubId],
    queryFn: () => apiClient.getClubDetail(activeClubId!),
    enabled: Boolean(activeClubId),
  });

  const {data: events = [], isLoading: eventsLoading} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  if (clubLoading || eventsLoading || !club) {
    return <LoadingSkeleton rows={4} />;
  }

  const upcomingCount = events.filter(
    (e) => e.status === 'published' || e.status === 'registration_open',
  ).length;
  const draftCount = events.filter((e) => e.status === 'draft').length;
  const totalRegistrations = events.reduce((acc, e) => acc + e.registeredCount, 0);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-center">
        <div className="flex items-center gap-4">
          <ClubLogo name={club.name} logoUrl={club.logoUrl} size="md" />
          <div>
            <p className="text-xs font-medium text-violet-700">Club Admin Workspace</p>
            <h1 className="font-display text-2xl font-bold text-slate-900">{club.name}</h1>
            <div className="mt-0.5 flex flex-wrap items-center gap-3 text-xs text-slate-500">
              <span>{club.category} · Scoped club governance</span>
              {club.instagramUrl && (
                <SafeExternalLink
                  href={club.instagramUrl}
                  className="inline-flex items-center gap-1 font-medium text-pink-700 hover:underline"
                >
                  <Instagram className="h-3.5 w-3.5" />
                  Instagram
                </SafeExternalLink>
              )}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/app/club-admin/events"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-800 whitespace-nowrap"
          >
            <Calendar className="h-3.5 w-3.5" />
            Manage Events
          </Link>
          <Link
            to="/app/club-admin/attendance"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <QrCode className="h-3.5 w-3.5" />
            Open QR Gate
          </Link>
        </div>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Club Followers</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {club.followerCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Verified student follows</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Upcoming Published</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {upcomingCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">{draftCount} draft events pending</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Club Events</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {events.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Published, draft, and completed</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Registrations</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {totalRegistrations}
          </p>
          <p className="mt-1 text-xs text-slate-500">Across club events</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Recent Club Events
            </h2>
            <Link
              to="/app/club-admin/events"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              All events
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {events.map((ev) => (
              <div key={ev.id} className="flex items-center justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">{ev.title}</p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {new Date(ev.startTime).toLocaleDateString()} · {ev.venue} ·{' '}
                    <span className="font-mono tabular-nums">
                      {ev.registeredCount}/{ev.capacity}
                    </span>
                  </p>
                </div>
                <StatusLabel status={ev.status} />
              </div>
            ))}
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-4">
          <Card className="p-6">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Pending Club Work
            </h2>
            <ul className="mt-3 space-y-2.5 text-xs text-slate-600">
              {draftCount > 0 && (
                <li className="flex items-center justify-between border-b border-slate-100 pb-2">
                  <span>{draftCount} draft event(s) ready to publish</span>
                  <Link to="/app/club-admin/events" className="font-medium text-blue-600">
                    Review
                  </Link>
                </li>
              )}
              <li className="flex items-center justify-between border-b border-slate-100 pb-2">
                <span>Team roster: {club.team.length} officers</span>
                <Link to="/app/club-admin/team" className="font-medium text-blue-600">
                  Manage
                </Link>
              </li>
              <li className="flex items-center justify-between">
                <span>Post-event outcome &amp; finance reports</span>
                <Link to="/app/club-admin/reports" className="font-medium text-blue-600">
                  Submit
                </Link>
              </li>
            </ul>
          </Card>

          <Card className="p-6 bg-slate-50/70">
            <h2 className="font-display text-sm font-semibold text-slate-900">Quick Actions</h2>
            <div className="mt-3 grid gap-2">
              <Link
                to="/app/club-admin/forms"
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <FileSpreadsheet className="h-4 w-4 text-violet-700" />
                  Registration Form Builder
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </Link>
              <Link
                to="/app/club-admin/team"
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <Users className="h-4 w-4 text-blue-600" />
                  Delegate Core Permissions
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </Link>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
};
