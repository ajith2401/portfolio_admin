// src/app/api/analytics/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/mongodb';
import { Writing, TechBlog, Project, Analytics } from '@/models';
import { requireAuth } from '@/lib/auth';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request) {
  const auth = await requireAuth(request, ['admin', 'editor']);
  if (!auth.authorized) {
    return auth.response;
  }

  try {
    await connectDB();
    
    // Get current date and date 30 days ago
    const today = new Date();
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    // Fetch analytics data for the last 30 days
    const analyticsData = await Analytics.find({
      date: { $gte: thirtyDaysAgo, $lte: today }
    }).sort({ date: 1 });
    
    // Get total page views
    const totalPageViews = analyticsData.reduce((total, item) => {
      let sum = total;
      if (item.pageViews) {
        item.pageViews.forEach((views) => {
          sum += views;
        });
      }
      return sum;
    }, 0);
    
    // Get total visitors
    const totalVisitors = analyticsData.reduce((total, item) => total + (item.visitors || 0), 0);
    
    // Get popular content
    const popularContent = await Analytics.aggregate([
      { $unwind: '$popularPosts' },
      { 
        $group: { 
          _id: { postId: '$popularPosts.postId', model: '$popularPosts.postModel' },
          views: { $sum: '$popularPosts.views' }
        } 
      },
      { $sort: { views: -1 } },
      { $limit: 5 }
    ]);
    
    // Fetch detailed information for each popular post
    const detailedPopularContent = await Promise.all(
      popularContent.map(async (item) => {
        const model = item._id.model;
        const id = item._id.postId;
        let contentDetails = null;
        
        if (model === 'Writing') {
          contentDetails = await Writing.findById(id).select('title category createdAt');
        } else if (model === 'TechBlog') {
          contentDetails = await TechBlog.findById(id).select('title category createdAt');
        } else if (model === 'Project') {
          contentDetails = await Project.findById(id).select('title category createdAt');
        }
        
        return {
          id,
          type: model,
          views: item.views,
          details: contentDetails
        };
      })
    );
    
    // Get content creation stats
    const contentCreationStats = {
      writings: await Writing.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      techBlogs: await TechBlog.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
      projects: await Project.countDocuments({ createdAt: { $gte: thirtyDaysAgo } }),
    };

    // Get ratings distribution
    const ratingsDistribution = await Promise.all([
      Writing.aggregate([
        { $unwind: '$ratings' },
        { $group: { _id: '$ratings.rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      TechBlog.aggregate([
        { $unwind: '$ratings' },
        { $group: { _id: '$ratings.rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      Project.aggregate([
        { $unwind: '$ratings' },
        { $group: { _id: '$ratings.rating', count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);
    
    return NextResponse.json({
      overview: {
        pageViews: totalPageViews,
        visitors: totalVisitors,
        bounceRate: 42,
        avgSessionDuration: '2m 45s'
      },
      pageViewsData: analyticsData.map(item => ({
        date: item.date ? item.date.toISOString().split('T')[0] : '',
        views: item.pageViews ? item.pageViews.reduce((a, b) => a + b, 0) : 0,
        visitors: item.visitors || 0
      })),
      popularContent: detailedPopularContent,
      contentCreation: contentCreationStats,
      ratings: {
        writings: ratingsDistribution[0],
        techBlogs: ratingsDistribution[1],
        projects: ratingsDistribution[2]
      }
    });
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}
