// src/app/admin/Dashboard/index.js
'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentSection } from './components/ContentSection';
import { calculateStats } from './lib/utils';
import { api } from './lib/api';
import { Button, Input, Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui';

const Dashboard = () => {
  const [currentSection, setCurrentSection] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [stats, setStats] = useState({
    writings: { total: 0, draft: 0, published: 0 },
    techblog: { total: 0, draft: 0, published: 0 },
    projects: { total: 0, draft: 0, published: 0 }
  });
  const [isLoading, setIsLoading] = useState(true);

  // Load stats only once when component mounts
  useEffect(() => {
    loadStats();
  }, []);

  const loadStats = async () => {
    setIsLoading(true);
    try {
      // Fix: Add error handling for each API call
      const fetchWritings = api.fetchWritings().catch(err => {
        console.error('Error fetching writings:', err);
        return [];
      });
      
      const fetchTechBlogs = api.fetchTechBlogs().catch(err => {
        console.error('Error fetching tech blogs:', err);
        return [];
      });
      
      const fetchProjects = api.fetchProjects().catch(err => {
        console.error('Error fetching projects:', err);
        return [];
      });

      const [writings, techblogs, projects] = await Promise.all([
        fetchWritings,
        fetchTechBlogs,
        fetchProjects
      ]);

      // Make sure we have valid arrays before calculating stats
      setStats({
        writings: calculateStats(Array.isArray(writings) ? writings : []),
        techblog: calculateStats(Array.isArray(techblogs) ? techblogs : []),
        projects: calculateStats(Array.isArray(projects) ? projects : [])
      });
    } catch (error) {
      console.error('Error loading stats:', error);
      // Set default stats on error
      setStats({
        writings: { total: 0, draft: 0, published: 0 },
        techblog: { total: 0, draft: 0, published: 0 },
        projects: { total: 0, draft: 0, published: 0 }
      });
    } finally {
      setIsLoading(false);
    }
  };

  const renderContent = () => {
    // Show loading state if data is being fetched
    if (isLoading && currentSection === 'dashboard') {
      return (
        <div className="space-y-6">
          <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['writings', 'techblog', 'projects'].map((key) => (
              <div key={key} className="bg-white p-6 rounded-lg shadow-sm animate-pulse">
                <h3 className="text-lg font-medium capitalize">{key}</h3>
                <div className="mt-2 space-y-1">
                  <div className="h-4 bg-gray-200 rounded w-1/2"></div>
                  <div className="h-4 bg-gray-200 rounded w-2/3"></div>
                  <div className="h-4 bg-gray-200 rounded w-1/3"></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

    switch (currentSection) {
      case 'dashboard':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Dashboard Overview</h2>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {Object.entries(stats).map(([key, data]) => (
                <div key={key} className="bg-white p-6 rounded-lg shadow-sm">
                  <h3 className="text-lg font-medium capitalize">{key}</h3>
                  <div className="mt-2 space-y-1">
                    <p>Total: {data.total}</p>
                    <p className="text-green-600">Published: {data.published}</p>
                    <p className="text-yellow-600">Draft: {data.draft}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
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
                {Object.entries(stats).map(([key, data]) => (
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

  return (
    <div className="min-h-screen bg-gray-50">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        toggleSidebar={() => setSidebarCollapsed(!sidebarCollapsed)}
        currentSection={currentSection}
        setCurrentSection={setCurrentSection}
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