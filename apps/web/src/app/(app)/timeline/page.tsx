'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search, GitBranch } from 'lucide-react';
import { useUiStore } from '@/store/ui';
import { getTimeline, type TimelineEntry } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { EmptyState } from '@/components/ui/EmptyState';
import { Spinner } from '@/components/ui/Spinner';

const DOT_COLORS: Record<string, string> = {
  stage_change:  '#0066CC',
  sla_warning:   '#ff3355',
  status_update: '#ffaa00',
};

function TimelineCard({ entry }: { entry: TimelineEntry }) {
  const dotColor = DOT_COLORS[entry.eventType] ?? '#c8dff5';
  return (
    <div className="relative mb-5 pl-8 last:mb-0">
      <div className="absolute left-0 top-2 h-3 w-3 rounded-full border-2"
        style={{ background: dotColor, borderColor: dotColor, boxShadow: `0 0 8px ${dotColor}60` }} />
      <div className="rounded border p-3 transition"
        style={{ background: '#ffffff', borderColor: '#c8dff5' }}
        onMouseEnter={(e) => (e.currentTarget.style.borderColor = '#c8dff5')}
        onMouseLeave={(e) => (e.currentTarget.style.borderColor = '#c8dff5')}>
        <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
          <span className="text-[0.85rem] font-semibold capitalize" style={{ color: '#0a2540' }}>
            {entry.eventType.replace(/_/g, ' ')}
          </span>
          <span className="font-mono text-[0.68rem]" style={{ color: '#5a8fc4' }}>
            {fmtDate(entry.occurredAt)}
          </span>
        </div>
        <div className="flex flex-wrap gap-3 text-xs" style={{ color: '#5a8fc4' }}>
          {entry.department && <span>Dept: <span style={{ color: '#0a2540' }}>{entry.department}</span></span>}
          {entry.previousState && <span>From: <span style={{ color: '#ffaa00' }}>{entry.previousState}</span></span>}
          {entry.newState && <span>To: <span style={{ color: '#4DA6FF' }}>{entry.newState}</span></span>}
          {entry.triggeredByUser && <span>By: <span style={{ color: '#0a2540' }}>{entry.triggeredByUser}</span></span>}
          {entry.sourceSystem && <span>Source: <span style={{ color: '#0a2540' }}>{entry.sourceSystem}</span></span>}
        </div>
        {entry.failedSteps.length > 0 && (
          <div className="mt-1.5 text-xs" style={{ color: '#ff3355' }}>
            ⚠ Failed: {entry.failedSteps.join(', ')}
          </div>
        )}
      </div>
    </div>
  );
}

export default function TimelinePage() {
  const setPageMeta = useUiStore((s) => s.setPageMeta);
  useEffect(() => { setPageMeta('Timeline', 'Customer journey visualization'); }, [setPageMeta]);

  const [input, setInput] = useState('');
  const [requestId, setRequestId] = useState('');

  const { data, isLoading, error } = useQuery({
    queryKey: ['timeline', requestId],
    queryFn: () => getTimeline(requestId).then((r) => r.data),
    enabled: !!requestId,
    retry: false,
  });

  function handleLoad() {
    const val = input.trim();
    if (val) setRequestId(val);
  }

  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        <div className="relative flex-1 max-w-sm">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#5a8fc4' }} />
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleLoad()}
            placeholder="Enter Request ID or Number…"
            className="w-full rounded border py-2 pl-8 pr-3 text-sm focus:outline-none"
            style={{ background: '#f7fbff', borderColor: '#c8dff5', color: '#0a2540' }}
            onFocus={(e) => { e.target.style.borderColor = '#0066CC'; }}
            onBlur={(e) => { e.target.style.borderColor = '#c8dff5'; }}
          />
        </div>
        <button onClick={handleLoad}
          className="rounded px-4 py-2 text-xs font-bold text-white transition"
          style={{ background: 'linear-gradient(135deg, #0066CC, #0055aa)' }}
          onMouseEnter={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, #4DA6FF, #0066CC)')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, #0066CC, #0055aa)')}>
          Load Timeline
        </button>
      </div>

      {!requestId && (
        <EmptyState
          icon={<GitBranch size={48} />}
          title="Enter a Request ID to view its journey timeline"
          description="Shows every event, stage transition, and SLA checkpoint for a service request"
        />
      )}

      {requestId && isLoading && (
        <div className="flex justify-center py-16"><Spinner /></div>
      )}

      {error && (
        <div className="rounded border p-4 text-sm"
          style={{ background: 'rgba(255,51,85,0.08)', borderColor: 'rgba(255,51,85,0.3)', color: '#ff3355' }}>
          {error instanceof Error ? error.message : 'Failed to load timeline'}
        </div>
      )}

      {data && data.length === 0 && <EmptyState title="No events recorded for this request" />}

      {data && data.length > 0 && (
        <div>
          {/* Stage summary strip */}
          <div className="mb-5 flex items-center gap-1 overflow-x-auto rounded border p-3"
            style={{ background: '#ffffff', borderColor: '#c8dff5' }}>
            {Array.from(new Set(data.map((e) => e.newState).filter(Boolean))).map((stage, i, arr) => (
              <div key={stage} className="flex items-center gap-1">
                <span className="whitespace-nowrap rounded px-2 py-1 text-[0.7rem] font-medium"
                  style={{ background: 'rgba(0,102,204,0.10)', color: '#4DA6FF' }}>
                  {stage}
                </span>
                {i < arr.length - 1 && <span style={{ color: '#c8dff5' }}>→</span>}
              </div>
            ))}
          </div>

          {/* Timeline */}
          <div className="relative">
            <div className="absolute left-1.5 top-0 h-full w-px"
              style={{ background: 'linear-gradient(to bottom, #0066CC, #1a3560, #0f2444)' }} />
            {data.map((entry) => <TimelineCard key={entry.id} entry={entry} />)}
          </div>
        </div>
      )}
    </div>
  );
}
