// src/app/api/writings/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Writing } from '@/models';
import { uploadImage } from '@/lib/cloudinary';
import { notifyWritingSubscribers } from '@/lib/notificationHandler';
import { generateSlug, ensureUniqueSlug, cleanSlug } from '@/utils/slugGenerator';
import { getAuthenticatedUser, requireAuth, validateOrigin } from '@/lib/auth';
import { applyRateLimit } from '@/lib/rateLimit';
import { sanitizeHtml } from '@/lib/sanitize';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);
    
    // Check authentication to determine whether drafts may be viewed
    const auth = await getAuthenticatedUser(request);
    const isAuthenticatedAdmin = auth.valid && ['admin', 'editor'].includes(auth.user.role);

    // Build query based on parameters
    const query = {};
    const sort = {};
    
    // Category filter - use exact match for indexed performance
    let category = searchParams.get('category');
    if (category && category !== 'All Writings') {
      query.category = category;
    }
    
    // Access control on status:
    // Unauthenticated callers may ONLY retrieve published content.
    if (!isAuthenticatedAdmin) {
      query.status = 'published';
    } else {
      const status = searchParams.get('status');
      if (status) {
        query.status = status;
      }
    }
    
    // Date filter
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) {
        const start = new Date(startDate);
        start.setHours(0, 0, 0, 0);
        query.createdAt.$gte = start;
      }
      if (endDate) {
        const end = new Date(endDate);
        end.setHours(23, 59, 59, 999);
        query.createdAt.$lte = end;
      }
    }
    
    // Search text - use $text if indexed
    const search = searchParams.get('search');
    if (search && search.trim() !== '') {
      query.$text = { $search: search.trim() };
    }
    
    // Sorting
    const sortBy = searchParams.get('sortBy') || 'date';
    switch (sortBy) {
      case 'rating':
        sort.averageRating = -1;
        sort.createdAt = -1;
        break;
      case 'oldest':
        sort.createdAt = 1;
        break;
      case 'title':
        sort.title = 1;
        break;
      case 'date':
      default:
        sort.createdAt = -1;
        break;
    }
    
    // Pagination
    const pageParam = searchParams.get('page');
    const limitParam = searchParams.get('limit');
    let page = 1;
    if (pageParam) {
      const parsedPage = parseInt(pageParam, 10);
      page = !isNaN(parsedPage) && parsedPage > 0 ? parsedPage : 1;
    }
    let limit = 12;
    if (limitParam) {
      const parsedLimit = parseInt(limitParam, 10);
      limit = !isNaN(parsedLimit) && parsedLimit > 0 ? Math.min(parsedLimit, 50) : 12;
    }
    const skip = (page - 1) * limit;
    
    // Only select needed fields for the listing
    const writings = await Writing.find(query)
      .select('title slug excerpt body images publishedAt category averageRating totalRatings status featured trending performance')
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .lean();
    
    // Get total count for pagination
    const total = await Writing.countDocuments(query);
    const totalPages = Math.max(1, Math.ceil(total / limit));
    const currentPage = page > totalPages ? totalPages : page;
    
    return NextResponse.json({
      writings,
      pagination: {
        total,
        pages: totalPages,
        current: currentPage,
        limit
      },
      filters: {
        category: category || null,
        startDate: startDate || null,
        endDate: endDate || null,
        search: search || null,
        sortBy
      }
    });
  } catch (error) {
    console.error('Error fetching writings:', error);
    return NextResponse.json(
      { error: 'Failed to fetch writings' },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  // 1. Enforce Authentication & Role Authorization
  const auth = await requireAuth(request, ['admin', 'editor']);
  if (!auth.authorized) {
    return auth.response;
  }

  // 2. Origin validation for state changes
  if (!validateOrigin(request)) {
    return NextResponse.json({ error: 'Forbidden: Invalid request origin' }, { status: 403 });
  }

  // 3. Rate limiting
  const rateLimit = applyRateLimit(request, 'create-writing', 30, 60 * 1000);
  if (!rateLimit.allowed) {
    return rateLimit.response;
  }

  try {
    await connectDB();
    
    if (!Writing) {
      throw new Error('Writing model is not properly imported');
    }
    
    let writing;
    let imageFile;
    
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      try {
        const formData = await request.formData();
        const writingData = formData.get('writing') || formData.get('content');
        
        if (!writingData) {
          return NextResponse.json(
            { error: 'Writing data is required' },
            { status: 400 }
          );
        }
        
        writing = typeof writingData === 'string' 
          ? JSON.parse(writingData) 
          : writingData;
          
        imageFile = formData.get('image');
      } catch (error) {
        console.error('Error parsing form data:', error);
        return NextResponse.json(
          { error: 'Invalid form data' },
          { status: 400 }
        );
      }
    } else {
      try {
        writing = await request.json();
      } catch (error) {
        console.error('Error parsing JSON data:', error);
        return NextResponse.json(
          { error: 'Invalid JSON data' },
          { status: 400 }
        );
      }
    }
    
    // Validate required fields
    if (!writing.title || !writing.category || !writing.body) {
      return NextResponse.json(
        { error: 'Title, category, and body are required' },
        { status: 400 }
      );
    }

    // Sanitize user inputs while preserving formatting and Tamil typography
    writing.title = sanitizeHtml(writing.title).trim();
    if (writing.subtitle) writing.subtitle = sanitizeHtml(writing.subtitle).trim();
    writing.body = sanitizeHtml(writing.body);
    if (writing.excerpt) writing.excerpt = sanitizeHtml(writing.excerpt).trim();

    // Clean and generate slug
    if (writing.slug) {
      writing.slug = cleanSlug(writing.slug);
    }

    if (!writing.slug) {
      const baseSlug = generateSlug(writing.title);
      if (baseSlug) {
        writing.slug = await ensureUniqueSlug(
          baseSlug,
          async (slug) => Writing.findOne({ slug })
        );
      } else {
        writing.slug = `writing-${Date.now()}`;
      }
    } else {
      writing.slug = await ensureUniqueSlug(
        writing.slug,
        async (slug) => Writing.findOne({ slug })
      );
    }

    if (!writing.slug) {
      writing.slug = `writing-${Date.now()}`;
    }

    // Handle image upload if present
    if (imageFile && typeof imageFile === 'object' && imageFile.type) {
      // Validate file type
      const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
      if (!allowedMimes.includes(imageFile.type)) {
        return NextResponse.json({ error: 'Invalid image format. Allowed: JPEG, PNG, WEBP, GIF' }, { status: 400 });
      }

      // Max size: 5MB
      if (imageFile.size > 5 * 1024 * 1024) {
        return NextResponse.json({ error: 'Image size exceeds maximum allowed 5MB limit' }, { status: 400 });
      }

      try {
        const buffer = await imageFile.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const dataURI = `data:${imageFile.type};base64,${base64Image}`;
        
        const images = await uploadImage(dataURI);
        writing.images = images;
      } catch (error) {
        console.error('Image upload error:', error);
        return NextResponse.json(
          { error: 'Failed to upload image' },
          { status: 500 }
        );
      }
    }

    // Set initial values
    writing.averageRating = 0;
    writing.totalRatings = 0;
    writing.ratings = [];

    // Default status to draft if not valid
    if (!['draft', 'published'].includes(writing.status)) {
      writing.status = 'draft';
    }

    const newWriting = await Writing.create(writing);

    if (newWriting.status === 'published') {
      notifyWritingSubscribers(newWriting).catch(error => {
        console.error('Error sending writing notifications:', error);
      });
    }

    return NextResponse.json(newWriting, { status: 201 });

  } catch (error) {
    console.error('Error creating writing:', error);
    
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create writing' },
      { status: 500 }
    );
  }
}
