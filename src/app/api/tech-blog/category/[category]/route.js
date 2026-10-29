import connectDB from "@/lib/mongodb";
import { TechBlog } from "@/models/techblog.model";
import { NextResponse } from "next/server";

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request, { params }) {
  try {
    await connectDB();
    const { category } = await params;
    
    const blogs = await TechBlog.find({
      category,
      status: 'published'
    })
      .sort({ publishedAt: -1 })
      .select('-content')
      .lean();
    
    return NextResponse.json(blogs);
  } catch (error) {
    console.error('Error fetching tech blogs by category:', error);
    return NextResponse.json(
      { error: 'Failed to fetch tech blogs' },
      { status: 500 }
    );
  }
}
