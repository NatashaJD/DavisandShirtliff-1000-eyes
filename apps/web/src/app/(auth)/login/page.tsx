'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { login, decodeJwt } from '@/lib/api';
import { useAuthStore } from '@/store/auth';
import { cn } from '@/lib/utils';

/* Davis & Shirtliff official logo as inline SVG */
function DsLogo({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 260 80" fill="none" xmlns="http://www.w3.org/2000/svg">
      {/* Box with waves */}
      <rect x="2" y="2" width="70" height="56" rx="4" fill="white" stroke="#0066CC" strokeWidth="3"/>
      <text x="10" y="18" fontFamily="Arial" fontWeight="bold" fontSize="10" fill="#0066CC">D&amp;S</text>
      {/* Wave shapes */}
      <path d="M8 32 Q18 24 28 32 Q38 40 48 32 Q58 24 66 32" stroke="#0066CC" strokeWidth="3" fill="none" strokeLinecap="round"/>
      <path d="M8 42 Q18 34 28 42 Q38 50 48 42 Q58 34 66 42" stroke="#4DA6FF" strokeWidth="3" fill="none" strokeLinecap="round"/>
      {/* Company name */}
      <text x="82" y="30" fontFamily="Arial" fontWeight="900" fontSize="22" fill="#111111" letterSpacing="-0.5">DAVIS &amp;</text>
      <text x="82" y="56" fontFamily="Arial" fontWeight="900" fontSize="22" fill="#111111" letterSpacing="-0.5">SHIRTLIFF</text>
      {/* Tagline */}
      <text x="82" y="72" fontFamily="Arial" fontSize="10" fill="#444">know </text>
      <text x="114" y="72" fontFamily="Arial" fontWeight="bold" fontSize="10" fill="#0066CC">H</text>
      <text x="123" y="68" fontFamily="Arial" fontSize="7" fill="#0066CC">2</text>
      <text x="130" y="72" fontFamily="Arial" fontWeight="bold" fontSize="10" fill="#0066CC">O</text>
      <text x="140" y="72" fontFamily="Arial" fontSize="10" fill="#444">w through experience</text>
    </svg>
  );
}

