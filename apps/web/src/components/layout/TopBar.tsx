'use client';

import { Menu, RefreshCw, AlertTriangle } from 'lucide-react';
import { useUiStore } from '@/store/ui';
import { cn } from '@/lib/utils';

interface TopBarProps {
  onRefresh?: () => void;
  isStale?: boolean;
}

export function TopBar({ onRefresh, isStale }: TopBarProps) {
  const { pageTitle, pageSubtitle, setSidebarOpen } = useUiStore();

  return (
    <header className="flex h-14 flex-shrink-0 items-center justify-between border-b px-4 lg:px-6"
      style={{ background: '#0d1f38', borderColor: '#0f2444' }}>
      {/* Left */}
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {/* Hamburger — mobile only */}
        <button
          onClick={() => setSidebarOpen(true)}
          className="flex-shrink-0 rounded p-1.5 text-text-muted transition hover:text-cyan lg:hidden"
          aria-label="Open navigation"
        >
          <Menu size={20} />
        </button>

        <div className="flex min-w-0 items-baseline gap-2">
          <h1 className="truncate text-[1rem] font-semibold text-white">
            {pageTitle}
          </h1>
          {pageSubtitle && (
            <span className="hidden truncate text-[0.75rem] text-text-muted md:block">
              {pageSubtitle}
            </span>
          )}
        </div>
      </div>

      {/* Right */}
      <div className="flex flex-shrink-0 items-center gap-2">
        {isStale && (
          <div className="hidden items-center gap-1.5 rounded border border-warning/25 bg-warning/10 px-2 py-1 text-[0.72rem] text-warning sm:flex">
            <AlertTriangle size={12} />
            Data may be stale
          </div>
        )}
        {onRefresh && (
          <button
            onClick={onRefresh}
            className={cn(
              'flex items-center gap-1.5 rounded border border-border-light px-3 py-1.5',
              'text-[0.8rem] text-text-subtle transition hover:border-border-light hover:bg-bg-hover hover:text-text',
            )}
          >
            <RefreshCw size={13} />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        )}
      </div>
    </header>
  );
}
