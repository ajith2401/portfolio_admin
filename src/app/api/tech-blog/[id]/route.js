// src/app/api/tech-blog/[id]/route.js
import { NextResponse } from "next/server";
import connectDB from "@/lib/mongodb";
import { TechBlog, Comment } from "@/models";
import { generateSlug, ensureUniqueSlug } from '@/utils/slugGenerator';
import { deleteImage } from '@/lib/cloudinary';
import { getAuthenticatedUser, requireAuth, validateOrigin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    const blog = await TechBlog.findById(id);
    if (!blog) {
      return NextResponse.json(
        { error: 'Tech blog not found' },
        { status: 404 }
      );
    }

    if (blog.status !== 'published') {
      const auth = await getAuthenticatedUser(request);
      if (!auth.valid || !['admin', 'editor'].includes(auth.user.role)) {
        return NextResponse.json({ error: 'Tech blog not found' }, { status: 404 });
      }
    }
    
    return NextResponse.json(blog);
  } catch (error) {
    console.error('Error fetching tech blog:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tech blog' },
      { status: 500 }
    );
  }
}

export async function PUT(request, { params }) {
  const auth = await requireAuth(request, ['admin', 'editor']);
  if (!auth.authorized) {
    return auth.response;
  }

  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
  }

  try {
    await connectDB();
    const { id } = await params;
    
    const existingBlog = await TechBlog.findById(id);
    if (!existingBlog) {
      return NextResponse.json(
        { error: 'Tech blog not found' },
        { status: 404 }
      );
    }
    
    let data;
    try {
      data = await request.json();
    } catch {
      return NextResponse.json(
        { error: 'Invalid JSON data' },
        { status: 400 }
      );
    }
    
    // Sanitize user inputs
    if (data.title) data.title = sanitizeHtml(data.title).trim();
    if (data.subtitle) data.subtitle = sanitizeHtml(data.subtitle).trim();
    if (data.content) data.content = sanitizeHtml(data.content);

    // Generate slug if title has changed and no slug is provided
    if (data.title && data.title !== existingBlog.title && !data.slug) {
      const baseSlug = generateSlug(data.title);
      if (baseSlug) {
        data.slug = await ensureUniqueSlug(
          baseSlug,
          async (slug) => TechBlog.findOne({ slug, _id: { $ne: id } }),
          id
        );
      }
    }
    
    // Remove rating manipulation
    delete data.averageRating;
    delete data.totalRatings;
    delete data.ratings;

    const blog = await TechBlog.findByIdAndUpdate(
      id,
      { $set: data },
      { new: true, runValidators: true }
    );
    
    return NextResponse.json(blog);
  } catch (error) {
    console.error('Error updating tech blog:', error);
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update tech blog' },
      { status: 500 }
    );
  }
}

export async function DELETE(request, { params }) {
  const auth = await requireAuth(request, ['admin']);
  if (!auth.authorized) {
    return auth.response;
  }

  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
  }

  try {
    await connectDB();
    const { id } = await params;
    
    const blog = await TechBlog.findById(id);
    if (!blog) {
      return NextResponse.json(
        { error: 'Tech blog not found' },
        { status: 404 }
      );
    }

    if (blog.images) {
      const imagePromises = Object.values(blog.images)
        .filter(url => url && typeof url === 'string')
        .map(url => deleteImage(url));
      await Promise.all(imagePromises);
    }

    await Comment.deleteMany({ parentId: id });
    await TechBlog.findByIdAndDelete(id);

    return NextResponse.json({ 
      message: 'Tech blog and associated data deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting tech blog:', error);
    return NextResponse.json(
      { error: 'Failed to delete tech blog' },
      { status: 500 }
    );
  }
}
