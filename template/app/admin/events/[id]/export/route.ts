import { NextResponse } from 'next/server';
import { createClient } from '@/lib/supabase/server';

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const supabase = await createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return new NextResponse('Not authenticated', { status: 401 });

  const { data: staffRow } = await supabase
    .from('staff')
    .select('role')
    .eq('user_id', user.id)
    .single();
  if (staffRow?.role !== 'admin') return new NextResponse('Not authorized', { status: 403 });

  const { data: event } = await supabase.from('events').select('name').eq('id', id).single();
  if (!event) return new NextResponse('Not found', { status: 404 });

  const { data: attendees, error } = await supabase
    .from('attendees')
    .select('name, phone, present, remarks, created_at')
    .eq('event_id', id)
    .order('name', { ascending: true });
  if (error) return new NextResponse('Could not load attendees', { status: 500 });

  const header = ['Name', 'Phone', 'Present', 'Remarks', 'Registered At'];
  const rows = (attendees ?? []).map((a) => [
    a.name,
    a.phone ?? '',
    a.present ? 'Yes' : 'No',
    a.remarks ?? '',
    new Date(a.created_at).toLocaleString('en-IN'),
  ]);
  const csv = [header, ...rows].map((row) => row.map(csvEscape).join(',')).join('\r\n');

  return new NextResponse(csv, {
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${sanitizeFilename(event.name)}-attendees.csv"`,
    },
  });
}

function csvEscape(value: string): string {
  if (/[",\r\n]/.test(value)) return `"${value.replace(/"/g, '""')}"`;
  return value;
}

function sanitizeFilename(name: string): string {
  return name.replace(/[^a-z0-9]+/gi, '-').toLowerCase().replace(/^-+|-+$/g, '') || 'event';
}
