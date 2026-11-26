import React, {useEffect, useMemo, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Ban, CheckCircle2, Clock, Download, Search, Send, Ticket} from 'lucide-react';
import {useSearchParams} from 'react-router-dom';
import type {TicketRecord} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {EmptyState, LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {PaginationBar} from '../../components/ui/PaginationBar.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';
import {useDebouncedValue} from '../../hooks/useDebouncedValue.ts';
import {triggerBlobDownload} from '../../lib/download.ts';

export const ClubRegistrationsPage: React.FC = () => {
  const {activeClubId, hasPermission} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const [selectedEventId, setSelectedEventId] = useState(searchParams.get('eventId') || '');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState(false);

  const [releaseModalOpen, setReleaseModalOpen] = useState(false);
  const [releaseNote, setReleaseNote] = useState('');
  const [revokeTarget, setRevokeTarget] = useState<TicketRecord | null>(null);
  const [revokeReason, setRevokeReason] = useState('');

  const canManageTickets = hasPermission('MANAGE_EVENTS');
  const debouncedSearch = useDebouncedValue(search, 250);

  const {data: events = []} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    setPage(1);
  }, [selectedEventId, debouncedSearch, statusFilter]);

  const {data: regPage, isLoading} = useQuery({
    queryKey: ['event-registrations', selectedEventId, page, debouncedSearch, statusFilter],
    queryFn: () =>
      apiClient.listEventRegistrationsPaginated(selectedEventId, {
        page,
        pageSize: 25,
        search: debouncedSearch,
        status: statusFilter,
      }),
    enabled: Boolean(selectedEventId),
  });

  const {data: eventTickets = []} = useQuery({
    queryKey: ['event-tickets', selectedEventId],
    queryFn: () => apiClient.listEventTickets(selectedEventId),
    enabled: Boolean(selectedEventId),
  });

  const ticketByRegistrationId = useMemo(() => {
    const map = new Map<string, TicketRecord>();
    for (const t of eventTickets) {
      map.set(t.registrationId, t);
    }
    return map;
  }, [eventTickets]);

  const selectedEvent = events.find((e) => e.id === selectedEventId);
  const registrations = regPage?.items || [];

  const confirmedEligibleCount = useMemo(
    () =>
      eventTickets.filter(
        (t) =>
          (t.registrationStatus === 'confirmed' || t.registrationStatus === 'attended') &&
          t.status !== 'revoked',
      ).length || selectedEvent?.registeredCount || 0,
    [eventTickets, selectedEvent],
  );
  const ticketsReleasedCount = eventTickets.filter((t) => t.status === 'released').length;
  const ticketsNotReleasedCount = eventTickets.filter((t) => t.status === 'not_released').length;
  const ticketsRevokedCount = eventTickets.filter((t) => t.status === 'revoked').length;

  const releaseMutation = useMutation({
    mutationFn: () =>
      apiClient.releaseEventTickets(selectedEventId, {
        confirmParticipantCount: confirmedEligibleCount,
        note: releaseNote.trim() || undefined,
      }),
    onSuccess: async (summary) => {
      setReleaseModalOpen(false);
      setReleaseNote('');
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['event-tickets', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['event-registrations', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['event-attendance', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['club-events', activeClubId]}),
        queryClient.invalidateQueries({queryKey: ['notifications']}),
      ]);
      const deliverySuffix =
        summary.emailDelivery === 'not_configured'
          ? 'In-app tickets unlocked; SMTP email delivery is not configured in this environment.'
          : 'In-app and email notifications dispatched.';
      toast.success(
        `Released ${summary.releasedCount} new ticket(s) (${summary.totalReleased} total active)`,
        deliverySuffix,
      );
    },
    onError: (err) => {
      toast.error('Ticket release failed', err instanceof Error ? err.message : undefined);
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (vars: {ticketId: string; reason: string}) =>
      apiClient.revokeTicket(vars.ticketId, vars.reason),
    onSuccess: async () => {
      setRevokeTarget(null);
      setRevokeReason('');
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['event-tickets', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['event-registrations', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['event-attendance', selectedEventId]}),
      ]);
      toast.info('Ticket revoked', 'QR check-in is now blocked for that ticket.');
    },
    onError: (err) => {
      toast.error('Ticket revocation failed', err instanceof Error ? err.message : undefined);
    },
  });

  const handleExportCsv = async () => {
    if (!selectedEventId) return;
    setExporting(true);
    try {
      const {blob, filename} = await apiClient.downloadEventCsv(selectedEventId, 'registrations');
      triggerBlobDownload(blob, filename);
      toast.success('Registrations CSV exported', filename);
    } catch (err) {
      toast.error(
        'Export failed',
        err instanceof Error ? err.message : 'Unable to export registrations CSV',
      );
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Participant Directory &amp; Ticket Management
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Inspect registrations, release official QR entry tickets in batch, revoke individual passes,
            and export sanitized CSV rosters.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {canManageTickets && (
            <Button
              disabled={!selectedEventId || confirmedEligibleCount === 0}
              onClick={() => setReleaseModalOpen(true)}
            >
              <Send className="h-4 w-4" />
              Release Tickets
            </Button>
          )}
          <Button
            variant="outline"
            loading={exporting}
            disabled={!selectedEventId || (regPage?.pagination.total ?? 0) === 0}
            onClick={() => void handleExportCsv()}
          >
            <Download className="h-4 w-4" />
            Export CSV
          </Button>
        </div>
      </div>

      {selectedEvent && (
        <Card className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-6 text-xs">
              <div>
                <p className="text-slate-500">Confirmed / Attended</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-slate-900 tabular-nums">
                  {confirmedEligibleCount}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Tickets Released</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-emerald-700 tabular-nums">
                  {ticketsReleasedCount}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Pending Release</p>
                <p className="mt-0.5 font-mono text-base font-semibold text-amber-700 tabular-nums">
                  {ticketsNotReleasedCount}
                </p>
              </div>
              {ticketsRevokedCount > 0 && (
                <div>
                  <p className="text-slate-500">Revoked</p>
                  <p className="mt-0.5 font-mono text-base font-semibold text-red-700 tabular-nums">
                    {ticketsRevokedCount}
                  </p>
                </div>
              )}
            </div>
            <div className="text-right text-xs text-slate-500">
              {selectedEvent.ticketsReleasedAt ? (
                <span>
                  Tickets released on{' '}
                  <strong className="text-slate-800">
                    {new Date(selectedEvent.ticketsReleasedAt).toLocaleString()}
                  </strong>
                </span>
              ) : (
                <span>Tickets have not been released yet for this event</span>
              )}
            </div>
          </div>
        </Card>
      )}

      <div className="grid gap-3 md:grid-cols-12">
        <div className="md:col-span-5">
          <select
            aria-label="Select event"
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title} ({ev.registeredCount}/{ev.capacity}
                {ev.waitlistedCount ? ` · +${ev.waitlistedCount} waitlist` : ''})
              </option>
            ))}
          </select>
        </div>
        <div className="relative md:col-span-4">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Filter by name, email, or ticket..."
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900"
          />
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filter by registration status"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
          >
            <option value="all">All Statuses</option>
            <option value="confirmed">Confirmed</option>
            <option value="waitlisted">Waitlisted</option>
            <option value="attended">Attended</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : registrations.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-6 w-6" />}
          title="No participants found"
          description="Published events will list confirmed and waitlisted students here once registrations arrive."
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                <tr>
                  <th className="px-5 py-3">Participant</th>
                  <th className="px-5 py-3">Email</th>
                  <th className="px-5 py-3">Ticket Code</th>
                  <th className="px-5 py-3">Registration</th>
                  <th className="px-5 py-3">Ticket Status</th>
                  <th className="px-5 py-3">Attendance</th>
                  <th className="px-5 py-3 text-right">Actions / Date</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {registrations.map((reg) => {
                  const ticket = ticketByRegistrationId.get(reg.id);
                  const ticketStatus = ticket?.status || reg.ticketStatus || 'not_released';
                  const checkedIn =
                    Boolean(reg.qrUsedAt) ||
                    reg.attendanceStatus === 'present' ||
                    reg.status === 'attended';
                  return (
                    <tr key={reg.id} className="hover:bg-slate-50/70">
                      <td className="px-5 py-3.5 font-medium text-slate-900">{reg.studentName}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-600">{reg.studentEmail}</td>
                      <td className="px-5 py-3.5 font-mono text-xs text-slate-700">
                        {ticket?.ticketCode || reg.ticketCode || 'Pending release'}
                      </td>
                      <td className="px-5 py-3.5">
                        <div className="flex items-center gap-2">
                          <StatusLabel status={reg.status} />
                          {reg.status === 'waitlisted' && reg.waitlistPosition ? (
                            <span className="font-mono text-xs text-amber-800">
                              #{reg.waitlistPosition}
                            </span>
                          ) : null}
                        </div>
                      </td>
                      <td className="px-5 py-3.5">
                        <StatusLabel status={ticketStatus} />
                      </td>
                      <td className="px-5 py-3.5">
                        {checkedIn ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700 whitespace-nowrap">
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Checked In
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-xs text-slate-500 whitespace-nowrap">
                            <Clock className="h-3.5 w-3.5" />
                            Not Checked In
                          </span>
                        )}
                      </td>
                      <td className="px-5 py-3.5 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {canManageTickets && ticket && ticket.status === 'released' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                setRevokeTarget(ticket);
                                setRevokeReason('');
                              }}
                            >
                              <Ban className="h-3.5 w-3.5 text-red-600" />
                              Revoke
                            </Button>
                          )}
                          <span className="font-mono text-xs text-slate-500 tabular-nums">
                            {new Date(reg.createdAt).toLocaleDateString()}
                          </span>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <PaginationBar pagination={regPage?.pagination} onPageChange={setPage} />
        </Card>
      )}

      <Modal
        open={releaseModalOpen}
        onClose={() => setReleaseModalOpen(false)}
        title="Release Event Entry Tickets"
        subtitle={selectedEvent?.title}
      >
        <div className="space-y-4">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-xs text-slate-700 space-y-1.5">
            <p>
              Eligible confirmed participants:{' '}
              <strong className="font-mono text-slate-900">{confirmedEligibleCount}</strong>
            </p>
            <p>
              Already released:{' '}
              <strong className="font-mono text-emerald-700">{ticketsReleasedCount}</strong>
            </p>
            <p>
              Pending release:{' '}
              <strong className="font-mono text-amber-700">{ticketsNotReleasedCount}</strong>
            </p>
            <p className="pt-1 text-slate-500">
              Releasing tickets unlocks single-use opaque QR passes inside each confirmed student&apos;s
              dashboard and sends in-app notifications. Already released tickets remain unchanged.
            </p>
          </div>
          <div>
            <label htmlFor="ticket-release-note" className="block text-xs font-medium text-slate-700">
              Release Note (optional)
            </label>
            <input
              id="ticket-release-note"
              type="text"
              value={releaseNote}
              onChange={(e) => setReleaseNote(e.target.value)}
              placeholder="e.g., Gate opens 30 minutes prior at Auditorium Entrance B"
              className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setReleaseModalOpen(false)}>
              Cancel
            </Button>
            <Button loading={releaseMutation.isPending} onClick={() => releaseMutation.mutate()}>
              Confirm &amp; Release Tickets
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(revokeTarget)}
        onClose={() => setRevokeTarget(null)}
        title="Revoke Individual Ticket"
        subtitle={revokeTarget?.studentName || revokeTarget?.ticketCode}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!revokeTarget) return;
            revokeMutation.mutate({
              ticketId: revokeTarget.id,
              reason: revokeReason.trim() || 'Revoked by club organizer',
            });
          }}
          className="space-y-4"
        >
          <p className="text-xs text-slate-600">
            Revoking ticket <strong className="font-mono">{revokeTarget?.ticketCode}</strong> blocks
            QR code check-in immediately and hides the active QR pass from the student.
          </p>
          <div>
            <label htmlFor="ticket-revoke-reason" className="block text-xs font-medium text-slate-700">
              Revocation Reason *
            </label>
            <input
              id="ticket-revoke-reason"
              type="text"
              required
              minLength={3}
              value={revokeReason}
              onChange={(e) => setRevokeReason(e.target.value)}
              placeholder="e.g., Duplicate account registration"
              className="mt-1.5 block w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setRevokeTarget(null)}>
              Keep Active
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={revokeReason.trim().length < 3}
              loading={revokeMutation.isPending}
            >
              Revoke Ticket
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
