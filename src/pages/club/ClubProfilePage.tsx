import React from 'react';
import {zodResolver} from '@hookform/resolvers/zod';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {useForm} from 'react-hook-form';
import {z} from 'zod';
import {Instagram} from 'lucide-react';
import {CLUB_CATEGORIES} from '../../../shared/constants/permissions.ts';
import {updateClubSchema} from '../../../shared/schemas/validation.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card, Input, Select, Textarea} from '../../components/ui/FormControls.tsx';
import {LoadingSkeleton, SafeExternalLink} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

type ClubProfileForm = z.infer<typeof updateClubSchema>;

export const ClubProfilePage: React.FC = () => {
  const {activeClubId, refreshSession} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();

  const {data: club, isLoading} = useQuery({
    queryKey: ['club', activeClubId],
    queryFn: () => apiClient.getClubDetail(activeClubId!),
    enabled: Boolean(activeClubId),
  });

  const {
    register,
    handleSubmit,
    formState: {errors, isSubmitting},
  } = useForm<ClubProfileForm>({
    resolver: zodResolver(updateClubSchema),
    values: club
      ? {
          name: club.name,
          category: club.category,
          tagline: club.tagline,
          description: club.description,
          meetingSchedule: club.meetingSchedule,
          contactEmail: club.contactEmail,
          instagramUrl: club.instagramUrl || '',
        }
      : undefined,
  });

  const updateMutation = useMutation({
    mutationFn: (values: ClubProfileForm) => apiClient.updateClub(activeClubId!, values),
    onSuccess: async () => {
      await Promise.all([
        refreshSession(),
        queryClient.invalidateQueries({queryKey: ['club', activeClubId]}),
        queryClient.invalidateQueries({queryKey: ['clubs']}),
        queryClient.invalidateQueries({queryKey: ['hall-of-fame']}),
      ]);
      toast.success('Club profile updated');
    },
    onError: (err) => {
      toast.error('Failed to update club profile', err instanceof Error ? err.message : undefined);
    },
  });

  if (isLoading || !club) return <LoadingSkeleton rows={4} />;

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Club Profile Editor</h1>
        <p className="mt-1 text-sm text-slate-600">
          Manage how {club.name} appears in Explore Clubs and the Hall of Fame.
        </p>
      </div>

      <Card className="p-6">
        <form
          onSubmit={handleSubmit((vals) => updateMutation.mutate(vals))}
          className="space-y-4"
        >
          <Input label="Club Name" error={errors.name?.message} {...register('name')} />
          <div className="grid gap-4 sm:grid-cols-2">
            <Select
              label="Category"
              error={errors.category?.message}
              options={CLUB_CATEGORIES.map((c) => ({label: c, value: c}))}
              {...register('category')}
            />
            <Input
              label="Contact Email"
              type="email"
              error={errors.contactEmail?.message}
              {...register('contactEmail')}
            />
          </div>
          <Input label="Tagline" error={errors.tagline?.message} {...register('tagline')} />
          <Textarea
            label="Full Description"
            rows={4}
            error={errors.description?.message}
            {...register('description')}
          />
          <Input
            label="Meeting Schedule & Venue"
            error={errors.meetingSchedule?.message}
            {...register('meetingSchedule')}
          />
          <div>
            <Input
              label="Instagram Profile (URL or @handle)"
              placeholder="https://www.instagram.com/clubhandle/"
              error={errors.instagramUrl?.message}
              {...register('instagramUrl')}
            />
            {club.instagramUrl && (
              <div className="mt-1.5">
                <SafeExternalLink
                  href={club.instagramUrl}
                  className="inline-flex items-center gap-1.5 text-xs font-medium text-pink-700 hover:underline"
                >
                  <Instagram className="h-3.5 w-3.5" />
                  {club.instagramUrl}
                </SafeExternalLink>
              </div>
            )}
          </div>

          <Button type="submit" loading={isSubmitting || updateMutation.isPending}>
            Save Club Profile
          </Button>
        </form>
      </Card>
    </div>
  );
};
