// Retired. This endpoint applied unmoderated ratings keyed by a self-reported email directly to the
// public aggregate. Ratings now arrive only as `pending` comments that an admin approves.
import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  return NextResponse.json(
    { error: 'Gone. Ratings are submitted as comments and moderated before they count.' },
    { status: 410, headers: { 'Cache-Control': 'no-store' } }
  );
}
