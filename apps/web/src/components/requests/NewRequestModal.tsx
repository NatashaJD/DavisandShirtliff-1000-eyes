'use client';

import { useState, type FormEvent } from 'react';
import { X } from 'lucide-react';
import { type ServiceRequest, type Priority } from '@/lib/api';
import { Spinner } from '@/components/ui/Spinner';

const REQUEST_TYPES = ['Borehole Design','Solar Installation','Pump Maintenance','Water Treatment','Site Survey'];
const DEPARTMENTS = ['Sales','Engineering','Logistics','Finance','Operations'];

interface Props {
  onClose: () => void;
  onSubmit: (body: Partial<ServiceRequest>) => void;
  loading: boolean;
}

const fieldStyle: React.CSSProperties = {
  background: '#0a1628', borderColor: '#1a3560', color: '#ddeeff', width: '100%',
};

export function NewRequestModal({ onClose, onSubmit, loading }: Props) {
  const [customerName, setCustomerName] = useState('');
  const [customerContact, setCustomerContact] = useState('');
  const [requestType, setRequestType] = useState('');
  const [department, setDepartment] = useState('');
  const [priority, setPriority] = useState<Priority>('Medium');
  const [error, setError] = useState('');

  function handleSubmit(e: FormEvent) {
    e.preventDefault();
    if (!customerName.trim()) { setError('Customer name is required'); return; }
    if (!requestType) { setError('Request type is required'); return; }
    setError('');
    onSubmit({
      customerName: customerName.trim(),
      customerContact: customerContact.trim() || null,
      requestType,
      assignedDepartment: department || null,
      metadata: { priority },
    });
  }

  const baseCls = 'rounded border px-3 py-2 text-sm focus:outline-none transition';
  const labelStyle: React.CSSProperties = { color: '#7aaad4' };

  function focusHandler(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.borderColor = '#0066CC';
    e.target.style.boxShadow = '0 0 0 2px rgba(0,102,204,0.15)';
  }
  function blurHandler(e: React.FocusEvent<HTMLInputElement | HTMLSelectElement>) {
    e.target.style.borderColor = '#1a3560';
    e.target.style.boxShadow = 'none';
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'rgba(0,0,0,0.75)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-lg border shadow-xl"
        style={{ background: '#0d1f38', borderColor: '#1a3560' }}>

        {/* Header */}
        <div className="flex items-center justify-between border-b px-5 py-4"
          style={{ borderColor: '#0f2444' }}>
          <h2 className="text-sm font-semibold text-white">New Service Request</h2>
          <button onClick={onClose} className="rounded p-1 transition"
            style={{ color: '#4d7ab5' }}
            onMouseEnter={(e) => (e.currentTarget.style.color = '#ffffff')}
            onMouseLeave={(e) => (e.currentTarget.style.color = '#4d7ab5')}
            aria-label="Close">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4 p-5">
          <div className="grid grid-cols-2 gap-3">

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>Customer Name *</label>
              <input
                value={customerName} onChange={(e) => setCustomerName(e.target.value)}
                className={baseCls} style={fieldStyle}
                placeholder="e.g. Nairobi Water"
                onFocus={focusHandler} onBlur={blurHandler}
              />
            </div>

            <div className="col-span-2">
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>Customer Contact</label>
              <input
                value={customerContact} onChange={(e) => setCustomerContact(e.target.value)}
                className={baseCls} style={fieldStyle}
                placeholder="email or phone"
                onFocus={focusHandler} onBlur={blurHandler}
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>Request Type *</label>
              <select value={requestType} onChange={(e) => setRequestType(e.target.value)}
                className={baseCls} style={fieldStyle}
                onFocus={focusHandler} onBlur={blurHandler}>
                <option value="">Select type…</option>
                {REQUEST_TYPES.map((t) => <option key={t}>{t}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>Department</label>
              <select value={department} onChange={(e) => setDepartment(e.target.value)}
                className={baseCls} style={fieldStyle}
                onFocus={focusHandler} onBlur={blurHandler}>
                <option value="">Select dept…</option>
                {DEPARTMENTS.map((d) => <option key={d}>{d}</option>)}
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-medium" style={labelStyle}>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value as Priority)}
                className={baseCls} style={fieldStyle}
                onFocus={focusHandler} onBlur={blurHandler}>
                <option>Low</option>
                <option>Medium</option>
                <option>High</option>
              </select>
            </div>
          </div>

          {error && <p className="text-xs" style={{ color: '#ff3355' }}>{error}</p>}

          <div className="flex justify-end gap-2 pt-1">
            <button type="button" onClick={onClose}
              className="rounded border px-4 py-2 text-xs transition"
              style={{ borderColor: '#1a3560', color: '#7aaad4' }}
              onMouseEnter={(e) => (e.currentTarget.style.background = '#112548')}
              onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}>
              Cancel
            </button>
            <button type="submit" disabled={loading}
              className="flex items-center gap-2 rounded px-4 py-2 text-xs font-bold text-white transition disabled:opacity-50"
              style={{ background: 'linear-gradient(135deg, #0066CC, #0055aa)', boxShadow: '0 4px 12px rgba(0,102,204,0.35)' }}
              onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(135deg, #4DA6FF, #0066CC)')}
              onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(135deg, #0066CC, #0055aa)')}>
              {loading && <Spinner className="h-3 w-3" />}
              Create Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
