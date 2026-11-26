'use client';

import dynamic from 'next/dynamic';

const AnalyticsSection = dynamic(
  () => import('../Dashboard/components/AnalyticsSection').then((m) => m.AnalyticsSection),
  { ssr: false },
);

export default function AnalyticsPage() {
  return <AnalyticsSection />;
}
