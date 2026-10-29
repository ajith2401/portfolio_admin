// src/app/api/projects/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Project } from '@/models';
import { uploadImage } from '@/lib/cloudinary';
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

    // Category filter
    const category = searchParams.get('category');
    if (category) query.category = category;

    // Status filter: enforce 'published' for unauthenticated requests
    if (!isAuthenticatedAdmin) {
      query.status = 'published';
    } else {
      const status = searchParams.get('status');
      if (status) query.status = status;
    }

    // Date filter
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    // Search text
    const search = searchParams.get('search');
    if (search && search.trim() !== '') {
      query.$text = { $search: search.trim() };
    }

    // Sorting
    const sortBy = searchParams.get('sortBy');
    if (sortBy === 'rating') {
      sort.averageRating = -1;
    } else if (sortBy === 'date') {
      sort.createdAt = -1;
    } else {
      sort.createdAt = -1;
    }

    // Pagination
    const page = Math.max(1, parseInt(searchParams.get('page'), 10) || 1);
    const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit'), 10) || 12));
    const skip = (page - 1) * limit;

    const projects = await Project.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();

    const total = await Project.countDocuments(query);

    return NextResponse.json({
      projects,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page,
      },
    });
  } catch (error) {
    console.error('Error fetching projects:', error);
    return NextResponse.json(
      { error: 'Failed to fetch projects' },
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

  const rateLimit = applyRateLimit(request, 'create-project', 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    await connectDB();

    const contentType = request.headers.get('content-type') || '';
    let projectData = {};
    let imageFile = null;
    
    if (contentType.includes('multipart/form-data')) {
      const formData = await request.formData();
      const contentData = formData.get('content') || formData.get('project');
      if (contentData) {
        try {
          projectData = typeof contentData === 'string' ? JSON.parse(contentData) : contentData;
        } catch {
          return NextResponse.json(
            { error: 'Invalid content data format' },
            { status: 400 }
          );
        }
      }
      imageFile = formData.get('image');
    } else if (contentType.includes('application/json')) {
      try {
        projectData = await request.json();
      } catch {
        return NextResponse.json(
          { error: 'Invalid JSON data' },
          { status: 400 }
        );
      }
    }

    if (!projectData.title || !projectData.category) {
      return NextResponse.json(
        { error: 'Title and category are required' },
        { status: 400 }
      );
    }

    // Sanitize text inputs
    projectData.title = sanitizeHtml(projectData.title).trim();
    if (projectData.shortDescription) projectData.shortDescription = sanitizeHtml(projectData.shortDescription).trim();
    if (projectData.longDescription) projectData.longDescription = sanitizeHtml(projectData.longDescription);

    // Generate slug
    if (!projectData.slug) {
      const baseSlug = generateSlug(projectData.title);
      if (baseSlug) {
        projectData.slug = await ensureUniqueSlug(
          baseSlug,
          async (slug) => Project.findOne({ slug })
        );
      } else {
        projectData.slug = `project-${Date.now()}`;
      }
    } else {
      projectData.slug = await ensureUniqueSlug(
        projectData.slug,
        async (slug) => Project.findOne({ slug })
      );
    }

    // Handle image upload if present
    if (imageFile && typeof imageFile === 'object' && imageFile.type) {
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimes.includes(imageFile.type)) {
        return NextResponse.json({ error: 'Invalid image format. Allowed: JPEG, PNG, WEBP, GIF' }, { status: 400 });
      }
      if (imageFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image size exceeds maximum allowed 5MB limit' }, { status: 400 });
      }

      try {
        const buffer = await imageFile.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const dataURI = `data:${imageFile.type};base64,${base64Image}`;
        const images = await uploadImage(dataURI);
        projectData.images = images;
      } catch (error) {
        console.error('Project image upload error:', error);
        return NextResponse.json(
          { error: 'Failed to upload image' },
          { status: 500 }
        );
      }
    }

    // Default status to draft if not valid
    if (!['draft', 'published'].includes(projectData.status)) {
      projectData.status = 'draft';
    }

    const project = await Project.create(projectData);
    return NextResponse.json(project, { status: 201 });
  } catch (error) {
    console.error('Error creating project:', error);
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }
    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
