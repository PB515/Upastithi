import Link from 'next/link';
import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';
import { StaffPanel } from './staff-panel';
import { listStaff } from './actions';

export default async function StaffPage() {
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
  if (staffRow?.role !== 'admin') {
    redirect('/login?error=Not authorized for this account');
  }

  const staff = await listStaff();

  return (
    <main className="flex-1 p-6">
      <div className="mb-4">
        <Link href="/admin" className="text-sm underline">
          &larr; Back to events
        </Link>
      </div>
      <h1 className="mb-4 font-display text-xl">Staff</h1>
      <StaffPanel initialStaff={staff} currentUserId={user.id} />
    </main>
  );
}
