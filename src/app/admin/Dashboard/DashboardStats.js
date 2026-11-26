'use client';

import React from 'react';
import Link from 'next/link';
import { BookOpen, FileText, Briefcase, BarChart3, Plus, ArrowUpRight } from 'lucide-react';

const SECTIONS = [
  { key: 'writings', label: 'Writings', href: '/admin/writings', icon: FileText, tone: 'text-blue-600 bg-blue-50', bar: 'bg-blue-500' },
  { key: 'techblog', label: 'Tech Blog', href: '/admin/tech-blog', icon: BookOpen, tone: 'text-purple-600 bg-purple-50', bar: 'bg-purple-500' },
  { key: 'projects', label: 'Projects', href: '/admin/projects', icon: Briefcase, tone: 'text-emerald-600 bg-emerald-50', bar: 'bg-emerald-500' },
];
const ACTIONS = [
  { href: '/admin/writings', label: 'Manage writings', icon: FileText },
  { href: '/admin/tech-blog', label: 'Tech blog posts', icon: BookOpen },
  { href: '/admin/projects', label: 'Projects', icon: Briefcase },
  { href: '/admin/analytics', label: 'View analytics', icon: BarChart3 },
];
const BADGE = {
  published: 'bg-emerald-100 text-emerald-800',
  draft: 'bg-amber-100 text-amber-800',
  archived: 'bg-gray-200 text-gray-700',
};

const fmt = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
};

export const DashboardStats = ({ stats = {} }) => {
  const recent = Array.isArray(stats.recent) ? stats.recent : [];
  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold tracking-tight">Dashboard</h1>
        <Link href="/admin/writings/new" className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700">
          <Plus size={16} aria-hidden="true" /> New writing
        </Link>
      </div>

      <section aria-label="Content totals" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {SECTIONS.map(({ key, label, href, icon: Icon, tone, bar }) => {
          const v = stats[key] || { total: 0, published: 0, draft: 0 };
          const pct = v.total ? Math.round((v.published / v.total) * 100) : 0;
          return (
            <Link key={key} href={href} className="group rounded-xl border border-gray-200 bg-white p-5 shadow-sm transition hover:border-gray-300 hover:shadow">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-gray-500">{label}</span>
                <span className={`rounded-lg p-2 ${tone}`}><Icon size={18} aria-hidden="true" /></span>
              </div>
              <p className="mt-2 text-3xl font-semibold tabular-nums">{v.total.toLocaleString()}</p>
              <p className="mt-1 text-sm text-gray-500">
                <span className="font-medium text-emerald-700">{v.published.toLocaleString()} published</span>
                {' · '}
                <span className="font-medium text-amber-700">{v.draft.toLocaleString()} draft</span>
              </p>
              <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-gray-100" role="img" aria-label={`${pct}% published`}>
                <div className={`h-full rounded-full ${bar}`} style={{ width: `${pct}%` }} />
              </div>
            </Link>
          );
        })}
      </section>

      <section aria-labelledby="qa-h">
        <h2 id="qa-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Quick actions</h2>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {ACTIONS.map(({ href, label, icon: Icon }) => (
            <Link key={href} href={href} className="flex items-center gap-3 rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm font-medium shadow-sm transition hover:border-blue-300 hover:text-blue-700">
              <Icon size={18} className="text-gray-400" aria-hidden="true" /> {label}
            </Link>
          ))}
        </div>
      </section>

      <section aria-labelledby="rc-h">
        <h2 id="rc-h" className="mb-3 text-sm font-semibold uppercase tracking-wide text-gray-500">Recent content</h2>
        {recent.length === 0 ? (
          <p className="rounded-xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">Nothing edited yet. New content will show up here.</p>
        ) : (
          <ul className="divide-y divide-gray-100 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm">
            {recent.map((r) => (
              <li key={`${r.type}-${r.id}`}>
                <Link href={r.href} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 hover:bg-gray-50">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-medium capitalize ${BADGE[r.status] || BADGE.archived}`}>{r.status}</span>
                  <span className="min-w-0 flex-1 truncate font-medium" lang={/[஀-௿]/.test(r.title) ? 'ta' : undefined}>{r.title}</span>
                  <span className="text-xs text-gray-500">{r.type}</span>
                  <span className="text-xs text-gray-600">{fmt(r.updatedAt)}</span>
                  <ArrowUpRight size={14} className="text-gray-300" aria-hidden="true" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
};
