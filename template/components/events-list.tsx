'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { Database } from '@/lib/supabase/database.types';
import { EmptyState } from '@/lib/patterns/empty-state';
import { Plus, Search } from '@/lib/icons';
import { formatEventDate } from '@/lib/format-date';

type Event = Database['public']['Tables']['events']['Row'];
export type EventWithCount = Event & { attendeeCount?: number };

export interface EventsListProps {
  events: EventWithCount[];
  /** Row link target prefix, e.g. "/admin/events". Omit to render plain,
   * unlinked rows — used by Viewer, which doesn't have a detail page yet. */
  basePath?: string;
  /** Shows the "Create event" empty-state action. Admin only. */
  canCreate?: boolean;
}

type DateFilter = 'all' | 'upcoming' | 'past';

export function EventsList({ events, basePath, canCreate }: EventsListProps) {
  const [query, setQuery] = useState('');
  const [dateFilter, setDateFilter] = useState<DateFilter>('all');

  // Stable for the component's lifetime — avoids the filter subtly shifting
  // mid-session if someone leaves the tab open across midnight.
  const [todayIso] = useState(() => new Date().toISOString().slice(0, 10));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return events.filter((event) => {
      if (q && !event.name.toLowerCase().includes(q)) return false;
      if (dateFilter === 'upcoming' && event.event_date < todayIso) return false;
      if (dateFilter === 'past' && event.event_date >= todayIso) return false;
      return true;
    });
  }, [events, query, dateFilter, todayIso]);

  if (events.length === 0) {
    return (
      <EmptyState
        title="No events yet"
        message={
          canCreate
            ? 'Create the first event to get started.'
            : 'No events have been created yet.'
        }
        action={
          canCreate ? (
            <Link
              href="/admin/events/new"
              className="inline-flex items-center gap-1 rounded-[var(--radius)] bg-accent px-3 py-2 text-sm text-accent-foreground"
            >
              <Plus className="size-4" aria-hidden /> Create event
            </Link>
          ) : undefined
        }
      />
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative">
          <Search
            className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted"
            aria-hidden
          />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search events..."
            aria-label="Search events"
            className="w-full rounded-[var(--radius)] border border-border py-2 pl-8 pr-3 text-sm sm:w-56"
          />
        </div>
        <div className="flex gap-1 text-sm" role="tablist" aria-label="Filter by date">
          {(['all', 'upcoming', 'past'] as const).map((f) => (
            <button
              key={f}
              type="button"
              role="tab"
              aria-selected={dateFilter === f}
              onClick={() => setDateFilter(f)}
              className={`rounded-[var(--radius)] px-3 py-1.5 ${
                dateFilter === f
                  ? 'bg-accent text-accent-foreground'
                  : 'border border-border'
              }`}
            >
              {f === 'all' ? 'All' : f === 'upcoming' ? 'Upcoming' : 'Past'}
            </button>
          ))}
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-muted">No events match your search.</p>
      ) : (
        <ul className="divide-y divide-border rounded-[var(--radius)] border border-border">
          {filtered.map((event) => {
            const row = (
              <div className="flex items-center justify-between gap-2 p-4">
                <div className="flex flex-col gap-1">
                  <span className="font-medium">{event.name}</span>
                  <span className="text-sm text-muted">
                    {formatEventDate(event.event_date)}
                    {event.location ? ` · ${event.location}` : ''}
                  </span>
                </div>
                {typeof event.attendeeCount === 'number' && (
                  <span className="whitespace-nowrap rounded-full border border-border px-2 py-0.5 text-xs text-muted">
                    {event.attendeeCount} {event.attendeeCount === 1 ? 'attendee' : 'attendees'}
                  </span>
                )}
              </div>
            );
            return (
              <li key={event.id}>
                {basePath ? (
                  <Link href={`${basePath}/${event.id}`} className="block hover:bg-black/5">
                    {row}
                  </Link>
                ) : (
                  row
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
