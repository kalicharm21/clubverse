import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {ArrowRight, Building2, DollarSign, ShieldCheck, Users} from 'lucide-react';
import {Link} from 'react-router-dom';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton} from '../../components/ui/Feedback.tsx';

export const AdminDashboardPage: React.FC = () => {
  const {data: stats, isLoading} = useQuery({
    queryKey: ['admin-dashboard'],
    queryFn: () => apiClient.getAdminDashboard(),
  });

  if (isLoading || !stats) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-4 border-b border-slate-200 pb-6 sm:flex-row sm:items-end">
        <div>
          <p className="text-xs font-medium text-violet-700">Office of Student Affairs</p>
          <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
            Institution Administration Overview
          </h1>
          <p className="mt-1 text-sm text-slate-600">
            Campus-wide club governance, student participation, financial ledgers, and audit logs.
          </p>
        </div>

        <div className="flex flex-wrap gap-2.5">
          <Link
            to="/app/admin/clubs"
            className="inline-flex items-center gap-2 rounded-lg bg-violet-700 px-4 py-2 text-xs font-medium text-white hover:bg-violet-800 whitespace-nowrap"
          >
            <Building2 className="h-3.5 w-3.5" />
            Manage Clubs
          </Link>
          <Link
            to="/app/admin/audit-logs"
            className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
          >
            <ShieldCheck className="h-3.5 w-3.5" />
            Audit Logs
          </Link>
        </div>
      </div>

      {/* Institution KPIs */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Registered Students</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.totalStudents}
          </p>
          <p className="mt-1 text-xs text-slate-500">Verified campus accounts</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Clubs (Active / Total)</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.activeClubs} / {stats.totalClubs}
          </p>
          <p className="mt-1 text-xs text-slate-500">Includes pending charter reviews</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Events (Upcoming / Total)</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            {stats.upcomingEvents} / {stats.totalEvents}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            {stats.completedEvents} completed · {stats.totalRegistrations} registrations
          </p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Institutional Net Balance</p>
          <p className="mt-2 font-mono text-2xl font-semibold text-slate-900 tabular-nums">
            INR {stats.netBalance.toLocaleString('en-IN', {minimumFractionDigits: 2, maximumFractionDigits: 2})}
          </p>
          <p className="mt-1 text-xs text-slate-500">
            INR {stats.totalCollections.toLocaleString('en-IN')} in · INR{' '}
            {stats.totalExpenses.toLocaleString('en-IN')} out
          </p>
        </Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Verified Check-Ins</p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-emerald-700 tabular-nums">
            {stats.totalAttendance}
          </p>
          <p className="mt-1 text-xs text-slate-500">Across all institutional events</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Completed Events Missing Reports</p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-amber-700 tabular-nums">
            {stats.pendingReportsCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Awaiting club report submission</p>
        </Card>
        <Card className="p-5">
          <p className="text-xs font-medium text-slate-500">Reports Awaiting Admin Review</p>
          <p className="mt-1.5 font-mono text-xl font-semibold text-violet-700 tabular-nums">
            {stats.awaitingApprovalReportsCount}
          </p>
          <p className="mt-1 text-xs text-slate-500">Submitted or under review</p>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-8">
          <div className="flex items-center justify-between">
            <h2 className="font-display text-base font-semibold text-slate-900">
              Recent Administrative &amp; Operational Actions
            </h2>
            <Link
              to="/app/admin/audit-logs"
              className="inline-flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700"
            >
              Full audit log
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          <div className="mt-4 divide-y divide-slate-100">
            {stats.recentAuditLogs.map((log) => (
              <div key={log.id} className="flex items-start justify-between gap-4 py-3.5">
                <div className="min-w-0">
                  <p className="text-sm font-medium text-slate-900">
                    {log.action.replace(/_/g, ' ')} · {log.targetLabel}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {log.actorName} ({log.actorContext}) — {log.details}
                  </p>
                </div>
                <span className="font-mono text-xs text-slate-400 whitespace-nowrap tabular-nums">
                  {new Date(log.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-4 bg-slate-50/70">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Oversight Consoles
          </h2>
          <div className="mt-4 space-y-2.5">
            <Link
              to="/app/admin/users"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <Users className="h-4 w-4 text-violet-700" />
                User Directory &amp; Status
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
            <Link
              to="/app/admin/finance"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <DollarSign className="h-4 w-4 text-blue-600" />
                Collections &amp; Expenses
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
            <Link
              to="/app/admin/reports"
              className="flex items-center justify-between rounded-lg border border-slate-200 bg-white px-4 py-3 text-xs font-medium text-slate-800 hover:bg-slate-50"
            >
              <span className="inline-flex items-center gap-2">
                <Building2 className="h-4 w-4 text-slate-700" />
                Event Completion Reports
              </span>
              <ArrowRight className="h-3.5 w-3.5 text-slate-400" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};
