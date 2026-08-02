'use server';

import { redirect } from 'next/navigation';

/**
 * No verification happens here — it just forwards the code to /e/[token],
 * which already knows how to check both the link and short-code paths
 * (lib/management-token.ts's verifyManagementAccess). One verification
 * path, not two, keeps the "same generic denial message either way"
 * guarantee (§5.4) from having to be reimplemented in a second place.
 */
export async function redeemCode(formData: FormData) {
  const code = String(formData.get('code') ?? '').trim().toUpperCase();
  if (!code) redirect('/e?error=Enter a code');
  redirect(`/e/${encodeURIComponent(code)}`);
}
