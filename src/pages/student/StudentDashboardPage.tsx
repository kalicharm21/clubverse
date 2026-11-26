import React, {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowRight, Award, Calendar, Compass, Ticket} from 'lucide-react';
import {Link} from 'react-router-dom';
import {MAX_FOLLOWED_CLUBS} from '../../../shared/constants/permissions.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {ClubLogo, LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';

export const StudentDashboardPage: React.FC = () => {
  const {user, followedClubIds} = useAuth();
  const [eventsPage, setEventsPage] = useState(1);

  const {data: clubs = [], isLoading: clubsLoading} = useQuery({
    queryKey: ['clubs'],
    queryFn: () => apiClient.listClubs(),
  });

  const {data: activeEventsResult, isLoading: eventsLoading} = useQuery({
    queryKey: ['events', 'upcoming', 'dashboard', eventsPage],
    queryFn: () => apiClient.listEventsPaginated({upcomingOnly: true, page: eventsPage, pageSize: 6}),
  });

  const {data: registrations = [], isLoading: regsLoading} = useQuery({
    queryKey: ['my-registrations', user?.id],
    queryFn: () => apiClient.listMyRegistrations(),
  });

  const {data: notifications = []} = useQuery({
    queryKey: ['notifications', user?.id],
    queryFn: () => apiClient.listNotifications(),
  });

  const events = activeEventsResult?.items ?? [];
  const eventsPagination = activeEventsResult?.pagination;
  const followedClubs = clubs.filter((c) => followedClubIds.includes(c.id));
  const upcomingRegistrations = registrations.filter(
    (r) => r.status !== 'attended' && r.status !== 'cancelled',
  );
  const releasedPassesCount = upcomingRegistrations.filter(
    (r) => r.ticketStatus === 'released' && Boolean(r.qrToken),
  ).length;
  const regByEventId = new Map(
    registrations.filter((r) => r.status !== 'cancelled').map((r) => [r.eventId, r]),
  );

  return (
    <div className="space-y-8">
      {/* Welcome & Student Summary */}
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-violet-700">
            {user?.department} · {user?.yearOfStudy} · {user?.studentId}
          </p>
          <h1 className="mt-1 font-display text-2xl font-bold tracking-tight text-slate-900 sm:text-3xl">
            Welcome back, {user?.name.split(' ')[0]}
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Track your followed clubs, active campus events, and released entry QR passes.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <Link
            to="/app/student/clubs"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-800 whitespace-nowrap"
          >
            <Compass className="h-3.5 w-3.5" />
            Explore Clubs
          </Link>
          <Link
            to="/app/student/events"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <Calendar className="h-3.5 w-3.5" />
            Browse Events
          </Link>
        </div>
      </div>

      {/* KPI Summary Strip */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Followed Clubs</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {followedClubIds.length} / {MAX_FOLLOWED_CLUBS}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {MAX_FOLLOWED_CLUBS - followedClubIds.length === 0
              ? 'Maximum club limit reached'
              : `${MAX_FOLLOWED_CLUBS - followedClubIds.length} slot remaining`}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Upcoming Registrations</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {upcomingRegistrations.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {releasedPassesCount} QR {releasedPassesCount === 1 ? 'pass' : 'passes'} released
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Active Campus Events</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {eventsPagination?.total ?? events.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Published across active clubs</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Total Registrations</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {registrations.length}
          </p>
          <p className="mt-1 text-xs text-slate-500">Across upcoming and past terms</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        {/* Followed Clubs & Active Events */}
        <div className="space-y-6 lg:col-span-8">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Active Events
              </h2>
              <Link
                to="/app/student/events"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                View all events
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {eventsLoading ? (
              <div className="mt-4">
                <LoadingSkeleton rows={3} />
              </div>
            ) : events.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No active campus events right now.</p>
            ) : (
              <>
                <div className="mt-4 divide-y divide-slate-100">
                  {events.map((ev) => {
                    const myReg = regByEventId.get(ev.id);
                    const seatsLeft = Math.max(0, ev.capacity - ev.registeredCount);
                    return (
                      <Link
                        key={ev.id}
                        to={`/app/student/events/${ev.id}`}
                        className="flex flex-col justify-between gap-3 py-3.5 hover:bg-slate-50/70 -mx-2 px-2 rounded-lg transition-colors sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <p className="truncate text-sm font-semibold text-slate-900">{ev.title}</p>
                            <StatusLabel status={ev.status} />
                          </div>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {ev.clubName} · {ev.category} · {new Date(ev.startTime).toLocaleDateString()} · {ev.venue}
                          </p>
                        </div>
                        <div className="flex items-center gap-3 shrink-0">
                          {myReg && (
                            <StatusLabel
                              status={
                                myReg.ticketStatus === 'released'
                                  ? 'released'
                                  : myReg.status
                              }
                            />
                          )}
                          <span className="font-mono text-xs font-medium text-slate-600 tabular-nums">
                            {seatsLeft > 0 ? `${seatsLeft} seats left` : 'Waitlist open'}
                          </span>
                        </div>
                      </Link>
                    );
                  })}
                </div>
                {eventsPagination && eventsPagination.totalPages > 1 && (
                  <div className="mt-4 flex items-center justify-between border-t border-slate-100 pt-3">
                    <span className="text-xs text-slate-500">
                      Page {eventsPagination.page} of {eventsPagination.totalPages}
                    </span>
                    <div className="flex items-center gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={eventsPagination.page <= 1}
                        onClick={() => setEventsPage((p) => Math.max(1, p - 1))}
                      >
                        Previous
                      </Button>
                      <Button
                        size="sm"
                        variant="outline"
                        disabled={eventsPagination.page >= eventsPagination.totalPages}
                        onClick={() => setEventsPage((p) => p + 1)}
                      >
                        Next
                      </Button>
                    </div>
                  </div>
                )}
              </>
            )}
          </Card>

          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Followed Clubs ({followedClubs.length}/{MAX_FOLLOWED_CLUBS})
              </h2>
              <Link
                to="/app/student/clubs"
                className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                Manage clubs
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            {clubsLoading ? (
              <div className="mt-4">
                <LoadingSkeleton rows={2} />
              </div>
            ) : followedClubs.length === 0 ? (
              <p className="mt-4 text-sm text-slate-600">
                You are not following any clubs yet. Follow up to {MAX_FOLLOWED_CLUBS} clubs to
                track their events.
              </p>
            ) : (
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                {followedClubs.map((club) => (
                  <Link
                    key={club.id}
                    to={`/app/student/clubs/${club.id}`}
                    className="flex items-start gap-3.5 rounded-xl border border-slate-200 p-4 hover:border-violet-300 transition-colors"
                  >
                    <ClubLogo name={club.name} logoUrl={club.logoUrl} size="md" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-slate-900">{club.name}</p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {club.category} · {club.upcomingEventsCount} upcoming
                      </p>
                      <p className="mt-1.5 line-clamp-2 text-xs text-slate-600">{club.tagline}</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </Card>
        </div>

        {/* Announcements, Recent Registrations, Quick Actions */}
        <div className="space-y-6 lg:col-span-4">
          <Card className="p-6">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Recent Registrations
              </h2>
              <Link
                to="/app/student/registrations"
                className="text-xs font-medium text-blue-600 hover:text-blue-700"
              >
                All passes
              </Link>
            </div>
            {regsLoading ? (
              <div className="mt-4">
                <LoadingSkeleton rows={2} />
              </div>
            ) : registrations.length === 0 ? (
              <p className="mt-4 text-xs text-slate-500">No event registrations yet.</p>
            ) : (
              <div className="mt-4 space-y-3">
                {registrations.slice(0, 3).map((reg) => (
                  <div key={reg.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <p className="text-sm font-medium text-slate-900">{reg.eventTitle}</p>
                    <div className="mt-1 flex flex-wrap items-center justify-between gap-2">
                      <span className="font-mono text-xs text-slate-500">
                        {reg.ticketStatus === 'released' && reg.qrToken
                          ? reg.ticketCode || reg.qrToken
                          : reg.ticketStatus === 'revoked'
                            ? 'Ticket revoked'
                            : 'Ticket pending release'}
                      </span>
                      <StatusLabel status={reg.status} />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>

          <Card className="p-6">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Latest Announcements
            </h2>
            <div className="mt-4 space-y-3">
              {notifications.length === 0 ? (
                <p className="text-xs text-slate-500">No announcements at this time.</p>
              ) : (
                notifications.slice(0, 3).map((item) => (
                  <div key={item.id} className="border-b border-slate-100 pb-3 last:border-0 last:pb-0">
                    <p className="text-xs font-semibold text-slate-900">{item.title}</p>
                    <p className="mt-0.5 text-xs text-slate-600">{item.message}</p>
                  </div>
                ))
              )}
            </div>
          </Card>

          <Card className="p-6 bg-slate-50/70">
            <h2 className="font-display text-sm font-semibold text-slate-900">Quick Shortcuts</h2>
            <div className="mt-3 grid gap-2">
              <Link
                to="/app/student/hall-of-fame"
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <Award className="h-4 w-4 text-violet-700" />
                  Club Hall of Fame
                </span>
                <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
              </Link>
              <Link
                to="/app/student/registrations"
                className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 text-xs font-medium text-slate-800 hover:bg-slate-50"
              >
                <span className="inline-flex items-center gap-2">
                  <Ticket className="h-4 w-4 text-blue-600" />
                  Open QR Entry Passes
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
