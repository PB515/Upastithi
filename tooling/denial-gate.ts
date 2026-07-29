#!/usr/bin/env tsx
/**
 * denial-gate — proves the cross-ROLE items of the denial gate specified in
 * docs/data-model-security.md §8 (Admin / Viewer / anon). The cross-EVENT
 * items later in that checklist (Management token scoping) can't be proven
 * yet — no /e/[token] route exists — they get proven when that feature ships.
 *
 * DB-backed, so it lives here rather than in template/tests (vitest there is
 * scoped to pure lib/logic unit tests — see vitest.config.ts's own comment;
 * DB-backed verification is tooling/verify's job). Built on tooling/verify's
 * exported harness (non-prod only — connect()/assertNonProd() refuse
 * anything that isn't clearly local).
 *
 * Usage: npx tsx tooling/denial-gate.ts
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { connect, serviceClient } from './verify';

function loadEnv(): void {
  for (const f of ['.env.local', 'template/.env.local', '.env', 'template/.env']) {
    try {
      process.loadEnvFile(f);
    } catch {
      /* absent — fine */
    }
  }
}
loadEnv();

const c = {
  green: (s: string) => `\x1b[32m${s}\x1b[0m`,
  red: (s: string) => `\x1b[31m${s}\x1b[0m`,
  dim: (s: string) => `\x1b[2m${s}\x1b[0m`,
};

function anonClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}

let failures = 0;
function check(label: string, cond: boolean, detail?: string): void {
  if (cond) {
    console.log(`  ${c.green('✓')} ${label}`);
  } else {
    failures++;
    console.log(`  ${c.red('✗')} ${label}${detail ? ` — ${detail}` : ''}`);
  }
}

/**
 * "Denied" can show up two ways in this schema, both correct:
 *  - a hard permission error (no table-level GRANT at all for this role —
 *    e.g. anon on every table, or authenticated on event_access_tokens), or
 *  - success with zero rows (GRANT exists, RLS filters every row out).
 * Both count as denial; only "success with rows" or "write succeeded" fail.
 */
function isDenied(error: { message: string } | null, data: unknown[] | null): boolean {
  return !!error || (data?.length ?? 0) === 0;
}

