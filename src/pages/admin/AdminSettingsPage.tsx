import React from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Database, LogOut} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const AdminSettingsPage: React.FC = () => {
  const {logout} = useAuth();
  const {toast, confirm} = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {data: settings, isLoading} = useQuery({
    queryKey: ['admin-settings'],
    queryFn: () => apiClient.getAdminSettings(),
  });

  const updateMutation = useMutation({
    mutationFn: (patch: {requireClubApproval?: boolean; allowStudentEventFeedback?: boolean}) =>
      apiClient.updateAdminSettings(patch),
    onSuccess: async () => {
      await queryClient.invalidateQueries({queryKey: ['admin-settings']});
      await queryClient.invalidateQueries({queryKey: ['admin-audit-logs']});
      toast.success('System settings updated');
    },
  });

  if (isLoading || !settings) return <LoadingSkeleton rows={3} />;

  const handleToggle = async (
    key: 'requireClubApproval' | 'allowStudentEventFeedback',
    nextVal: boolean,
  ) => {
    const ok = await confirm({
      title: 'Confirm Policy Change',
      description: `Update institutional policy setting "${key}" to ${nextVal ? 'Enabled' : 'Disabled'}?`,
      confirmLabel: 'Apply Setting',
    });
    if (ok) updateMutation.mutate({[key]: nextVal});
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">System Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Configure institutional governance policies and inspect persistence adapter status.
        </p>
      </div>

      <Card className="p-6 space-y-5">
        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Maximum Clubs Followed Per Student</p>
            <p className="text-xs text-slate-500">Enforced across backend services and UI</p>
          </div>
          <span className="font-mono text-base font-semibold text-slate-900 tabular-nums">
            {settings.maxClubsPerStudent} Clubs
          </span>
        </div>

        <div className="flex items-center justify-between border-b border-slate-100 pb-4">
          <div>
            <p className="text-sm font-semibold text-slate-900">Require Charter Approval</p>
            <p className="text-xs text-slate-500">
              New clubs enter pending review before appearing in student discovery
            </p>
          </div>
          <Button
            size="sm"
            variant={settings.requireClubApproval ? 'primary' : 'outline'}
            onClick={() => void handleToggle('requireClubApproval', !settings.requireClubApproval)}
          >
            {settings.requireClubApproval ? 'Enabled' : 'Disabled'}
          </Button>
        </div>

        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Student Event Feedback</p>
            <p className="text-xs text-slate-500">
              Allow post-event ratings from verified attendees
            </p>
          </div>
          <Button
            size="sm"
            variant={settings.allowStudentEventFeedback ? 'primary' : 'outline'}
            onClick={() =>
              void handleToggle('allowStudentEventFeedback', !settings.allowStudentEventFeedback)
            }
          >
            {settings.allowStudentEventFeedback ? 'Enabled' : 'Disabled'}
          </Button>
        </div>
      </Card>

      <Card className="p-6 bg-slate-50/70">
        <div className="flex items-start gap-3">
          <Database className="mt-0.5 h-5 w-5 text-blue-600 shrink-0" />
          <div>
            <h2 className="font-display text-sm font-semibold text-slate-900">
              {settings.phaseLabel}
            </h2>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              {settings.persistenceMode === 'postgres'
                ? 'All mutations persist transactionally to Supabase PostgreSQL via Drizzle ORM with Row-Level Security (RLS) and append-only audit logging.'
                : 'Changes made during this session mutate in-memory state via the isolated development DemoDataAdapter.'}
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Sign Out</p>
          <p className="text-xs text-slate-500">End Super Admin session.</p>
        </div>
        <Button
          variant="danger"
          onClick={async () => {
            await logout();
            navigate('/login');
          }}
        >
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </Card>
    </div>
  );
};
