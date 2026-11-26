'use client';

import dynamic from 'next/dynamic';

const Overview = dynamic(() => import('./Dashboard'), { ssr: false });

export default function AdminPage() {
  return <Overview />;
}
