/**
 * formatEventDate — shared date formatting for both server and client
 * components. Deliberately its own file, not colocated in a 'use client'
 * component: once a file has 'use client' at the top, Next.js treats every
 * export as client-only, even a plain pure function — a Server Component
 * importing it fails at runtime, not build time (caught this the hard way:
 * events-list.tsx went client in Slice 3, which silently broke
 * /e/[token]/page.tsx, a Server Component, until it was browser-tested
 * again in Slice 4).
 */
export function formatEventDate(dateStr: string): string {
  return new Date(`${dateStr}T00:00:00`).toLocaleDateString('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}
