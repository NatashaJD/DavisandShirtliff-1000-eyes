import { cn } from '@/lib/utils';

export function EmptyState({
  icon,
  title,
  description,
  className,
}: {
  icon?: React.ReactNode;
  title?: string;
  description?: string;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-2 py-12 text-center',
        className,
      )}
    >
      {icon && <div className="opacity-30">{icon}</div>}
      {title && <p className="text-sm font-medium text-text-subtle">{title}</p>}
      {description && (
        <p className="max-w-xs text-xs text-text-muted">{description}</p>
      )}
    </div>
  );
}
