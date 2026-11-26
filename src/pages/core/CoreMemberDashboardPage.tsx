import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {
  ArrowRight,
  Calendar,
  CheckCircle2,
  FileSpreadsheet,
  FileText,
  Lock,
  QrCode,
  Ticket,
} from 'lucide-react';
import {Link} from 'react-router-dom';
import {
  CORE_MEMBER_PERMISSIONS,
  PERMISSION_LABELS,
  type CoreMemberPermission,
} from '../../../shared/constants/permissions.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';

const PERMISSION_ROUTE: Partial<Record<CoreMemberPermission, {to: string; icon: React.ReactNode}>> = {
  MANAGE_EVENTS: {to: '/app/core/events', icon: <Calendar className="h-4 w-4 text-violet-700" />},
  MANAGE_FORMS: {to: '/app/core/forms', icon: <FileSpreadsheet className="h-4 w-4 text-violet-700" />},
  VIEW_REGISTRATIONS: {to: '/app/core/registrations', icon: <Ticket className="h-4 w-4 text-blue-600" />},
  SCAN_ATTENDANCE: {to: '/app/core/attendance', icon: <QrCode className="h-4 w-4 text-blue-600" />},
  SUBMIT_EVENT_REPORTS: {to: '/app/core/reports', icon: <FileText className="h-4 w-4 text-violet-700" />},
  SUBMIT_FINANCE_REPORTS: {to: '/app/core/reports', icon: <FileText className="h-4 w-4 text-blue-600" />},
};

export const CoreMemberDashboardPage: React.FC = () => {
  const {user, activeClubId, activeMembership, hasPermission} = useAuth();

  const {data: club, isLoading} = useQuery({
    queryKey: ['club', activeClubId],
    queryFn: () => apiClient.getClubDetail(activeClubId!),
    enabled: Boolean(activeClubId),
  });

  if (isLoading || !club || !activeMembership) {
    return <LoadingSkeleton rows={4} />;
  }

  return (
    <div className="space-y-8">
      <div className="border-b border-slate-200 pb-6">
        <p className="text-xs font-medium text-blue-600">
          Core Member Workspace · {club.name}
        </p>
        <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">
          {user?.name} — {activeMembership.title}
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Your workspace reflects only the permissions delegated to you by {club.name} admins.
          Club Admin settings and team controls remain restricted.
        </p>
      </div>

      {/* Assigned Permissions Matrix */}
      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-7">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Assigned Club Permissions ({activeMembership.permissions.length}/
            {CORE_MEMBER_PERMISSIONS.length})
          </h2>
          <div className="mt-4 grid gap-3 sm:grid-cols-2">
            {CORE_MEMBER_PERMISSIONS.map((perm) => {
              const allowed = hasPermission(perm);
              const linkInfo = PERMISSION_ROUTE[perm];
              return (
                <div
                  key={perm}
                  className={`flex items-center justify-between rounded-xl border p-3.5 ${
                    allowed
                      ? 'border-emerald-200 bg-emerald-50/40'
                      : 'border-slate-200 bg-slate-50/70 opacity-75'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    {allowed ? (
                      <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    ) : (
                      <Lock className="h-4 w-4 text-slate-400 shrink-0" />
                    )}
                    <span className="truncate text-xs font-medium text-slate-900">
                      {PERMISSION_LABELS[perm]}
                    </span>
                  </div>
                  {allowed && linkInfo && (
                    <Link
                      to={linkInfo.to}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                    >
                      Open
                    </Link>
                  )}
                </div>
              );
            })}
          </div>
        </Card>

        <Card className="p-6 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Assigned Operational Tasks
          </h2>
          {activeMembership.assignedTasks && activeMembership.assignedTasks.length > 0 ? (
            <ul className="mt-4 space-y-3">
              {activeMembership.assignedTasks.map((task, idx) => (
                <li
                  key={idx}
                  className="rounded-lg border border-slate-200 bg-slate-50/70 px-3.5 py-2.5 text-xs text-slate-700 leading-relaxed"
                >
                  {task}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-xs text-slate-500">
              No specific tasks pinned. Use your permitted modules on the left to support club
              events.
            </p>
          )}

          <div className="mt-5 border-t border-slate-100 pt-4">
            <Link
              to="/app/core/profile"
              className="inline-flex items-center gap-1.5 text-xs font-medium text-violet-700 hover:text-violet-800"
            >
              Inspect membership &amp; role boundaries
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </Card>
      </div>
    </div>
  );
};
