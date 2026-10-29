// src/app/api/projects/[id]/comments/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Project, Comment } from '@/models';
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
      parentModel: 'Project'
    };

    if (!isAdmin) {
      query.status = 'approved';
    }

    const comments = await Comment.find(query)
      .sort({ createdAt: -1 })
      .lean();

    return NextResponse.json(comments);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(request, { params }) {
  const rateLimit = applyRateLimit(request, 'comment-project', 5, 60 * 1000);
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

    const project = await Project.findById(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    const ratingVal = Number(body.rating) || 5;
    const clampedRating = Math.max(1, Math.min(5, Math.round(ratingVal)));

    const comment = await Comment.create({
      parentId: id,
      parentModel: 'Project',
      name: sanitizeHtml(String(body.name)).trim(),
      email: String(body.email).trim().toLowerCase(),
      comment: sanitizeHtml(String(body.comment)).trim(),
      rating: clampedRating,
      status: 'pending',
    });

    return NextResponse.json(
      { message: 'Comment submitted successfully and is pending review', commentId: comment._id },
      { status: 201 }
    );
  } catch (error) {
    console.error('Error adding project comment:', error);
    return NextResponse.json({ error: 'Failed to submit comment' }, { status: 500 });
  }
}
