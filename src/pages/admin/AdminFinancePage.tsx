import React, {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Download, ExternalLink} from 'lucide-react';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, SafeExternalLink} from '../../components/ui/Feedback.tsx';
import {useToast} from '../../context/ToastContext.tsx';
import {triggerBlobDownload} from '../../lib/download.ts';

function formatInr(amount: number): string {
  return `INR ${amount.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}`;
}

export const AdminFinancePage: React.FC = () => {
  const {toast} = useToast();
  const [exporting, setExporting] = useState(false);

  const {data, isLoading} = useQuery({
    queryKey: ['admin-finance'],
    queryFn: () => apiClient.getAdminFinance(),
  });

  if (isLoading || !data) return <LoadingSkeleton rows={4} />;

  const ledger = data.ledgerSummary;
  const totalIncome = ledger?.totalIncome ?? data.totalCollections;
  const totalExpenses = ledger?.totalExpenses ?? data.totalExpenses;
  const netBalance = ledger?.netBalance ?? data.netBalance;

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      const {blob, filename} = await apiClient.downloadAdminCsv('finance');
      triggerBlobDownload(blob, filename);
      toast.success('Finance CSV exported', filename);
    } catch (err) {
      toast.error('Export failed', err instanceof Error ? err.message : undefined);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Institutional Financial Oversight
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Exact integer-paise consolidated income, expenses, club-wise and event-wise balances,
            and itemized reconciliations. Strictly hidden from student accounts.
          </p>
        </div>

        <Button
          variant="outline"
          loading={exporting}
          onClick={() => void handleExportCsv()}
        >
          <Download className="h-4 w-4" />
          Export Finance CSV
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Institutional Total Income</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-emerald-700 tabular-nums">
            {formatInr(totalIncome)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Institutional Total Expenses</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-red-700 tabular-nums">
            {formatInr(totalExpenses)}
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Institutional Net Balance</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {formatInr(netBalance)}
          </p>
        </Card>
      </div>

      {ledger && (ledger.byClub?.length || ledger.byEvent?.length) ? (
        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-3.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Club-Wise Financial Summary
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Club</th>
                    <th className="px-5 py-2.5 text-right">Income</th>
                    <th className="px-5 py-2.5 text-right">Expenses</th>
                    <th className="px-5 py-2.5 text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(ledger.byClub || []).map((c) => (
                    <tr key={c.clubId}>
                      <td className="px-5 py-2.5 font-medium text-slate-900">
                        {c.clubName}{' '}
                        <span className="font-mono text-[11px] text-slate-400">
                          ({c.entryCount})
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-emerald-700 tabular-nums">
                        {formatInr(c.totalIncome)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono text-red-700 tabular-nums">
                        {formatInr(c.totalExpenses)}
                      </td>
                      <td className="px-5 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatInr(c.netBalance)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card className="overflow-hidden">
            <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-3.5">
              <h2 className="font-display text-sm font-semibold text-slate-900">
                Event-Wise Financial Summary
              </h2>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="px-5 py-2.5">Event</th>
                    <th className="px-5 py-2.5 text-right">Income</th>
                    <th className="px-5 py-2.5 text-right">Expenses</th>
                    <th className="px-5 py-2.5 text-right">Net Balance</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {(ledger.byEvent || []).length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-5 py-4 text-center text-slate-500">
                        No event-linked ledger entries yet.
                      </td>
                    </tr>
                  ) : (
                    (ledger.byEvent || []).map((ev) => (
                      <tr key={ev.eventId}>
                        <td className="px-5 py-2.5">
                          <p className="font-medium text-slate-900">{ev.eventTitle}</p>
                          <p className="text-[11px] text-slate-500">{ev.clubName}</p>
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-emerald-700 tabular-nums">
                          {formatInr(ev.totalIncome)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono text-red-700 tabular-nums">
                          {formatInr(ev.totalExpenses)}
                        </td>
                        <td className="px-5 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                          {formatInr(ev.netBalance)}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      ) : null}

      {ledger && ledger.entries.length > 0 && (
        <Card className="overflow-hidden">
          <div className="border-b border-slate-200 bg-slate-50/70 px-6 py-3.5">
            <h2 className="font-display text-sm font-semibold text-slate-900">
              Institutional Ledger Transactions ({ledger.entries.length})
            </h2>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs">
              <thead className="border-b border-slate-100 text-slate-500">
                <tr>
                  <th className="px-5 py-2.5">Date</th>
                  <th className="px-5 py-2.5">Club / Scope</th>
                  <th className="px-5 py-2.5">Description &amp; Category</th>
                  <th className="px-5 py-2.5">Type</th>
                  <th className="px-5 py-2.5 text-right">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {ledger.entries.map((entry) => (
                  <tr key={entry.id}>
                    <td className="px-5 py-2.5 font-mono text-slate-500 whitespace-nowrap">
                      {new Date(entry.transactionDate).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-slate-900">{entry.clubName || entry.clubId}</p>
                      <p className="text-[11px] text-slate-500">
                        {entry.eventTitle || 'Club General'}
                      </p>
                    </td>
                    <td className="px-5 py-2.5">
                      <p className="font-medium text-slate-900">{entry.description}</p>
                      <p className="text-[11px] text-slate-500">
                        {entry.sourceOrCategory}
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
                    <td className="px-5 py-2.5 capitalize">
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
                    <td className="px-5 py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                      {formatInr(entry.amount)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <div className="space-y-4">
        {data.reports.map((rep) => (
          <Card key={rep.id} className="overflow-hidden">
            <div className="flex flex-col justify-between gap-2 border-b border-slate-200 bg-slate-50/70 px-6 py-4 sm:flex-row sm:items-center">
              <div>
                <p className="text-xs font-medium text-violet-700">{rep.clubName}</p>
                <h2 className="font-display text-base font-semibold text-slate-900">
                  {rep.eventTitle}
                </h2>
              </div>
              <div className="flex items-center gap-5 font-mono text-xs tabular-nums">
                <span className="text-emerald-700">+{formatInr(rep.totalCollections)}</span>
                <span className="text-red-700">-{formatInr(rep.totalExpenses)}</span>
                <span className="font-semibold text-slate-900">
                  Net {formatInr(rep.netBalance)}
                </span>
              </div>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="border-b border-slate-100 text-slate-500">
                  <tr>
                    <th className="px-6 py-2.5">Line Item</th>
                    <th className="px-6 py-2.5">Type</th>
                    <th className="px-6 py-2.5">Category</th>
                    <th className="px-6 py-2.5 text-right">Amount</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {rep.lineItems.map((li) => (
                    <tr key={li.id}>
                      <td className="px-6 py-2.5 font-medium text-slate-900">{li.label}</td>
                      <td className="px-6 py-2.5 capitalize text-slate-600">{li.type}</td>
                      <td className="px-6 py-2.5 text-slate-600">{li.category}</td>
                      <td className="px-6 py-2.5 text-right font-mono font-semibold text-slate-800 tabular-nums">
                        {formatInr(li.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        ))}
      </div>
    </div>
  );
};
