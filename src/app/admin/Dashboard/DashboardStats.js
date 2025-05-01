'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { BookOpen, FileText, Briefcase, BarChart2, Plus } from 'lucide-react';
import { Button } from '@/components/ui';

export const DashboardStats = ({ stats = {} }) => {
  const {
    writings = { total: 0, published: 0, draft: 0 },
    techblog = { total: 0, published: 0, draft: 0 },
    projects = { total: 0, published: 0, draft: 0 }
  } = stats;

  // Calculate percentages safely
  const calculatePercentage = (published, total) => {
    if (total === 0) return 0;
    return (published / total) * 100;
  };

  const writingsPercentage = calculatePercentage(writings.published, writings.total);
  const techblogPercentage = calculatePercentage(techblog.published, techblog.total);
  const projectsPercentage = calculatePercentage(projects.published, projects.total);

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Writings Stats */}
        <Card className="hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Writings</CardTitle>
            <FileText className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-semibold">{writings.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-500">Published</span>
                <span className="font-semibold text-green-500">{writings.published}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-500">Draft</span>
                <span className="font-semibold text-amber-500">{writings.draft}</span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="relative w-full h-2 bg-gray-100 rounded-full">
                  <div 
                    className="absolute top-0 left-0 h-2 bg-blue-500 rounded-full"
                    style={{ width: `${writingsPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tech Blog Stats */}
        <Card className="hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Tech Blog</CardTitle>
            <BookOpen className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-semibold">{techblog.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-500">Published</span>
                <span className="font-semibold text-green-500">{techblog.published}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-500">Draft</span>
                <span className="font-semibold text-amber-500">{techblog.draft}</span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="relative w-full h-2 bg-gray-100 rounded-full">
                  <div 
                    className="absolute top-0 left-0 h-2 bg-purple-500 rounded-full"
                    style={{ width: `${techblogPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects Stats */}
        <Card className="hover:shadow-md transition-all">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Projects</CardTitle>
            <Briefcase className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-semibold">{projects.total}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-500">Published</span>
                <span className="font-semibold text-green-500">{projects.published}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-500">Draft</span>
                <span className="font-semibold text-amber-500">{projects.draft}</span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="relative w-full h-2 bg-gray-100 rounded-full">
                  <div 
                    className="absolute top-0 left-0 h-2 bg-green-500 rounded-full"
                    style={{ width: `${projectsPercentage}%` }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <h3 className="text-xl font-medium mt-8 mb-4">Quick Actions</h3>
      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="hover:shadow-md transition-all cursor-pointer">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <FileText className="h-8 w-8 text-blue-500 mb-2" />
            <span className="font-medium">New Writing</span>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-all cursor-pointer">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <BookOpen className="h-8 w-8 text-purple-500 mb-2" />
            <span className="font-medium">New Blog Post</span>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-all cursor-pointer">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <Briefcase className="h-8 w-8 text-green-500 mb-2" />
            <span className="font-medium">New Project</span>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-all cursor-pointer">
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <BarChart2 className="h-8 w-8 text-amber-500 mb-2" />
            <span className="font-medium">View Analytics</span>
          </CardContent>
        </Card>
      </div>

      {/* Recent Content */}
      <h3 className="text-xl font-medium mt-8 mb-4">Recent Content</h3>
      <div className="bg-white rounded-lg shadow-sm p-8 text-center">
        <div className="flex flex-col items-center justify-center space-y-4">
          <div className="text-gray-400">
            <BarChart2 className="h-16 w-16" />
          </div>
          <h4 className="text-lg font-medium">No Recent Activity</h4>
          <p className="text-gray-500 max-w-md">
            Start creating content to see your recent activity here.
          </p>
          <Button className="mt-4">
            <Plus className="w-4 h-4 mr-2" />
            Create Content
          </Button>
        </div>
      </div>
    </div>
  );
};