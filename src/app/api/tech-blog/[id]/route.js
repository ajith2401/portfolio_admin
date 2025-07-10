import connectDB from "@/lib/db";
import { TechBlog } from "@/models";
import { NextResponse } from "next/server";
import { generateSlug, ensureUniqueSlug } from '@/utils/slugGenerator';
import { deleteImage } from '@/lib/cloudinary';

// src/app/api/tech-blog/[id]/route.js
export async function GET(request, { params }) {
    try {
      await connectDB();
      const { id } =  await params; // Extract id properly
      const blog = await TechBlog.findById(id);
      if (!blog) {
        return NextResponse.json(
          { error: 'Tech blog not found' },
          { status: 404 }
        );
      }
      
      return NextResponse.json(blog);
    } catch (error) {
      console.error('Error fetching tech blog:', error);
      return NextResponse.json(
        { error: 'Failed to fetch tech blog' },
        { status: 500 }
      );
    }
  }
  
  // PUT update tech blog
  export async function PUT(request, { params }) {
    try {
      await connectDB();
      const { id } =  await params; // Extract id properly
      
      // Get the existing blog
      const existingBlog = await TechBlog.findById(id);
      if (!existingBlog) {
        return NextResponse.json(
          { error: 'Tech blog not found' },
          { status: 404 }
        );
      }
      
      const data = await request.json();
      
      // Generate slug if title has changed and no slug is provided
      if (data.title && data.title !== existingBlog.title && !data.slug) {
        const baseSlug = generateSlug(data.title);
        if (baseSlug) {
          data.slug = await ensureUniqueSlug(
            baseSlug,
            async (slug) => {
              return await TechBlog.findOne({ slug, _id: { $ne: id } });
            },
            id
          );
        }
      }
      
      const blog = await TechBlog.findByIdAndUpdate(
        id,
        { $set: data },
        { new: true, runValidators: true }
      );
      
      return NextResponse.json(blog);
    } catch (error) {
      console.error('Error updating tech blog:', error);
      
      // Handle validation errors
      if (error.name === 'ValidationError') {
        const validationErrors = Object.values(error.errors).map(err => err.message);
        return NextResponse.json(
          { error: 'Validation failed', details: validationErrors },
          { status: 400 }
        );
      }
      
      return NextResponse.json(
        { error: 'Failed to update tech blog' },
        { status: 500 }
      );
    }
  }
  
  // DELETE tech blog
  export async function DELETE(request, { params }) {
    try {
      await connectDB();
      const { id } =  await params; // Extract id properly
      
      // First find the blog to get image URLs
      const blog = await TechBlog.findById(id);
      
      if (!blog) {
        return NextResponse.json(
          { error: 'Tech blog not found' },
          { status: 404 }
        );
      }

      // Delete images from Cloudinary if they exist
      if (blog.images) {
        const imagePromises = Object.values(blog.images)
          .filter(url => url) // Only delete if URL exists
          .map(url => deleteImage(url));
        await Promise.all(imagePromises);
      }

      // Delete the blog
      await TechBlog.findByIdAndDelete(id);
      
      return NextResponse.json({ message: 'Tech blog deleted successfully' });
    } catch (error) {
      console.error('Error deleting tech blog:', error);
      return NextResponse.json(
        { error: 'Failed to delete tech blog' },
        { status: 500 }
      );
    }
  }