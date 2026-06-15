'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import {
  LayoutDashboard,
  FileText,
  Clock,
  GitBranch,
  Bell,
  Activity,
  BarChart2,
  BrainCircuit,
  LogOut,
  X,
} from 'lucide-react';
import { cn, initials } from '@/lib/utils';
import { useAuthStore } from '@/store/auth';
import { useUiStore } from '@/store/ui';
import { logoutApi } from '@/lib/api';

const NAV = [
  {
    section: 'Overview',
    items: [
      { label: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
      { label: 'Service Requests', href: '/requests', icon: FileText },
    ],
  },
  {
    section: 'Operations',
    items: [
      { label: 'Events', href: '/events', icon: Clock },
      { label: 'Timeline', href: '/timeline', icon: GitBranch },
      { label: 'Alerts', href: '/alerts', icon: Bell, badge: true },
      { label: 'SLA Monitor', href: '/sla', icon: Activity },
    ],
  },
  {
    section: 'Intelligence',
    items: [
      { label: 'Analytics', href: '/analytics', icon: BarChart2 },
      { label: 'AI Copilot', href: '/ai', icon: BrainCircuit },
    ],
  },
];

export function Sidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const user = useAuthStore((s) => s.user);
  const { refreshToken, clearAuth } = useAuthStore();
  const { sidebarCollapsed, sidebarOpen, toggleSidebar, setSidebarOpen } =
    useUiStore();

  async function handleLogout() {
    if (!confirm('Sign out?')) return;
    if (refreshToken) {
      try { await logoutApi(refreshToken); } catch { /* ignore */ }
    }
    clearAuth();
    router.push('/login');
  }

  const collapsed = sidebarCollapsed;
  const userInitials = user ? initials(user.email.split('@')[0] ?? '') : '?';

  return (
    <>
      {/* Mobile backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-[99] bg-black/65 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed left-0 top-0 z-[200] flex h-screen flex-col',
          'border-r transition-all duration-200',
          collapsed ? 'w-16' : 'w-56',
          'lg:relative lg:translate-x-0',
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0',
        )}
        style={{ background: '#0a1628', borderColor: '#0f2444', boxShadow: '2px 0 16px rgba(0,0,0,0.4)' }}
        role="navigation"
        aria-label="Main navigation"
      >
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b border-border px-3 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            {/* D&S logo icon */}
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center rounded"
              style={{ background: 'white', boxShadow: '0 0 8px rgba(0,102,204,0.4)' }}>
              <svg width="24" height="24" viewBox="0 0 40 40" fill="none">
                <rect x="1" y="1" width="38" height="38" rx="3" fill="white" stroke="#0066CC" strokeWidth="1.5"/>
                <text x="5" y="14" fontFamily="Arial" fontWeight="bold" fontSize="8" fill="#0066CC">D&amp;S</text>
                <path d="M4 22 Q10 17 16 22 Q22 27 28 22 Q34 17 38 22" stroke="#0066CC" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M4 30 Q10 25 16 30 Q22 35 28 30 Q34 25 38 30" stroke="#4DA6FF" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
            {!collapsed && (
              <div className="min-w-0">
                <div className="truncate text-[0.8rem] font-black leading-tight tracking-tight text-white">D&amp;S 1000 Eyes</div>
                <div className="truncate text-[0.55rem] tracking-wide" style={{ color: '#4DA6FF' }}>Process Observability</div>
              </div>
            )}
          </div>

          {/* Desktop collapse toggle */}
          <button
            onClick={toggleSidebar}
            className="hidden flex-shrink-0 rounded p-1 text-text-muted transition hover:text-cyan lg:block"
            aria-label="Toggle sidebar"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <line x1="3" y1="12" x2="21" y2="12" />
              <line x1="3" y1="6" x2="21" y2="6" />
              <line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>

          {/* Mobile close */}
          <button
            onClick={() => setSidebarOpen(false)}
            className="flex-shrink-0 rounded p-1 text-text-muted transition hover:text-cyan lg:hidden"
            aria-label="Close navigation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex flex-1 flex-col gap-5 overflow-y-auto overflow-x-hidden p-2 py-3">
          {NAV.map((section) => (
            <div key={section.section} className="flex flex-col gap-0.5">
              {!collapsed && (
                <span className="mb-1 px-2 text-[0.62rem] font-semibold uppercase tracking-widest text-text-muted">
                  {section.section}
                </span>
              )}
              {section.items.map((item) => {
                const active = pathname === item.href || pathname.startsWith(item.href + '/');
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setSidebarOpen(false)}
                    className={cn(
                      'flex items-center gap-2.5 rounded px-2.5 py-2 text-[0.83rem] font-[450] transition-all',
                      active
                        ? 'font-semibold'
                        : 'hover:bg-bg-hover',
                      collapsed && 'justify-center px-0',
                    )}
                    style={active
                      ? { background: 'rgba(0,102,204,0.18)', color: '#4DA6FF' }
                      : { color: '#7aaad4' }}
                    title={collapsed ? item.label : undefined}
                    aria-current={active ? 'page' : undefined}
                  >
                    <Icon
                      size={17}
                      className={cn('flex-shrink-0', active && 'drop-shadow-[0_0_4px_#00e5ff]')}
                    />
                    {!collapsed && <span className="truncate">{item.label}</span>}
                    {!collapsed && item.badge && (
                      <span
                        id="alert-badge"
                        className="ml-auto hidden rounded-full bg-danger px-1.5 py-0.5 text-[0.62rem] font-bold text-white"
                      >
                        0
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Footer */}
        <div className="flex-shrink-0 border-t border-border p-2">
          {/* WS status */}
          <div
            className={cn(
              'mb-1 flex items-center gap-2 rounded px-2 py-1',
              collapsed && 'justify-center',
            )}
          >
            <span className="h-[7px] w-[7px] flex-shrink-0 rounded-full bg-text-muted" />
            {!collapsed && (
              <span className="text-[0.72rem] text-text-muted">Connecting…</span>
            )}
          </div>

          {/* User chip */}
          <div
            className={cn(
              'flex items-center gap-2 rounded border border-border bg-bg-raised px-2 py-1.5',
              collapsed && 'justify-center',
            )}
          >
            <div className="flex h-7 w-7 flex-shrink-0 items-center justify-center rounded-full border text-[0.7rem] font-bold uppercase"
              style={{ background: 'rgba(0,102,204,0.18)', borderColor: '#0066CC', color: '#4DA6FF' }}
            >
              {userInitials}
            </div>
            {!collapsed && (
              <div className="min-w-0 flex-1">
                <p className="truncate text-[0.78rem] font-medium text-text">
                  {user?.email.split('@')[0] ?? '—'}
                </p>
                <p className="truncate text-[0.68rem]" style={{ color: '#4DA6FF' }}>
                  {user?.role ?? '—'}
                </p>
              </div>
            )}
            {!collapsed && (
              <button
                onClick={handleLogout}
                className="flex-shrink-0 rounded p-1 text-text-muted transition hover:text-danger"
                title="Logout"
                aria-label="Logout"
              >
                <LogOut size={14} />
              </button>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
