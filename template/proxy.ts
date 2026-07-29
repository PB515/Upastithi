import { type NextRequest } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

// Next.js 16 renamed the root "middleware.ts" convention to "proxy.ts" (the
// exported function follows: `proxy`, not `middleware`). This file still
// calls the existing lib/supabase/middleware.ts helper — that one keeps its
// name, it's the IDP's own "4-client split" naming, not the Next.js
// file-convention this renaming applies to.
export async function proxy(request: NextRequest) {
  const { supabaseResponse } = await updateSession(request);
  return supabaseResponse;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
