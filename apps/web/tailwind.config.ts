import type { Config } from 'tailwindcss';

const config: Config = {
  darkMode: ['class'],
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        /* Dark navy backgrounds */
        bg: {
          DEFAULT: '#050d1a',
          raised:  '#0a1628',
          panel:   '#0d1f38',
          hover:   '#112548',
        },
        border: {
          DEFAULT: '#0f2444',
          light:   '#1a3560',
        },
        text: {
          DEFAULT: '#ddeeff',
          muted:   '#4d7ab5',
          subtle:  '#7aaad4',
        },
        /* D&S primary blue — used wherever "cyan" was */
        cyan: {
          DEFAULT: '#0066CC',
          dim:     '#0055aa',
          faint:   'rgba(0,102,204,0.10)',
          glow:    'rgba(0,102,204,0.22)',
        },
        /* D&S light blue accent */
        'blue-light': '#4DA6FF',
        /* D&S brand */
        'ds-blue':    '#0066CC',
        'ds-light':   '#4DA6FF',
        'ds-dark':    '#003380',
        'ds-deeper':  '#002266',

        success: '#00cc7a',
        warning: '#ffaa00',
        danger:  '#ff3355',
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
        sm:   '0 1px 3px rgba(0,0,0,0.5)',
        md:   '0 4px 16px rgba(0,0,0,0.6)',
        blue: '0 0 24px rgba(0,102,204,0.18)',
      },
      keyframes: {
        fadeSlideUp: {
          from: { opacity: '0', transform: 'translateY(20px)' },
          to:   { opacity: '1', transform: 'translateY(0)' },
        },
        shimmer: {
          '0%':   { backgroundPosition: '200% 0' },
          '100%': { backgroundPosition: '-200% 0' },
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
        fadeSlideUp:  'fadeSlideUp 0.4s ease',
        shimmer:      'shimmer 1.6s ease infinite',
        spin:         'spin 0.8s linear infinite',
        bounce:       'bounce 1.2s infinite',
        fadeIn:       'fadeIn 0.25s ease',
        'fade-slide-up': 'fadeSlideUp 0.4s ease',
        'spin-slow':  'spin 0.8s linear infinite',
      },
    },
  },
  plugins: [],
};

export default config;
