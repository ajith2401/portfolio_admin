// src/app/api/writings/[id]/rate/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Writing } from '@/models';
import { applyRateLimit } from '@/lib/rateLimit';
import { sanitizeHtml } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const rateLimit = applyRateLimit(request, 'rate-writing', 10, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    await connectDB();
    const { id } = await params;
    const body = await request.json().catch(() => null);
    if (!body || !body.email || body.rating === undefined) {
      return NextResponse.json({ error: 'Email and rating are required' }, { status: 400 });
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const ratingNum = Math.max(1, Math.min(5, Math.round(Number(body.rating))));
    const sanitizedName = sanitizeHtml(String(body.name || 'Anonymous')).trim();

    const writing = await Writing.findById(id);
    if (!writing) {
      return NextResponse.json({ error: 'Writing not found' }, { status: 404 });
    }
    
    await writing.addRating(sanitizedName, String(body.email).trim().toLowerCase(), ratingNum);
    return NextResponse.json({
      averageRating: writing.averageRating,
      totalRatings: writing.totalRatings
    });
  } catch (error) {
    return NextResponse.json({ error: 'Failed to record rating' }, { status: 500 });
  }
}
