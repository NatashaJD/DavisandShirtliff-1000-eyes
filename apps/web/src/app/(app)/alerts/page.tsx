'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/ui';
import { getAlerts, updateAlert, type AlertSeverity, type AlertLifecycle } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { DataTable } from '@/components/ui/DataTable';
import { Badge, severityVariant, lifecycleVariant } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';

const PAGE_SIZE = 20;

const NEXT_ACTION: Partial<Record<AlertLifecycle, { label: string; action: 'acknowledge' | 'resolve' | 'archive' }>> = {
  Created:      { label: 'Acknowledge', action: 'acknowledge' },
  Acknowledged: { label: 'Resolve',     action: 'resolve' },
  Resolved:     { label: 'Archive',     action: 'archive' },
};

const selectStyle: React.CSSProperties = {
  background: '#f7fbff', borderColor: '#c8dff5', color: '#0a2540',
  borderWidth: 1, borderStyle: 'solid', borderRadius: 5,
  padding: '7px 12px', fontSize: 13, outline: 'none',
};

export default function AlertsPage() {
  const setPageMeta = useUiStore((s) => s.setPageMeta);
  useEffect(() => { setPageMeta('Alerts', 'Operational risk monitoring'); }, [setPageMeta]);

  const toast = useToast();
  const qc = useQueryClient();
  const [page, setPage] = useState(1);
  const [severity, setSeverity] = useState('');
  const [state, setState] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['alerts', page, severity, state],
    queryFn: () => getAlerts({
      page, pageSize: PAGE_SIZE,
      ...(severity ? { severity } : {}),
      ...(state ? { lifecycleState: state } : {}),
    }).then((r) => r),
    refetchInterval: 30_000,
  });

  const actionMutation = useMutation({
    mutationFn: ({ id, action }: { id: string; action: 'acknowledge' | 'resolve' | 'archive' }) =>
      updateAlert(id, action),
    onSuccess: () => {
      toast('Alert updated', 'success');
      void qc.invalidateQueries({ queryKey: ['alerts'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={severity} onChange={(e) => { setSeverity(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All severities</option>
          {(['Critical','Warning','Info'] as AlertSeverity[]).map((s) => <option key={s}>{s}</option>)}
        </select>
        <select value={state} onChange={(e) => { setState(e.target.value); setPage(1); }} style={selectStyle}>
          <option value="">All states</option>
          {(['Created','Acknowledged','Resolved','Archived'] as AlertLifecycle[]).map((s) => <option key={s}>{s}</option>)}
        </select>
        {data?.meta && (
          <span className="ml-auto font-mono text-xs" style={{ color: '#5a8fc4' }}>
            {data.meta.total} alerts
          </span>
        )}
      </div>

      <DataTable
        columns={[
          { key: 'sev', header: 'Severity', render: (a) => <Badge variant={severityVariant(a.severity)}>{a.severity}</Badge> },
          { key: 'type', header: 'Type', className: 'hidden md:table-cell', render: (a) => (
            <span className="text-xs" style={{ color: '#2e6fa8' }}>{a.alertType}</span>
          )},
          { key: 'msg', header: 'Message', render: (a) => (
            <span className="line-clamp-2 text-[0.82rem]" style={{ color: '#0a2540' }}>{a.message}</span>
          )},
          { key: 'state', header: 'State', render: (a) => <Badge variant={lifecycleVariant(a.lifecycleState)}>{a.lifecycleState}</Badge> },
          { key: 'req', header: 'Request', className: 'hidden lg:table-cell', render: (a) => (
            <span className="font-mono text-xs" style={{ color: '#4DA6FF' }}>{a.requestId}</span>
          )},
          { key: 'time', header: 'Created', className: 'hidden xl:table-cell', render: (a) => (
            <span className="font-mono text-xs" style={{ color: '#5a8fc4' }}>{fmtDate(a.createdAt)}</span>
          )},
          { key: 'action', header: 'Action', render: (a) => {
            const next = NEXT_ACTION[a.lifecycleState];
            if (!next) return <span className="text-xs" style={{ color: '#5a8fc4' }}>—</span>;
            return (
              <button
                onClick={(e) => { e.stopPropagation(); actionMutation.mutate({ id: a.id, action: next.action }); }}
                disabled={actionMutation.isPending}
                className="rounded border px-2.5 py-1 text-xs transition disabled:opacity-40"
                style={{ borderColor: '#c8dff5', color: '#2e6fa8' }}
                onMouseEnter={(e) => { e.currentTarget.style.borderColor = '#0066CC'; e.currentTarget.style.color = '#4DA6FF'; }}
                onMouseLeave={(e) => { e.currentTarget.style.borderColor = '#c8dff5'; e.currentTarget.style.color = '#2e6fa8'; }}>
                {next.label}
              </button>
            );
          }},
        ]}
        rows={data?.data ?? []}
        rowKey={(a) => a.id}
        loading={isLoading}
        emptyMessage="No alerts found"
      />

      {data?.meta && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.meta.total} onChange={setPage} />
      )}
    </div>
  );
}
