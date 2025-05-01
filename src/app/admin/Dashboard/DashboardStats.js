// src/app/admin/Dashboard/components/DashboardStats.js
'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Briefcase, BookOpen, FileText, BarChart2, Bookmark, Eye } from 'lucide-react';
import Link from 'next/link';
import { setCurrentSection } from '@/store/slices/uiSlice';
import { useDispatch } from 'react-redux';

export const DashboardStats = ({ stats }) => {
  const dispatch = useDispatch();

  const handleNavigate = (section) => {
    dispatch(setCurrentSection(section));
  };

  return (
    <div className="space-y-6">
      <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Writings Stats */}
        <Card 
          className="hover:shadow-md transition-all cursor-pointer"
          onClick={() => handleNavigate('writings')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Writings</CardTitle>
            <FileText className="h-5 w-5 text-blue-500" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-semibold">{stats.writings?.total || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-500">Published</span>
                <span className="font-semibold text-green-500">{stats.writings?.published || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-500">Draft</span>
                <span className="font-semibold text-amber-500">{stats.writings?.draft || 0}</span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="relative w-full h-2 bg-gray-100 rounded-full">
                  <div 
                    className="absolute top-0 left-0 h-2 bg-blue-500 rounded-full"
                    style={{ 
                      width: `${stats.writings?.total ? (stats.writings?.published / stats.writings?.total) * 100 : 0}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Tech Blog Stats */}
        <Card 
          className="hover:shadow-md transition-all cursor-pointer"
          onClick={() => handleNavigate('tech-blog')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Tech Blog</CardTitle>
            <BookOpen className="h-5 w-5 text-purple-500" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-semibold">{stats.techblog?.total || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-500">Published</span>
                <span className="font-semibold text-green-500">{stats.techblog?.published || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-500">Draft</span>
                <span className="font-semibold text-amber-500">{stats.techblog?.draft || 0}</span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="relative w-full h-2 bg-gray-100 rounded-full">
                  <div 
                    className="absolute top-0 left-0 h-2 bg-purple-500 rounded-full"
                    style={{ 
                      width: `${stats.techblog?.total ? (stats.techblog?.published / stats.techblog?.total) * 100 : 0}%` 
                    }}
                  />
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Projects Stats */}
        <Card 
          className="hover:shadow-md transition-all cursor-pointer"
          onClick={() => handleNavigate('projects')}
        >
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-lg font-medium">Projects</CardTitle>
            <Briefcase className="h-5 w-5 text-green-500" />
          </CardHeader>
          <CardContent>
            <div className="flex flex-col space-y-2">
              <div className="flex justify-between items-center">
                <span className="text-sm text-gray-500">Total</span>
                <span className="font-semibold">{stats.projects?.total || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-green-500">Published</span>
                <span className="font-semibold text-green-500">{stats.projects?.published || 0}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-amber-500">Draft</span>
                <span className="font-semibold text-amber-500">{stats.projects?.draft || 0}</span>
              </div>
              <div className="mt-2 pt-2 border-t">
                <div className="relative w-full h-2 bg-gray-100 rounded-full">
                  <div 
                    className="absolute top-0 left-0 h-2 bg-green-500 rounded-full"
                    style={{ 
                      width: `${stats.projects?.total ? (stats.projects?.published / stats.projects?.total) * 100 : 0}%` 
                    }}
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
        <Card 
          className="hover:shadow-md transition-all cursor-pointer"
          onClick={() => handleNavigate('writings')}
        >
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <FileText className="h-8 w-8 text-blue-500 mb-2" />
            <span className="font-medium">New Writing</span>
          </CardContent>
        </Card>
        
        <Card 
          className="hover:shadow-md transition-all cursor-pointer"
          onClick={() => handleNavigate('tech-blog')}
        >
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <BookOpen className="h-8 w-8 text-purple-500 mb-2" />
            <span className="font-medium">New Blog Post</span>
          </CardContent>
        </Card>
        
        <Card 
          className="hover:shadow-md transition-all cursor-pointer"
          onClick={() => handleNavigate('projects')}
        >
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <Briefcase className="h-8 w-8 text-green-500 mb-2" />
            <span className="font-medium">New Project</span>
          </CardContent>
        </Card>
        
        <Card 
          className="hover:shadow-md transition-all cursor-pointer"
          onClick={() => handleNavigate('analytics')}
        >
          <CardContent className="p-4 flex flex-col items-center justify-center text-center">
            <BarChart2 className="h-8 w-8 text-amber-500 mb-2" />
            <span className="font-medium">View Analytics</span>
          </CardContent>
        </Card>
      </div>

      {/* Recent Content */}
      <h3 className="text-xl font-medium mt-8 mb-4">Recent Content</h3>
      <div className="grid grid-cols-1 gap-4">
        {/* This would be populated with actual recent content */}
        <Card className="hover:shadow-md transition-all">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-green-500 mr-2"></div>
                <span className="font-medium">Document title would go here</span>
              </div>
              <div className="flex space-x-2 text-gray-500">
                <span className="text-xs">Apr 30, 2025</span>
                <Bookmark className="h-4 w-4" />
                <Eye className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-all">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-amber-500 mr-2"></div>
                <span className="font-medium">Another document title here</span>
              </div>
              <div className="flex space-x-2 text-gray-500">
                <span className="text-xs">Apr 28, 2025</span>
                <Bookmark className="h-4 w-4" />
                <Eye className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="hover:shadow-md transition-all">
          <CardContent className="p-4">
            <div className="flex justify-between items-center">
              <div className="flex items-center">
                <div className="w-2 h-2 rounded-full bg-purple-500 mr-2"></div>
                <span className="font-medium">Yet another document title</span>
              </div>
              <div className="flex space-x-2 text-gray-500">
                <span className="text-xs">Apr 25, 2025</span>
                <Bookmark className="h-4 w-4" />
                <Eye className="h-4 w-4" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};