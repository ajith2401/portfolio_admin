// src/app/api/tech-blog/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { TechBlog } from '@/models';
import { notifyBlogSubscribers } from '@/lib/notificationHandler';
import { generateSlug, ensureUniqueSlug } from '@/utils/slugGenerator';

export async function GET(request) {
  try {
    await connectDB();
    const { searchParams } = new URL(request.url);

    // Build query based on parameters
    const query = {};
    const sort = {};

    // Category filter
    const category = searchParams.get('category');
    if (category) query.category = category;

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
    if (search) {
      query.$text = { $search: search };
    }

    // Sorting
    const sortBy = searchParams.get('sortBy');
    if (sortBy === 'rating') {
      sort.averageRating = -1;
    } else if (sortBy === 'date') {
      sort.createdAt = -1;
    }

    // Pagination
    const page = parseInt(searchParams.get('page')) || 1;
    const limit = parseInt(searchParams.get('limit')) || 12;
    const skip = (page - 1) * limit;

    const techBlogs = await TechBlog.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)

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
      { error: error.message },
      { status: 500 }
    );
  }
}


// POST new tech blog
export async function POST(request) {
  try {
    await connectDB();
    
    const data = await request.json();
    
    // Validate required fields
    if (!data.title || !data.category || !data.content) {
      return NextResponse.json(
        { error: 'Title, category, and content are required' },
        { status: 400 }
      );
    }

    // Generate slug if not provided
    if (!data.slug) {
      const baseSlug = generateSlug(data.title);
      if (baseSlug) {
        data.slug = await ensureUniqueSlug(
          baseSlug,
          async (slug) => {
            return await TechBlog.findOne({ slug });
          }
        );
      }
    }

    const blog = await TechBlog.create(data);
    
    // Send notifications if blog is published
    if (blog.status === 'published') {
      // Send notifications asynchronously (non-blocking)
      notifyBlogSubscribers(blog).catch(error => {
        console.error('Error sending blog notifications:', error);
      });
    }
      
    return NextResponse.json(blog, { status: 201 });
  } catch (error) {
    console.error('Error creating tech blog:', error);
    
    // Handle Mongoose validation errors
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
