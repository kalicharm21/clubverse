import React, {useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Search} from 'lucide-react';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton} from '../../components/ui/Feedback.tsx';

export const AdminAuditLogsPage: React.FC = () => {
  const [search, setSearch] = useState('');
  const {data: logs = [], isLoading} = useQuery({
    queryKey: ['admin-audit-logs'],
    queryFn: () => apiClient.listAdminAuditLogs(),
  });

  const filtered = logs.filter((l) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      l.action.toLowerCase().includes(q) ||
      l.actorName.toLowerCase().includes(q) ||
      l.targetLabel.toLowerCase().includes(q) ||
      l.details.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Audit Logs</h1>
        <p className="mt-1 text-sm text-slate-600">
          Chronological record of governance, event publishing, check-in, and financial actions.
        </p>
      </div>

      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by actor, action, or target..."
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
                  <th className="px-6 py-3">Timestamp</th>
                  <th className="px-6 py-3">Actor</th>
                  <th className="px-6 py-3">Action</th>
                  <th className="px-6 py-3">Target &amp; Details</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5 font-mono text-xs text-slate-500 whitespace-nowrap tabular-nums">
                      {new Date(log.createdAt).toLocaleString()}
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-slate-900">{log.actorName}</p>
                      <p className="text-xs text-slate-500">{log.actorContext}</p>
                    </td>
                    <td className="px-6 py-3.5 font-mono text-xs font-semibold text-violet-800">
                      {log.action}
                    </td>
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-slate-900">{log.targetLabel}</p>
                      <p className="text-xs text-slate-600">{log.details}</p>
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
