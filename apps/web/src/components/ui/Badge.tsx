import { cn } from '@/lib/utils';

type Variant = 'cyan' | 'success' | 'warning' | 'danger' | 'neutral' | 'info';

const variants: Record<Variant, string> = {
  cyan:    'border',
  success: 'border',
  warning: 'border',
  danger:  'border',
  neutral: 'border',
  info:    'border',
};

const variantStyles: Record<Variant, React.CSSProperties> = {
  cyan:    { background: 'rgba(0,102,204,0.15)', color: '#4DA6FF', borderColor: 'rgba(0,102,204,0.35)' },
  info:    { background: 'rgba(0,102,204,0.10)', color: '#4DA6FF', borderColor: 'rgba(0,102,204,0.25)' },
  success: { background: 'rgba(0,204,122,0.12)', color: '#00cc7a', borderColor: 'rgba(0,204,122,0.30)' },
  warning: { background: 'rgba(255,170,0,0.12)',  color: '#ffaa00', borderColor: 'rgba(255,170,0,0.30)' },
  danger:  { background: 'rgba(255,51,85,0.12)',  color: '#ff3355', borderColor: 'rgba(255,51,85,0.30)' },
  neutral: { background: 'rgba(10,22,40,0.8)',    color: '#7aaad4', borderColor: '#1a3560' },
};

export function Badge({
  children,
  variant = 'neutral',
  className,
}: {
  children: React.ReactNode;
  variant?: Variant;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full px-2 py-0.5 text-[0.68rem] font-semibold whitespace-nowrap',
        variants[variant],
        className,
      )}
      style={variantStyles[variant]}
    >
      {children}
    </span>
  );
}

export function stageBadgeVariant(stage: string): Variant {
  const map: Record<string, Variant> = {
    Inquiry: 'cyan',
    'Sales Review': 'info',
    'Engineering Design': 'info',
    Quotation: 'warning',
    Approval: 'warning',
    Dispatch: 'success',
    Delivery: 'success',
    Completed: 'success',
    Cancelled: 'danger',
  };
  return map[stage] ?? 'neutral';
}

export function severityVariant(s: string): Variant {
  return s === 'Critical' ? 'danger' : s === 'Warning' ? 'warning' : 'info';
}

export function lifecycleVariant(s: string): Variant {
  return s === 'Created' ? 'cyan'
    : s === 'Acknowledged' ? 'warning'
    : s === 'Resolved' ? 'success'
    : 'neutral';
}
