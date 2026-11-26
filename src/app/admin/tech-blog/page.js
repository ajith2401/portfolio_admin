'use client';

import dynamic from 'next/dynamic';

const ContentSection = dynamic(
  () => import('../Dashboard/components/ContentSection').then((m) => m.ContentSection),
  { ssr: false },
);

export default function TechBlogPage() {
  return <ContentSection type="tech-blog" title="Tech Blog" />;
}
