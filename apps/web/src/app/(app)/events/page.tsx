'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Search } from 'lucide-react';
import { useUiStore } from '@/store/ui';
import { getEvents } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { DataTable } from '@/components/ui/DataTable';
import { Pagination } from '@/components/ui/Pagination';

const PAGE_SIZE = 20;
const EVENT_TYPES = ['stage_change','status_update','sla_warning','assignment_changed','note_added','document_uploaded'];

const selectStyle: React.CSSProperties = {
  background: '#f7fbff', borderColor: '#c8dff5', color: '#0a2540',
  borderWidth: 1, borderStyle: 'solid', borderRadius: 5,
  padding: '7px 12px', fontSize: 13, outline: 'none',
};

export default function EventsPage() {
  const setPageMeta = useUiStore((s) => s.setPageMeta);
  useEffect(() => { setPageMeta('Events', 'Operational event stream'); }, [setPageMeta]);

  const [page, setPage] = useState(1);
  const [requestId, setRequestId] = useState('');
  const [eventType, setEventType] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['events', page, requestId, eventType],
    queryFn: () => getEvents({
      page, pageSize: PAGE_SIZE,
      ...(requestId ? { requestId } : {}),
      ...(eventType ? { eventType } : {}),
    }).then((r) => r),
  });

  const pipelineColor = (s: string) =>
    s === 'complete' ? '#00cc7a' : s === 'partial' ? '#ffaa00' : '#5a8fc4';

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#5a8fc4' }} />
          <input
            value={requestId}
            onChange={(e) => { setRequestId(e.target.value); setPage(1); }}
            placeholder="Filter by request ID…"
            className="rounded border py-2 pl-8 pr-3 text-sm focus:outline-none"
            style={selectStyle}
            onFocus={(e) => { e.target.style.borderColor = '#0066CC'; }}
            onBlur={(e) => { e.target.style.borderColor = '#c8dff5'; }}
          />
        </div>
        <select value={eventType} onChange={(e) => { setEventType(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All event types</option>
          {EVENT_TYPES.map((t) => <option key={t} value={t}>{t.replace(/_/g,' ')}</option>)}
        </select>
        {data?.meta && (
          <span className="ml-auto font-mono text-xs" style={{ color: '#5a8fc4' }}>
            {data.meta.total} events
          </span>
        )}
      </div>

      <DataTable
        columns={[
          { key: 'type', header: 'Event Type', render: (e) => (
            <span className="font-medium capitalize" style={{ color: '#0a2540' }}>
              {e.eventType.replace(/_/g,' ')}
            </span>
          )},
          { key: 'req', header: 'Request ID', render: (e) => (
            <span className="font-mono text-xs" style={{ color: '#4DA6FF' }}>{e.requestId}</span>
          )},
          { key: 'dept', header: 'Department', className: 'hidden md:table-cell', render: (e) => (
            <span style={{ color: '#2e6fa8' }}>{e.department}</span>
          )},
          { key: 'src', header: 'Source', className: 'hidden lg:table-cell', render: (e) => (
            <span style={{ color: '#5a8fc4' }}>{e.sourceSystem}</span>
          )},
          { key: 'pipeline', header: 'Pipeline', render: (e) => (
            <span className="text-xs font-semibold" style={{ color: pipelineColor(e.pipelineStatus) }}>
              {e.pipelineStatus}
            </span>
          )},
          { key: 'time', header: 'Occurred At', render: (e) => (
            <span className="font-mono text-xs" style={{ color: '#5a8fc4' }}>{fmtDate(e.occurredAt)}</span>
          )},
        ]}
        rows={data?.data ?? []}
        rowKey={(e) => e.id}
        loading={isLoading}
        emptyMessage="No events found"
      />

      {data?.meta && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.meta.total} onChange={setPage} />
      )}
    </div>
  );
}
