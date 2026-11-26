import React, {useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {AlertCircle, ArrowLeft, Calendar, Instagram, Mail, MapPin, UserMinus, UserPlus, Users} from 'lucide-react';
import {Link, useParams} from 'react-router-dom';
import {CLUB_ROLE_LABELS} from '../../../shared/constants/permissions.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {ClubLogo, LoadingSkeleton, SafeExternalLink, StatusLabel} from '../../components/ui/Feedback.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';

export const ClubDetailsPage: React.FC = () => {
  const {clubId = ''} = useParams();
  const {followedClubIds, refreshSession} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();
  const [followError, setFollowError] = useState<string | null>(null);

  const {data: club, isLoading, error} = useQuery({
    queryKey: ['club', clubId],
    queryFn: () => apiClient.getClubDetail(clubId),
    enabled: Boolean(clubId),
  });

  const followMutation = useMutation({
    mutationFn: () => apiClient.followClub(club!.id),
    onSuccess: async () => {
      setFollowError(null);
      await refreshSession();
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['club', clubId]}),
        queryClient.invalidateQueries({queryKey: ['clubs']}),
        queryClient.invalidateQueries({queryKey: ['clubs-paginated']}),
        queryClient.invalidateQueries({queryKey: ['hall-of-fame']}),
        queryClient.invalidateQueries({queryKey: ['followed-clubs']}),
      ]);
      toast.success(`Now following ${club?.name}`);
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to follow club';
      setFollowError(msg);
      toast.error('Cannot follow club', msg);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: () => apiClient.unfollowClub(club!.id),
    onSuccess: async () => {
      setFollowError(null);
      await refreshSession();
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['club', clubId]}),
        queryClient.invalidateQueries({queryKey: ['clubs']}),
        queryClient.invalidateQueries({queryKey: ['clubs-paginated']}),
        queryClient.invalidateQueries({queryKey: ['hall-of-fame']}),
        queryClient.invalidateQueries({queryKey: ['followed-clubs']}),
      ]);
      toast.info(`Unfollowed ${club?.name}`);
    },
    onError: (err) => {
      toast.error('Cannot unfollow club', err instanceof Error ? err.message : undefined);
    },
  });

  if (isLoading) return <LoadingSkeleton rows={4} />;
  if (error || !club) {
    return (
      <Card className="p-8 text-center">
        <p className="text-sm font-medium text-slate-800">Club profile could not be loaded.</p>
        <Link to="/app/student/clubs" className="mt-3 inline-block text-xs font-medium text-blue-600">
          Return to Explore Clubs
        </Link>
      </Card>
    );
  }

  const isFollowing = followedClubIds.includes(club.id);

  return (
    <div className="space-y-6">
      <Link
        to="/app/student/clubs"
        className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Back to Explore Clubs
      </Link>

      {followError && (
        <div
          role="alert"
          className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900"
        >
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
          <div>
            <p className="font-semibold">Unable to follow club</p>
            <p className="mt-0.5 text-amber-800">{followError}</p>
          </div>
        </div>
      )}

      <Card className="p-6 sm:p-8">
        <div className="flex flex-col justify-between gap-6 sm:flex-row sm:items-start">
          <div className="flex items-start gap-4">
            <ClubLogo name={club.name} logoUrl={club.logoUrl} size="lg" />
            <div>
              <p className="text-xs font-medium text-violet-700">
                {club.category} · Founded {club.foundedYear}
              </p>
              <h1 className="mt-1 font-display text-2xl font-bold text-slate-900">{club.name}</h1>
              <p className="mt-1 text-sm text-slate-600">{club.tagline}</p>
              <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                <span className="font-mono tabular-nums">{club.followerCount} followers</span>
                <span>·</span>
                <span className="font-mono tabular-nums">{club.memberCount} team members</span>
                <span>·</span>
                <span>{club.meetingSchedule}</span>
              </div>
            </div>
          </div>

          <div className="shrink-0">
            {isFollowing ? (
              <Button
                variant="outline"
                loading={unfollowMutation.isPending}
                onClick={() => unfollowMutation.mutate()}
              >
                <UserMinus className="h-4 w-4" />
                Unfollow Club
              </Button>
            ) : (
              <Button
                loading={followMutation.isPending}
                onClick={() => followMutation.mutate()}
              >
                <UserPlus className="h-4 w-4" />
                Follow Club
              </Button>
            )}
          </div>
        </div>

        <div className="mt-6 border-t border-slate-100 pt-6">
          <h2 className="font-display text-sm font-semibold text-slate-900">About the Club</h2>
          <p className="mt-2 text-sm text-slate-600 leading-relaxed">{club.description}</p>
          <div className="mt-3 flex flex-wrap items-center gap-4 text-xs text-slate-500">
            <span className="inline-flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5" />
              {club.contactEmail}
            </span>
            {club.instagramUrl && (
              <SafeExternalLink
                href={club.instagramUrl}
                className="inline-flex items-center gap-1.5 font-medium text-pink-700 hover:text-pink-800 hover:underline"
              >
                <Instagram className="h-3.5 w-3.5" />
                Instagram Profile
              </SafeExternalLink>
            )}
          </div>
        </div>
      </Card>

      <div className="grid gap-6 lg:grid-cols-12">
        <Card className="p-6 lg:col-span-7">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Upcoming Club Events ({club.upcomingEvents.length})
          </h2>
          {club.upcomingEvents.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">No upcoming published events right now.</p>
          ) : (
            <div className="mt-4 divide-y divide-slate-100">
              {club.upcomingEvents.map((ev) => (
                <div key={ev.id} className="flex items-center justify-between gap-4 py-4">
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <Link
                        to={`/app/student/events/${ev.id}`}
                        className="text-sm font-semibold text-slate-900 hover:text-violet-700"
                      >
                        {ev.title}
                      </Link>
                      <StatusLabel status={ev.status} />
                    </div>
                    <p className="mt-1 flex flex-wrap items-center gap-3 text-xs text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <Calendar className="h-3.5 w-3.5" />
                        {new Date(ev.startTime).toLocaleDateString()}
                      </span>
                      <span className="inline-flex items-center gap-1">
                        <MapPin className="h-3.5 w-3.5" />
                        {ev.venue}
                      </span>
                    </p>
                  </div>
                  <Link
                    to={`/app/student/events/${ev.id}`}
                    className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    Details &amp; Register
                  </Link>
                </div>
              ))}
            </div>
          )}
        </Card>

        <Card className="p-6 lg:col-span-5">
          <h2 className="font-display text-base font-semibold text-slate-900">
            Club Leadership Team
          </h2>
          {club.team.length === 0 ? (
            <p className="mt-4 text-sm text-slate-500">Leadership roster pending update.</p>
          ) : (
            <div className="mt-4 space-y-3">
              {club.team.map((member) => (
                <div
                  key={member.id}
                  className="flex items-center justify-between gap-3 border-b border-slate-100 pb-3 last:border-0 last:pb-0"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <Users className="h-4 w-4 text-slate-400 shrink-0" />
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900">
                        {member.userName}
                      </p>
                      <p className="truncate text-xs text-slate-500">{member.title}</p>
                    </div>
                  </div>
                  <span className="text-xs font-medium text-slate-600 whitespace-nowrap">
                    {CLUB_ROLE_LABELS[member.role] || member.role.replace('_', ' ')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Card>
      </div>
    </div>
  );
};
