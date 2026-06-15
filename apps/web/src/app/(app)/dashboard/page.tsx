'use client';

import { useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Clock, CheckCircle2, AlertTriangle, TrendingUp, Activity, Zap,
} from 'lucide-react';
import { useUiStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { getDashboardOverview, getDashboardBottlenecks, getAlerts } from '@/lib/api';
import { fmtDate, fmtHours } from '@/lib/utils';
import { Skeleton } from '@/components/ui/Skeleton';
import { Badge, severityVariant, lifecycleVariant } from '@/components/ui/Badge';
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel';
import { EmptyState } from '@/components/ui/EmptyState';

function KpiCard({
  label, value, sub, icon: Icon, accent,
}: { label: string; value: string; sub?: string; icon: React.ElementType; accent?: boolean }) {
  return (
    <div className="group relative overflow-hidden rounded border border-border bg-bg-panel p-5 transition hover:border-border-light">
      <div className="absolute inset-x-0 top-0 h-[2px] opacity-0 transition group-hover:opacity-100"
        style={{ background: 'linear-gradient(90deg, #0066CC, #4DA6FF, transparent)' }} />
      <div className="mb-3 flex items-center gap-2 text-[0.7rem] font-semibold uppercase tracking-wider text-text-muted">
        <Icon size={13} className="text-cyan" />
        {label}
      </div>
      <div className={`text-3xl font-bold tracking-tight ${accent ? 'text-cyan' : 'text-white'}`}>
        {value}
      </div>
      {sub && <p className="mt-1.5 text-xs text-text-muted">{sub}</p>}
    </div>
  );
}

export default function DashboardPage() {
  const setPageMeta = useUiStore((s) => s.setPageMeta);
  const user = useAuthStore((s) => s.user);
  const canSeeBottlenecks = user?.role === 'Administrator' || user?.role === 'Regional Manager';

  useEffect(() => { setPageMeta('Dashboard', 'Operational overview'); }, [setPageMeta]);

  const { data: overview, isLoading: loadingOverview } = useQuery({
    queryKey: ['dashboard', 'overview'],
    queryFn: () => getDashboardOverview().then((r) => r.data),
  });

  const { data: bottlenecks } = useQuery({
    queryKey: ['dashboard', 'bottlenecks'],
    queryFn: () => getDashboardBottlenecks().then((r) => r.data),
    enabled: canSeeBottlenecks,
  });

  const { data: alertsRes } = useQuery({
    queryKey: ['alerts', 'recent'],
    queryFn: () => getAlerts({ lifecycleState: 'Created', pageSize: 5 }).then((r) => r),
  });

  const kpis = overview?.kpis;
  const recentAlerts = alertsRes?.data ?? [];

  return (
    <div className="space-y-5">
      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
        {loadingOverview ? (
          Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded border border-border" />
          ))
        ) : (
          <>
            <KpiCard label="SLA Compliance" value={kpis ? `${(kpis.slaComplianceRate * 100).toFixed(1)}%` : '—'} icon={Activity} accent sub="Overall rate" />
            <KpiCard label="Avg Completion" value={kpis ? fmtHours(kpis.avgCompletionTimeHours) : '—'} icon={Clock} sub="End-to-end" />
            <KpiCard label="Completion Rate" value={kpis ? `${(kpis.completionRate * 100).toFixed(1)}%` : '—'} icon={CheckCircle2} sub="Closed requests" />
            <KpiCard label="Throughput" value={kpis ? `${kpis.requestThroughput}/day` : '—'} icon={TrendingUp} sub="Request volume" />
            <KpiCard label="Delay Frequency" value={kpis ? String(kpis.delayFrequency) : '—'} icon={AlertTriangle} sub="Active delays" />
            <KpiCard label="Engineering Avg" value={kpis ? fmtHours(kpis.avgDepartmentProcessingTime['Engineering'] ?? 0) : '—'} icon={Zap} sub="Engineering dept" />
          </>
        )}
      </div>

      {/* Bottom panels */}
      <div className="grid gap-4 lg:grid-cols-2">
        {/* Bottlenecks */}
        {canSeeBottlenecks && (
          <Panel>
            <PanelHeader>
              <PanelTitle>Top Bottlenecks</PanelTitle>
              <span className="rounded-full border border-border bg-bg-raised px-2 py-0.5 text-[0.68rem] text-text-muted">by excess SLA time</span>
            </PanelHeader>
            <PanelBody className="divide-y divide-border p-0">
              {!bottlenecks ? (
                <div className="p-4"><Skeleton className="h-40" /></div>
              ) : bottlenecks.length === 0 ? (
                <EmptyState title="No bottlenecks" />
              ) : (
                bottlenecks.map((b) => (
                  <div key={b.rank} className="flex items-center gap-3 px-4 py-3">
                    <span className="w-5 text-center text-[0.68rem] font-bold text-text-muted">#{b.rank}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[0.82rem] text-text">{b.journeyStage}</p>
                      <p className="text-[0.72rem] text-text-muted">{b.department} · {b.occurrenceCount} occurrences</p>
                    </div>
                    <div className="h-1.5 w-24 overflow-hidden rounded-full bg-bg-raised">
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-cyan to-danger transition-all"
                        style={{ width: `${Math.min(100, (b.avgExcessHours / 30) * 100)}%` }}
                      />
                    </div>
                    <span className="w-14 text-right font-mono text-xs font-semibold text-danger">
                      +{b.avgExcessHours.toFixed(1)}h
                    </span>
                  </div>
                ))
              )}
            </PanelBody>
          </Panel>
        )}

        {/* Recent Alerts */}
        <Panel>
          <PanelHeader>
            <PanelTitle>Recent Alerts</PanelTitle>
            <a href="/alerts" className="text-[0.72rem] text-cyan hover:text-white">View all →</a>
          </PanelHeader>
          <PanelBody className="divide-y divide-border p-0">
            {recentAlerts.length === 0 ? (
              <EmptyState title="No active alerts" />
            ) : (
              recentAlerts.map((a) => (
                <div key={a.id} className="flex items-start gap-3 px-4 py-3">
                  <Badge variant={severityVariant(a.severity)} className="mt-0.5 flex-shrink-0">{a.severity}</Badge>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[0.8rem] text-text">{a.message}</p>
                    <p className="mt-0.5 text-[0.7rem] text-text-muted">{fmtDate(a.createdAt)}</p>
                  </div>
                  <Badge variant={lifecycleVariant(a.lifecycleState)}>{a.lifecycleState}</Badge>
                </div>
              ))
            )}
          </PanelBody>
        </Panel>
      </div>

      {overview?.isStale && (
        <p className="text-center text-xs text-warning">⚠ Dashboard data may be stale — last computed {fmtDate(overview.computedAt)}</p>
      )}
    </div>
  );
}
