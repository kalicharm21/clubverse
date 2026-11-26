import React, {useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {Search, Shield} from 'lucide-react';
import type {UserAccount} from '../../../shared/types/domain.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const AdminUsersPage: React.FC = () => {
  const {user: currentUser} = useAuth();
  const {toast, confirm} = useToast();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');

  const {data: users = [], isLoading} = useQuery({
    queryKey: ['admin-users'],
    queryFn: () => apiClient.listAdminUsers(),
  });

  const statusMutation = useMutation({
    mutationFn: (vars: {userId: string; status: 'active' | 'suspended'}) =>
      apiClient.updateUserStatus(vars.userId, vars.status),
    onSuccess: async (updated) => {
      await queryClient.invalidateQueries({queryKey: ['admin-users']});
      toast.success(`${updated.name} is now ${updated.status}`);
    },
    onError: (err) => {
      toast.error('Account status update failed', err instanceof Error ? err.message : undefined);
    },
  });

  const handleToggleStatus = async (target: UserAccount) => {
    const nextStatus = target.status === 'active' ? 'suspended' : 'active';
    const ok = await confirm({
      title: `${nextStatus === 'suspended' ? 'Suspend' : 'Reactivate'} ${target.name}?`,
      description:
        nextStatus === 'suspended'
          ? 'Suspended accounts are immediately blocked from signing in or submitting registrations.'
          : 'Reactivating restores student and club leadership access.',
      confirmLabel: nextStatus === 'suspended' ? 'Suspend Account' : 'Reactivate Account',
      destructive: nextStatus === 'suspended',
    });
    if (ok) statusMutation.mutate({userId: target.id, status: nextStatus});
  };

  const filtered = users.filter((u) => {
    if (!search.trim()) return true;
    const q = search.toLowerCase();
    return (
      u.name.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      u.department.toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">
          User Directory &amp; Account Status
        </h1>
        <p className="mt-1 text-sm text-slate-600">
          Review institutional accounts and enforce suspensions. Super Admin privileges are strictly
          provisioned server-side and cannot be granted from the client UI.
        </p>
      </div>

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search users by name, email, or department..."
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
                  <th className="px-6 py-3">User</th>
                  <th className="px-6 py-3">Department</th>
                  <th className="px-6 py-3">Privilege Scope</th>
                  <th className="px-6 py-3">Status</th>
                  <th className="px-6 py-3 text-right">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filtered.map((u) => (
                  <tr key={u.id} className="hover:bg-slate-50/70">
                    <td className="px-6 py-3.5">
                      <p className="font-medium text-slate-900">{u.name}</p>
                      <p className="text-xs text-slate-500">{u.email}</p>
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-600">
                      {u.department} · {u.yearOfStudy}
                    </td>
                    <td className="px-6 py-3.5 text-xs text-slate-700">
                      {u.isSuperAdmin ? (
                        <span className="inline-flex items-center gap-1 font-semibold text-violet-700">
                          <Shield className="h-3.5 w-3.5" />
                          Super Admin
                        </span>
                      ) : (
                        'Student / Club Scoped'
                      )}
                    </td>
                    <td className="px-6 py-3.5">
                      <StatusLabel status={u.status} />
                    </td>
                    <td className="px-6 py-3.5 text-right">
                      {u.id !== currentUser?.id && !u.isSuperAdmin && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => void handleToggleStatus(u)}
                        >
                          {u.status === 'active' ? 'Suspend' : 'Reactivate'}
                        </Button>
                      )}
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
