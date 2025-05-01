'use client';

import React, { useState, useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { ContentSection } from './components/ContentSection';
import { DashboardStats } from './DashboardStats';
import { AnalyticsSection } from './components/AnalyticsSection';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

const Dashboard = () => {
  const [currentSection, setCurrentSection] = useState('dashboard');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [statsData, setStatsData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);

  // Fetch dashboard statistics
  useEffect(() => {
    const fetchStats = async () => {
      if (currentSection === 'dashboard') {
        setIsLoading(true);
        setError(null);
        
        try {
          const response = await fetch('/api/stats');
          
          if (!response.ok) {
            throw new Error('Could not load dashboard statistics. Please try again.');
          }
          
          const data = await response.json();
          setStatsData(data);
        } catch (err) {
          console.error('Error fetching stats:', err);
          setError(err.message || 'Failed to load dashboard data');
        } finally {
          setIsLoading(false);
        }
      }
    };
    
    fetchStats();
  }, [currentSection]);

  // Toggle sidebar
  const toggleSidebar = () => {
    setSidebarCollapsed(prev => !prev);
  };

  // Render content based on current section
  const renderContent = () => {
    // Show loading state if stats data is being fetched
    if (currentSection === 'dashboard' && isLoading) {
      return (
        <div className="flex flex-col items-center justify-center h-64">
          <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
          <p className="text-gray-500">Loading dashboard data...</p>
        </div>
      );
    }

    // Show error state if stats fetching failed
    if (currentSection === 'dashboard' && error) {
      return (
        <div className="bg-red-50 border border-red-200 rounded-lg p-4 text-red-700">
          <div className="flex items-center mb-2">
            <AlertTriangle className="h-5 w-5 mr-2" />
            <h2 className="text-lg font-medium">Error Loading Dashboard Data</h2>
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
        return <AnalyticsSection />;
      case 'settings':
        return (
          <div className="space-y-6">
            <h2 className="text-2xl font-semibold">Settings</h2>
            <div className="bg-white p-6 rounded-lg shadow-sm">
              <div className="max-w-md space-y-4">
                <div>
                  <label className="block text-sm font-medium mb-1">Site Title</label>
                  <input 
                    type="text"
                    defaultValue="My Portfolio"
                    className="w-full p-2 border rounded-md"
                  />
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
                  <select
                    defaultValue="light"
                    className="w-full p-2 border rounded-md"
                  >
                    <option value="light">Light</option>
                    <option value="dark">Dark</option>
                    <option value="system">System</option>
                  </select>
                </div>
                
                <Button>Save Changes</Button>
              </div>
            </div>
          </div>
        );
      default:
        return null;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex">
      <Sidebar 
        collapsed={sidebarCollapsed} 
        toggleSidebar={toggleSidebar}
        currentSection={currentSection}
        setCurrentSection={setCurrentSection}
      />
      
      <main className={`transition-all duration-300 flex-1 ${
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