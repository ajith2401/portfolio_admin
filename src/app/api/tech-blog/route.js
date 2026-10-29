// src/app/api/tech-blog/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { TechBlog } from '@/models';
import { notifyBlogSubscribers } from '@/lib/notificationHandler';
import { generateSlug, ensureUniqueSlug } from '@/utils/slugGenerator';
import { getAuthenticatedUser, requireAuth, validateOrigin } from '@/lib/auth';
import { applyRateLimit } from '@/lib/rateLimit';
import { sanitizeHtml } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    const auth = await getAuthenticatedUser(request);
    const isAuthenticatedAdmin = auth.valid && ['admin', 'editor'].includes(auth.user.role);

    const query = {};
    const sort = {};

    const category = searchParams.get('category');
    if (category) query.category = category;

    // Enforce 'published' for unauthenticated requests
    if (!isAuthenticatedAdmin) {
      query.status = 'published';
    } else {
      const status = searchParams.get('status');
      if (status) query.status = status;
    }

    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const search = searchParams.get('search');
    if (search && search.trim() !== '') {
      query.$text = { $search: search.trim() };
    }

    const sortBy = searchParams.get('sortBy');
    if (sortBy === 'rating') {
      sort.averageRating = -1;
    } else if (sortBy === 'date') {
      sort.createdAt = -1;
    } else {
      sort.createdAt = -1;
    }

    const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit'), 10) || 12));
    const skip = (page - 1) * limit;

    const techBlogs = await TechBlog.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await TechBlog.countDocuments(query);

    return NextResponse.json({
      techBlogs,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page
      }
    });
  } catch (error) {
    console.error('Error fetching tech blogs:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tech blogs' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  const auth = await requireAuth(request, ['admin', 'editor']);
  if (!auth.authorized) {
    return auth.response;
  }

  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
  }

  const rateLimit = applyRateLimit(request, 'create-tech-blog', 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    await connectDB();
    
    let data;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON data' },
        { status: 400 }
      );
    }
    
    if (!data.title || !data.category || !data.content) {
      return NextResponse.json(
        { error: 'Title, category, and content are required' },
        { status: 400 }
      );
    }

    // Sanitize user inputs
    data.title = sanitizeHtml(data.title).trim();
    if (data.subtitle) data.subtitle = sanitizeHtml(data.subtitle).trim();
    data.content = sanitizeHtml(data.content);

    // Generate slug if not provided
    if (!data.slug) {
      const baseSlug = generateSlug(data.title);
      if (baseSlug) {
        data.slug = await ensureUniqueSlug(
          baseSlug,
          async (slug) => TechBlog.findOne({ slug })
        );
      } else {
        data.slug = `tech-blog-${Date.now()}`;
      }
    } else {
      data.slug = await ensureUniqueSlug(
        data.slug,
        async (slug) => TechBlog.findOne({ slug })
      );
    }

    // Default status to draft if not valid
    if (!['draft', 'published'].includes(data.status)) {
      data.status = 'draft';
    }

    // Prevent direct rating manipulation
    delete data.averageRating;
    delete data.totalRatings;
    delete data.ratings;

    const blog = await TechBlog.create(data);

    if (blog.status === 'published') {
      notifyBlogSubscribers(blog).catch(error => {
        console.error('Error sending blog notifications:', error);
      });
    }

    return NextResponse.json(blog, { status: 201 });
  } catch (error) {
    console.error('Error creating tech blog:', error);
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create tech blog' },
      { status: 500 }
    );
  }
}
