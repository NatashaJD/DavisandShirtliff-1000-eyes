'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Search, Plus, ExternalLink } from 'lucide-react';
import { useUiStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { getRequests, createRequest, type ServiceRequest, type RequestStage } from '@/lib/api';
import { fmtDate } from '@/lib/utils';
import { DataTable } from '@/components/ui/DataTable';
import { Badge, stageBadgeVariant } from '@/components/ui/Badge';
import { Pagination } from '@/components/ui/Pagination';
import { useToast } from '@/components/ui/Toast';
import { RequestDrawer } from '@/components/requests/RequestDrawer';
import { NewRequestModal } from '@/components/requests/NewRequestModal';

const PAGE_SIZE = 20;
const STAGES: RequestStage[] = [
  'Inquiry','Sales Review','Engineering Design','Quotation',
  'Approval','Dispatch','Delivery','Completed','Cancelled',
];

const selectStyle: React.CSSProperties = {
  background: '#f7fbff', borderColor: '#c8dff5', color: '#0a2540',
  borderWidth: 1, borderStyle: 'solid', borderRadius: 5,
  padding: '7px 12px', fontSize: 13, outline: 'none',
};

export default function RequestsPage() {
  const setPageMeta = useUiStore((s) => s.setPageMeta);
  const user = useAuthStore((s) => s.user);
  const toast = useToast();
  const qc = useQueryClient();

  useEffect(() => { setPageMeta('Service Requests', 'Customer request management'); }, [setPageMeta]);

  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [stageFilter, setStageFilter] = useState('');
  const [selected, setSelected] = useState<ServiceRequest | null>(null);
  const [showNew, setShowNew] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['requests', page, stageFilter],
    queryFn: () => getRequests({ page, pageSize: PAGE_SIZE, ...(stageFilter ? { stage: stageFilter } : {}) }).then((r) => r),
  });

  const createMutation = useMutation({
    mutationFn: (body: Partial<ServiceRequest>) => createRequest(body).then((r) => r.data),
    onSuccess: () => {
      toast('Request created successfully', 'success');
      setShowNew(false);
      void qc.invalidateQueries({ queryKey: ['requests'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  const canCreate = user?.role === 'Administrator' || user?.role === 'Sales Engineer';

  const rows = (data?.data ?? []).filter((r) =>
    !search ||
    r.requestNumber.toLowerCase().includes(search.toLowerCase()) ||
    r.customerName.toLowerCase().includes(search.toLowerCase()),
  );

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-2">
          {/* Search */}
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: '#5a8fc4' }} />
            <input
              type="search" value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search requests…"
              className="rounded border py-2 pl-8 pr-3 text-sm focus:outline-none"
              style={selectStyle}
              onFocus={(e) => { e.target.style.borderColor = '#0066CC'; e.target.style.boxShadow = '0 0 0 2px rgba(0,102,204,0.12)'; }}
              onBlur={(e) => { e.target.style.borderColor = '#c8dff5'; e.target.style.boxShadow = 'none'; }}
            />
          </div>
          {/* Stage filter */}
          <select value={stageFilter} onChange={(e) => { setStageFilter(e.target.value); setPage(1); }}
            style={selectStyle}>
            <option value="">All stages</option>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
        </div>
        {canCreate && (
          <button onClick={() => setShowNew(true)}
            className="flex items-center gap-1.5 rounded px-3 py-2 text-xs font-bold text-white transition"
            style={{ background: 'linear-gradient(135deg, #0066CC, #0055aa)', boxShadow: '0 4px 12px rgba(0,102,204,0.3)' }}
            onMouseEnter={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, #4DA6FF, #0066CC)')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'linear-gradient(135deg, #0066CC, #0055aa)')}>
            <Plus size={14} /> New Request
          </button>
        )}
      </div>

      {/* Table */}
      <DataTable
        columns={[
          { key: 'num', header: 'Request #', render: (r) => (
            <span className="font-mono text-sm font-semibold" style={{ color: '#4DA6FF' }}>{r.requestNumber}</span>
          )},
          { key: 'customer', header: 'Customer', render: (r) => (
            <span style={{ color: '#0a2540' }}>{r.customerName}</span>
          )},
          { key: 'type', header: 'Type', className: 'hidden md:table-cell', render: (r) => (
            <span style={{ color: '#2e6fa8' }}>{r.requestType}</span>
          )},
          { key: 'stage', header: 'Stage', render: (r) => (
            <Badge variant={stageBadgeVariant(r.currentStage)}>{r.currentStage}</Badge>
          )},
          { key: 'status', header: 'Status', className: 'hidden sm:table-cell', render: (r) => (
            <Badge variant={r.currentStatus === 'Open' ? 'cyan' : r.currentStatus === 'Closed' ? 'success' : 'danger'}>
              {r.currentStatus}
            </Badge>
          )},
          { key: 'sla', header: 'SLA', render: (r) => (
            r.slaBreached
              ? <span className="text-xs font-semibold" style={{ color: '#ff3355' }}>Breached</span>
              : <span className="text-xs font-semibold" style={{ color: '#00cc7a' }}>On Track</span>
          )},
          { key: 'dept', header: 'Dept', className: 'hidden lg:table-cell', render: (r) => (
            <span style={{ color: '#2e6fa8' }}>{r.assignedDepartment ?? '—'}</span>
          )},
          { key: 'created', header: 'Created', className: 'hidden xl:table-cell', render: (r) => (
            <span className="font-mono text-xs" style={{ color: '#5a8fc4' }}>{fmtDate(r.createdAt)}</span>
          )},
          { key: 'action', header: '', render: (r) => (
            <button onClick={(e) => { e.stopPropagation(); setSelected(r); }}
              style={{ color: '#5a8fc4' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#4DA6FF')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#5a8fc4')}>
              <ExternalLink size={14} />
            </button>
          )},
        ]}
        rows={rows}
        rowKey={(r) => r.id}
        onRowClick={setSelected}
        loading={isLoading}
        emptyMessage="No requests found"
      />

      {data?.meta && (
        <Pagination page={page} pageSize={PAGE_SIZE} total={data.meta.total} onChange={setPage} />
      )}

      {selected && <RequestDrawer request={selected} onClose={() => setSelected(null)} />}
      {showNew && (
        <NewRequestModal
          onClose={() => setShowNew(false)}
          onSubmit={(body) => createMutation.mutate(body)}
          loading={createMutation.isPending}
        />
      )}
    </div>
  );
}
