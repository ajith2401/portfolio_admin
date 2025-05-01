// src/app/api/stats/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Writing, TechBlog, Project } from '@/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await connectDB();
    
    // Fetch writings stats
    const writingsData = await Writing.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Fetch tech blog stats
    const techBlogData = await TechBlog.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Fetch projects stats
    const projectsData = await Project.aggregate([
      {
        $group: {
          _id: '$status',
          count: { $sum: 1 }
        }
      }
    ]);
    
    // Process writings data
    const writingsStats = {
      total: 0,
      published: 0,
      draft: 0
    };
    
    writingsData.forEach(item => {
      if (item._id === 'published') {
        writingsStats.published = item.count;
      } else if (item._id === 'draft') {
        writingsStats.draft = item.count;
      }
      writingsStats.total += item.count;
    });
    
    // Process tech blog data
    const techBlogStats = {
      total: 0,
      published: 0,
      draft: 0
    };
    
    techBlogData.forEach(item => {
      if (item._id === 'published') {
        techBlogStats.published = item.count;
      } else if (item._id === 'draft') {
        techBlogStats.draft = item.count;
      }
      techBlogStats.total += item.count;
    });
    
    // Process projects data
    const projectsStats = {
      total: 0,
      published: 0,
      draft: 0
    };
    
    projectsData.forEach(item => {
      if (item._id === 'published') {
        projectsStats.published = item.count;
      } else if (item._id === 'draft') {
        projectsStats.draft = item.count;
      }
      projectsStats.total += item.count;
    });
    
    // Return the complete stats object
    return NextResponse.json({
      writings: writingsStats,
      techblog: techBlogStats,
      projects: projectsStats
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch statistics' },
      { status: 500 }
    );
  }
}