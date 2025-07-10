// src/app/api/projects/[id]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Comment, Project } from '@/models';
import { deleteImage, uploadImage } from '@/lib/cloudinary';
import { generateSlug, ensureUniqueSlug } from '@/utils/slugGenerator';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  try {
    await connectDB();
    const { id } =  await params; // Extract id properly

    // Get the existing project
    const existingProject = await Project.findById(id);
    if (!existingProject) {
      return NextResponse.json(
        { error: 'Project not found' }, 
        { status: 404 }
      );
    }

    // Check the content type to determine how to parse the request
    const contentType = request.headers.get('content-type') || '';
    
    let updates;
    let image;
    
    if (contentType.includes('multipart/form-data')) {
      // Parse form data
      const formData = await request.formData();
      updates = JSON.parse(formData.get('content'));
      image = formData.get('image');
    } else if (contentType.includes('application/json')) {
      // Parse JSON data
      updates = await request.json();
      image = null; // JSON requests can't include file uploads
    } else {
      return NextResponse.json(
        { error: 'Unsupported content type' },
        { status: 400 }
      );
    }

    // Handle image update if new image is provided
    if (image) {
      try {
        // Delete old images from Cloudinary
        if (existingProject.images) {
          const deletePromises = Object.values(existingProject.images)
            .filter(url => url) // Only delete if URL exists
            .map(url => deleteImage(url));
          await Promise.all(deletePromises);
        }

        // Upload new image
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

    // Generate slug if title has changed and no slug is provided
    if (updates.title && updates.title !== existingProject.title && !updates.slug) {
      const baseSlug = generateSlug(updates.title);
      if (baseSlug) {
        updates.slug = await ensureUniqueSlug(
          baseSlug,
          async (slug) => {
            return await Project.findOne({ slug, _id: { $ne: id } });
          },
          id
        );
      }
    }

    // Update project
    const updatedProject = await Project.findByIdAndUpdate(
      id,
      { 
        $set: {
          ...updates,
          // Preserve existing images if no new image uploaded
          images: updates.images || existingProject.images
        }
      },
      { 
        new: true,
        runValidators: true
      }
    ).populate({
      path: 'comments',
      options: { sort: { createdAt: -1 } }
    });

    return NextResponse.json(updatedProject);
  } catch (error) {
    console.error('Error updating project:', error);
    
    // Handle validation errors
    if (error.name === 'ValidationError') {
      const validationErrors = Object.values(error.errors)
        .map(err => err.message);
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

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { id } =await params; // Extract id properly
    
    const project = await Project.findById(id).populate('comments');
    if (!project) {
      return NextResponse.json({ error: 'Project not found' }, { status: 404 });
    }
    return NextResponse.json(project);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    const { id } = await params; // Extract id properly
    
    // First find the project to get image URLs
    const project = await Project.findById(id);
    
    if (!project) {
      return NextResponse.json(
        { error: 'Project not found' }, 
        { status: 404 }
      );
    }

    // Delete images from Cloudinary if they exist
    if (project.images) {
      const imagePromises = Object.values(project.images)
        .map(url => deleteImage(url));
      await Promise.all(imagePromises);
    }

    // Delete all associated comments
    if (project.comments && project.comments.length > 0) {
      await Comment.deleteMany({ _id: { $in: project.comments } });
    }

    // Delete the project
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