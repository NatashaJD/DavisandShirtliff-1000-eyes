import { cn } from '@/lib/utils';

const panelStyle: React.CSSProperties = {
  background: '#0d1f38',
  borderColor: '#0f2444',
};

const headerStyle: React.CSSProperties = {
  borderColor: '#0f2444',
};

export function Panel({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-col rounded border', className)}
      style={panelStyle}
    >
      {children}
    </div>
  );
}

export function PanelHeader({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn('flex flex-shrink-0 items-center justify-between border-b px-4 py-3', className)}
      style={headerStyle}
    >
      {children}
    </div>
  );
}

export function PanelTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[0.87rem] font-semibold" style={{ color: '#ddeeff' }}>
      {children}
    </h3>
  );
}

export function PanelBody({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex-1 overflow-y-auto p-4', className)}>
      {children}
    </div>
  );
}
