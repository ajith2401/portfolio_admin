// src/app/api/tech-blog/[id]/rate/route.js
import connectDB from "@/lib/mongodb";
import { TechBlog } from "@/models";
import { NextResponse } from "next/server";
import { applyRateLimit } from '@/lib/rateLimit';
import { sanitizeHtml } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request, { params }) {
  const rateLimit = applyRateLimit(request, 'rate-techblog', 10, 60 * 1000);
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

    const blog = await TechBlog.findById(id);
    if (!blog) {
      return NextResponse.json(
        { error: 'Tech blog not found' },
        { status: 404 }
      );
    }
    
    if (!blog.ratings) {
      blog.ratings = [];
    }
    
    const normalizedEmail = String(body.email).trim().toLowerCase();
    const existingRating = blog.ratings.find(r => r.email === normalizedEmail);
    if (existingRating) {
      existingRating.rating = ratingNum;
      existingRating.name = sanitizedName;
    } else {
      blog.ratings.push({ name: sanitizedName, email: normalizedEmail, rating: ratingNum });
    }
    
    const totalRating = blog.ratings.reduce((sum, r) => sum + r.rating, 0);
    blog.averageRating = totalRating / blog.ratings.length;
    blog.totalRatings = blog.ratings.length;
    
    await blog.save();
    
    return NextResponse.json({
      averageRating: blog.averageRating,
      totalRatings: blog.totalRatings
    });
  } catch (error) {
    console.error('Error updating rating:', error);
    return NextResponse.json(
      { error: 'Failed to update rating' },
      { status: 500 }
    );
  }
}
