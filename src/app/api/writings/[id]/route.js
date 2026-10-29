// src/app/api/writings/[id]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Writing, Comment } from '@/models';
import { deleteImage, uploadImage } from '@/lib/cloudinary';
import { generateSlug, ensureUniqueSlug, cleanSlug } from '@/utils/slugGenerator';
import { getAuthenticatedUser, requireAuth, validateOrigin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    
    const writing = await Writing.findById(id);
    if (!writing) {
      return NextResponse.json({ error: 'Writing not found' }, { status: 404 });
    }

    // Access control: If content is in draft status, only authenticated users may view it
    if (writing.status !== 'published') {
      const auth = await getAuthenticatedUser(request);
      if (!auth.valid || !['admin', 'editor'].includes(auth.user.role)) {
        return NextResponse.json({ error: 'Writing not found' }, { status: 404 });
      }
    }

    return NextResponse.json(writing);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
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
    const { id } = await params;
    await connectDB();

    const existingWriting = await Writing.findById(id);
    if (!existingWriting) {
      return NextResponse.json(
        { error: 'Writing not found' }, 
        { status: 404 }
      );
    }

    const contentType = request.headers.get('content-type') || '';
    let updates;
    let image;
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const rawData = formData.get('writing') || formData.get('content');
      updates = typeof rawData === 'string' ? JSON.parse(rawData) : rawData;
      image = formData.get('image');
    } else if (contentType.includes('application/json')) {
      updates = await request.json();
      image = null;
    } else {
      return NextResponse.json(
        { error: 'Unsupported content type' },
        { status: 400 }
      );
    }

    // Handle image update if new image is provided
    if (image && typeof image === 'object' && image.type) {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimes.includes(image.type)) {
        return NextResponse.json({ error: 'Invalid image format. Allowed: JPEG, PNG, WEBP, GIF' }, { status: 400 });
      }
      if (image.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image size exceeds maximum allowed 5MB limit' }, { status: 400 });
      }

      try {
        if (existingWriting.images) {
          const deletePromises = Object.values(existingWriting.images)
            .filter(url => url && typeof url === 'string')
            .map(url => deleteImage(url));
          await Promise.all(deletePromises);
        }

        const buffer = await image.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const dataURI = `data:${image.type};base64,${base64Image}`;
        
        const images = await uploadImage(dataURI);
        updates.images = images;
      } catch (error) {
        console.error('Error handling image update:', error);
        return NextResponse.json(
          { error: 'Failed to update image' }, 
          { status: 500 }
        );
      }
    }

    // Sanitize user inputs
    if (updates.title) updates.title = sanitizeHtml(updates.title).trim();
    if (updates.subtitle) updates.subtitle = sanitizeHtml(updates.subtitle).trim();
    if (updates.body) updates.body = sanitizeHtml(updates.body);
    if (updates.excerpt) updates.excerpt = sanitizeHtml(updates.excerpt).trim();

    // Clean and validate slug if provided
    if (updates.slug) {
      updates.slug = cleanSlug(updates.slug);
      if (!updates.slug) {
        if (updates.title) {
          const baseSlug = generateSlug(updates.title);
          updates.slug = baseSlug || existingWriting.slug;
        } else {
          updates.slug = existingWriting.slug;
        }
      }
    }

    // Do not allow arbitrary client manipulation of ratings
    delete updates.averageRating;
    delete updates.totalRatings;
    delete updates.ratings;

    const updatedWriting = await Writing.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return NextResponse.json(updatedWriting);
  } catch (error) {
    console.error('Error updating writing:', error);
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors }, 
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update writing' }, 
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
    
    const writing = await Writing.findById(id);
    if (!writing) {
      return NextResponse.json(
        { error: 'Writing not found' }, 
        { status: 404 }
      );
    }

    if (writing.images) {
      const imagePromises = Object.values(writing.images)
        .filter(url => url && typeof url === 'string')
        .map(url => deleteImage(url));
      await Promise.all(imagePromises);
    }

    await Comment.deleteMany({ parentId: id });
    await Writing.findByIdAndDelete(id);

    return NextResponse.json({ 
      message: 'Writing and associated data deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting writing:', error);
    return NextResponse.json(
      { error: 'Failed to delete writing' }, 
      { status: 500 }
    );
  }
}
