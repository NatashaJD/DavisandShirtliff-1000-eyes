import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('animate-spin-slow text-cyan', className)} size={18} />;
}

export function PageSpinner() {
  return (
    <div className="flex h-48 items-center justify-center">
      <Spinner />
    </div>
  );
}
