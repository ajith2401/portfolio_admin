'use client';

import { LogOut, ExternalLink } from 'lucide-react';

export default function SettingsPage() {
  const logout = async () => {
    try { await fetch('/api/logout', { method: 'POST' }); } catch { /* leave anyway */ }
    window.location.href = '/login';
  };
  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-semibold tracking-tight">Settings</h1>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Account</h2>
        <p className="mt-2 text-sm text-gray-700">Signed in as <strong>Ajithkumar</strong> (Admin).</p>
        <button type="button" onClick={logout} className="mt-4 inline-flex items-center gap-2 rounded-lg border border-red-200 px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
          <LogOut size={16} aria-hidden="true" /> Log out
        </button>
      </section>
      <section className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-gray-500">Site</h2>
        <p className="mt-2 text-sm text-gray-700">Site title, description and SEO are set per item in each editor. There are no global settings to change here yet.</p>
        <a href="https://www.ajithkumarr.com" target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-2 text-sm font-medium text-blue-700 hover:underline">
          View public site <ExternalLink size={14} aria-hidden="true" />
        </a>
      </section>
    </div>
  );
}
