'use client';

import { ViewEditForm } from '@/lib/patterns/view-edit-form';
import { formatEventDate } from '@/lib/format-date';
import { updateEvent, type EventDraft } from './actions';

export function EventDetailForm({
  eventId,
  initial,
}: {
  eventId: string;
  initial: EventDraft;
}) {
  return (
    <ViewEditForm<EventDraft>
      initial={initial}
      save={(draft) => updateEvent(eventId, draft)}
      view={(value, edit) => (
        <div className="space-y-3">
          <div>
            <div className="text-sm text-muted">Event name</div>
            <div className="font-medium">{value.name}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Date</div>
            <div>{formatEventDate(value.event_date)}</div>
          </div>
          <div>
            <div className="text-sm text-muted">Location</div>
            <div>{value.location || 'Not set'}</div>
          </div>
          <button
            type="button"
            onClick={edit}
            className="rounded-[var(--radius)] border border-border px-3 py-2 text-sm"
          >
            Edit
          </button>
        </div>
      )}
      edit={({ draft, set, save, cancel, saving, error }) => (
        <div className="space-y-3">
          {error && (
            <p className="text-sm text-red-600" role="alert">
              {error}
            </p>
          )}
          <div className="space-y-1">
            <label htmlFor="edit-name" className="block text-sm text-muted">
              Event name
            </label>
            <input
              id="edit-name"
              value={draft.name}
              onChange={(e) => set({ name: e.target.value })}
              className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-date" className="block text-sm text-muted">
              Date
            </label>
            <input
              id="edit-date"
              type="date"
              value={draft.event_date}
              onChange={(e) => set({ event_date: e.target.value })}
              className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="edit-location" className="block text-sm text-muted">
              Location
            </label>
            <input
              id="edit-location"
              value={draft.location}
              onChange={(e) => set({ location: e.target.value })}
              className="w-full rounded-[var(--radius)] border border-border px-3 py-2"
            />
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={save}
              disabled={saving}
              className="rounded-[var(--radius)] bg-accent px-3 py-2 text-sm text-accent-foreground disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              type="button"
              onClick={cancel}
              disabled={saving}
              className="rounded-[var(--radius)] border border-border px-3 py-2 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    />
  );
}
