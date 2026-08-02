/**
 * requireAdmin — the re-check every admin-only Server Action runs for
 * itself, not just relied on from the page render that led to it. A Server
 * Action is a direct RPC endpoint; the page's own auth check doesn't cover
 * a forged/replayed call to the action itself. Throws if the caller isn't a
 * signed-in admin.
 */
import 'server-only';
import { createClient } from './supabase/server';

export async function requireAdmin(): Promise<{ userId: string }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not authenticated');

  const { data: staffRow } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (staffRow?.role !== 'admin') throw new Error('Not authorized');

  return { userId: user.id };
}