export default function LoginPage() {
  const router = useRouter();
  const setAuth = useAuthStore((s) => s.setAuth);

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const data = await login(email, password);
      const payload = decodeJwt(data.accessToken);
      if (!payload) throw new Error('Invalid token received');
      setAuth(data.accessToken, data.refreshToken, payload);
      router.push('/dashboard');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="relative flex min-h-screen items-center justify-center overflow-hidden"
      style={{ background: 'linear-gradient(135deg, #050d1a 0%, #0a1628 50%, #0d1f38 100%)' }}>

      {/* Background water-wave pattern */}
      <div className="pointer-events-none absolute inset-0 overflow-hidden">
        {/* Grid */}
        <div className="absolute inset-0 opacity-20"
          style={{
            backgroundImage: 'linear-gradient(#0f2444 1px, transparent 1px), linear-gradient(90deg, #0f2444 1px, transparent 1px)',
            backgroundSize: '48px 48px',
            maskImage: 'radial-gradient(ellipse 80% 80% at center, black 0%, transparent 100%)',
          }}
        />
        {/* Blue glow top */}
        <div className="absolute inset-0"
          style={{ background: 'radial-gradient(ellipse 70% 50% at 50% -10%, rgba(0,102,204,0.25) 0%, transparent 70%)' }} />
        {/* Animated wave lines */}
        <svg className="absolute bottom-0 left-0 right-0 opacity-10" viewBox="0 0 1440 200" preserveAspectRatio="none" style={{ height: 200 }}>
          <path d="M0,80 C360,160 720,0 1080,80 C1260,120 1380,60 1440,80 L1440,200 L0,200 Z" fill="#0066CC"/>
          <path d="M0,120 C320,60 640,160 960,100 C1120,70 1300,130 1440,100 L1440,200 L0,200 Z" fill="#4DA6FF" fillOpacity="0.5"/>
        </svg>
      </div>

      {/* Card */}
      <div className="animate-fade-slide-up relative z-10 w-full max-w-sm rounded-xl border px-8 py-9"
        style={{
          background: 'rgba(13,31,56,0.95)',
          borderColor: '#1a3560',
          boxShadow: '0 8px 32px rgba(0,0,0,0.6), 0 0 0 1px rgba(0,102,204,0.15), 0 0 40px rgba(0,102,204,0.08)',
          backdropFilter: 'blur(12px)',
        }}>

        {/* Logo */}
        <div className="mb-7 flex flex-col items-center gap-3">
          {/* D&S logo block */}
          <div className="flex items-center gap-3">
            {/* Icon box */}
            <div className="flex h-14 w-14 flex-shrink-0 items-center justify-center rounded-lg"
              style={{ background: 'white', boxShadow: '0 0 20px rgba(0,102,204,0.3)' }}>
              <svg width="40" height="40" viewBox="0 0 40 40" fill="none">
                <rect x="1" y="1" width="38" height="38" rx="3" fill="white" stroke="#0066CC" strokeWidth="1.5"/>
                <text x="5" y="14" fontFamily="Arial" fontWeight="bold" fontSize="8" fill="#0066CC">D&amp;S</text>
                <path d="M4 22 Q10 17 16 22 Q22 27 28 22 Q34 17 38 22" stroke="#0066CC" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
                <path d="M4 30 Q10 25 16 30 Q22 35 28 30 Q34 25 38 30" stroke="#4DA6FF" strokeWidth="2.5" fill="none" strokeLinecap="round"/>
              </svg>
            </div>
            <div>
              <div className="text-xl font-black leading-tight tracking-tight text-white">
                DAVIS &amp; SHIRTLIFF
              </div>
              <div className="text-[0.65rem] tracking-wide text-text-muted">
                know <span style={{ color: '#4DA6FF' }}>H₂O</span>w through experience
              </div>
            </div>
          </div>

          {/* Platform name */}
          <div className="mt-1 text-center">
            <div className="text-base font-bold tracking-wider" style={{ color: '#4DA6FF' }}>
              1000 Eyes
            </div>
            <div className="text-[0.65rem] uppercase tracking-[0.12em] text-text-muted">
              Enterprise Process Observability Platform
            </div>
          </div>

          {/* Blue divider */}
          <div className="h-px w-full" style={{ background: 'linear-gradient(90deg, transparent, #0066CC, transparent)' }} />
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex flex-col gap-4" noValidate>
          {/* Email */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="email" className="text-xs font-medium" style={{ color: '#7aaad4' }}>
              Email Address
            </label>
            <div className="relative flex items-center">
              <svg className="pointer-events-none absolute left-3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4d7ab5" strokeWidth="2">
                <path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"/>
                <polyline points="22,6 12,13 2,6"/>
              </svg>
              <input
                id="email" type="email" autoComplete="email" required
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="user@davis-shirtliff.com"
                className="w-full rounded border py-2.5 pl-9 pr-4 text-sm transition focus:outline-none"
                style={{
                  background: '#0a1628', borderColor: '#1a3560', color: '#ddeeff',
                }}
                onFocus={(e) => { e.target.style.borderColor = '#0066CC'; e.target.style.boxShadow = '0 0 0 2px rgba(0,102,204,0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#1a3560'; e.target.style.boxShadow = 'none'; }}
              />
            </div>
          </div>

          {/* Password */}
          <div className="flex flex-col gap-1.5">
            <label htmlFor="password" className="text-xs font-medium" style={{ color: '#7aaad4' }}>
              Password
            </label>
            <div className="relative flex items-center">
              <svg className="pointer-events-none absolute left-3" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#4d7ab5" strokeWidth="2">
                <rect x="3" y="11" width="18" height="11" rx="2" ry="2"/>
                <path d="M7 11V7a5 5 0 0 1 10 0v4"/>
              </svg>
              <input
                id="password" type={showPwd ? 'text' : 'password'} autoComplete="current-password" required
                value={password} onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                className="w-full rounded border py-2.5 pl-9 pr-10 text-sm transition focus:outline-none"
                style={{ background: '#0a1628', borderColor: '#1a3560', color: '#ddeeff' }}
                onFocus={(e) => { e.target.style.borderColor = '#0066CC'; e.target.style.boxShadow = '0 0 0 2px rgba(0,102,204,0.15)'; }}
                onBlur={(e) => { e.target.style.borderColor = '#1a3560'; e.target.style.boxShadow = 'none'; }}
              />
              <button type="button" aria-label="Toggle password" onClick={() => setShowPwd((v) => !v)}
                className="absolute right-2.5 rounded p-1 transition"
                style={{ color: '#4d7ab5' }}
                onMouseEnter={(e) => (e.currentTarget.style.color = '#4DA6FF')}
                onMouseLeave={(e) => (e.currentTarget.style.color = '#4d7ab5')}>
                {showPwd ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </div>
          </div>

          {/* Error */}
          {error && <p role="alert" className="text-xs" style={{ color: '#ff3355' }}>{error}</p>}

          {/* Submit */}
          <button
            type="submit" disabled={loading}
            className="mt-1 flex w-full items-center justify-center gap-2 rounded py-2.5 text-sm font-bold text-white transition disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #0066CC 0%, #0055aa 100%)', boxShadow: '0 4px 15px rgba(0,102,204,0.4)' }}
            onMouseEnter={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(135deg, #4DA6FF 0%, #0066CC 100%)')}
            onMouseLeave={(e) => !loading && (e.currentTarget.style.background = 'linear-gradient(135deg, #0066CC 0%, #0055aa 100%)')}>
            {loading ? <><Loader2 size={14} className="animate-spin-slow" /> Signing in…</> : 'Sign In'}
          </button>

          {/* Demo hint */}
          <p className="text-center text-[0.7rem]" style={{ color: '#4d7ab5' }}>
            Demo:{' '}
            <code className="rounded px-1 py-0.5 text-[0.68rem]" style={{ background: 'rgba(0,102,204,0.12)', color: '#4DA6FF' }}>
              admin@dayliff.com
            </code>{' '}
            /{' '}
            <code className="rounded px-1 py-0.5 text-[0.68rem]" style={{ background: 'rgba(0,102,204,0.12)', color: '#4DA6FF' }}>
              admin123
            </code>
          </p>
        </form>
      </div>
    </div>
  );
}
