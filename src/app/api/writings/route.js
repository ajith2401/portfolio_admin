// src/app/api/writings/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Writing } from '@/models';
import { uploadImage } from '@/lib/cloudinary';
import { notifyWritingSubscribers } from '@/lib/notificationHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

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
    
    // Check if Writing model is undefined before using it
    if (!Writing) {
      throw new Error('Writing model is not properly imported');
    }
    
    const writings = await Writing.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate({
        path: 'comments',
        options: { sort: { createdAt: -1 } }
      });
      
    const total = await Writing.countDocuments(query);
    
    return NextResponse.json({
      writings,
      pagination: {
        total,
        pages: Math.ceil(total / limit),
        current: page
      }
    });
  } catch (error) {
    console.error('Error fetching writings:', error);
    return NextResponse.json(
      { error: error.message }, 
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();
    
    // Check if Writing model is undefined before using it
    if (!Writing) {
      throw new Error('Writing model is not properly imported');
    }
    
    let writing;
    let imageFile;
    
    // Check the content type to determine how to parse the request
    const contentType = request.headers.get('content-type') || '';
    
    if (contentType.includes('multipart/form-data')) {
      // Handle form data
      try {
        const formData = await request.formData();
        const writingData = formData.get('writing');
        
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
      // Handle JSON data
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

    // Handle image upload if present
    if (imageFile) {
      try {
        // Convert file to buffer/base64 if needed by your cloudinary setup
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
    writing.comments = [];

    // Create the writing
    const newWriting = await Writing.create(writing);

    // Populate comments if any
    const populatedWriting = await newWriting.populate({
      path: 'comments',
      options: { sort: { createdAt: -1 } }
    });

    if (writing.status === 'published') {
      notifyWritingSubscribers(populatedWriting).then(()=> console.log(">>>>>>>>>>>>>>>>>>>>>Mail send successfully ")).catch(error => {
        console.error('Error sending writing notifications:', error);
      });
    }

    return NextResponse.json(populatedWriting, { status: 201 });

  } catch (error) {
    console.error('Error creating writing:', error);
    
    // Handle Mongoose validation errors
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