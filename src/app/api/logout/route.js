// src/app/api/logout/route.js
import { NextResponse } from 'next/server';
import { clearSessionCookie } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({
    message: 'Logged out successfully'
  });
  
  response.headers.set('Set-Cookie', clearSessionCookie());
  return response;
}

