import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {
  AlertTriangle,
  Camera,
  CameraOff,
  CheckCircle2,
  Download,
  QrCode,
  Search,
  UserCheck,
} from 'lucide-react';
import {useSearchParams} from 'react-router-dom';
import type {Registration} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {CameraQrScanner} from '../../components/qr/CameraQrScanner.tsx';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, Modal, StatusLabel} from '../../components/ui/Feedback.tsx';
import {PaginationBar} from '../../components/ui/PaginationBar.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';
import {useDebouncedValue} from '../../hooks/useDebouncedValue.ts';
import {triggerBlobDownload} from '../../lib/download.ts';

export const AttendancePage: React.FC = () => {
  const {activeClubId, hasPermission} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();

  const {data: events = []} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  const [selectedEventId, setSelectedEventId] = useState(searchParams.get('eventId') || '');
  const [scannerOpen, setScannerOpen] = useState(false);
  const [qrInput, setQrInput] = useState('');
  const [ledgerSearch, setLedgerSearch] = useState('');
  const [ledgerPage, setLedgerPage] = useState(1);
  const [exporting, setExporting] = useState(false);
  const [manualTarget, setManualTarget] = useState<Registration | null>(null);
  const [manualReason, setManualReason] = useState('');
  const [scanResult, setScanResult] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);

  const debouncedLedgerSearch = useDebouncedValue(ledgerSearch, 250);

  useEffect(() => {
    if (!selectedEventId && events.length > 0) {
      setSelectedEventId(events[0].id);
    }
  }, [events, selectedEventId]);

  useEffect(() => {
    setLedgerPage(1);
  }, [selectedEventId, debouncedLedgerSearch]);

  const {data: attendanceSummary, isLoading} = useQuery({
    queryKey: ['event-attendance', selectedEventId, ledgerPage, debouncedLedgerSearch],
    queryFn: () =>
      apiClient.getEventAttendance(selectedEventId, {
        page: ledgerPage,
        pageSize: 25,
        search: debouncedLedgerSearch,
      }),
    enabled: Boolean(selectedEventId),
  });

  const canViewRegs = hasPermission('VIEW_REGISTRATIONS');
  const {data: registrationsPage} = useQuery({
    queryKey: ['event-registrations-gate', selectedEventId],
    queryFn: () =>
      apiClient.listEventRegistrationsPaginated(selectedEventId, {
        page: 1,
        pageSize: 25,
      }),
    enabled: Boolean(selectedEventId) && canViewRegs,
  });

  const registrations = registrationsPage?.items || [];

  const scanMutation = useMutation({
    mutationFn: (payload: {
      qrToken?: string;
      registrationId?: string;
      method: 'qr_scan' | 'manual_override';
      reason?: string;
    }) =>
      payload.method === 'manual_override' && payload.registrationId && payload.reason
        ? apiClient.manualAttendance(selectedEventId, {
            registrationId: payload.registrationId,
            reason: payload.reason,
          })
        : apiClient.scanAttendance(selectedEventId, payload),
    onSuccess: async (record) => {
      setScanResult({
        ok: true,
        message: `Checked in ${record.studentName} (${record.qrToken}) via ${
          record.method === 'qr_scan' ? 'QR scan' : 'manual override'
        }.`,
      });
      setQrInput('');
      setManualTarget(null);
      setManualReason('');
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['event-attendance', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['event-registrations-gate', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['event-registrations', selectedEventId]}),
      ]);
      toast.success('Attendance recorded', `${record.studentName} verified`);
    },
    onError: (err) => {
      const message = err instanceof Error ? err.message : 'Verification failed';
      setScanResult({ok: false, message});
      toast.error('Check-in rejected', message);
    },
  });

  const handleTokenSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!qrInput.trim()) return;
    scanMutation.mutate({qrToken: qrInput.trim(), method: 'qr_scan'});
  };

  const handleManualSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualTarget || manualReason.trim().length < 5) return;
    scanMutation.mutate({
      registrationId: manualTarget.id,
      method: 'manual_override',
      reason: manualReason.trim(),
    });
  };

  const handleExportCsv = async () => {
    if (!selectedEventId) return;
    setExporting(true);
    try {
      const {blob, filename} = await apiClient.downloadEventCsv(selectedEventId, 'attendance');
      triggerBlobDownload(blob, filename);
      toast.success('Attendance CSV exported', filename);
    } catch (err) {
      toast.error(
        'Export failed',
        err instanceof Error ? err.message : 'Unable to export attendance CSV',
      );
    } finally {
      setExporting(false);
    }
  };

  const summary = attendanceSummary?.summary;
  const confirmedCount = summary?.confirmedCount ?? attendanceSummary?.registeredCount ?? 0;
  const ticketsReleasedCount = summary?.ticketsReleasedCount ?? 0;
  const ticketsNotReleasedCount = summary?.ticketsNotReleasedCount ?? 0;
  const attendedCount = summary?.attendedCount ?? attendanceSummary?.attendedCount ?? 0;
  const remainingCount = summary?.remainingCount ?? Math.max(0, confirmedCount - attendedCount);
  const attendancePct =
    summary?.attendancePercentage ??
    (confirmedCount > 0 ? Math.min(100, Math.round((attendedCount / confirmedCount) * 100)) : 0);

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Attendance &amp; QR Check-In Gate
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Scan released QR passes via camera, enter opaque tokens manually, or record audited manual
            overrides.
          </p>
        </div>

        <Button
          variant="outline"
          loading={exporting}
          disabled={!selectedEventId}
          onClick={() => void handleExportCsv()}
        >
          <Download className="h-4 w-4" />
          Export Attendance CSV
        </Button>
      </div>

      <Card className="p-4">
        <label htmlFor="attendance-event-select" className="block text-xs font-medium text-slate-500">
          Active Event Gate
        </label>
        <select
          id="attendance-event-select"
          value={selectedEventId}
          onChange={(e) => {
            setSelectedEventId(e.target.value);
            setScanResult(null);
          }}
          className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} ({ev.status})
            </option>
          ))}
        </select>
      </Card>

      {/* 6 Real-Time Attendance Metrics */}
      <div className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500">Confirmed</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {confirmedCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500">Tickets Released</p>
          <p className="mt-1 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
            {ticketsReleasedCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500">Not Released</p>
          <p className="mt-1 font-mono text-xl font-semibold text-amber-700 tabular-nums">
            {ticketsNotReleasedCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500">Checked In</p>
          <p className="mt-1 font-mono text-xl font-semibold text-violet-700 tabular-nums">
            {attendedCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500">Remaining</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {remainingCount}
          </p>
        </Card>
        <Card className="p-4">
          <p className="text-[11px] font-medium text-slate-500">Attendance %</p>
          <p className="mt-1 font-mono text-xl font-semibold text-slate-900 tabular-nums">
            {attendancePct}%
          </p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="space-y-4 p-6 lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2.5 text-violet-700">
              <QrCode className="h-5 w-5" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                QR Pass Verification
              </h2>
            </div>
            <Button
              type="button"
              size="sm"
              variant={scannerOpen ? 'outline' : 'secondary'}
              onClick={() => setScannerOpen((prev) => !prev)}
            >
              {scannerOpen ? (
                <>
                  <CameraOff className="h-3.5 w-3.5" />
                  Close QR Scanner
                </>
              ) : (
                <>
                  <Camera className="h-3.5 w-3.5" />
                  Open QR Scanner
                </>
              )}
            </Button>
          </div>

          {scannerOpen && (
            <CameraQrScanner
              disabled={!selectedEventId || scanMutation.isPending}
              onScanToken={(token) => scanMutation.mutate({qrToken: token, method: 'qr_scan'})}
            />
          )}

          <form onSubmit={handleTokenSubmit} className="space-y-3">
            <label className="block text-xs font-medium text-slate-700">
              Manual Token Entry
            </label>
            <input
              type="text"
              value={qrInput}
              onChange={(e) => setQrInput(e.target.value)}
              placeholder="CV-TCK-XXXXXXXX"
              aria-label="QR Verification Token"
              className="block w-full rounded-lg border border-slate-200 bg-white px-3.5 py-2.5 font-mono text-sm uppercase text-slate-900 focus:border-blue-600"
            />
            <Button
              type="submit"
              disabled={!selectedEventId}
              loading={scanMutation.isPending}
              className="w-full"
            >
              Verify &amp; Check In
            </Button>
          </form>

          {scanResult && (
            <div
              role="status"
              className={`flex items-start gap-2.5 rounded-lg border p-3.5 text-xs ${
                scanResult.ok
                  ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                  : 'border-red-200 bg-red-50 text-red-900'
              }`}
            >
              {scanResult.ok ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-700" />
              ) : (
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-red-700" />
              )}
              <span>{scanResult.message}</span>
            </div>
          )}

          <div className="border-t border-slate-100 pt-5">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-medium text-slate-500">Gate Turnout</span>
              <span className="font-mono text-sm font-semibold text-slate-900 tabular-nums">
                {attendedCount} / {confirmedCount} ({attendancePct}%)
              </span>
            </div>
            <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className="h-full bg-violet-700 transition-all"
                style={{width: `${attendancePct}%`}}
              />
            </div>
          </div>
        </Card>

        <div className="space-y-6 lg:col-span-7">
          {canViewRegs && registrations.length > 0 && (
            <Card className="p-6">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Registered Participants (Quick Simulate &amp; Manual Fallback)
              </h2>
              <div className="mt-3 divide-y divide-slate-100">
                {registrations.map((reg) => {
                  const alreadyCheckedIn =
                    Boolean(reg.qrUsedAt) ||
                    reg.attendanceStatus === 'present' ||
                    reg.status === 'attended';
                  const hasReleasedTicket = reg.ticketStatus === 'released' && Boolean(reg.qrToken);
                  const canManualCheckIn =
                    !alreadyCheckedIn &&
                    reg.status !== 'waitlisted' &&
                    reg.status !== 'cancelled';
                  const canQrCheckIn = canManualCheckIn && hasReleasedTicket;

                  return (
                    <div
                      key={reg.id}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="text-sm font-medium text-slate-900">{reg.studentName}</p>
                        <p className="font-mono text-xs text-slate-500">
                          {hasReleasedTicket
                            ? reg.ticketCode || reg.qrToken
                            : reg.ticketStatus === 'revoked'
                              ? 'Ticket revoked'
                              : 'Ticket not released'}
                        </p>
                      </div>
                      <div className="flex items-center gap-2">
                        <StatusLabel status={alreadyCheckedIn ? 'attended' : reg.status} />
                        <Button
                          size="sm"
                          variant="outline"
                          disabled={!canQrCheckIn || scanMutation.isPending}
                          onClick={() =>
                            scanMutation.mutate({qrToken: reg.qrToken, method: 'qr_scan'})
                          }
                        >
                          <QrCode className="h-3.5 w-3.5" />
                          Scan
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          disabled={!canManualCheckIn || scanMutation.isPending}
                          onClick={() => {
                            setManualTarget(reg);
                            setManualReason('');
                          }}
                        >
                          <UserCheck className="h-3.5 w-3.5" />
                          Manual
                        </Button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          <Card className="overflow-hidden">
            <div className="flex flex-col justify-between gap-3 border-b border-slate-200 px-6 py-4 sm:flex-row sm:items-center">
              <h2 className="font-display text-base font-semibold text-slate-900">
                Verified Check-In Ledger
              </h2>
              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  value={ledgerSearch}
                  onChange={(e) => setLedgerSearch(e.target.value)}
                  placeholder="Search checked-in students..."
                  aria-label="Search checked-in ledger"
                  className="w-full rounded-lg border border-slate-200 bg-white py-1.5 pl-8 pr-3 text-xs text-slate-900"
                />
              </div>
            </div>
            {isLoading ? (
              <div className="p-6">
                <LoadingSkeleton rows={2} />
              </div>
            ) : !attendanceSummary?.records.length ? (
              <p className="p-6 text-sm text-slate-500">
                No attendees checked in yet for this event.
              </p>
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-sm">
                    <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                      <tr>
                        <th className="px-6 py-3">Student</th>
                        <th className="px-6 py-3">QR Token</th>
                        <th className="px-6 py-3">Method &amp; Notes</th>
                        <th className="px-6 py-3 text-right">Checked In</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {attendanceSummary.records.map((rec) => (
                        <tr key={rec.id}>
                          <td className="px-6 py-3 font-medium text-slate-900">
                            {rec.studentName}
                          </td>
                          <td className="px-6 py-3 font-mono text-xs text-slate-600">
                            {rec.qrToken}
                          </td>
                          <td className="px-6 py-3 text-xs text-slate-600">
                            <div>
                              {rec.method === 'qr_scan' ? 'QR Scan' : 'Manual Override'}
                            </div>
                            {rec.manualReason && (
                              <div className="mt-0.5 text-slate-500">{rec.manualReason}</div>
                            )}
                          </td>
                          <td className="px-6 py-3 text-right font-mono text-xs text-slate-500 tabular-nums">
                            {new Date(rec.checkedInAt).toLocaleTimeString()}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <PaginationBar
                  pagination={attendanceSummary.pagination}
                  onPageChange={setLedgerPage}
                />
              </>
            )}
          </Card>
        </div>
      </div>

      <Modal
        open={Boolean(manualTarget)}
        onClose={() => setManualTarget(null)}
        title="Manual Attendance Override"
        subtitle={
          manualTarget
            ? `Record verified manual check-in for ${manualTarget.studentName}`
            : undefined
        }
      >
        <form onSubmit={handleManualSubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label htmlFor="manual-override-reason" className="block text-xs font-medium text-slate-700">
              Audit Reason (minimum 5 characters) *
            </label>
            <textarea
              id="manual-override-reason"
              rows={3}
              required
              minLength={5}
              value={manualReason}
              onChange={(e) => setManualReason(e.target.value)}
              placeholder="e.g., Student phone battery died; verified university ID card at venue gate"
              className="block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={() => setManualTarget(null)}>
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={manualReason.trim().length < 5}
              loading={scanMutation.isPending}
            >
              Confirm Manual Check-In
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
};
