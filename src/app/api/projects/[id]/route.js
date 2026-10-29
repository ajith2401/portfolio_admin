// src/app/api/projects/[id]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Comment, Project } from '@/models';
import { deleteImage, uploadImage } from '@/lib/cloudinary';
import { generateSlug, ensureUniqueSlug } from '@/utils/slugGenerator';
import { getAuthenticatedUser, requireAuth, validateOrigin } from '@/lib/auth';
import { sanitizeHtml } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } = await params;
    
    const project = await Project.findById(id);
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }

    if (project.status !== 'published') {
      const auth = await getAuthenticatedUser(request);
      if (!auth.valid || !['admin', 'editor'].includes(auth.user.role)) {
        return NextResponse.json({ error: 'Project not found' }, { status: 404 });
      }
    }

    return NextResponse.json(project);
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
    await connectDB();
    const { id } = await params;

    const existingProject = await Project.findById(id);
    if (!existingProject) {
      return NextResponse.json(
        { error: 'Project not found' }, 
        { status: 404 }
      );
    }

    const contentType = request.headers.get('content-type') || '';
    let updates;
    let image;
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const rawData = formData.get('content') || formData.get('project');
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
        if (existingProject.images) {
          const deletePromises = Object.values(existingProject.images)
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
        console.error('Error handling project image update:', error);
        return NextResponse.json(
          { error: 'Failed to update image' }, 
          { status: 500 }
        );
      }
    }

    // Sanitize fields
    if (updates.title) updates.title = sanitizeHtml(updates.title).trim();
    if (updates.shortDescription) updates.shortDescription = sanitizeHtml(updates.shortDescription).trim();
    if (updates.longDescription) updates.longDescription = sanitizeHtml(updates.longDescription);

    // Generate slug if title changed
    if (updates.title && updates.title !== existingProject.title && !updates.slug) {
      const baseSlug = generateSlug(updates.title);
      if (baseSlug) {
        updates.slug = await ensureUniqueSlug(
          baseSlug,
          async (slug) => Project.findOne({ slug, _id: { $ne: id } }),
          id
        );
      }
    }

    // Remove immutable / computed rating fields from client payload
    delete updates.averageRating;
    delete updates.totalRatings;
    delete updates.ratings;

    const project = await Project.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    return NextResponse.json(project);
  } catch (error) {
    console.error('Error updating project:', error);
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors }, 
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to update project' }, 
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
    
    const project = await Project.findById(id);
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' }, 
        { status: 404 }
      );
    }

    if (project.images) {
      const imagePromises = Object.values(project.images)
        .filter(url => url && typeof url === 'string')
        .map(url => deleteImage(url));
      await Promise.all(imagePromises);
    }

    await Comment.deleteMany({ parentId: id });
    await Project.findByIdAndDelete(id);

    return NextResponse.json({ 
      message: 'Project and associated data deleted successfully' 
    });
  } catch (error) {
    console.error('Error deleting project:', error);
    return NextResponse.json(
      { error: 'Failed to delete project' }, 
      { status: 500 }
    );
  }
}
