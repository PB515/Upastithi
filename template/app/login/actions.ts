'use server';

import { redirect } from 'next/navigation';
import { createClient } from '@/lib/supabase/server';

export async function signIn(formData: FormData) {
  const email = String(formData.get('email') ?? '');
  const password = String(formData.get('password') ?? '');

  const supabase = await createClient();
  const { data: signInData, error: signInError } =
    await supabase.auth.signInWithPassword({ email, password });

  if (signInError || !signInData.user) {
    redirect('/login?error=Incorrect email or password');
  }

  // Filter by user_id explicitly — RLS's "admins can read all staff" policy
  // means an admin caller would otherwise get every staff row back, breaking
  // .single() the moment there's more than one admin/viewer in the table.
  const { data: staffRow } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', signInData.user.id)
    .single();

  if (!staffRow) {
    await supabase.auth.signOut();
    redirect('/login?error=This account has no access configured');
  }

  redirect(staffRow.role === 'admin' ? '/admin' : '/viewer');
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect('/login');
}
