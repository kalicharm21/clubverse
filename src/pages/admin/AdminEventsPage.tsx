import React, {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Search} from 'lucide-react';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';

export const AdminEventsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');

  const {data: analytics, isLoading} = useQuery({
    queryKey: ['admin-analytics'],
    queryFn: () => apiClient.getAdminAnalytics(),
  });

  const events = (analytics?.events || []).filter((ev) => {
    const matchesStatus = statusFilter === 'All' || ev.status === statusFilter;
    const q = search.trim().toLowerCase();
    const matchesQuery =
      !q ||
      ev.title.toLowerCase().includes(q) ||
      ev.clubName.toLowerCase().includes(q) ||
      ev.venue.toLowerCase().includes(q);
    return matchesStatus && matchesQuery;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">
            Institution-Wide Event Analytics
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Monitor event status, registrations, ticket releases, attendance rates, completion
            reports, and event net financials across all campus clubs.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {['All', 'published', 'registration_open', 'draft', 'completed'].map((st) => (
            <button
              key={st}
              type="button"
              onClick={() => setStatusFilter(st)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium capitalize transition-colors whitespace-nowrap ${
                statusFilter === st ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {st.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search events, clubs, or venues..."
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
                  <th className="px-5 py-3">Event &amp; Club</th>
                  <th className="px-5 py-3">Status</th>
                  <th className="px-5 py-3 text-right">Registrations</th>
                  <th className="px-5 py-3 text-right">Tickets Released</th>
                  <th className="px-5 py-3 text-right">Attendance</th>
                  <th className="px-5 py-3">Report Status</th>
                  <th className="px-5 py-3 text-right">Event Finance</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {events.map((ev) => (
                  <tr key={ev.eventId} className="hover:bg-slate-50/70">
                    <td className="px-5 py-3.5">
                      <p className="font-medium text-slate-900">{ev.title}</p>
                      <p className="text-xs text-slate-500">
                        {ev.clubName} · {new Date(ev.startTime).toLocaleDateString()} · {ev.venue}
                      </p>
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusLabel status={ev.status} />
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-800 tabular-nums">
                      <div>
                        {ev.confirmedCount} / {ev.capacity}
                      </div>
                      {ev.waitlistedCount > 0 && (
                        <div className="text-amber-700">+{ev.waitlistedCount} waitlist</div>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums">
                      <span className="text-emerald-700">{ev.ticketsReleasedCount} rel</span>
                      <span className="text-slate-400"> / </span>
                      <span className="text-amber-700">{ev.ticketsNotReleasedCount} pend</span>
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs text-slate-800 tabular-nums">
                      {ev.attendedCount} ({ev.attendancePercentage}%)
                    </td>
                    <td className="px-5 py-3.5">
                      <StatusLabel status={ev.reportStatus} />
                    </td>
                    <td className="px-5 py-3.5 text-right font-mono text-xs tabular-nums">
                      <div className="font-semibold text-slate-900">
                        Net INR {ev.netBalance.toLocaleString('en-IN')}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        +{ev.totalIncome.toLocaleString('en-IN')} / -
                        {ev.totalExpenses.toLocaleString('en-IN')}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
};
