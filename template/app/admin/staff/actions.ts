'use server';

import { randomBytes } from 'node:crypto';
import { revalidatePath } from 'next/cache';
import { createServiceRoleClient } from '@/lib/supabase/service-role';
import { requireAdmin } from '@/lib/require-admin';
import { writeAuditLog } from '@/lib/patterns/audit-log';

export interface StaffSummary {
  userId: string;
  email: string | null;
  role: 'admin' | 'viewer';
}

/**
 * Creating/deleting an auth.users row is never something any client-role
 * session can do directly, regardless of RLS — it's a GoTrue admin-API
 * operation. Every action here is service-role-mediated after a fresh
 * requireAdmin() check, same pattern as the event-access-grant actions.
 */
export async function listStaff(): Promise<StaffSummary[]> {
  await requireAdmin();
  const service = createServiceRoleClient();

  const { data: staffRows, error } = await service
    .from('staff')
    .select('user_id, role')
    .order('role', { ascending: true });
  if (error) throw new Error('Could not load staff');

  const { data: usersPage } = await service.auth.admin.listUsers();
  const emailByUserId = new Map(usersPage?.users.map((u) => [u.id, u.email ?? null]) ?? []);

  return (staffRows ?? []).map((s) => ({
    userId: s.user_id,
    email: emailByUserId.get(s.user_id) ?? null,
    role: s.role as 'admin' | 'viewer',
  }));
}

export interface AddedViewer {
  email: string;
  tempPassword: string;
}

export async function addViewer(email: string): Promise<AddedViewer> {
  const { userId: actorId } = await requireAdmin();

  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail || !trimmedEmail.includes('@')) {
    throw new Error('Enter a valid email address');
  }

  const service = createServiceRoleClient();
  // Random temp password, Node built-in, no new dep — shown once below,
  // same "copy this now" pattern as generateGrant. Not an email invite:
  // that needs real SMTP configured first, a separate decision.
  const tempPassword = randomBytes(12).toString('base64url');

  const { data: created, error: createError } = await service.auth.admin.createUser({
    email: trimmedEmail,
    password: tempPassword,
    email_confirm: true,
  });

  if (createError || !created.user) {
    throw new Error('An account with that email already exists, or the address is invalid');
  }

  const { error: staffError } = await service
    .from('staff')
    .insert({ user_id: created.user.id, role: 'viewer' });
  if (staffError) {
    throw new Error('Account created, but could not grant Viewer access. Try removing and re-adding.');
  }

  await writeAuditLog(service, {
    actorId,
    action: 'staff.viewer_added',
    entity: 'staff',
    entityId: created.user.id,
    meta: { email: trimmedEmail },
  });

  revalidatePath('/admin/staff');

  return { email: trimmedEmail, tempPassword };
}

export async function removeViewer(userId: string): Promise<void> {
  const { userId: actorId } = await requireAdmin();
  const service = createServiceRoleClient();

  // Re-check the target is actually a Viewer, not just trust the id passed
  // in — this action must never be usable to remove an Admin.
  const { data: target } = await service.from('staff').select('role').eq('user_id', userId).single();
  if (!target || target.role !== 'viewer') {
    throw new Error('Can only remove Viewer accounts here');
  }

  const { error } = await service.auth.admin.deleteUser(userId);
  if (error) throw new Error('Could not remove the account');

  await writeAuditLog(service, {
    actorId,
    action: 'staff.viewer_removed',
    entity: 'staff',
    entityId: userId,
    meta: {},
  });

  revalidatePath('/admin/staff');
}
