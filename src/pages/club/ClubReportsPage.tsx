import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {AlertCircle, DollarSign, ExternalLink, FileText, History, Plus, Trash2} from 'lucide-react';
import type {FinanceEntryType, FinancialLineItem} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input, Select, Textarea} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, SafeExternalLink, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

function formatInr(amount: number): string {
  return `INR ${amount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

export const ClubReportsPage: React.FC = () => {
  const {activeClubId, hasPermission} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();

  const canSubmitEventReport = hasPermission('SUBMIT_EVENT_REPORTS');
  const canSubmitFinanceReport = hasPermission('SUBMIT_FINANCE_REPORTS');

  const {data: events = [], isLoading: eventsLoading} = useQuery({
    queryKey: ['club-events', activeClubId],
    queryFn: () => apiClient.listEvents({clubId: activeClubId!}),
    enabled: Boolean(activeClubId),
  });

  const [selectedEventId, setSelectedEventId] = useState('');
  useEffect(() => {
    if (!selectedEventId && events.length > 0) setSelectedEventId(events[0].id);
  }, [events, selectedEventId]);

  const {data: existingEventReport} = useQuery({
    queryKey: ['event-report', selectedEventId],
    queryFn: () => apiClient.getEventReport(selectedEventId),
    enabled: Boolean(selectedEventId) && canSubmitEventReport,
  });

  const {data: existingFinanceReport} = useQuery({
    queryKey: ['finance-report', selectedEventId],
    queryFn: () => apiClient.getFinancialReport(selectedEventId),
    enabled: Boolean(selectedEventId) && canSubmitFinanceReport,
  });

  const {data: clubFinance, isLoading: financeLoading} = useQuery({
    queryKey: ['club-finance', activeClubId],
    queryFn: () => apiClient.getClubFinance(activeClubId!),
    enabled: Boolean(activeClubId) && canSubmitFinanceReport,
  });

  // Event Report State
  const [objectives, setObjectives] = useState('');
  const [actualEventDate, setActualEventDate] = useState('');
  const [participationSummary, setParticipationSummary] = useState('');
  const [outcomeSummary, setOutcomeSummary] = useState('');
  const [outcomes, setOutcomes] = useState('');
  const [highlights, setHighlights] = useState('');
  const [challenges, setChallenges] = useState('');
  const [feedbackObservations, setFeedbackObservations] = useState('');
  const [evidenceUrl, setEvidenceUrl] = useState('');
  const [actualAttendance, setActualAttendance] = useState(0);
  const [completionStatus, setCompletionStatus] = useState<'completed' | 'partial'>('completed');

  useEffect(() => {
    const selectedEv = events.find((e) => e.id === selectedEventId);
    if (existingEventReport) {
      setObjectives(existingEventReport.objectives || '');
      setActualEventDate(
        existingEventReport.actualEventDate
          ? existingEventReport.actualEventDate.slice(0, 10)
          : selectedEv?.startTime.slice(0, 10) || '',
      );
      setParticipationSummary(existingEventReport.participationSummary || '');
      setOutcomeSummary(existingEventReport.outcomeSummary);
      setOutcomes(existingEventReport.outcomes || '');
      setHighlights(existingEventReport.highlights);
      setChallenges(existingEventReport.challenges);
      setFeedbackObservations(existingEventReport.feedbackObservations || '');
      setEvidenceUrl(existingEventReport.evidenceUrl || '');
      setActualAttendance(existingEventReport.actualAttendance);
      setCompletionStatus(existingEventReport.completionStatus);
    } else {
      setObjectives('');
      setActualEventDate(selectedEv?.startTime.slice(0, 10) || new Date().toISOString().slice(0, 10));
      setParticipationSummary('');
      setOutcomeSummary('');
      setOutcomes('');
      setHighlights('');
      setChallenges('');
      setFeedbackObservations('');
      setEvidenceUrl('');
      setActualAttendance(selectedEv?.attendedCount || 0);
      setCompletionStatus('completed');
    }
  }, [existingEventReport, selectedEventId, events]);

  // Ledger Entry State
  const [entryType, setEntryType] = useState<FinanceEntryType>('income');
  const [entryEventId, setEntryEventId] = useState<string>('club_general');
  const [sourceOrCategory, setSourceOrCategory] = useState('Sponsorship');
  const [entryDescription, setEntryDescription] = useState('');
  const [amountRupees, setAmountRupees] = useState('');
  const [transactionDate, setTransactionDate] = useState(new Date().toISOString().slice(0, 10));
  const [vendorOrRecipient, setVendorOrRecipient] = useState('');
  const [receiptUrl, setReceiptUrl] = useState('');
  const [entryNotes, setEntryNotes] = useState('');

  // Itemized Event Finance Report State
  const [lineItems, setLineItems] = useState<FinancialLineItem[]>([
    {
      id: 'li-init-1',
      type: 'collection',
      label: 'Registration Fee Collections',
      category: 'Registrations',
      amount: 0,
    },
  ]);
  const [financeNotes, setFinanceNotes] = useState('');

  useEffect(() => {
    if (existingFinanceReport) {
      setLineItems(existingFinanceReport.lineItems);
      setFinanceNotes(existingFinanceReport.notes);
    } else {
      setLineItems([
        {
          id: `li-${Date.now()}`,
          type: 'collection',
          label: 'Registration Fee Collections',
          category: 'Registrations',
          amount: 0,
        },
      ]);
      setFinanceNotes('');
    }
  }, [existingFinanceReport, selectedEventId]);

  const eventReportMutation = useMutation({
    mutationFn: (submitStatus: 'draft' | 'submitted') =>
      apiClient.submitEventReport(selectedEventId, {
        objectives: objectives.trim() || undefined,
        actualEventDate: actualEventDate || undefined,
        participationSummary: participationSummary.trim() || undefined,
        outcomeSummary,
        outcomes: outcomes.trim() || undefined,
        highlights,
        challenges: challenges || 'None reported',
        feedbackObservations: feedbackObservations.trim() || undefined,
        evidenceUrl: evidenceUrl.trim() || undefined,
        actualAttendance: Number(actualAttendance),
        completionStatus,
        status: submitStatus,
      }),
    onSuccess: async (_rep, submitStatus) => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['event-report', selectedEventId]}),
        queryClient.invalidateQueries({queryKey: ['club-events', activeClubId]}),
      ]);
      toast.success(
        submitStatus === 'draft' ? 'Event report saved as draft' : 'Event report submitted for review',
      );
    },
    onError: (err) => {
      toast.error('Failed to save event report', err instanceof Error ? err.message : undefined);
    },
  });

  const createLedgerEntryMutation = useMutation({
    mutationFn: async () => {
      const parsedRupees = Number(amountRupees);
      if (!Number.isFinite(parsedRupees) || parsedRupees < 0) {
        throw new Error('Enter a valid non-negative INR amount');
      }
      const amountMinorUnits = Math.round(parsedRupees * 100);
      return apiClient.createClubFinanceEntry(activeClubId!, {
        eventId: entryEventId === 'club_general' ? null : entryEventId,
        entryType,
        sourceOrCategory: sourceOrCategory.trim(),
        description: entryDescription.trim(),
        amountMinorUnits,
        transactionDate,
        vendorOrRecipient: vendorOrRecipient.trim(),
        receiptUrl: receiptUrl.trim() || undefined,
        notes: entryNotes.trim() || undefined,
      });
    },
    onSuccess: async () => {
      setEntryDescription('');
      setAmountRupees('');
      setVendorOrRecipient('');
      setReceiptUrl('');
      setEntryNotes('');
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['club-finance', activeClubId]}),
        queryClient.invalidateQueries({queryKey: ['admin-finance']}),
      ]);
      toast.success('Financial ledger entry recorded');
    },
    onError: (err) => {
      toast.error('Failed to add ledger entry', err instanceof Error ? err.message : undefined);
    },
  });

  const deleteLedgerEntryMutation = useMutation({
    mutationFn: (entryId: string) => apiClient.deleteClubFinanceEntry(activeClubId!, entryId),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['club-finance', activeClubId]}),
        queryClient.invalidateQueries({queryKey: ['admin-finance']}),
      ]);
      toast.info('Ledger entry removed');
    },
    onError: (err) => {
      toast.error('Failed to delete entry', err instanceof Error ? err.message : undefined);
    },
  });

  const financeMutation = useMutation({
    mutationFn: () =>
      apiClient.submitFinancialReport(selectedEventId, {
        lineItems,
        notes: financeNotes,
      }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['finance-report', selectedEventId]});
      toast.success('Event financial reconciliation saved');
    },
    onError: (err) => {
      toast.error('Failed to submit financial report', err instanceof Error ? err.message : undefined);
    },
  });

  const totalCollections = lineItems
    .filter((i) => i.type === 'collection')
    .reduce((acc, i) => acc + Math.round(Number(i.amount || 0) * 100), 0) / 100;
  const totalExpenses = lineItems
    .filter((i) => i.type === 'expense')
    .reduce((acc, i) => acc + Math.round(Number(i.amount || 0) * 100), 0) / 100;
  const netBalance = (Math.round(totalCollections * 100) - Math.round(totalExpenses * 100)) / 100;

  if (eventsLoading) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Post-Event Reports &amp; Club Finance Ledger
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Submit structured completion reports for institutional review and maintain exact integer-paise
          club and event financial ledgers. Financial data is restricted to authorized club officers
          and Super Admins.
        </p>
      </div>

      <Card className="p-4">
        <label htmlFor="report-event-select" className="block text-xs font-medium text-slate-500">
          Select Target Event
        </label>
        <select
          id="report-event-select"
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          className="mt-1.5 block w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-900"
        >
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} ({ev.status})
            </option>
          ))}
        </select>
      </Card>

      {canSubmitEventReport && (
        <Card className="p-6 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-violet-700">
              <FileText className="h-5 w-5" />
              <h2 className="font-display text-base font-semibold text-slate-900">
                Post-Event Completion Report
              </h2>
            </div>
            {existingEventReport && <StatusLabel status={existingEventReport.status} />}
          </div>

          {existingEventReport?.reviewNotes && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
              <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div>
                <p className="font-semibold">
                  Reviewer Feedback ({existingEventReport.reviewedByName || 'Super Admin'})
                </p>
                <p className="mt-1">{existingEventReport.reviewNotes}</p>
              </div>
            </div>
          )}

          <form
            onSubmit={(e) => {
              e.preventDefault();
              eventReportMutation.mutate('submitted');
            }}
            className="space-y-4"
          >
            <div className="grid gap-4 sm:grid-cols-3">
              <Input
                label="Actual Event Date"
                type="date"
                value={actualEventDate}
                onChange={(e) => setActualEventDate(e.target.value)}
              />
              <Input
                label="Actual Attendance"
                type="number"
                min={0}
                value={actualAttendance}
                onChange={(e) => setActualAttendance(Number(e.target.value))}
              />
              <Select
                label="Completion Status"
                value={completionStatus}
                onChange={(e) => setCompletionStatus(e.target.value as 'completed' | 'partial')}
                options={[
                  {label: 'Completed', value: 'completed'},
                  {label: 'Partial', value: 'partial'},
                ]}
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea
                label="Objectives & Scope"
                rows={2}
                value={objectives}
                onChange={(e) => setObjectives(e.target.value)}
                placeholder="Planned goals and target audience..."
              />
              <Textarea
                label="Participation Summary"
                rows={2}
                value={participationSummary}
                onChange={(e) => setParticipationSummary(e.target.value)}
                placeholder="Department mix, turnout vs capacity, engagement observations..."
              />
            </div>

            <Textarea
              label="Outcome Summary *"
              rows={3}
              required
              minLength={20}
              value={outcomeSummary}
              onChange={(e) => setOutcomeSummary(e.target.value)}
              placeholder="Summarize session outcomes, deliverables, and student engagement (min 20 characters)..."
            />

            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea
                label="Key Highlights *"
                rows={2}
                required
                minLength={10}
                value={highlights}
                onChange={(e) => setHighlights(e.target.value)}
                placeholder="Notable achievements or guest speaker takeaways (min 10 characters)..."
              />
              <Textarea
                label="Detailed Outcomes (optional)"
                rows={2}
                value={outcomes}
                onChange={(e) => setOutcomes(e.target.value)}
                placeholder="Projects built, winners, or follow-up workshops..."
              />
            </div>

            <div className="grid gap-4 sm:grid-cols-2">
              <Textarea
                label="Operational Challenges"
                rows={2}
                value={challenges}
                onChange={(e) => setChallenges(e.target.value)}
                placeholder="Logistics or AV issues encountered (optional)"
              />
              <Textarea
                label="Feedback & Observations"
                rows={2}
                value={feedbackObservations}
                onChange={(e) => setFeedbackObservations(e.target.value)}
                placeholder="Student feedback and recommendations for next cycle..."
              />
            </div>

            <Input
              label="Evidence / Drive Folder URL (optional, https://...)"
              type="url"
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              placeholder="https://drive.google.com/..."
            />

            <div className="flex flex-wrap items-center gap-2.5">
              <Button
                type="button"
                variant="outline"
                disabled={!selectedEventId}
                loading={eventReportMutation.isPending}
                onClick={() => eventReportMutation.mutate('draft')}
              >
                Save Draft
              </Button>
              <Button
                type="submit"
                disabled={!selectedEventId}
                loading={eventReportMutation.isPending}
              >
                {existingEventReport?.status === 'changes_requested'
                  ? 'Resubmit for Review'
                  : existingEventReport
                    ? 'Update & Submit for Review'
                    : 'Submit for Review'}
              </Button>
            </div>
          </form>

          {existingEventReport?.history && existingEventReport.history.length > 0 && (
            <div className="border-t border-slate-100 pt-4">
              <div className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
                <History className="h-3.5 w-3.5" />
                Review Audit Trail
              </div>
              <div className="mt-2 space-y-2">
                {existingEventReport.history.map((item, idx) => (
                  <div
                    key={`${item.timestamp}-${idx}`}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-slate-50 px-3 py-2 text-xs"
                  >
                    <div>
                      <span className="font-medium text-slate-900">{item.actorName}</span>{' '}
                      <span className="text-slate-500">({item.actorRole})</span> —{' '}
                      <span className="font-medium text-slate-700">{item.action}</span>
                      {item.notes ? <p className="mt-0.5 text-slate-600">{item.notes}</p> : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusLabel status={item.status} />
                      <span className="font-mono text-[11px] text-slate-500">
                        {new Date(item.timestamp).toLocaleString()}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </Card>
      )}

      {canSubmitFinanceReport && (
        <div className="grid gap-6 lg:grid-cols-12">
          <Card className="p-6 lg:col-span-7 space-y-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-600">
                <DollarSign className="h-5 w-5" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Club &amp; Event Finance Ledger
                </h2>
              </div>
            </div>

            {financeLoading ? (
              <LoadingSkeleton rows={2} />
            ) : (
              <>
                <div className="grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-4 text-xs">
                  <div>
                    <p className="text-slate-500">Club Total Income</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                      {formatInr(clubFinance?.totalIncome ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Club Total Expenses</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-red-700 tabular-nums">
                      {formatInr(clubFinance?.totalExpenses ?? 0)}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Net Club Balance</p>
                    <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                      {formatInr(clubFinance?.netBalance ?? 0)}
                    </p>
                  </div>
                </div>

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    createLedgerEntryMutation.mutate();
                  }}
                  className="space-y-3 rounded-xl border border-slate-200 p-4"
                >
                  <p className="text-xs font-semibold text-slate-900">Record Ledger Transaction</p>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Select
                      label="Type"
                      value={entryType}
                      onChange={(e) => setEntryType(e.target.value as FinanceEntryType)}
                      options={[
                        {label: 'Income', value: 'income'},
                        {label: 'Expense', value: 'expense'},
                      ]}
                    />
                    <Select
                      label="Linked Scope"
                      value={entryEventId}
                      onChange={(e) => setEntryEventId(e.target.value)}
                      options={[
                        {label: 'Club General Budget', value: 'club_general'},
                        ...events.map((ev) => ({label: ev.title, value: ev.id})),
                      ]}
                    />
                    <Input
                      label="Date"
                      type="date"
                      required
                      value={transactionDate}
                      onChange={(e) => setTransactionDate(e.target.value)}
                    />
                  </div>
                  <div className="grid gap-3 sm:grid-cols-3">
                    <Input
                      label="Category / Source *"
                      required
                      value={sourceOrCategory}
                      onChange={(e) => setSourceOrCategory(e.target.value)}
                      placeholder="Sponsorship, Logistics..."
                    />
                    <Input
                      label="Amount (INR) *"
                      type="number"
                      step="0.01"
                      min="0"
                      required
                      value={amountRupees}
                      onChange={(e) => setAmountRupees(e.target.value)}
                      placeholder="1250.00"
                    />
                    <Input
                      label="Vendor / Recipient"
                      value={vendorOrRecipient}
                      onChange={(e) => setVendorOrRecipient(e.target.value)}
                      placeholder="Payee or sponsor"
                    />
                  </div>
                  <Input
                    label="Description *"
                    required
                    minLength={3}
                    value={entryDescription}
                    onChange={(e) => setEntryDescription(e.target.value)}
                    placeholder="Itemized transaction details"
                  />
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Input
                      label="Receipt URL (optional, https://...)"
                      type="url"
                      value={receiptUrl}
                      onChange={(e) => setReceiptUrl(e.target.value)}
                      placeholder="https://..."
                    />
                    <Input
                      label="Notes (optional)"
                      value={entryNotes}
                      onChange={(e) => setEntryNotes(e.target.value)}
                      placeholder="Invoice # or remarks"
                    />
                  </div>
                  <Button type="submit" size="sm" loading={createLedgerEntryMutation.isPending}>
                    <Plus className="h-3.5 w-3.5" />
                    Add Ledger Entry
                  </Button>
                </form>

                {clubFinance && clubFinance.entries.length > 0 ? (
                  <div className="overflow-x-auto rounded-xl border border-slate-200">
                    <table className="w-full text-left text-xs">
                      <thead className="border-b border-slate-200 bg-slate-50 text-slate-500">
                        <tr>
                          <th className="px-4 py-2.5">Date</th>
                          <th className="px-4 py-2.5">Scope &amp; Description</th>
                          <th className="px-4 py-2.5">Type</th>
                          <th className="px-4 py-2.5 text-right">Amount</th>
                          <th className="px-4 py-2.5 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {clubFinance.entries.map((entry) => (
                          <tr key={entry.id}>
                            <td className="px-4 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                              {new Date(entry.transactionDate).toLocaleDateString()}
                            </td>
                            <td className="px-4 py-2.5">
                              <p className="font-medium text-slate-900">{entry.description}</p>
                              <p className="text-[11px] text-slate-500">
                                {entry.sourceOrCategory}
                                {entry.eventTitle ? ` · ${entry.eventTitle}` : ' · Club General'}
                                {entry.vendorOrRecipient ? ` · ${entry.vendorOrRecipient}` : ''}
                              </p>
                              {entry.receiptUrl && (
                                <SafeExternalLink
                                  href={entry.receiptUrl}
                                  className="mt-0.5 inline-flex items-center gap-1 text-[11px] text-blue-600 hover:underline"
                                >
                                  Receipt <ExternalLink className="h-3 w-3" />
                                </SafeExternalLink>
                              )}
                            </td>
                            <td className="px-4 py-2.5 capitalize">
                              <span
                                className={
                                  entry.entryType === 'income'
                                    ? 'font-medium text-emerald-700'
                                    : 'font-medium text-red-700'
                                }
                              >
                                {entry.entryType}
                              </span>
                            </td>
                            <td className="px-4 py-2.5 text-right font-mono font-semibold tabular-nums">
                              {formatInr(entry.amount)}
                            </td>
                            <td className="px-4 py-2.5 text-right">
                              <button
                                type="button"
                                aria-label="Delete ledger entry"
                                onClick={() => deleteLedgerEntryMutation.mutate(entry.id)}
                                className="text-slate-400 hover:text-red-600"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <p className="text-xs text-slate-500">No ledger entries recorded for this club yet.</p>
                )}
              </>
            )}
          </Card>

          <Card className="p-6 lg:col-span-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 text-blue-600">
                <DollarSign className="h-5 w-5" />
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Event Financial Reconciliation
                </h2>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() =>
                  setLineItems((prev) => [
                    ...prev,
                    {
                      id: `li-${Date.now()}`,
                      type: 'expense',
                      label: 'Equipment / Supplies',
                      category: 'Materials',
                      amount: 0,
                    },
                  ])
                }
              >
                <Plus className="h-3.5 w-3.5" />
                Add Item
              </Button>
            </div>

            <div className="mt-4 grid grid-cols-3 gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5 text-xs">
              <div>
                <p className="text-slate-500">Collections</p>
                <p className="mt-1 font-mono text-sm font-semibold text-emerald-700 tabular-nums">
                  {formatInr(totalCollections)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Expenses</p>
                <p className="mt-1 font-mono text-sm font-semibold text-red-700 tabular-nums">
                  {formatInr(totalExpenses)}
                </p>
              </div>
              <div>
                <p className="text-slate-500">Net Balance</p>
                <p className="mt-1 font-mono text-sm font-semibold text-slate-900 tabular-nums">
                  {formatInr(netBalance)}
                </p>
              </div>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                financeMutation.mutate();
              }}
              className="mt-4 space-y-3"
            >
              {lineItems.map((item, idx) => (
                <div
                  key={item.id}
                  className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-12 sm:items-center"
                >
                  <select
                    aria-label="Line item type"
                    value={item.type}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((li, i) =>
                          i === idx
                            ? {...li, type: e.target.value as 'collection' | 'expense'}
                            : li,
                        ),
                      )
                    }
                    className="rounded-md border border-slate-200 px-2 py-1.5 text-xs sm:col-span-3"
                  >
                    <option value="collection">Collection</option>
                    <option value="expense">Expense</option>
                  </select>
                  <input
                    type="text"
                    required
                    value={item.label}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((li, i) => (i === idx ? {...li, label: e.target.value} : li)),
                      )
                    }
                    placeholder="Item description"
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 text-xs sm:col-span-5"
                  />
                  <input
                    type="number"
                    min={0}
                    step="0.01"
                    required
                    value={item.amount}
                    onChange={(e) =>
                      setLineItems((prev) =>
                        prev.map((li, i) =>
                          i === idx ? {...li, amount: Number(e.target.value)} : li,
                        ),
                      )
                    }
                    className="rounded-md border border-slate-200 px-2.5 py-1.5 font-mono text-xs sm:col-span-3"
                  />
                  <button
                    type="button"
                    disabled={lineItems.length <= 1}
                    onClick={() => setLineItems((prev) => prev.filter((_, i) => i !== idx))}
                    aria-label="Remove line item"
                    className="flex justify-center text-slate-400 hover:text-red-600 disabled:opacity-40 sm:col-span-1"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}

              <Textarea
                label="Audit & Ledger Notes"
                rows={2}
                value={financeNotes}
                onChange={(e) => setFinanceNotes(e.target.value)}
                placeholder="Invoice references or grant allocation notes..."
              />

              <Button type="submit" variant="secondary" loading={financeMutation.isPending}>
                {existingFinanceReport ? 'Update Financial Report' : 'Submit Financial Report'}
              </Button>
            </form>
          </Card>
        </div>
      )}
    </div>
  );
};
