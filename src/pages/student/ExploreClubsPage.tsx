import React, {useEffect, useState} from 'react';
import {useMutation, useQuery, useQueryClient} from '@tanstack/react-query';
import {AlertCircle, Check, Compass, Search, UserMinus, UserPlus} from 'lucide-react';
import {Link} from 'react-router-dom';
import {CLUB_CATEGORIES, MAX_FOLLOWED_CLUBS} from '../../../shared/constants/permissions.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {ClubLogo, EmptyState, LoadingSkeleton} from '../../components/ui/Feedback.tsx';
import {PaginationBar} from '../../components/ui/PaginationBar.tsx';
import {useAuth} from '../../context/AuthContext.tsx';
import {useToast} from '../../context/ToastContext.tsx';
import {useDebouncedValue} from '../../hooks/useDebouncedValue.ts';

export const ExploreClubsPage: React.FC = () => {
  const {followedClubIds, refreshSession, isAuthenticated} = useAuth();
  const {toast} = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sortBy, setSortBy] = useState('followers');
  const [page, setPage] = useState(1);
  const [limitNotice, setLimitNotice] = useState<string | null>(null);

  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, sortBy]);

  const {data: clubsPage, isLoading} = useQuery({
    queryKey: ['clubs-paginated', debouncedSearch, category, sortBy, page],
    queryFn: () =>
      apiClient.listClubsPaginated({
        search: debouncedSearch,
        category,
        sortBy,
        page,
        pageSize: 12,
      }),
  });

  const clubs = clubsPage?.items || [];

  const {data: followedClubs = []} = useQuery({
    queryKey: ['followed-clubs'],
    queryFn: () => apiClient.getMyFollowedClubs(),
    enabled: isAuthenticated && followedClubIds.length > 0,
  });

  const followMutation = useMutation({
    mutationFn: (clubId: string) => apiClient.followClub(clubId),
    onSuccess: async () => {
      setLimitNotice(null);
      await refreshSession();
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['clubs']}),
        queryClient.invalidateQueries({queryKey: ['clubs-paginated']}),
        queryClient.invalidateQueries({queryKey: ['hall-of-fame']}),
        queryClient.invalidateQueries({queryKey: ['followed-clubs']}),
        queryClient.invalidateQueries({queryKey: ['club']}),
      ]);
      toast.success('Club followed');
    },
    onError: (err) => {
      const msg = err instanceof Error ? err.message : 'Unable to follow club';
      setLimitNotice(msg);
      toast.error('Follow limit reached', msg);
    },
  });

  const unfollowMutation = useMutation({
    mutationFn: (clubId: string) => apiClient.unfollowClub(clubId),
    onSuccess: async () => {
      setLimitNotice(null);
      await refreshSession();
      await Promise.all([
        queryClient.invalidateQueries({queryKey: ['clubs']}),
        queryClient.invalidateQueries({queryKey: ['clubs-paginated']}),
        queryClient.invalidateQueries({queryKey: ['hall-of-fame']}),
        queryClient.invalidateQueries({queryKey: ['followed-clubs']}),
        queryClient.invalidateQueries({queryKey: ['club']}),
      ]);
      toast.info('Club unfollowed');
    },
    onError: (err) => {
      toast.error('Unable to unfollow club', err instanceof Error ? err.message : undefined);
    },
  });

  const atLimit = followedClubIds.length >= MAX_FOLLOWED_CLUBS;

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Explore Campus Clubs</h1>
          <p className="mt-1 text-sm text-slate-600">
            Follow up to {MAX_FOLLOWED_CLUBS} clubs simultaneously ({followedClubIds.length}/
            {MAX_FOLLOWED_CLUBS} active).
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label htmlFor="club-sort-select" className="text-xs font-medium text-slate-500">
            Sort by
          </label>
          <select
            id="club-sort-select"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-800"
          >
            <option value="followers">Most Followers</option>
            <option value="events">Upcoming Events</option>
            <option value="name">Alphabetical</option>
          </select>
        </div>
      </div>

      {(atLimit || limitNotice) && (
        <div
          role="status"
          className="flex flex-col gap-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
            <div>
              <p className="font-semibold">
                Two-Club Follow Limit Reached ({followedClubIds.length}/{MAX_FOLLOWED_CLUBS})
              </p>
              <p className="mt-0.5 leading-relaxed text-amber-800">
                {limitNotice ||
                  'CampusVerse caps student follows at two clubs to keep Hall of Fame rankings meaningful. Unfollow one of your existing clubs to follow a new club.'}
              </p>
            </div>
          </div>

          {followedClubs.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              {followedClubs.map((fc) => (
                <Button
                  key={fc.id}
                  size="sm"
                  variant="outline"
                  loading={unfollowMutation.isPending && unfollowMutation.variables === fc.id}
                  onClick={() => unfollowMutation.mutate(fc.id)}
                >
                  <UserMinus className="h-3.5 w-3.5 text-amber-700" />
                  Unfollow {fc.name}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Search + Category filter controls */}
      <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="relative w-full lg:max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search clubs by name or focus..."
            aria-label="Search clubs"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600"
          />
        </div>

        <div className="flex flex-wrap items-center gap-1 rounded-lg bg-slate-100 p-1">
          {['All', ...CLUB_CATEGORIES].map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setCategory(cat)}
              className={`rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                category === cat
                  ? 'bg-white text-slate-900 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : clubs.length === 0 ? (
        <EmptyState
          icon={<Compass className="h-6 w-6" />}
          title="No clubs match your filter"
          description="Try clearing your search query or switching back to All categories."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setCategory('All');
              }}
            >
              Reset Filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-5 md:grid-cols-2">
            {clubs.map((club) => {
              const isFollowing = followedClubIds.includes(club.id);
              const busy =
                (followMutation.isPending && followMutation.variables === club.id) ||
                (unfollowMutation.isPending && unfollowMutation.variables === club.id);

              return (
                <Card key={club.id} className="flex flex-col justify-between p-6">
                  <div>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5 min-w-0">
                        <ClubLogo name={club.name} logoUrl={club.logoUrl} size="md" />
                        <div className="min-w-0">
                          <Link
                            to={`/app/student/clubs/${club.id}`}
                            className="font-display text-base font-semibold text-slate-900 hover:text-violet-700"
                          >
                            {club.name}
                          </Link>
                          <p className="mt-0.5 text-xs text-slate-500">
                            {club.category} ·{' '}
                            <span className="font-mono tabular-nums">{club.followerCount}</span>{' '}
                            followers ·{' '}
                            <span className="font-mono tabular-nums">
                              {club.upcomingEventsCount}
                            </span>{' '}
                            events
                          </p>
                        </div>
                      </div>
                    </div>
                    <p className="mt-4 text-sm text-slate-600 leading-relaxed">{club.tagline}</p>
                  </div>

                  <div className="mt-6 flex items-center justify-between gap-3 border-t border-slate-100 pt-4">
                    <Link
                      to={`/app/student/clubs/${club.id}`}
                      className="text-xs font-medium text-blue-600 hover:text-blue-700 whitespace-nowrap"
                    >
                      View Club Profile
                    </Link>

                    {isFollowing ? (
                      <Button
                        size="sm"
                        variant="outline"
                        loading={busy}
                        onClick={() => unfollowMutation.mutate(club.id)}
                      >
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        Following
                        <UserMinus className="h-3.5 w-3.5 text-slate-400" />
                      </Button>
                    ) : (
                      <Button
                        size="sm"
                        variant={atLimit ? 'outline' : 'primary'}
                        loading={busy}
                        onClick={() => followMutation.mutate(club.id)}
                      >
                        <UserPlus className="h-3.5 w-3.5" />
                        {atLimit ? 'Limit Reached (2/2)' : 'Follow Club'}
                      </Button>
                    )}
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="overflow-hidden">
            <PaginationBar pagination={clubsPage?.pagination} onPageChange={setPage} />
          </Card>
        </div>
      )}
    </div>
  );
};
