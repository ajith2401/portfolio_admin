// src/app/api/analytics/route.js
import { NextResponse } from 'next/server';
import connectDB from '@/lib/db';
import { Writing, TechBlog, Project, Analytics } from '@/models';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
    
    // Process ratings data
    const processedRatings = {
      writings: Array(5).fill(0),
      techBlogs: Array(5).fill(0),
      projects: Array(5).fill(0)
    };
    
    ratingsDistribution[0].forEach(item => {
      if (item._id >= 1 && item._id <= 5) {
        processedRatings.writings[item._id - 1] = item.count;
      }
    });
    
    ratingsDistribution[1].forEach(item => {
      if (item._id >= 1 && item._id <= 5) {
        processedRatings.techBlogs[item._id - 1] = item.count;
      }
    });
    
    ratingsDistribution[2].forEach(item => {
      if (item._id >= 1 && item._id <= 5) {
        processedRatings.projects[item._id - 1] = item.count;
      }
    });
    
    // Return the analytics data
    return NextResponse.json({
      overview: {
        pageViews: totalPageViews,
        visitors: totalVisitors,
        newContent: contentCreationStats.writings + contentCreationStats.techBlogs + contentCreationStats.projects
      },
      contentStats: {
        writings: contentCreationStats.writings,
        techBlogs: contentCreationStats.techBlogs,
        projects: contentCreationStats.projects
      },
      popularContent: detailedPopularContent,
      ratings: processedRatings,
      // Include daily data for charts
      dailyData: analyticsData.map(item => ({
        date: item.date,
        visitors: item.visitors || 0,
        pageViews: item.pageViews ? Array.from(item.pageViews.values()).reduce((sum, val) => sum + val, 0) : 0
      }))
    });
    
  } catch (error) {
    console.error('Error fetching analytics:', error);
    return NextResponse.json(
      { error: 'Failed to fetch analytics data' },
      { status: 500 }
    );
  }
}