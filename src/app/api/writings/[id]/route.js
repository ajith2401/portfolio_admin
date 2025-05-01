// src/app/api/writings/[id]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Writing, Comment } from '@/models';
import { deleteImage, uploadImage } from '@/lib/cloudinary';
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request, context) {
  try {
    // Extract params from context
    const params = context.params;
    
    // Make sure params.id is available
    if (!params || !params.id) {
      return NextResponse.json(
        { error: 'Writing ID is required' },
        { status: 400 }
      );
    }
    
    await connectDB();

    // Get the existing writing
    const existingWriting = await Writing.findById(params.id);
    if (!existingWriting) {
      return NextResponse.json(
        { error: 'Writing not found' }, 
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
      updates = JSON.parse(formData.get('writing'));
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
        if (existingWriting.images) {
          const deletePromises = Object.values(existingWriting.images)
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
    // Check if status is changing from draft to published
    const isNewlyPublished = existingWriting.status !== 'published' && 
    updates.status === 'published';
    

    // Update writing
    const updatedWriting = await Writing.findByIdAndUpdate(
      params.id,
      { 
        $set: {
          ...updates,
          // Preserve existing images if no new image uploaded
          images: updates.images || existingWriting.images
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

        // Send notifications if writing status changed from draft to published
        if (isNewlyPublished) {
          notifyWritingSubscribers(updatedWriting).catch(error => {
            console.error('Error sending writing notifications:', error);
          });
        }

    return NextResponse.json(updatedWriting);
  } catch (error) {
    console.error('Error updating writing:', error);
    
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
      { error: 'Failed to update writing' }, 
      { status: 500 }
    );
  }
}


export async function GET(request, { params }) {
  try {
    await connectDB();
    const writing = await Writing.findById(params.id).populate('comments');
    if (!writing) {
      return NextResponse.json({ error: 'Writing not found' }, { status: 404 });
    }
    return NextResponse.json(writing);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  }

export async function DELETE(request, { params }) {
  try {
    await connectDB();
    
    // First find the writing to get image URLs
    const writing = await Writing.findById(params.id);
    
    if (!writing) {
      return NextResponse.json(
        { error: 'Writing not found' }, 
        { status: 404 }
      );
    }

    // Delete images from Cloudinary if they exist
    if (writing.images) {
      const imagePromises = Object.values(writing.images)
        .map(url => deleteImage(url));
      await Promise.all(imagePromises);
    }

    // Delete all associated comments
    if (writing.comments && writing.comments.length > 0) {
      await Comment.deleteMany({ _id: { $in: writing.comments } });
    }

    // Delete the writing
    await Writing.findByIdAndDelete(params.id);

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
