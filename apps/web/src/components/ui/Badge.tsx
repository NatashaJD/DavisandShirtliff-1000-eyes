import { cn } from '@/lib/utils';

type Variant = 'cyan' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const variantStyles: Record<Variant, React.CSSProperties> = {
  cyan:    { background: '#e6f0fb', color: '#0055aa', border: '1px solid #b0d0f0' },
  info:    { background: '#e6f0fb', color: '#0055aa', border: '1px solid #b0d0f0' },
  success: { background: '#e6f7f0', color: '#007a4d', border: '1px solid #a3d9be' },
  warning: { background: '#fff5e6', color: '#b35c00', border: '1px solid #f0c040' },
  danger:  { background: '#fce6eb', color: '#cc0033', border: '1px solid #f0a0b0' },
  neutral: { background: '#f0f6ff', color: '#2e6fa8', border: '1px solid #c8dff5' },
};

export function Badge({ children, variant = 'neutral', className }: {
  children: React.ReactNode; variant?: Variant; className?: string;
}) {
  return (
    <span className={cn('inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold whitespace-nowrap', className)}
      style={variantStyles[variant]}>
      {children}
    </span>
  );
}

export function stageBadgeVariant(stage: string): Variant {
  const map: Record<string, Variant> = {
    Inquiry: 'cyan', 'Sales Review': 'info', 'Engineering Design': 'info',
    Quotation: 'warning', Approval: 'warning',
    Dispatch: 'success', Delivery: 'success', Completed: 'success', Cancelled: 'danger',
  };
  return map[stage] ?? 'neutral';
}

export function severityVariant(s: string): Variant {
  return s === 'Critical' ? 'danger' : s === 'Warning' ? 'warning' : 'info';
}

export function lifecycleVariant(s: string): Variant {
  return s === 'Created' ? 'cyan' : s === 'Acknowledged' ? 'warning' : s === 'Resolved' ? 'success' : 'neutral';
}
