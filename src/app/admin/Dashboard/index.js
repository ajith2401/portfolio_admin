'use client';

import React, { useState, useEffect } from 'react';
import { DashboardStats } from './DashboardStats';
import { Loader2, AlertTriangle } from 'lucide-react';

const Dashboard = () => {
  const [stats, setStats] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const res = await fetch('/api/stats');
        if (!res.ok) throw new Error(res.status === 401 ? 'Your session expired. Please sign in again.' : 'Could not load dashboard statistics.');
        const data = await res.json();
        if (alive) setStats(data);
      } catch (e) {
        if (alive) setError(e.message || 'Failed to load dashboard data');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  if (loading) {
    return (
      <div className="flex h-64 flex-col items-center justify-center text-gray-500" role="status">
        <Loader2 className="mb-3 h-8 w-8 animate-spin" aria-hidden="true" />
        Loading dashboard…
      </div>
    );
  }
  if (error) {
    return (
      <div role="alert" className="rounded-lg border border-red-200 bg-red-50 p-4 text-red-800">
        <div className="mb-1 flex items-center gap-2 font-medium"><AlertTriangle className="h-5 w-5" aria-hidden="true" /> Error loading dashboard</div>
        <p className="mb-3 text-sm">{error}</p>
        <button type="button" onClick={() => window.location.reload()} className="rounded-md border border-red-300 bg-white px-3 py-1.5 text-sm font-medium hover:bg-red-100">Retry</button>
      </div>
    );
  }
  return <DashboardStats stats={stats || {}} />;
};

export default Dashboard;
