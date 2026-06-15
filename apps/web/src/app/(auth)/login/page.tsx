'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { login, decodeJwt } from '@/lib/api';
import { useAuthStore } from '@/store/auth';

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd]   = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(''); setLoading(true);
    try {
      const data = await login(email, password);
      const payload = decodeJwt(data.accessToken);
      if (!payload) throw new Error('Invalid token received');
      setAuth(data.accessToken, data.refreshToken, payload);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally { setLoading(false); }
  }

  const inputBase = 'w-full rounded border px-3 py-2.5 text-sm focus:outline-none transition';
  const inputStyle: React.CSSProperties = { background: '#f7fbff', borderColor: '#c8dff5', color: '#0a2540' };

  function onFocus(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = '#0066CC';
    e.target.style.boxShadow = '0 0 0 3px rgba(0,102,204,0.12)';
  }
  function onBlur(e: React.FocusEvent<HTMLInputElement>) {
    e.target.style.borderColor = '#c8dff5';
    e.target.style.boxShadow = 'none';
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #e6f0fb 0%, #f0f6ff 50%, #dceefa 100%)' }}>
      {/* Background */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute inset-0 opacity-30"
          style={{ backgroundImage: 'linear-gradient(#c8dff5 1px, transparent 1px), linear-gradient(90deg, #c8dff5 1px, transparent 1px)', backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 70% 70% at center, black 0%, transparent 100%)' }} />
        <div className="absolute inset-0" style={{ background: 'radial-gradient(ellipse 80% 60% at 50% 0%, rgba(0,102,204,0.10) 0%, transparent 70%)' }} />
        <svg className="absolute bottom-0 left-0 right-0 opacity-20" viewBox="0 0 1440 200" preserveAspectRatio="none" style={{ height: 200 }}>
          <path d="M0,80 C360,160 720,0 1080,80 C1260,120 1380,60 1440,80 L1440,200 L0,200 Z" fill="#0066CC"/>
          <path d="M0,120 C320,60 640,160 960,100 C1120,70 1300,130 1440,100 L1440,200 L0,200 Z" fill="#4DA6FF" fillOpacity="0.5"/>
        </svg>
      </div>

      {/* Card */}
      <div className="animate-fade-slide-up relative z-10 w-full max-w-sm rounded-xl border px-8 py-9"
        style={{ background: '#ffffff', borderColor: '#c8dff5', boxShadow: '0 8px 32px rgba(0,102,204,0.15), 0 0 0 1px rgba(0,102,204,0.08)' }}>

        {/* Brand */}
        <div className="mb-7 flex flex-col items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: '#0066CC', boxShadow: '0 0 20px rgba(0,102,204,0.3)' }}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="1" y="1" width="38" height="38" rx="3" fill="white" stroke="#0066CC" strokeWidth="1.5"/>
                <text x="5" y="14" fontFamily="Arial" fontWeight="bold" fontSize="8" fill="#0066CC">D&amp;S</text>
                <path d="M4 22 Q10 17 16 22 Q22 27 28 22 Q34 17 38 22" stroke="#0066CC" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M4 30 Q10 25 16 30 Q22 35 28 30 Q34 25 38 30" stroke="#4DA6FF" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="text-xl font-black leading-tight tracking-tight" style={{ color: '#0a2540' }}>DAVIS &amp; SHIRTLIFF</div>
              <div className="text-[0.65rem] tracking-wide" style={{ color: '#5a8fc4' }}>
                know <span style={{ color: '#0066CC', fontWeight: 700 }}>H₂O</span>w through experience
              </div>
            </div>
          </div>
          <div className="mt-1 text-center">
            <div className="text-base font-bold tracking-wider" style={{ color: '#0066CC' }}>1000 Eyes</div>
            <div className="text-[0.65rem] uppercase tracking-[0.12em]" style={{ color: '#5a8fc4' }}>Enterprise Process Observability</div>
          </div>
          <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, #0066CC, transparent)' }} />
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium" style={{ color: '#2e6fa8' }}>Email Address</label>
            <div className="relative flex items-center">
              <svg className="pointer-events-none absolute left-3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5a8fc4" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/><polyline points="22,6 12,13 2,6"/>
              </svg>
              <input id="email" type="email" autoComplete="email" required value={email}
                onChange={(e) => setEmail(e.target.value)} placeholder="user@davis-shirtliff.com"
                className={`${inputBase} pl-9 pr-4`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium" style={{ color: '#2e6fa8' }}>Password</label>
            <div className="relative flex items-center">
              <svg className="pointer-events-none absolute left-3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#5a8fc4" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input id="password" type={showPwd ? 'text' : 'password'} autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className={`${inputBase} pl-9 pr-10`} style={inputStyle} onFocus={onFocus} onBlur={onBlur} />
              <button type="button" aria-label="Toggle password" onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2.5 rounded p-1 transition" style={{ color: '#5a8fc4' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#0066CC')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#5a8fc4')}>
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {error && <p role="alert" className="text-xs" style={{ color: '#cc0033' }}>{error}</p>}

          <button type="submit" disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0066CC 0%, #0055aa 100%)', boxShadow: '0 4px 15px rgba(0,102,204,0.35)' }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(135deg, #4DA6FF 0%, #0066CC 100%)')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(135deg, #0066CC 0%, #0055aa 100%)')}>
            {loading ? <><Loader2 size={14} className="animate-spin-slow" /> Signing in…</> : 'Sign In'}
          </button>

          <p className="text-center text-[0.7rem]" style={{ color: '#5a8fc4' }}>
            Demo: <code className="rounded px-1 py-0.5" style={{ background: '#e6f0fb', color: '#0066CC' }}>admin@dayliff.com</code>{' '}
            / <code className="rounded px-1 py-0.5" style={{ background: '#e6f0fb', color: '#0066CC' }}>admin123</code>
          </p>
        </form>
      </div>
    </div>
  );
}
