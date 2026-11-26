import React from 'react';
import {useQuery} from '@tanstack/react-query';
import {Award} from 'lucide-react';
import {Link} from 'react-router-dom';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Card} from '../../components/ui/FormControls.tsx';
import {ClubLogo, EmptyState, LoadingSkeleton} from '../../components/ui/Feedback.tsx';

export const HallOfFamePage: React.FC = () => {
  const {data: entries = [], isLoading} = useQuery({
    queryKey: ['hall-of-fame'],
    queryFn: () => apiClient.getHallOfFame(),
  });

  const topThree = entries.filter((entry) => entry.rank <= 3);
  const remaining = entries.filter((entry) => entry.rank > 3);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-2xl font-bold text-slate-900">Club Hall of Fame</h1>
        <p className="mt-1 text-sm text-slate-600">
          Live rankings powered by verified student follows (2-club cap per student). Equal follower
          counts share the same rank.
        </p>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={5} />
      ) : entries.length === 0 ? (
        <EmptyState
          icon={<Award className="h-6 w-6" />}
          title="No active clubs ranked yet"
          description="Hall of Fame rankings appear automatically as active campus clubs publish events and receive student follows."
        />
      ) : (
        <>
          {/* Top 3 Podium Showcase (all clubs with rank <= 3 including ties) */}
          <div className="grid gap-5 md:grid-cols-3">
            {topThree.map((entry) => (
              <Card
                key={entry.club.id}
                className={`p-6 ${
                  entry.rank === 1 ? 'border-violet-300 bg-violet-50/30' : 'bg-white'
                }`}
              >
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-1.5 font-mono text-sm font-semibold text-violet-800 tabular-nums">
                    <Award className="h-4 w-4" />
                    Rank #{entry.rank}
                    {entry.tieCount > 1 ? ' (Tied)' : ''}
                  </span>
                  <span className="text-xs text-slate-500">{entry.club.category}</span>
                </div>

                <div className="mt-4 flex items-center gap-3.5">
                  <ClubLogo name={entry.club.name} logoUrl={entry.club.logoUrl} size="md" />
                  <div className="min-w-0">
                    <Link
                      to={`/app/student/clubs/${entry.club.id}`}
                      className="block truncate font-display text-base font-semibold text-slate-900 hover:text-violet-700"
                    >
                      {entry.club.name}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {entry.eventsHosted} hosted events
                    </p>
                  </div>
                </div>

                <p className="mt-3 line-clamp-2 text-xs text-slate-600 leading-relaxed">
                  {entry.club.tagline}
                </p>

                <div className="mt-5 flex items-baseline justify-between border-t border-slate-100 pt-4">
                  <span className="text-xs text-slate-500">Verified Followers</span>
                  <span className="font-mono text-xl font-bold text-slate-900 tabular-nums">
                    {entry.followerCount}
                  </span>
                </div>
              </Card>
            ))}
          </div>

          {/* Remaining Clubs Ranking Table */}
          {remaining.length > 0 && (
            <Card className="overflow-hidden">
              <div className="border-b border-slate-200 px-6 py-4">
                <h2 className="font-display text-base font-semibold text-slate-900">
                  Full Campus Standings
                </h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-sm">
                  <thead className="border-b border-slate-200 bg-slate-50 text-xs font-medium text-slate-500">
                    <tr>
                      <th className="px-6 py-3">Rank</th>
                      <th className="px-6 py-3">Club</th>
                      <th className="px-6 py-3">Category</th>
                      <th className="px-6 py-3 text-right">Events Hosted</th>
                      <th className="px-6 py-3 text-right">Followers</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {remaining.map((entry) => (
                      <tr key={entry.club.id} className="hover:bg-slate-50/70">
                        <td className="px-6 py-3.5 font-mono text-xs font-semibold text-slate-700 tabular-nums">
                          #{entry.rank}
                          {entry.tieCount > 1 ? ' (Tie)' : ''}
                        </td>
                        <td className="px-6 py-3.5">
                          <Link
                            to={`/app/student/clubs/${entry.club.id}`}
                            className="font-medium text-slate-900 hover:text-violet-700"
                          >
                            {entry.club.name}
                          </Link>
                        </td>
                        <td className="px-6 py-3.5 text-xs text-slate-600">{entry.club.category}</td>
                        <td className="px-6 py-3.5 text-right font-mono text-xs text-slate-700 tabular-nums">
                          {entry.eventsHosted}
                        </td>
                        <td className="px-6 py-3.5 text-right font-mono text-sm font-semibold text-slate-900 tabular-nums">
                          {entry.followerCount}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
          )}
        </>
      )}
    </div>
  );
};
