import React, { useState, useEffect } from 'react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, AlertTriangle, TrendingUp, Users, Eye, FileText, BookOpen, Code, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

const AnalyticsDashboard = () => {
  const [analyticsData, setAnalyticsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [timeRange, setTimeRange] = useState('30d');

  useEffect(() => {
    const fetchAnalytics = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const response = await fetch(`/api/analytics?range=${timeRange}`);
        
        if (!response.ok) {
          throw new Error('Failed to fetch analytics data');
        }
        
        const data = await response.json();
        setAnalyticsData(data);
      } catch (err) {
        console.error('Error fetching analytics:', err);
        setError(err.message || 'An error occurred while fetching analytics');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchAnalytics();
  }, [timeRange]);

  // Format date for display in charts
  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return `${date.getMonth() + 1}/${date.getDate()}`;
  };

  // Format ratings data for chart
  const formatRatingsData = (ratingsData) => {
    if (!ratingsData) return [];
    
    return [
      { name: '1 Star', writings: ratingsData.writings[0], techBlogs: ratingsData.techBlogs[0], projects: ratingsData.projects[0] },
      { name: '2 Stars', writings: ratingsData.writings[1], techBlogs: ratingsData.techBlogs[1], projects: ratingsData.projects[1] },
      { name: '3 Stars', writings: ratingsData.writings[2], techBlogs: ratingsData.techBlogs[2], projects: ratingsData.projects[2] },
      { name: '4 Stars', writings: ratingsData.writings[3], techBlogs: ratingsData.techBlogs[3], projects: ratingsData.projects[3] },
      { name: '5 Stars', writings: ratingsData.writings[4], techBlogs: ratingsData.techBlogs[4], projects: ratingsData.projects[4] },
    ];
  };

  // Prepare daily traffic data for chart
  const prepareTrafficData = (dailyData) => {
    if (!dailyData) return [];
    
    return dailyData.map(day => ({
      date: formatDate(day.date),
      pageViews: day.pageViews,
      visitors: day.visitors
    }));
  };

  // Render loading state
  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-gray-500">Loading analytics data...</p>
      </div>
    );
  }

  // Render error state
  if (error) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
        <div className="flex items-center mb-2">
          <AlertTriangle className="h-5 w-5 mr-2" />
          <h2 className="text-lg font-medium">Error Loading Analytics</h2>
        </div>
        <p className="mb-3">{error}</p>
        <Button 
          variant="outline" 
          className="border-red-300 hover:bg-red-100" 
          onClick={() => {
            setIsLoading(true);
            window.location.reload();
          }}
        >
          Retry
        </Button>
      </div>
    );
  }

  // If no data available yet
  if (!analyticsData) {
    return (
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-blue-700">
        <p>No analytics data available yet. Start creating and publishing content to see analytics.</p>
      </div>
    );
  }

  // Extract data for display
  const { overview, contentStats, popularContent, ratings, dailyData } = analyticsData;
  const trafficData = prepareTrafficData(dailyData);
  const ratingsData = formatRatingsData(ratings);

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-2xl font-semibold">Analytics Dashboard</h2>
        <div className="flex space-x-2">
          <Button 
            variant={timeRange === '7d' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeRange('7d')}
          >
            7 Days
          </Button>
          <Button 
            variant={timeRange === '30d' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeRange('30d')}
          >
            30 Days
          </Button>
          <Button 
            variant={timeRange === '90d' ? 'default' : 'outline'} 
            size="sm"
            onClick={() => setTimeRange('90d')}
          >
            90 Days
          </Button>
        </div>
      </div>

      {/* Overview Stats */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Total Page Views</CardTitle>
            <Eye className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.pageViews.toLocaleString() || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Website impressions</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Unique Visitors</CardTitle>
            <Users className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.visitors.toLocaleString() || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Individual users</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">New Content</CardTitle>
            <TrendingUp className="h-4 w-4 text-gray-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{overview?.newContent || 0}</div>
            <p className="text-xs text-gray-500 mt-1">Items created this period</p>
          </CardContent>
        </Card>
      </div>

      {/* Content Type Breakdown */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Writings</CardTitle>
            <FileText className="h-4 w-4 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contentStats?.writings || 0}</div>
            <p className="text-xs text-gray-500 mt-1">New writings this period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Tech Blogs</CardTitle>
            <BookOpen className="h-4 w-4 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contentStats?.techBlogs || 0}</div>
            <p className="text-xs text-gray-500 mt-1">New blog posts this period</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">Projects</CardTitle>
            <Code className="h-4 w-4 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{contentStats?.projects || 0}</div>
            <p className="text-xs text-gray-500 mt-1">New projects this period</p>
          </CardContent>
        </Card>
      </div>

      {/* Traffic Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Traffic Overview</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart
                data={trafficData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="date" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Line type="monotone" dataKey="pageViews" stroke="#3b82f6" name="Page Views" />
                <Line type="monotone" dataKey="visitors" stroke="#10b981" name="Visitors" />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Ratings Distribution */}
      <Card>
        <CardHeader>
          <CardTitle>Ratings Distribution</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={ratingsData}
                margin={{ top: 5, right: 30, left: 20, bottom: 5 }}
              >
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Legend />
                <Bar dataKey="writings" fill="#3b82f6" name="Writings" />
                <Bar dataKey="techBlogs" fill="#8b5cf6" name="Tech Blogs" />
                <Bar dataKey="projects" fill="#10b981" name="Projects" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Popular Content */}
      <Card>
        <CardHeader>
          <CardTitle>Popular Content</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {popularContent && popularContent.length > 0 ? (
              popularContent.map((item, index) => (
                <div key={index} className="flex items-center justify-between border-b pb-3">
                  <div className="flex items-start">
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center mr-3 
                      ${item.type === 'Writing' ? 'bg-blue-100 text-blue-600' : 
                        item.type === 'TechBlog' ? 'bg-purple-100 text-purple-600' : 
                        'bg-green-100 text-green-600'}`}
                    >
                      {item.type === 'Writing' ? (
                        <FileText size={16} />
                      ) : item.type === 'TechBlog' ? (
                        <BookOpen size={16} />
                      ) : (
                        <Code size={16} />
                      )}
                    </div>
                    <div>
                      <h3 className="font-medium">
                        {item.details?.title || 'Untitled Content'}
                      </h3>
                      <p className="text-sm text-gray-500">
                        {item.type} · {item.details?.category || 'Uncategorized'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center">
                    <div className="text-right">
                      <div className="font-semibold">{item.views.toLocaleString()}</div>
                      <div className="text-xs text-gray-500">views</div>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-center text-gray-500 py-4">No popular content data available</p>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default AnalyticsDashboard;