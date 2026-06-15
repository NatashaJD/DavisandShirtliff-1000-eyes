'use client';

import { useQuery } from '@tanstack/react-query';
import { X, ExternalLink } from 'lucide-react';
import { getTimeline, getAiPrediction, type ServiceRequest } from '@/lib/api';
import { fmtDate, fmtHours, cn } from '@/lib/utils';
import { Badge, stageBadgeVariant, severityVariant } from '@/components/ui/Badge';
import { useAuthStore } from '@/store/auth';

interface Props {
  request: ServiceRequest;
  onClose: () => void;
}

const JOURNEY: string[] = [
  'Inquiry','Sales Review','Engineering Design','Quotation',
  'Approval','Dispatch','Delivery','Completed',
];

export function RequestDrawer({ request: r, onClose }: Props) {
  const user = useAuthStore((s) => s.user);
  const canSeeAi = user?.role === 'Administrator' || user?.role === 'Regional Manager';

  const { data: timeline } = useQuery({
    queryKey: ['timeline', r.id],
    queryFn: () => getTimeline(r.id).then((res) => res.data),
  });

  const { data: prediction } = useQuery({
    queryKey: ['ai-prediction', r.id],
    queryFn: () => getAiPrediction(r.id).then((res) => res.data),
    enabled: canSeeAi,
    retry: false,
  });

  const stageIndex = JOURNEY.indexOf(r.currentStage);

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm" onClick={onClose} />

      {/* Drawer */}
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-xl flex-col border-l shadow-xl"
        style={{ background: '#ffffff', borderColor: '#c8dff5' }}>
        {/* Header */}
        <div className="flex flex-shrink-0 items-center justify-between border-b px-5 py-4" style={{ borderColor: '#c8dff5' }}>
          <div>
            <p className="font-mono text-sm font-semibold" style={{ color: '#4DA6FF' }}>{r.requestNumber}</p>
            <p className="text-xs text-text-muted">{r.customerName}</p>
          </div>
          <button onClick={onClose} className="rounded p-1.5 text-text-muted transition hover:text-white" aria-label="Close">
            <X size={18} />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-5 space-y-6">
          {/* Journey progress */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Journey Progress</h4>
            <div className="flex items-center gap-1 overflow-x-auto pb-2">
              {JOURNEY.map((stage, i) => {
                const done = i < stageIndex;
                const active = i === stageIndex;
                return (
                  <div key={stage} className="flex items-center gap-1">
                    <div className={cn(
                      'flex h-6 min-w-max items-center rounded px-2 text-[0.68rem] font-medium transition',
                      done ? 'bg-success/15 text-success' : active ? 'bg-cyan/15 text-cyan ring-1 ring-cyan/30' : 'bg-bg-raised text-text-muted',
                    )}>
                      {stage}
                    </div>
                    {i < JOURNEY.length - 1 && (
                      <div className={cn('h-px w-3 flex-shrink-0', done ? 'bg-success/40' : 'bg-border')} />
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Details grid */}
          <div className="grid grid-cols-2 gap-3">
            {[
              ['Type', r.requestType],
              ['Status', r.currentStatus],
              ['Department', r.assignedDepartment ?? '—'],
              ['Priority', r.metadata?.priority ?? '—'],
              ['SLA', r.slaBreached ? '🔴 Breached' : '🟢 On Track'],
              ['Created', fmtDate(r.createdAt)],
              ['Updated', fmtDate(r.updatedAt)],
              ['Contact', r.customerContact ?? '—'],
            ].map(([label, value]) => (
              <div key={label} className="rounded border border-border bg-bg-raised p-3">
                <p className="mb-1 text-[0.68rem] uppercase tracking-wider text-text-muted">{label}</p>
                <p className="text-[0.82rem] text-text">{value}</p>
              </div>
            ))}
          </div>

          {/* AI Prediction */}
          {canSeeAi && prediction && (
            <div className="rounded border border-border bg-bg-raised p-4">
              <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">AI Risk Prediction</h4>
              <div className="flex items-center gap-3 mb-3">
                <div className={cn(
                  'rounded-full px-3 py-1 text-sm font-bold',
                  prediction.riskLabel === 'Critical' ? 'bg-danger/15 text-danger' :
                  prediction.riskLabel === 'High' ? 'bg-warning/15 text-warning' :
                  prediction.riskLabel === 'Medium' ? 'bg-yellow-500/15 text-yellow-400' :
                  'bg-success/15 text-success',
                )}>
                  {prediction.riskLabel}
                </div>
                <span className="font-mono text-lg font-bold text-white">{(prediction.riskScore * 100).toFixed(0)}%</span>
                <span className="text-xs text-text-muted">risk score</span>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-text-muted">Predicted delay: </span><span className="text-warning font-semibold">{fmtHours(prediction.predictedDelayHours)}</span></div>
                <div><span className="text-text-muted">Confidence: </span><span className="text-text">{(prediction.delayConfidence * 100).toFixed(0)}%</span></div>
              </div>
              <div className="mt-3 space-y-1.5">
                {prediction.contributingFactors.map((f) => (
                  <div key={f.factor} className="flex items-center gap-2">
                    <div className="h-1 flex-1 overflow-hidden rounded-full bg-bg-hover">
                      <div className="h-full rounded-full bg-cyan/70" style={{ width: `${f.influence * 100}%` }} />
                    </div>
                    <span className="w-40 truncate text-[0.7rem] text-text-muted">{f.factor}</span>
                    <span className="w-8 text-right font-mono text-[0.7rem] text-cyan">{(f.influence * 100).toFixed(0)}%</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Timeline */}
          <div>
            <h4 className="mb-3 text-xs font-semibold uppercase tracking-wider text-text-muted">Event Timeline</h4>
            {!timeline ? (
              <p className="text-xs text-text-muted">Loading…</p>
            ) : timeline.length === 0 ? (
              <p className="text-xs text-text-muted">No events recorded</p>
            ) : (
              <div className="relative pl-5">
                <div className="absolute left-[7px] top-0 h-full w-px bg-gradient-to-b from-cyan via-border to-border" />
                {timeline.map((e) => (
                  <div key={e.id} className="relative mb-4 last:mb-0">
                    <div className="absolute -left-5 top-2 h-2.5 w-2.5 rounded-full border-2 border-cyan bg-bg" />
                    <div className="rounded border border-border bg-bg-raised p-3">
                      <div className="flex items-center justify-between gap-2 flex-wrap">
                        <span className="text-[0.82rem] font-semibold text-text capitalize">{e.eventType.replace(/_/g,' ')}</span>
                        <span className="font-mono text-[0.68rem] text-text-muted">{fmtDate(e.occurredAt)}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-2 text-[0.72rem] text-text-muted">
                        {e.department && <span>{e.department}</span>}
                        {e.newState && <span>→ {e.newState}</span>}
                        {e.triggeredByUser && <span>by {e.triggeredByUser}</span>}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </aside>
    </>
  );
}