async function main() {
  const service = serviceClient();
  const pg = await connect();

  const stamp = Date.now();
  const ADMIN_EMAIL = `denial-gate-admin-${stamp}@test.local`;
  const VIEWER_EMAIL = `denial-gate-viewer-${stamp}@test.local`;
  const PASSWORD = 'denial-gate-test-password';

  let adminUserId: string | undefined;
  let viewerUserId: string | undefined;
  let seededEventId: string | undefined;

  try {
    const { data: adminUser, error: adminErr } = await service.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (adminErr || !adminUser.user) throw adminErr ?? new Error('no admin user returned');
    adminUserId = adminUser.user.id;

    const { data: viewerUser, error: viewerErr } = await service.auth.admin.createUser({
      email: VIEWER_EMAIL,
      password: PASSWORD,
      email_confirm: true,
    });
    if (viewerErr || !viewerUser.user) throw viewerErr ?? new Error('no viewer user returned');
    viewerUserId = viewerUser.user.id;

    const { error: staffSeedErr } = await service.from('staff').insert([
      { user_id: adminUserId, role: 'admin' },
      { user_id: viewerUserId, role: 'viewer' },
    ]);
    if (staffSeedErr) throw staffSeedErr;

    console.log(c.dim('\ncross-role denial gate — data-model-security.md §8 (cross-role items)\n'));

    // ---------- anon (no session) ----------
    console.log('anon (no session):');
    const anon = anonClient();

    {
      const { data, error } = await anon.from('events').select('*');
      check('select events → denied', isDenied(error, data));
    }
    {
      const { error } = await anon
        .from('events')
        .insert({ name: 'x', event_date: '2026-01-01', created_by: adminUserId });
      check('insert events → fails', !!error, error ? undefined : 'insert succeeded, should have failed');
    }
    {
      const { data, error } = await anon.from('staff').select('*');
      check('select staff → denied', isDenied(error, data));
    }
    {
      const { data, error } = await anon.from('event_access_tokens').select('*');
      check('select event_access_tokens → denied', isDenied(error, data));
    }
    {
      const { data, error } = await anon.from('attendees').select('*');
      check('select attendees → denied', isDenied(error, data));
    }
    {
      const { data, error } = await anon.from('audit_log').select('*');
      check('select audit_log → denied', isDenied(error, data));
    }

    // ---------- admin ----------
    console.log('\nadmin:');
    const adminClient = anonClient();
    const { error: adminSignInErr } = await adminClient.auth.signInWithPassword({
      email: ADMIN_EMAIL,
      password: PASSWORD,
    });
    if (adminSignInErr) throw adminSignInErr;

    {
      const { data, error } = await adminClient
        .from('events')
        .insert({ name: 'Denial gate test event', event_date: '2026-01-01', created_by: adminUserId })
        .select()
        .single();
      check('insert events → succeeds', !error && !!data, error?.message);
      seededEventId = data?.id;
    }
    if (seededEventId) {
      const { error } = await adminClient
        .from('events')
        .update({ location: 'Test hall' })
        .eq('id', seededEventId);
      check('update events → succeeds', !error, error?.message);
    }
    {
      const { data, error } = await adminClient.from('staff').select('*');
      check('select staff (sees all rows) → succeeds', !error && (data?.length ?? 0) >= 2, error?.message);
    }
    {
      const { data, error } = await adminClient.from('event_access_tokens').select('*');
      check(
        'select event_access_tokens → denied (zero policies, admin included)',
        isDenied(error, data)
      );
    }

    // ---------- viewer ----------
    console.log('\nviewer:');
    const viewerClient = anonClient();
    const { error: viewerSignInErr } = await viewerClient.auth.signInWithPassword({
      email: VIEWER_EMAIL,
      password: PASSWORD,
    });
    if (viewerSignInErr) throw viewerSignInErr;

    {
      const { data, error } = await viewerClient.from('events').select('*');
      check('select events → succeeds', !error && (data?.length ?? 0) >= 1, error?.message);
    }
    if (seededEventId) {
      // UPDATE denial in Postgres RLS is usually SILENT, not a thrown error:
      // if no applicable policy's USING clause matches the row, it's simply
      // not found to update — 0 rows affected, error stays null. Checking
      // `!error` alone can't distinguish "correctly denied" from "actually
      // updated" — must inspect the returned row count via .select().
      const { data, error } = await viewerClient
        .from('events')
        .update({ location: 'Should not work' })
        .eq('id', seededEventId)
        .select();
      check('update events → denied (0 rows affected)', isDenied(error, data));

      const { error: insertErr } = await viewerClient
        .from('attendees')
        .insert({ event_id: seededEventId, name: 'Should not work' });
      check('insert attendees → fails', !!insertErr, insertErr ? undefined : 'insert succeeded, should have failed');
    }
    {
      const { data, error } = await viewerClient.from('event_access_tokens').select('*');
      check(
        'select event_access_tokens → denied (zero policies)',
        isDenied(error, data)
      );
    }
    {
      const { data, error } = await viewerClient.from('staff').select('*');
      const onlyOwnRow = (data?.length ?? -1) === 1 && data?.[0]?.user_id === viewerUserId;
      check('select staff → sees only own row, not admin\'s', !error && onlyOwnRow, error?.message);
    }
    {
      const { data, error } = await viewerClient.from('audit_log').select('*');
      check('select audit_log → denied (confirmed deny)', isDenied(error, data));
    }
  } finally {
    // Teardown — leave the DB clean. Deleting the auth user cascades to its
    // staff row (staff.user_id references auth.users(id) on delete cascade).
    if (seededEventId) await pg.query('delete from events where id = $1', [seededEventId]);
    if (adminUserId) await service.auth.admin.deleteUser(adminUserId);
    if (viewerUserId) await service.auth.admin.deleteUser(viewerUserId);
    await pg.end();
  }

  console.log('');
  if (failures > 0) {
    console.log(c.red(`✗ ${failures} check(s) failed`));
    process.exit(1);
  }
  console.log(c.green('✓ all cross-role denial checks passed'));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
