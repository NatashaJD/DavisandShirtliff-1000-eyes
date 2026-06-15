'use client';

import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
}

export function Pagination({ page, pageSize, total, onChange }: PaginationProps) {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  if (totalPages <= 1) return null;

  return (
    <div className="flex items-center justify-end gap-1.5 pt-3">
      <span className="mr-2 text-xs" style={{ color: '#4d7ab5' }}>
        {(page - 1) * pageSize + 1}–{Math.min(page * pageSize, total)} of {total}
      </span>
      <button
        onClick={() => onChange(page - 1)}
        disabled={page <= 1}
        className="rounded border p-1 transition disabled:cursor-not-allowed disabled:opacity-30"
        style={{ borderColor: '#1a3560', color: '#7aaad4' }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0066CC')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1a3560')}
        aria-label="Previous page"
      >
        <ChevronLeft size={14} />
      </button>
      {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
        let p = i + 1;
        if (totalPages > 5) {
          if (page <= 3) p = i + 1;
          else if (page >= totalPages - 2) p = totalPages - 4 + i;
          else p = page - 2 + i;
        }
        const active = p === page;
        return (
          <button
            key={p}
            onClick={() => onChange(p)}
            className="min-w-[28px] rounded border px-2 py-1 text-xs transition"
            style={active
              ? { background: 'rgba(0,102,204,0.2)', borderColor: '#0066CC', color: '#4DA6FF' }
              : { borderColor: '#1a3560', color: '#7aaad4' }}
            onMouseEnter={(e) => !active && (e.currentTarget.style.borderColor = '#0066CC')}
            onMouseLeave={(e) => !active && (e.currentTarget.style.borderColor = '#1a3560')}
          >
            {p}
          </button>
        );
      })}
      <button
        onClick={() => onChange(page + 1)}
        disabled={page >= totalPages}
        className="rounded border p-1 transition disabled:cursor-not-allowed disabled:opacity-30"
        style={{ borderColor: '#1a3560', color: '#7aaad4' }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#0066CC')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#1a3560')}
        aria-label="Next page"
      >
        <ChevronRight size={14} />
      </button>
    </div>
  );
}
