import React, {useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Calendar, CheckCircle2, Clock, MapPin, QrCode, Ticket} from 'lucide-react';
import {QRCodeSVG} from 'qrcode.react';
import {Link} from 'react-router-dom';
import type {Registration} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {EmptyState, LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const MyRegistrationsPage: React.FC = () => {
  const {user} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  const [selectedPass, setSelectedPass] = useState<Registration | null>(null);
  const [cancelTarget, setCancelTarget] = useState<Registration | null>(null);

  const {data: registrations = [], isLoading} = useQuery({
    queryKey: ['my-registrations', user?.id],
    queryFn: () => apiClient.listMyRegistrations(),
  });

  const cancelMutation = useMutation({
    mutationFn: (eventId: string) => apiClient.cancelMyRegistration(eventId),
    onSuccess: async (_res, eventId) => {
      setCancelTarget(null);
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['my-registrations']}),
        queryClient.invalidateQueries({queryKey: ['event', eventId]}),
        queryClient.invalidateQueries({queryKey: ['events']}),
        queryClient.invalidateQueries({queryKey: ['notifications']}),
      ]);
      toast.info('Registration cancelled', 'Seat released to the FIFO waitlist.');
    },
    onError: (err) => {
      toast.error('Cancellation failed', err instanceof Error ? err.message : undefined);
    },
  });

  const upcoming = registrations.filter(
    (r) => (r.status === 'confirmed' || r.status === 'waitlisted') && !r.qrUsedAt,
  );
  const past = registrations.filter(
    (r) => r.status === 'attended' || r.status === 'cancelled' || Boolean(r.qrUsedAt),
  );
  const activeList = tab === 'upcoming' ? upcoming : past;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">My Registrations</h1>
          <p className="mt-1 text-sm text-slate-600">
            Access your event tickets, non-PII QR passes, waitlist positions, and check-in history.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
          <button
            type="button"
            onClick={() => setTab('upcoming')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'upcoming' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upcoming ({upcoming.length})
          </button>
          <button
            type="button"
            onClick={() => setTab('past')}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              tab === 'past' ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Past ({past.length})
          </button>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={3} />
      ) : activeList.length === 0 ? (
        <EmptyState
          icon={<Ticket className="h-6 w-6" />}
          title={`No ${tab} registrations`}
          description="Explore upcoming campus events to reserve your spot and generate an entry pass."
          action={
            <Link
              to="/app/student/events"
              className="inline-flex items-center rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-800"
            >
              Browse Events
            </Link>
          }
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {activeList.map((reg) => {
            const checkedIn =
              Boolean(reg.qrUsedAt) ||
              reg.attendanceStatus === 'present' ||
              reg.status === 'attended';
            const canCancel =
              !checkedIn && (reg.status === 'confirmed' || reg.status === 'waitlisted');
            const isTicketReleased = reg.ticketStatus === 'released' && Boolean(reg.qrToken);

            return (
              <Card key={reg.id} className="p-6 flex flex-col justify-between">
                <div>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-medium text-violet-700">{reg.clubName}</span>
                    <div className="flex flex-wrap items-center gap-2.5">
                      <StatusLabel status={reg.status} />
                      <StatusLabel status={reg.ticketStatus || 'not_released'} />
                      {reg.status === 'waitlisted' && reg.waitlistPosition ? (
                        <span className="font-mono text-xs font-semibold text-amber-800">
                          #{reg.waitlistPosition}
                        </span>
                      ) : null}
                      {checkedIn ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                          <CheckCircle2 className="h-3.5 w-3.5" />
                          Checked In
                        </span>
                      ) : reg.status === 'confirmed' && isTicketReleased ? (
                        <span className="inline-flex items-center gap-1 text-xs text-slate-500">
                          <Clock className="h-3.5 w-3.5" />
                          Pending Scan
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <Link
                    to={`/app/student/events/${reg.eventId}`}
                    className="mt-2 block font-display text-base font-semibold text-slate-900 hover:text-violet-700"
                  >
                    {reg.eventTitle}
                  </Link>
                  <div className="mt-3 space-y-1 text-xs text-slate-500">
                    {reg.eventStartTime && (
                      <p className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>{new Date(reg.eventStartTime).toLocaleString()}</span>
                      </p>
                    )}
                    {reg.eventVenue && (
                      <p className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        <span>{reg.eventVenue}</span>
                      </p>
                    )}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
                  <span className="font-mono text-xs text-slate-600">
                    {isTicketReleased
                      ? reg.ticketCode || reg.qrToken
                      : reg.ticketStatus === 'revoked'
                        ? 'Ticket revoked'
                        : 'Ticket pending release'}
                  </span>
                  <div className="flex items-center gap-2">
                    {canCancel && (
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setCancelTarget(reg)}
                      >
                        Cancel
                      </Button>
                    )}
                    {isTicketReleased ? (
                      <Button size="sm" variant="outline" onClick={() => setSelectedPass(reg)}>
                        <QrCode className="h-3.5 w-3.5" />
                        Open QR Pass
                      </Button>
                    ) : (
                      <Link
                        to={`/app/student/events/${reg.eventId}`}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50"
                      >
                        View Status
                      </Link>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      <Modal
        open={Boolean(selectedPass)}
        onClose={() => setSelectedPass(null)}
        title={selectedPass?.eventTitle || 'Event QR Pass'}
        subtitle="Single-use opaque attendance token (contains zero personal PII)"
      >
        {selectedPass && (
          <div className="flex flex-col items-center text-center">
            {selectedPass.ticketStatus === 'released' && selectedPass.qrToken ? (
              <>
                <div className="rounded-xl border border-slate-200 bg-white p-5">
                  <QRCodeSVG value={selectedPass.qrToken} size={184} level="M" />
                </div>
                {selectedPass.ticketCode && (
                  <p className="mt-3 font-mono text-xs font-medium text-slate-600">
                    Ticket Code: {selectedPass.ticketCode}
                  </p>
                )}
                <p className="mt-1 font-mono text-base font-semibold text-slate-900">
                  {selectedPass.qrToken}
                </p>
              </>
            ) : (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
                {selectedPass.ticketStatus === 'revoked'
                  ? 'This ticket has been revoked by club organizers.'
                  : 'Tickets have not been released for this event yet.'}
              </div>
            )}
            <div className="mt-2 flex items-center gap-2">
              <StatusLabel status={selectedPass.status} />
              <StatusLabel status={selectedPass.ticketStatus || 'not_released'} />
              {selectedPass.status === 'waitlisted' && selectedPass.waitlistPosition ? (
                <span className="font-mono text-xs text-amber-800">
                  Waitlist #{selectedPass.waitlistPosition}
                </span>
              ) : null}
            </div>
            {selectedPass.qrUsedAt && (
              <p className="mt-2 text-xs text-slate-500">
                Checked in at {new Date(selectedPass.qrUsedAt).toLocaleString()}
              </p>
            )}
          </div>
        )}
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel Registration"
        subtitle={cancelTarget?.eventTitle}
      >
        <div className="space-y-4">
          <p className="text-sm text-slate-600">
            Cancelling releases your spot and automatically promotes the first student on the FIFO
            waitlist.
          </p>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setCancelTarget(null)}>
              Keep Registration
            </Button>
            <Button
              variant="danger"
              loading={cancelMutation.isPending}
              onClick={() => cancelTarget && cancelMutation.mutate(cancelTarget.eventId)}
            >
              Confirm Cancellation
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
};
