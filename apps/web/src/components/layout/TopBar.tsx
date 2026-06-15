'use client';

import { Menu, RefreshCw, AlertTriangle } from 'lucide-react';
import { useUiStore } from '@/store/ui';

interface TopBarProps {
  onRefresh?: () => void;
  isStale?: boolean;
}

export function TopBar({ onRefresh, isStale }: TopBarProps) {
  const { pageTitle, pageSubtitle, setSidebarOpen } = useUiStore();

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between px-4 lg:px-6"
      style={{ background: '#ffffff', borderBottom: '1px solid #c8dff5', boxShadow: '0 1px 4px rgba(0,102,204,0.07)' }}>
      {/* Left */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <button onClick={() => setSidebarOpen(true)} aria-label="Open navigation"
          className="flex-shrink-0 rounded p-1.5 transition lg:hidden"
          style={{ color: '#5a8fc4' }}
          onMouseEnter={(e) => (e.currentTarget.style.color = '#0066CC')}
          onMouseLeave={(e) => (e.currentTarget.style.color = '#5a8fc4')}>
          <Menu size={20} />
        </button>
        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[1rem] font-semibold" style={{ color: '#0a2540' }}>
            {pageTitle}
          </h1>
          {pageSubtitle && (
            <span className="hidden truncate text-[0.75rem] md:block" style={{ color: '#5a8fc4' }}>
              {pageSubtitle}
            </span>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {isStale && (
          <div className="hidden items-center gap-1.5 rounded border px-2 py-1 text-[0.72rem] sm:flex"
            style={{ background: '#fff8e6', borderColor: '#f0c040', color: '#b35c00' }}>
            <AlertTriangle size={12} />
            Data may be stale
          </div>
        )}
        {onRefresh && (
          <button onClick={onRefresh}
            className="flex items-center gap-1.5 rounded border px-3 py-1.5 text-[0.8rem] transition"
            style={{ background: '#f0f6ff', borderColor: '#c8dff5', color: '#2e6fa8' }}
            onMouseEnter={(e) => { e.currentTarget.style.background = '#e6f0fb'; e.currentTarget.style.borderColor = '#0066CC'; }}
            onMouseLeave={(e) => { e.currentTarget.style.background = '#f0f6ff'; e.currentTarget.style.borderColor = '#c8dff5'; }}>
            <RefreshCw size={13} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
}
