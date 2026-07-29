#!/usr/bin/env tsx
/**
 * dev-seed — creates one local admin + one local viewer test user.
 *
 * Manual, local-dev-only tool. Not wired into any npm script or CI — run
 * directly with `npx tsx tooling/dev-seed.ts` after `npm run db:start` +
 * `npm run migrate:up`. Matches docs/data-model-security.md §2: there is no
 * self-serve "become admin" path in the app; the first accounts are always
 * created out-of-band, via the service-role Admin API (locally) or the
 * Supabase dashboard (production) — never a public signup page.
 */

import { createClient } from '@supabase/supabase-js';

function loadEnv(): void {
  for (const file of ['.env.local', 'template/.env.local', '.env', 'template/.env']) {
    try {
      process.loadEnvFile(file); // Node >=20.6
    } catch {
      /* file absent — fine */
    }
  }
}
loadEnv();

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !serviceRoleKey) {
  console.error(
    'Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY — ' +
      'is template/.env.local set up? (npm run db:start first)'
  );
  process.exit(1);
}

const supabase = createClient(url, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const SEED_USERS = [
  { email: 'admin@upasthiti.test', password: 'dev-admin-password', role: 'admin' as const },
  { email: 'viewer@upasthiti.test', password: 'dev-viewer-password', role: 'viewer' as const },
];

async function main() {
  for (const { email, password, role } of SEED_USERS) {
    const { data: created, error: createError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });

    let userId = created?.user?.id;

    if (createError) {
      // Already exists from a previous run of this script — reuse it.
      const { data: list, error: listError } = await supabase.auth.admin.listUsers();
      if (listError) throw listError;
      const existing = list.users.find((u) => u.email === email);
      if (!existing) throw createError;
      userId = existing.id;
      console.log(`  ${email} — already exists, reusing`);
    } else {
      console.log(`  ${email} — created`);
    }

    if (!userId) throw new Error(`No user id resolved for ${email}`);

    const { error: staffError } = await supabase
      .from('staff')
      .upsert({ user_id: userId, role }, { onConflict: 'user_id' });
    if (staffError) throw staffError;

    console.log(`  ${email} — staff row set to role=${role}`);
  }

  console.log('\nDone. Sign in at /login with:');
  for (const { email, password, role } of SEED_USERS) {
    console.log(`  ${role.padEnd(6)} ${email} / ${password}`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
