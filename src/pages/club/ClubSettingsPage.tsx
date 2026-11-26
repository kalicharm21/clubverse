import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {LogOut, Shield} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';

export const ClubSettingsPage: React.FC = () => {
  const {activeClubId, activeMembership, logout} = useAuth();
  const navigate = useNavigate();

  const {data: club} = useQuery({
    queryKey: ['club', activeClubId],
    queryFn: () => apiClient.getClubDetail(activeClubId!),
    enabled: Boolean(activeClubId),
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Club Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Operational governance and scoped membership boundaries for {club?.name}.
        </p>
      </div>

      <Card className="p-6 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-semibold text-slate-900">Club Charter Status</p>
            <p className="text-xs text-slate-500">
              Controlled by Office of Student Affairs (Super Admin)
            </p>
          </div>
          {club && <StatusLabel status={club.status} />}
        </div>

        <div className="border-t border-slate-100 pt-4">
          <div className="flex items-start gap-2.5 text-xs text-slate-600">
            <Shield className="mt-0.5 h-4 w-4 text-violet-700 shrink-0" />
            <p className="leading-relaxed">
              Your current session role in this club is{' '}
              <span className="font-semibold text-slate-900">
                {activeMembership?.title} ({activeMembership?.role})
              </span>
              . All mutations on events, forms, attendance, and financial reports are strictly
              scoped to <span className="font-mono text-slate-800">{activeClubId}</span>.
            </p>
          </div>
        </div>
      </Card>

      <Card className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Sign Out</p>
          <p className="text-xs text-slate-500">End your current CampusVerse sandbox session.</p>
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
