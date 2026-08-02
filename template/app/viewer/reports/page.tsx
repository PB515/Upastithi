import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { ReportsView } from '@/components/reports-view';

export default async function ViewerReportsPage() {
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');

  const { data: staffRow } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (staffRow?.role !== 'viewer') {
    redirect('/login?error=Not authorized for this account');
  }

  const [{ data: events }, { data: attendees }] = await Promise.all([
    supabase.from('events').select('id, name, event_date'),
    supabase.from('attendees').select('event_id, present'),
  ]);

  return (
    <main className="flex-1 p-6">
      <div className="mb-4">
        <Link href="/viewer" className="text-sm underline">
          &larr; Back to events
        </Link>
      </div>
      <h1 className="mb-4 font-display text-xl">Reports</h1>
      <ReportsView events={events ?? []} attendees={attendees ?? []} />
    </main>
  );
}
