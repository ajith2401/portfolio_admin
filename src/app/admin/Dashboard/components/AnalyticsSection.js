'use client';

import React, { useState, useEffect } from 'react';
import dynamic from 'next/dynamic';
import { Loader2, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui';

// Dynamically import the AnalyticsDashboard component
// to avoid SSR issues with recharts
const AnalyticsDashboard = dynamic(
  () => import('./AnalyticsDashboard'),
  { 
    loading: () => (
      <div className="flex flex-col items-center justify-center h-64">
        <Loader2 className="w-12 h-12 animate-spin text-primary mb-4" />
        <p className="text-gray-500">Loading analytics dashboard...</p>
      </div>
    ),
    ssr: false 
  }
);

export const AnalyticsSection = () => {
  return (
    <div className="space-y-4">
      <h2 className="text-2xl font-semibold">Analytics</h2>
      <AnalyticsDashboard />
    </div>
  );
};