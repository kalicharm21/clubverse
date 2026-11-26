import React from 'react';
import {zodResolver} from '@hookform/resolvers/zod';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {LogOut, UserMinus} from 'lucide-react';
import {useForm} from 'react-hook-form';
import {useNavigate} from 'react-router-dom';
import {z} from 'zod';
import {updateProfileSchema} from '../../../shared/schemas/validation.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input} from '../../components/ui/FormControls.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

type ProfileFormValues = z.infer<typeof updateProfileSchema>;

export const StudentSettingsPage: React.FC = () => {
  const {user, followedClubIds, refreshSession, logout} = useAuth();
  const {toast} = useToast();
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  const {data: clubs = []} = useQuery({
    queryKey: ['clubs'],
    queryFn: () => apiClient.listClubs(),
  });

  const followedClubs = clubs.filter((c) => followedClubIds.includes(c.id));

  const {
    register,
    handleSubmit,
    formState: {errors, isSubmitting},
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(updateProfileSchema),
    values: {
      name: user?.name || '',
      department: user?.department || '',
      yearOfStudy: user?.yearOfStudy || '',
    },
  });

  const updateMutation = useMutation({
    mutationFn: (values: ProfileFormValues) => apiClient.updateMyProfile(values),
    onSuccess: async () => {
      await refreshSession();
      toast.success('Student profile updated');
    },
    onError: (err) => {
      toast.error('Profile update failed', err instanceof Error ? err.message : undefined);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (clubId: string) => apiClient.unfollowClub(clubId),
    onSuccess: async () => {
      await refreshSession();
      await queryClient.invalidateQueries({queryKey: ['clubs']});
      toast.info('Club unfollowed');
    },
  });

  const handleLogout = async () => {
    await logout();
    navigate('/login');
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Student Settings</h1>
        <p className="mt-1 text-sm text-slate-600">
          Update your profile information, manage followed clubs, and review account details.
        </p>
      </div>

      <Card className="p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">Profile Details</h2>
        <form
          onSubmit={handleSubmit((vals) => updateMutation.mutate(vals))}
          className="mt-4 space-y-4"
        >
          <Input label="Full Name" error={errors.name?.message} {...register('name')} />
          <Input
            label="Institutional Email"
            value={user?.email || ''}
            disabled
            hint="Institutional email is managed by university identity."
          />
          <div className="grid gap-4 sm:grid-cols-2">
            <Input
              label="Department"
              error={errors.department?.message}
              {...register('department')}
            />
            <Input
              label="Year of Study"
              error={errors.yearOfStudy?.message}
              {...register('yearOfStudy')}
            />
          </div>
          <Button type="submit" loading={isSubmitting || updateMutation.isPending}>
            Save Profile Changes
          </Button>
        </form>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-base font-semibold text-slate-900">
          Followed Clubs ({followedClubs.length}/2)
        </h2>
        {followedClubs.length === 0 ? (
          <p className="mt-3 text-sm text-slate-500">You are not following any clubs.</p>
        ) : (
          <div className="mt-4 divide-y divide-slate-100">
            {followedClubs.map((club) => (
              <div key={club.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{club.name}</p>
                  <p className="text-xs text-slate-500">{club.category}</p>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => unfollowMutation.mutate(club.id)}
                >
                  <UserMinus className="h-3.5 w-3.5" />
                  Unfollow
                </Button>
              </div>
            ))}
          </div>
        )}
      </Card>

      <Card className="p-6 flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h2 className="font-display text-base font-semibold text-slate-900">Account Session</h2>
          <p className="mt-0.5 text-xs text-slate-500">
            Student ID {user?.studentId} · Verified institutional session
          </p>
        </div>
        <Button variant="danger" onClick={() => void handleLogout()}>
          <LogOut className="h-4 w-4" />
          Sign Out
        </Button>
      </Card>
    </div>
  );
};
