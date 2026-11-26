import React from 'react';
import {CheckCircle2, Lock, LogOut} from 'lucide-react';
import {useNavigate} from 'react-router-dom';
import {
  CORE_MEMBER_PERMISSIONS,
  PERMISSION_LABELS,
} from '../../../shared/constants/permissions.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {useAuth} from '../../context/AuthContext.tsx';

export const CoreMemberProfilePage: React.FC = () => {
  const {user, memberships, activeMembership, logout} = useAuth();
  const navigate = useNavigate();

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          Profile &amp; Club Membership
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Review your institutional profile and per-club permission scopes.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">Identity Summary</h2>
        <dl className="mt-4 grid gap-4 sm:grid-cols-2 text-sm">
          <div>
            <dt className="text-xs text-slate-500">Name</dt>
            <dd className="mt-0.5 font-medium text-slate-900">{user?.name}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Institutional Email</dt>
            <dd className="mt-0.5 font-medium text-slate-900">{user?.email}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Department</dt>
            <dd className="mt-0.5 font-medium text-slate-900">{user?.department}</dd>
          </div>
          <div>
            <dt className="text-xs text-slate-500">Active Club Role</dt>
            <dd className="mt-0.5 font-medium text-violet-700">
              {activeMembership?.title} · {activeMembership?.clubName}
            </dd>
          </div>
        </dl>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          All Club Memberships ({memberships.length})
        </h2>
        <div className="mt-4 space-y-4">
          {memberships.map((m) => (
            <div key={m.id} className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center justify-between">
                <p className="font-semibold text-sm text-slate-900">{m.clubName}</p>
                <span className="text-xs font-medium text-slate-600 capitalize">
                  {m.role.replace('_', ' ')} · {m.title}
                </span>
              </div>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {CORE_MEMBER_PERMISSIONS.map((perm) => {
                  const has = m.permissions.includes(perm);
                  return (
                    <div key={perm} className="flex items-center gap-2 text-xs text-slate-700">
                      {has ? (
                        <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                      ) : (
                        <Lock className="h-3.5 w-3.5 text-slate-300 shrink-0" />
                      )}
                      <span className={has ? 'text-slate-900' : 'text-slate-400'}>
                        {PERMISSION_LABELS[perm]}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </Card>

      <Card className="p-6 flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-900">Sign Out</p>
          <p className="text-xs text-slate-500">Clear your active sandbox session token.</p>
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
