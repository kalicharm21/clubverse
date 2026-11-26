import React, {useEffect, useState} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Calendar, MapPin, Search} from 'lucide-react';
import {Link, useSearchParams} from 'react-router-dom';
import {EVENT_CATEGORIES} from '../../../shared/constants/permissions.ts';
import {apiClient} from '../../adapters/ApiDataAdapter.ts';
import {Button} from '../../components/ui/Button.tsx';
import {Card} from '../../components/ui/FormControls.tsx';
import {EmptyState, LoadingSkeleton, StatusLabel} from '../../components/ui/Feedback.tsx';
import {PaginationBar} from '../../components/ui/PaginationBar.tsx';
import {useDebouncedValue} from '../../hooks/useDebouncedValue.ts';

export const EventsPage: React.FC = () => {
  const [searchParams] = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [category, setCategory] = useState('All');
  const [clubId, setClubId] = useState('All');
  const [upcomingOnly, setUpcomingOnly] = useState(true);
  const [page, setPage] = useState(1);

  const debouncedSearch = useDebouncedValue(search, 250);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, clubId, upcomingOnly]);

  const {data: clubs = []} = useQuery({
    queryKey: ['clubs'],
    queryFn: () => apiClient.listClubs(),
  });

  const {data: eventsPage, isLoading} = useQuery({
    queryKey: ['events', debouncedSearch, category, clubId, upcomingOnly, page],
    queryFn: () =>
      apiClient.listEventsPaginated({
        search: debouncedSearch,
        category,
        clubId,
        upcomingOnly,
        page,
        pageSize: 12,
      }),
  });

  const events = eventsPage?.items || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-end">
        <div>
          <h1 className="font-display text-2xl font-bold text-slate-900">Campus Events</h1>
          <p className="mt-1 text-sm text-slate-600">
            Discover workshops, hackathons, seminars, and cultural nights across campus clubs.
          </p>
        </div>

        <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 self-start">
          <button
            type="button"
            onClick={() => setUpcomingOnly(true)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              upcomingOnly ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Upcoming Open
          </button>
          <button
            type="button"
            onClick={() => setUpcomingOnly(false)}
            className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
              !upcomingOnly ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            All Events
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="grid gap-3 md:grid-cols-12">
        <div className="relative md:col-span-5">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search events by title, club, or venue..."
            aria-label="Search events"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-600"
          />
        </div>
        <div className="md:col-span-3">
          <select
            aria-label="Filter by category"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="All">All Categories</option>
            {EVENT_CATEGORIES.map((cat) => (
              <option key={cat} value={cat}>
                {cat}
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-4">
          <select
            aria-label="Filter by organizing club"
            value={clubId}
            onChange={(e) => setClubId(e.target.value)}
            className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800"
          >
            <option value="All">All Clubs</option>
            {clubs.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {isLoading ? (
        <LoadingSkeleton rows={4} />
      ) : events.length === 0 ? (
        <EmptyState
          icon={<Calendar className="h-6 w-6" />}
          title="No matching events"
          description="Adjust your search query, category, or club filter to discover open campus events."
          action={
            <Button
              variant="outline"
              onClick={() => {
                setSearch('');
                setCategory('All');
                setClubId('All');
              }}
            >
              Clear Filters
            </Button>
          }
        />
      ) : (
        <div className="space-y-4">
          <div className="grid gap-5 md:grid-cols-2">
            {events.map((ev) => {
              const isFull = ev.registeredCount >= ev.capacity;
              return (
                <Card key={ev.id} className="overflow-hidden flex flex-col justify-between">
                  <div className="p-6">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-medium text-violet-700">
                        {ev.clubName} · {ev.category}
                      </span>
                      <StatusLabel status={ev.status} />
                    </div>

                    <Link
                      to={`/app/student/events/${ev.id}`}
                      className="mt-2 block font-display text-lg font-semibold text-slate-900 hover:text-violet-700"
                    >
                      {ev.title}
                    </Link>
                    <p className="mt-2 line-clamp-2 text-sm text-slate-600 leading-relaxed">
                      {ev.description}
                    </p>

                    <div className="mt-4 space-y-1.5 text-xs text-slate-500">
                      <p className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5 shrink-0" />
                        <span>
                          {new Date(ev.startTime).toLocaleDateString()} ·{' '}
                          {new Date(ev.startTime).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </span>
                      </p>
                      <p className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        <span>{ev.venue}</span>
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center justify-between border-t border-slate-100 bg-slate-50/60 px-6 py-3.5">
                    <span className="font-mono text-xs text-slate-600 tabular-nums">
                      {ev.registeredCount}/{ev.capacity} registered
                      {isFull ? ' · Waitlist Open' : ''}
                      {ev.isPaid ? ` · INR ${ev.feeAmount}` : ' · Free'}
                    </span>
                    <Link
                      to={`/app/student/events/${ev.id}`}
                      className="rounded-lg bg-violet-700 px-3.5 py-1.5 text-xs font-medium text-white hover:bg-violet-800 whitespace-nowrap"
                    >
                      View &amp; Register
                    </Link>
                  </div>
                </Card>
              );
            })}
          </div>
          <Card className="overflow-hidden">
            <PaginationBar pagination={eventsPage?.pagination} onPageChange={setPage} />
          </Card>
        </div>
      )}
    </div>
  );
};
