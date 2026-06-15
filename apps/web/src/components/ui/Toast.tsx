'use client';

import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';
import { X } from 'lucide-react';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface ToastItem {
  id: string;
  message: string;
  type: ToastType;
}

interface ToastContextValue {
  toast: (message: string, type?: ToastType) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

const dotColor: Record<ToastType, string> = {
  success: '#00cc7a',
  error:   '#ff3355',
  warning: '#ffaa00',
  info:    '#4DA6FF',
};

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  const toast = useCallback((message: string, type: ToastType = 'info') => {
    const id = Math.random().toString(36).slice(2);
    setToasts((t) => [...t, { id, message, type }]);
    setTimeout(() => setToasts((t) => t.filter((x) => x.id !== id)), 4000);
  }, []);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="fixed bottom-5 right-4 z-[600] flex flex-col-reverse gap-2 sm:right-5">
        {toasts.map((t) => (
          <div
            key={t.id}
            className="flex min-w-[260px] max-w-sm items-center gap-3 rounded border px-4 py-3 shadow-md text-sm animate-fade-slide-up"
            style={{ background: '#0d1f38', borderColor: '#1a3560', color: '#ddeeff' }}
          >
            <span className="h-2 w-2 flex-shrink-0 rounded-full" style={{ background: dotColor[t.type] }} />
            <span className="flex-1">{t.message}</span>
            <button
              onClick={() => setToasts((prev) => prev.filter((x) => x.id !== t.id))}
              style={{ color: '#4d7ab5' }}
              onMouseEnter={(e) => (e.currentTarget.style.color = '#ddeeff')}
              onMouseLeave={(e) => (e.currentTarget.style.color = '#4d7ab5')}
              aria-label="Dismiss"
            >
              <X size={13} />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used inside ToastProvider');
  return ctx.toast;
}
