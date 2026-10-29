// src/app/api/tech-blog/[id]/comments/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Comment, TechBlog } from '@/models';
import { sanitizeHtml } from '@/lib/sanitize';
import { applyRateLimit } from '@/lib/rateLimit';
import { getAuthenticatedUser } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    
    const auth = await getAuthenticatedUser(request);
    const isAdmin = auth.valid && ['admin', 'editor'].includes(auth.user.role);

    const query = {
      parentId: id,
      parentModel: 'TechBlog'
    };

    if (!isAdmin) {
      query.status = 'approved';
    }

    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .lean();
    
    return NextResponse.json(comments);
  } catch (error) {
    console.error('Error fetching comments:', error);
    return NextResponse.json(
      { error: 'Failed to fetch comments' },
      { status: 500 }
    );
  }
}

export async function POST(request, { params }) {
  const rateLimit = applyRateLimit(request, 'comment-techblog', 5, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    await connectDB();
    const { id } = await params;
    
    const body = await request.json().catch(() => null);
    if (!body || !body.name || !body.email || !body.comment) {
      return NextResponse.json(
        { error: 'Name, email, and comment are required' },
        { status: 400 }
      );
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(body.email)) {
      return NextResponse.json({ error: 'Valid email is required' }, { status: 400 });
    }

    const blog = await TechBlog.findById(id);
    if (!blog) {
      return NextResponse.json(
        { error: 'Tech blog not found' },
        { status: 404 }
      );
    }

    const ratingVal = Number(body.rating) || 5;
    const clampedRating = Math.max(1, Math.min(5, Math.round(ratingVal)));
    
    const comment = await Comment.create({
      parentId: id,
      parentModel: 'TechBlog',
      name: sanitizeHtml(String(body.name)).trim(),
      email: String(body.email).trim().toLowerCase(),
      comment: sanitizeHtml(String(body.comment)).trim(),
      rating: clampedRating,
      status: 'pending'
    });
    
    return NextResponse.json(
      { message: 'Comment submitted successfully and is pending review', commentId: comment._id },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error creating comment:', error);
    return NextResponse.json(
      { error: 'Failed to create comment' },
      { status: 500 }
    );
  }
}
