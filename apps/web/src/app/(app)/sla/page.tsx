'use client';

import { useEffect, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUiStore } from '@/store/ui';
import { useAuthStore } from '@/store/auth';
import { getSlaRules, getSlaCompliance, updateSlaRule, type SlaRule } from '@/lib/api';
import { cn } from '@/lib/utils';
import { Panel, PanelHeader, PanelTitle, PanelBody } from '@/components/ui/Panel';
import { Skeleton } from '@/components/ui/Skeleton';
import { useToast } from '@/components/ui/Toast';

const PERIOD_OPTIONS = [
  { label: 'Last 7 days',   days: 7 },
  { label: 'Last 30 days',  days: 30 },
  { label: 'Last 90 days',  days: 90 },
  { label: 'Last 365 days', days: 365 },
];

function compColor(v: number) {
  if (v >= 0.85) return '#00cc7a';
  if (v >= 0.65) return '#ffaa00';
  return '#ff3355';
}

function compBg(v: number) {
  if (v >= 0.85) return 'rgba(0,204,122,0.15)';
  if (v >= 0.65) return 'rgba(255,170,0,0.12)';
  return 'rgba(255,51,85,0.12)';
}

function EditableRule({ rule, isAdmin }: { rule: SlaRule; isAdmin: boolean }) {
  const toast = useToast();
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [hours, setHours] = useState(String(rule.thresholdHours));

  const mutation = useMutation({
    mutationFn: () => updateSlaRule(rule.journeyStage, { thresholdHours: Number(hours) }),
    onSuccess: () => {
      toast('SLA rule updated', 'success');
      setEditing(false);
      void qc.invalidateQueries({ queryKey: ['sla-rules'] });
    },
    onError: (e: Error) => toast(e.message, 'error'),
  });

  return (
    <div className="flex items-center gap-3 border-b py-3 last:border-0" style={{ borderColor: '#c8dff5' }}>
      <div className="flex-1">
        <p className="text-[0.83rem]" style={{ color: '#0a2540' }}>{rule.journeyStage}</p>
        <p className="text-[0.7rem]" style={{ color: '#5a8fc4' }}>{rule.description}</p>
      </div>
      {editing ? (
        <div className="flex items-center gap-2">
          <input
            type="number" value={hours} onChange={(e) => setHours(e.target.value)} min={1}
            className="w-20 rounded border px-2 py-1 font-mono text-sm focus:outline-none"
            style={{ background: '#f7fbff', borderColor: '#0066CC', color: '#4DA6FF' }}
          />
          <span className="text-xs" style={{ color: '#5a8fc4' }}>hrs</span>
          <button onClick={() => mutation.mutate()} disabled={mutation.isPending}
            className="rounded px-2 py-1 text-xs font-bold text-white transition disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0066CC, #0055aa)' }}>
            Save
          </button>
          <button onClick={() => setEditing(false)} className="text-xs" style={{ color: '#5a8fc4' }}>
            Cancel
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-semibold" style={{ color: '#4DA6FF' }}>
            {rule.thresholdHours}h
          </span>
          {isAdmin && (
            <button onClick={() => { setHours(String(rule.thresholdHours)); setEditing(true); }}
              className="text-xs transition" style={{ color: '#5a8fc4' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#4DA6FF')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#5a8fc4')}>
              Edit
            </button>
          )}
        </div>
      )}
    </div>
  );
}

const selectStyle: React.CSSProperties = {
  background: '#f7fbff', borderColor: '#c8dff5', color: '#0a2540',
  borderWidth: 1, borderStyle: 'solid', borderRadius: 5,
  padding: '4px 10px', fontSize: 12, outline: 'none',
};

export default function SlaPage() {
  const setPageMeta = useUiStore((s) => s.setPageMeta);
  const user = useAuthStore((s) => s.user);
  const isAdmin = user?.role === 'Administrator';
  useEffect(() => { setPageMeta('SLA Monitor', 'Compliance & thresholds'); }, [setPageMeta]);

  const [periodDays, setPeriodDays] = useState(30);

  const { data: rules, isLoading: loadingRules } = useQuery({
    queryKey: ['sla-rules'],
    queryFn: () => getSlaRules().then((r) => r.data),
  });

  const { data: compliance, isLoading: loadingCompliance } = useQuery({
    queryKey: ['sla-compliance', periodDays],
    queryFn: () => {
      const to = new Date();
      const from = new Date(Date.now() - periodDays * 86_400_000);
      return getSlaCompliance(from.toISOString(), to.toISOString()).then((r) => r.data);
    },
    refetchInterval: 60_000,
  });

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      {/* Rules */}
      <Panel>
        <PanelHeader>
          <PanelTitle>SLA Rules</PanelTitle>
          <span className="rounded-full border px-2 py-0.5 text-[0.68rem]"
            style={{ background: '#f7fbff', borderColor: '#c8dff5', color: '#5a8fc4' }}>
            per stage
          </span>
        </PanelHeader>
        <PanelBody className="p-0 px-4">
          {loadingRules ? (
            <div className="space-y-2 py-3">
              {Array.from({ length: 7 }).map((_, i) => <Skeleton key={i} className="h-10" />)}
            </div>
          ) : (rules ?? []).map((rule) => (
            <EditableRule key={rule.id} rule={rule} isAdmin={isAdmin} />
          ))}
        </PanelBody>
      </Panel>

      {/* Compliance */}
      <Panel>
        <PanelHeader>
          <PanelTitle>Compliance Metrics</PanelTitle>
          <select value={periodDays} onChange={(e) => setPeriodDays(Number(e.target.value))} style={selectStyle}>
            {PERIOD_OPTIONS.map((o) => <option key={o.days} value={o.days}>{o.label}</option>)}
          </select>
        </PanelHeader>
        <PanelBody className="space-y-4 p-4">
          {loadingCompliance ? (
            <div className="space-y-2">
              {Array.from({ length: 5 }).map((_, i) => <Skeleton key={i} className="h-8" />)}
            </div>
          ) : compliance ? (
            <>
              {/* Overall */}
              <div className="flex items-center justify-between rounded border px-4 py-3"
                style={{ background: '#f7fbff', borderColor: '#c8dff5' }}>
                <span className="text-sm font-semibold" style={{ color: '#0a2540' }}>Overall Compliance</span>
                <span className="font-mono text-xl font-bold"
                  style={{ color: compColor(compliance.overallComplianceRate) }}>
                  {(compliance.overallComplianceRate * 100).toFixed(1)}%
                </span>
              </div>

              {/* By Stage */}
              <div>
                <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: '#5a8fc4' }}>By Stage</p>
                <div className="space-y-1.5">
                  {Object.entries(compliance.byStage).map(([stage, rate]) => (
                    <div key={stage} className="flex items-center gap-3">
                      <span className="w-36 truncate text-xs" style={{ color: '#0a2540' }}>{stage}</span>
                      <div className="flex-1 h-1.5 overflow-hidden rounded-full" style={{ background: '#e6f0fb' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${rate * 100}%`, background: compColor(rate) }} />
                      </div>
                      <span className="w-12 text-right font-mono text-xs font-semibold"
                        style={{ color: compColor(rate) }}>
                        {(rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* By Department */}
              <div>
                <p className="mb-2 text-[0.72rem] font-semibold uppercase tracking-wider" style={{ color: '#5a8fc4' }}>By Department</p>
                <div className="space-y-1.5">
                  {Object.entries(compliance.byDepartment).map(([dept, rate]) => (
                    <div key={dept} className="flex items-center gap-3">
                      <span className="w-24 truncate text-xs" style={{ color: '#0a2540' }}>{dept}</span>
                      <div className="flex-1 h-1.5 overflow-hidden rounded-full" style={{ background: '#e6f0fb' }}>
                        <div className="h-full rounded-full transition-all"
                          style={{ width: `${rate * 100}%`, background: compColor(rate) }} />
                      </div>
                      <span className="w-12 text-right font-mono text-xs font-semibold"
                        style={{ color: compColor(rate) }}>
                        {(rate * 100).toFixed(0)}%
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              <p className="text-center text-[0.7rem]" style={{ color: '#5a8fc4' }}>
                {compliance.recordsProcessed} records processed
              </p>
            </>
          ) : null}
        </PanelBody>
      </Panel>
    </div>
  );
}
