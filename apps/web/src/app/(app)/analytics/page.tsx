'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid, Legend,
} from 'recharts';
import { BarChart2 } from 'lucide-react';
import { useUiStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { getAnalyticsTrends, getAnalyticsDepartments, getAnalyticsReports } from '@/lib/api';
import { fmtDateShort, fmtHours, cn } from '@/lib/utils';
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { EmptyState } from '@/components/ui/EmptyState';

const RANGE_OPTIONS = [
  { label: '7d',   days: 7 },
  { label: '30d',  days: 30 },
  { label: '90d',  days: 90 },
  { label: '180d', days: 180 },
  { label: '366d', days: 366 },
];

const tooltipStyle: React.CSSProperties = {
  backgroundColor: '#0d1f38',
  border: '1px solid #1a3560',
  borderRadius: 6,
  color: '#ddeeff',
  fontSize: 12,
};

function compColor(v: number) {
  if (v >= 0.85) return '#00cc7a';
  if (v >= 0.65) return '#ffaa00';
  return '#ff3355';
}

export default function AnalyticsPage() {
  const setPageMeta = useUiStore((s) => s.setPageMeta);
  const user = useAuthStore((s) => s.user);
  const allowed = user?.role === 'Administrator' || user?.role === 'Regional Manager';

  useEffect(() => { setPageMeta('Analytics', 'Business intelligence & trends'); }, [setPageMeta]);

  const [rangeDays, setRangeDays] = useState(30);

  const { data: trends, isLoading: loadingTrends } = useQuery({
    queryKey: ['analytics-trends', rangeDays],
    queryFn: () => {
      const to = new Date();
      const from = new Date(Date.now() - rangeDays * 86_400_000);
      return getAnalyticsTrends(from.toISOString(), to.toISOString()).then((r) => r.data);
    },
    enabled: allowed,
  });

  const { data: depts, isLoading: loadingDepts } = useQuery({
    queryKey: ['analytics-departments'],
    queryFn: () => getAnalyticsDepartments().then((r) => r.data),
    enabled: allowed,
  });

  const { data: reportsRes } = useQuery({
    queryKey: ['analytics-reports'],
    queryFn: () => getAnalyticsReports({ page: 1, pageSize: 10 }).then((r) => r),
    enabled: allowed,
  });

  if (!allowed) {
    return (
      <EmptyState
        icon={<BarChart2 size={48} />}
        title="Access restricted"
        description="Analytics is available to Administrators and Regional Managers"
      />
    );
  }

  const chartData = (trends?.requestVolume ?? []).map((pt, i) => ({
    date: pt.timestamp,
    volume: pt.value,
    sla: Math.round(((trends?.slaComplianceRate[i]?.value ?? 0) * 100) * 10) / 10,
  }));

  return (
    <div className="space-y-4">
      {/* Range selector */}
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: '#4d7ab5' }}>Range:</span>
        {RANGE_OPTIONS.map((o) => (
          <button key={o.days} onClick={() => setRangeDays(o.days)}
            className="rounded border px-3 py-1 text-xs transition"
            style={rangeDays === o.days
              ? { background: 'rgba(0,102,204,0.2)', borderColor: '#0066CC', color: '#4DA6FF' }
              : { borderColor: '#1a3560', color: '#7aaad4' }}
            onMouseEnter={(e) => rangeDays !== o.days && (e.currentTarget.style.borderColor = '#0066CC')}
            onMouseLeave={(e) => rangeDays !== o.days && (e.currentTarget.style.borderColor = '#1a3560')}>
            {o.label}
          </button>
        ))}
      </div>

      {/* Trend Chart */}
      <Panel>
        <PanelHeader>
          <PanelTitle>Request Volume &amp; SLA Compliance Trend</PanelTitle>
        </PanelHeader>
        <PanelBody className="p-4">
          {loadingTrends ? (
            <Skeleton className="h-56 w-full" />
          ) : chartData.length === 0 ? (
            <EmptyState title="No trend data available" />
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={chartData} margin={{ top: 4, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="volGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#0066CC" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#0066CC" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="slaGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%"  stopColor="#00cc7a" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="#00cc7a" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#0f2444" vertical={false} />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: '#4d7ab5' }} tickLine={false} axisLine={false}
                  tickFormatter={(v: string) => v.slice(5)} interval="preserveStartEnd" />
                <YAxis yAxisId="vol" tick={{ fontSize: 10, fill: '#4d7ab5' }} tickLine={false} axisLine={false} />
                <YAxis yAxisId="sla" orientation="right" tick={{ fontSize: 10, fill: '#4d7ab5' }} tickLine={false} axisLine={false}
                  tickFormatter={(v: number) => `${v}%`} domain={[0, 100]} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 11, color: '#7aaad4' }} />
                <Area yAxisId="vol" type="monotone" dataKey="volume" name="Requests"
                  stroke="#0066CC" fill="url(#volGrad)" strokeWidth={2} dot={false} />
                <Area yAxisId="sla" type="monotone" dataKey="sla" name="SLA %"
                  stroke="#00cc7a" fill="url(#slaGrad)" strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </PanelBody>
      </Panel>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* Department efficiency */}
        <Panel>
          <PanelHeader><PanelTitle>Department Efficiency</PanelTitle></PanelHeader>
          <PanelBody className="p-0 px-4">
            {loadingDepts ? (
              <div className="space-y-2 py-3">
                {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
              </div>
            ) : (depts ?? []).map((d) => (
              <div key={d.department} className="flex items-center gap-3 border-b py-3 last:border-0" style={{ borderColor: '#0f2444' }}>
                <span className="w-24 truncate text-[0.82rem]" style={{ color: '#ddeeff' }}>{d.department}</span>
                <div className="flex-1">
                  <div className="mb-1 flex items-center justify-between text-xs" style={{ color: '#4d7ab5' }}>
                    <span>SLA {(d.slaComplianceRate * 100).toFixed(0)}%</span>
                    <span>Bottlenecks: {d.bottleneckFrequency}</span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full" style={{ background: '#112548' }}>
                    <div className="h-full rounded-full transition-all"
                      style={{ width: `${d.slaComplianceRate * 100}%`, background: compColor(d.slaComplianceRate) }} />
                  </div>
                </div>
                <span className="w-14 text-right font-mono text-xs font-semibold" style={{ color: '#4DA6FF' }}>
                  {fmtHours(d.avgProcessingTimeHours)}
                </span>
              </div>
            ))}
          </PanelBody>
        </Panel>

        {/* Snapshot Reports */}
        <Panel>
          <PanelHeader><PanelTitle>Snapshot Reports</PanelTitle></PanelHeader>
          <PanelBody className="p-0 px-4">
            {(reportsRes?.data ?? []).length === 0 ? (
              <EmptyState title="No reports" />
            ) : (reportsRes?.data ?? []).map((r) => (
              <div key={r.id} className="flex items-center gap-3 border-b py-3 last:border-0" style={{ borderColor: '#0f2444' }}>
                <div className="flex-1">
                  <p className="text-[0.8rem]" style={{ color: '#ddeeff' }}>{r.kpiKey.replace(/_/g, ' ')}</p>
                  <p className="text-[0.7rem]" style={{ color: '#4d7ab5' }}>
                    {r.snapshotType} · {fmtDateShort(r.periodStart)}
                  </p>
                </div>
                <span className="font-mono text-sm font-bold" style={{ color: '#4DA6FF' }}>
                  {r.kpiKey.includes('rate') || r.kpiKey.includes('compliance')
                    ? `${(r.kpiValue * 100).toFixed(1)}%`
                    : r.kpiValue.toFixed(2)}
                </span>
              </div>
            ))}
          </PanelBody>
        </Panel>
      </div>
    </div>
  );
}
