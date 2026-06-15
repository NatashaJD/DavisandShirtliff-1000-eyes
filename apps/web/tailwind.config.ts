import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: {
          DEFAULT: '#f0f6ff',
          raised:  '#e6f0fb',
          panel:   '#ffffff',
          hover:   '#dceefa',
        },
        border: {
          DEFAULT: '#c8dff5',
          light:   '#b0d0f0',
        },
        text: {
          DEFAULT: '#0a2540',
          muted:   '#5a8fc4',
          subtle:  '#2e6fa8',
        },
        cyan: {
          DEFAULT: '#0066CC',
          dim:     '#0055aa',
          faint:   'rgba(0,102,204,0.10)',
          glow:    'rgba(0,102,204,0.20)',
        },
        'blue-light': '#4DA6FF',
        'ds-blue':    '#0066CC',
        'ds-light':   '#4DA6FF',
        'ds-dark':    '#003380',
        'ds-deeper':  '#002266',

        success: '#007a4d',
        warning: '#b35c00',
        danger:  '#cc0033',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Mono', 'monospace'],
      },
      borderRadius: {
        sm:      '5px',
        DEFAULT: '8px',
        lg:      '12px',
      },
      boxShadow: {
        sm:   '0 1px 4px rgba(0,102,204,0.10)',
        md:   '0 4px 16px rgba(0,102,204,0.12)',
        blue: '0 0 24px rgba(0,102,204,0.15)',
      },
      keyframes: {
        fadeSlideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        spin: { to: { transform: 'rotate(360deg)' } },
        bounce: {
          '0%, 80%, 100%': { transform: 'translateY(0)', opacity: '0.4' },
          '40%':            { transform: 'translateY(-5px)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to:   { opacity: '1' },
        },
      },
      animation: {
        fadeSlideUp:      'fadeSlideUp 0.4s ease',
        fadeIn:           'fadeIn 0.25s ease',
        'fade-slide-up':  'fadeSlideUp 0.4s ease',
        'spin-slow':      'spin 0.8s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
