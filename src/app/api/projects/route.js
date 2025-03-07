// src/app/api/projects/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Project } from '@/models/project.model';
import { uploadImage } from '@/lib/cloudinary';
import slugify from 'slugify';

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

    const projects = await Project.find(query)
      .sort(sort)
      .skip(skip)
      .limit(limit);

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
      { error: error.message },
      { status: 500 }
    );
  }
}

export async function POST(request) {
  try {
    await connectDB();

    // Check content type and handle accordingly
    const contentType = request.headers.get('content-type') || '';
    
    let projectData = {};
    let imageFile = null;
    
    if (contentType.includes('multipart/form-data')) {
      // Handle form data
      const formData = await request.formData();
      
      // Get content data
      const contentData = formData.get('content');
      if (contentData) {
        try {
          projectData = JSON.parse(contentData);
        } catch (error) {
          console.error('Error parsing content JSON:', error);
          return NextResponse.json(
            { error: 'Invalid content data format' },
            { status: 400 }
          );
        }
      }
      
      // Get image if present
      imageFile = formData.get('image');
    } else {
      // Assume JSON data
      try {
        projectData = await request.json();
      } catch (error) {
        return NextResponse.json(
          { error: 'Invalid JSON data' },
          { status: 400 }
        );
      }
    }

    // Validate required fields
    if (!projectData.title || !projectData.category) {
      return NextResponse.json(
        { error: 'Title and category are required' },
        { status: 400 }
      );
    }

    // Generate slug from title
    projectData.slug = slugify(projectData.title, { 
      lower: true,
      strict: true
    });

    // Handle image upload if present
    if (imageFile) {
      try {
        // Convert file to buffer/base64 if needed by your cloudinary setup
        const buffer = await imageFile.arrayBuffer();
        const base64Image = Buffer.from(buffer).toString('base64');
        const dataURI = `data:${imageFile.type};base64,${base64Image}`;
        
        const images = await uploadImage(dataURI);
        projectData.images = {
          ...projectData.images,
          small: images.small,
          medium: images.medium,
          large: images.large,
          thumbnail: images.small // Use small as thumbnail
        };
      } catch (error) {
        console.error('Image upload error:', error);
        return NextResponse.json(
          { error: 'Failed to upload image' },
          { status: 500 }
        );
      }
    }

    // Map longDescription from description if provided
    if (projectData.description && !projectData.longDescription) {
      projectData.longDescription = projectData.description;
      delete projectData.description;
    }

    // Ensure necessary arrays are initialized
    projectData.technologies = projectData.technologies || [];
    projectData.stack = projectData.stack || [];
    projectData.features = projectData.features || [];
    projectData.challenges = projectData.challenges || [];
    
    // If technologies is a string, convert to array
    if (typeof projectData.technologies === 'string') {
      projectData.technologies = projectData.technologies
        .split(',')
        .map(tech => tech.trim())
        .filter(Boolean);
    }

    // Create the project
    const newProject = await Project.create(projectData);

    return NextResponse.json(newProject, { status: 201 });

  } catch (error) {
    console.error('Error creating project:', error);
    
    // Handle Mongoose validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors).map(err => err.message);
      return NextResponse.json(
        { error: 'Validation failed', details: validationErrors },
        { status: 400 }
      );
    }

    // Handle duplicate key error
    if (error.code === 11000) {
      return NextResponse.json(
        { error: 'A project with this title already exists' },
        { status: 400 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to create project' },
      { status: 500 }
    );
  }
}
