// src/app/api/writings/[id]/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Writing, Comment } from '@/models';
import { deleteImage, uploadImage } from '@/lib/cloudinary';
import { generateSlug, ensureUniqueSlug, cleanSlug } from '@/utils/slugGenerator';
import { notifyWritingSubscribers } from '@/lib/notificationHandler';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function PUT(request, { params }) {
  try {
    // Extract params from context
    const { id } =  await params; 
    
    // // Make sure params.id is available
    // if (!params || !params.id) {
    //   return NextResponse.json(
    //     { error: 'Writing ID is required' },
    //     { status: 400 }
    //   );
    // }
    
    // // // Extract id to avoid Next.js warnings
    // // const { id } = await params;
    
    await connectDB();

    // Get the existing writing
    const existingWriting = await Writing.findById(id);
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

    // Clean and validate slug if provided
    if (updates.slug) {
      updates.slug = cleanSlug(updates.slug);
      if (!updates.slug) {
        // If slug becomes empty after cleaning, generate from title or keep existing
        if (updates.title) {
          const baseSlug = generateSlug(updates.title);
          updates.slug = baseSlug || existingWriting.slug;
        } else {
          updates.slug = existingWriting.slug; // Keep existing slug
        }
      }
    }

    // Generate slug if title has changed and no slug is provided
    if (updates.title && updates.title !== existingWriting.title && !updates.slug) {
      const baseSlug = generateSlug(updates.title);
      if (baseSlug) {
        updates.slug = await ensureUniqueSlug(
          baseSlug,
          async (slug) => {
            return await Writing.findOne({ slug, _id: { $ne: id } });
          },
          id
        );
      } else {
        updates.slug = existingWriting.slug; // Keep existing slug as fallback
      }
    }

    // Ensure slug uniqueness if it was changed
    if (updates.slug && updates.slug !== existingWriting.slug) {
      updates.slug = await ensureUniqueSlug(
        updates.slug,
        async (slug) => {
          return await Writing.findOne({ slug, _id: { $ne: id } });
        },
        id
      );
    }

    // Final safety check - ensure slug is not empty
    if (!updates.slug) {
      updates.slug = existingWriting.slug || `writing-${Date.now()}`;
    }

    // Check if status is changing from draft to published
    const isNewlyPublished = existingWriting.status !== 'published' && 
    updates.status === 'published';
    
    // Remove empty or undefined fields from updates
    const cleanedUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, value]) => value !== '' && value !== null && value !== undefined)
    );

    // Update writing
    const updatedWriting = await Writing.findByIdAndUpdate(
      id, // Use the extracted id here
      {
        $set: {
          ...cleanedUpdates,
          // Preserve existing images if no new image uploaded
          images: cleanedUpdates.images || existingWriting.images,
          // Ensure slug is always present
          slug: cleanedUpdates.slug || existingWriting.slug
        }
      },
      {
        new: true,
        runValidators: true
      }
    );

    // Send notifications if writing status changed from draft to published
    if (isNewlyPublished) {
      // Check if notifyWritingSubscribers function exists
      if (typeof notifyWritingSubscribers === 'function') {
        notifyWritingSubscribers(updatedWriting).catch(error => {
          console.error('Error sending writing notifications:', error);
        });
      } else {
        console.warn('notifyWritingSubscribers function is not defined');
      }
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
    const { id } = await params; // Extract id properly
    
    const writing = await Writing.findById(id);
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
    const { id } = await params; // Extract id properly
    
    // First find the writing to get image URLs
    const writing = await Writing.findById(id);
    
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

    // Delete all associated comments (if they exist as separate documents)
    await Comment.deleteMany({ writingId: id });

    // Delete the writing
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