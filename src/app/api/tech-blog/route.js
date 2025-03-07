// src/app/api/tech-blog/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { TechBlog } from '@/models/techblog.model';

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
    const blog = await TechBlog.create(data);
  
    return NextResponse.json(blog, { status: 201 });
  } catch (error) {
    console.error('Error creating tech blog:', error);
    return NextResponse.json(
      { error: 'Failed to create tech blog' },
      { status: 500 }
    );
  }
}
