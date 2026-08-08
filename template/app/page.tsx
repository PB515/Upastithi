import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export default async function Home() {
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

  if (staffRow?.role === 'admin') redirect('/admin');
  if (staffRow?.role === 'viewer') redirect('/viewer');

  redirect('/login?error=Not authorized for this account');
}
