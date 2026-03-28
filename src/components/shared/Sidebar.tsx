'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

interface SidebarProps {
  projectId?: string;
}

const projectNavItems = [
  { href: '', label: 'Overview', icon: '◉' },
  { href: '/gantt', label: 'Gantt', icon: '▦' },
  { href: '/lookahead', label: 'Look-ahead', icon: '⏭' },
  { href: '/burndown', label: 'Burn-down', icon: '📉' },
  { href: '/whatif', label: 'What-if', icon: '🔀' },
  { href: '/health', label: 'Health', icon: '❤' },
  { href: '/chat', label: 'AI Agent', icon: '🤖' },
  { href: '/versions', label: 'Versions', icon: '🕐' },
  { href: '/import', label: 'Import', icon: '⬆' },
  { href: '/export', label: 'Export', icon: '⬇' },
  { href: '/settings', label: 'Settings', icon: '⚙' },
];

export default function Sidebar({ projectId }: SidebarProps) {
  const pathname = usePathname();

  return (
    <aside className="w-60 bg-slate-900 border-r border-slate-800 flex flex-col h-screen sticky top-0">
      {/* Logo */}
      <div className="p-4 border-b border-slate-800">
        <Link href="/dashboard" className="flex items-center gap-2">
          <div className="w-7 h-7 bg-amber-500 rounded flex items-center justify-center">
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none">
              <rect x="1" y="4" width="14" height="2" rx="1" fill="white" />
              <rect x="1" y="8" width="9" height="2" rx="1" fill="white" />
              <rect x="1" y="12" width="11" height="2" rx="1" fill="white" />
            </svg>
          </div>
          <span className="text-white font-semibold text-sm tracking-tight">Kedular</span>
        </Link>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto p-3">
        {/* Dashboard link */}
        <Link
          href="/dashboard"
          className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm mb-4 transition-colors ${
            pathname === '/dashboard'
              ? 'bg-slate-700 text-white'
              : 'text-slate-400 hover:text-white hover:bg-slate-800'
          }`}
        >
          <span>⊞</span>
          <span>All Projects</span>
        </Link>

        {/* Project nav */}
        {projectId && (
          <>
            <div className="text-xs font-medium text-slate-500 uppercase tracking-wider px-3 mb-2">
              Project
            </div>
            {projectNavItems.map((item) => {
              const href = `/project/${projectId}${item.href}`;
              const isActive = pathname === href || (item.href === '' && pathname === `/project/${projectId}`);
              return (
                <Link
                  key={item.href}
                  href={href}
                  className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    isActive
                      ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <span className="text-xs">{item.icon}</span>
                  <span>{item.label}</span>
                </Link>
              );
            })}
          </>
        )}
      </nav>

      {/* User */}
      <div className="p-3 border-t border-slate-800">
        <Link
          href="/settings"
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-slate-400 hover:text-white hover:bg-slate-800 transition-colors"
        >
          <span>👤</span>
          <span>Account</span>
        </Link>
      </div>
    </aside>
  );
}
