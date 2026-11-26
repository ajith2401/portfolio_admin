'use client';
// One shell for every /admin page: persistent sidebar on desktop, slide-over drawer on mobile.
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { LayoutDashboard, PenTool, BookOpen, Code2, BarChart3, Settings, LogOut, Menu, X, ExternalLink } from 'lucide-react';

const NAV = [
  { href: '/admin', label: 'Dashboard', icon: LayoutDashboard, exact: true },
  { href: '/admin/writings', label: 'Writings', icon: PenTool },
  { href: '/admin/tech-blog', label: 'Tech Blog', icon: BookOpen },
  { href: '/admin/projects', label: 'Projects', icon: Code2 },
  { href: '/admin/analytics', label: 'Analytics', icon: BarChart3 },
  { href: '/admin/settings', label: 'Settings', icon: Settings },
];

async function logout() {
  try { await fetch('/api/logout', { method: 'POST' }); } catch { /* still leave */ }
  window.location.href = '/login';
}

function NavList({ pathname, onNavigate }) {
  return (
    <nav aria-label="Admin" className="flex-1 space-y-1 px-3 py-4">
      {NAV.map(({ href, label, icon: Icon, exact }) => {
        const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
        return (
          <Link
            key={href}
            href={href}
            onClick={onNavigate}
            aria-current={active ? 'page' : undefined}
            className={`flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
              active ? 'bg-blue-50 text-blue-700' : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
            }`}
          >
            <Icon size={18} aria-hidden="true" />
            {label}
          </Link>
        );
      })}
    </nav>
  );
}

function SidebarBody({ pathname, onNavigate }) {
  return (
    <div className="flex h-full flex-col">
      <div className="flex h-14 items-center border-b border-gray-200 px-5">
        <span className="text-base font-semibold tracking-tight text-gray-900">Admin CMS</span>
      </div>
      <NavList pathname={pathname} onNavigate={onNavigate} />
      <div className="space-y-1 border-t border-gray-200 p-3">
        <a href="https://www.ajithkumarr.com" target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm text-gray-600 hover:bg-gray-100">
          <ExternalLink size={16} aria-hidden="true" /> View site
        </a>
        <div className="flex items-center gap-3 px-3 py-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 text-sm font-semibold text-blue-700" aria-hidden="true">A</div>
          <div className="min-w-0">
            <p className="truncate text-sm font-medium text-gray-900">Ajithkumar</p>
            <p className="text-xs text-gray-500">Admin</p>
          </div>
        </div>
        <button type="button" onClick={logout} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50">
          <LogOut size={16} aria-hidden="true" /> Logout
        </button>
      </div>
    </div>
  );
}

export default function AdminShell({ children }) {
  const pathname = usePathname() || '';
  const [open, setOpen] = useState(false);
  useEffect(() => { setOpen(false); }, [pathname]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900">
      <a href="#admin-main" className="sr-only focus:not-sr-only focus:fixed focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2">Skip to content</a>
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-60 border-r border-gray-200 bg-white lg:block">
        <SidebarBody pathname={pathname} />
      </aside>

      <header className="sticky top-0 z-20 flex h-14 items-center gap-3 border-b border-gray-200 bg-white px-4 lg:hidden">
        <button type="button" onClick={() => setOpen(true)} aria-label="Open navigation" aria-expanded={open} className="rounded p-2 text-gray-700 hover:bg-gray-100">
          <Menu size={20} />
        </button>
        <span className="font-semibold">Admin CMS</span>
      </header>

      {open && (
        <div className="fixed inset-0 z-40 lg:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button type="button" aria-label="Close navigation" className="absolute inset-0 bg-black/40" onClick={() => setOpen(false)} />
          <div className="absolute inset-y-0 left-0 w-64 bg-white shadow-xl">
            <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="absolute right-2 top-3 rounded p-2 text-gray-500 hover:bg-gray-100"><X size={18} /></button>
            <SidebarBody pathname={pathname} onNavigate={() => setOpen(false)} />
          </div>
        </div>
      )}

      <main id="admin-main" className="lg:pl-60">
        <div className="mx-auto w-full max-w-7xl px-4 py-6 sm:px-6 lg:px-8">{children}</div>
      </main>
    </div>
  );
}
