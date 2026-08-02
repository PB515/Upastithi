'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function createEvent(formData: FormData) {
  const name = String(formData.get('name') ?? '').trim();
  const eventDate = String(formData.get('event_date') ?? '').trim();
  const location = String(formData.get('location') ?? '').trim();

  // Never trust client-only validation (the form's `required` attributes) —
  // re-check server-side.
  if (!name) {
    redirect('/admin/events/new?error=Event name is required');
  }
  if (!eventDate || Number.isNaN(Date.parse(eventDate))) {
    redirect('/admin/events/new?error=A valid event date is required');
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data, error } = await supabase
    .from('events')
    .insert({
      name,
      event_date: eventDate,
      location: location || null,
      created_by: user.id,
    })
    .select('id')
    .single();

  if (error || !data) {
    redirect('/admin/events/new?error=Could not create the event, try again');
  }

  redirect(`/admin/events/${data.id}`);
}
