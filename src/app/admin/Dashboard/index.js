// src/app/admin/Dashboard/index.js
'use client';

import React, { useEffect } from 'react';
import { useSelector, useDispatch } from 'react-redux';
import { Sidebar } from './components/Sidebar';
import { ContentSection } from './components/ContentSection';
import { useGetStatsQuery } from '@/store/slices/apiSlice';
import { setCurrentSection } from '@/store/slices/uiSlice';
import { Loader2 } from 'lucide-react';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';
import { DashboardStats } from './DashboardStats';
const Dashboard = () => {
  const { currentSection, sidebarCollapsed } = useSelector((state) => state.ui);
  const dispatch = useDispatch();

  // Load stats data from RTK Query
  const { data: statsData, isLoading, error } = useGetStatsQuery();

  // Handle section selection
  const handleSectionChange = (section) => {
    dispatch(setCurrentSection(section));
  };

  // Render the appropriate content based on current section
  const renderContent = () => {
    // Show loading state if stats data is being fetched and we're on the dashboard
    if (isLoading && currentSection === 'dashboard') {
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-gray-500">Loading dashboard data...</p>
        </div>
      );
    }

    switch (currentSection) {
      case 'dashboard':
        return <DashboardStats stats={statsData || {}} />;
      case 'writings':
        return <ContentSection type="writings" title="Writings" />;
      case 'tech-blog':
        return <ContentSection type="tech-blog" title="Tech Blog" />;
      case 'projects':
        return <ContentSection type="projects" title="Projects" />;
      case 'analytics':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Analytics</h2>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <h3 className="text-lg font-medium mb-4">Content Performance</h3>
              <div className="space-y-4">
                {statsData && Object.entries(statsData).map(([key, data]) => (
                  <div key={key} className="flex items-center justify-between p-3 border rounded">
                    <div>
                      <h4 className="font-medium capitalize">{key}</h4>
                      <p className="text-sm text-gray-500">
                        {data.total > 0 ? Math.round((data.published / data.total) * 100) : 0}% published
                      </p>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-center">
                        <p className="text-2xl font-semibold">{data.total}</p>
                        <p className="text-sm text-gray-500">Total</p>
                      </div>
                      <div className="text-center text-green-600">
                        <p className="text-2xl font-semibold">{data.published}</p>
                        <p className="text-sm">Live</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      case 'settings':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Settings</h2>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <form className="space-y-4 max-w-md">
                <div>
                  <label className="block text-sm font-medium mb-1">Site Title</label>
                  <Input defaultValue="My Portfolio" />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Description</label>
                  <textarea 
                    className="w-full min-h-[100px] p-2 border rounded-md"
                    defaultValue="Personal portfolio and blog"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium mb-1">Theme</label>
                  <Select defaultValue="light">
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="light">Light</SelectItem>
                      <SelectItem value="dark">Dark</SelectItem>
                      <SelectItem value="system">System</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button>Save Changes</Button>
              </form>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  // Render error state if stats fetching failed
  if (error && currentSection === 'dashboard') {
    return (
      <div className="min-h-screen bg-gray-50">
        <Sidebar 
          collapsed={sidebarCollapsed} 
          currentSection={currentSection}
          setCurrentSection={handleSectionChange}
        />
        
        <main className={`transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-64'
        }`}>
          <div className="p-6">
            <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
              <h2 className="text-lg font-medium mb-2">Error Loading Dashboard Data</h2>
              <p>{error.message || 'Could not load dashboard statistics. Please try again.'}</p>
              <Button 
                variant="outline" 
                className="mt-2" 
                onClick={() => window.location.reload()}
              >
                Retry
              </Button>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        currentSection={currentSection}
        setCurrentSection={handleSectionChange}
      />
      
      <main className={`transition-all duration-300 ${
        sidebarCollapsed ? 'ml-16' : 'ml-64'
      }`}>
        <div className="p-6">
          {renderContent()}
        </div>
      </main>
    </div>
  );
};

export default Dashboard;

