import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { signOut } from '../login/actions';

// Phase 1: proves session + role routing works. No event/attendee content
// yet — that's a later "features" phase, per the security-first build order.
export default async function ViewerPage() {
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

  return (
    <main className="flex-1 p-6">
      <div className="mb-4 flex items-center justify-between">
        <h1 className="font-display text-xl">Viewer</h1>
        <form action={signOut}>
          <button type="submit" className="text-sm underline">
            Sign out
          </button>
        </form>
      </div>
      <p className="text-muted">
        Signed in as {user.email}, role: viewer (read-only).
      </p>
    </main>
  );
}
