/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        base: '#0C0A09',
        surface: '#1C1917',
        'surface-hover': '#292524',
        'surface-bright': '#44403C',
        'border-subtle': '#33302E',
        'text-primary': '#FAFAF9',
        'text-secondary': '#A8A29E',
        'text-muted': '#78716C',
        mineral: '#D97706',
        'mineral-dim': 'rgba(217, 119, 6, 0.15)',
        crude: '#0EA5E9',
        'crude-dim': 'rgba(14, 165, 233, 0.15)',
        verified: '#10B981',
        'verified-dim': 'rgba(16, 185, 129, 0.12)',
        anomaly: '#EF4444',
        'anomaly-dim': 'rgba(239, 68, 68, 0.12)',
        pending: '#F59E0B',
        'pending-dim': 'rgba(245, 158, 11, 0.12)',
      },
      fontFamily: {
        sans: ['"Plus Jakarta Sans"', 'system-ui', 'sans-serif'],
        display: ['"Space Grotesk"', '"Plus Jakarta Sans"', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
      keyframes: {
        fadeUp: {
          from: { opacity: '0', transform: 'translateY(12px)', filter: 'blur(4px)' },
          to: { opacity: '1', transform: 'translateY(0)', filter: 'blur(0)' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        slideInRight: {
          from: { opacity: '0', transform: 'translateX(-16px)' },
          to: { opacity: '1', transform: 'translateX(0)' },
        },
        pulse: {
          '0%, 100%': { opacity: '1' },
          '50%': { opacity: '0.5' },
        },
        glow: {
          '0%, 100%': { boxShadow: '0 0 4px rgba(217, 119, 6, 0.3)' },
          '50%': { boxShadow: '0 0 16px rgba(217, 119, 6, 0.5)' },
        },
      },
      animation: {
        'fade-up': 'fadeUp 600ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'fade-in': 'fadeIn 400ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'slide-in-right': 'slideInRight 500ms cubic-bezier(0.32, 0.72, 0, 1) both',
        'pulse-slow': 'pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        glow: 'glow 2s ease-in-out infinite',
      },
      boxShadow: {
        card: '0 2px 8px rgba(0, 0, 0, 0.25), 0 0 1px rgba(255, 255, 255, 0.05)',
        'card-hover': '0 8px 32px rgba(0, 0, 0, 0.4), 0 0 1px rgba(255, 255, 255, 0.08)',
        'ambient': '0 12px 48px rgba(0, 0, 0, 0.5)',
        'inner-highlight': 'inset 0 1px 1px rgba(255, 255, 255, 0.06)',
        'glow-mineral': '0 0 20px rgba(217, 119, 6, 0.2)',
        'glow-crude': '0 0 20px rgba(14, 165, 233, 0.2)',
        'glow-verified': '0 0 20px rgba(16, 185, 129, 0.2)',
        'glow-anomaly': '0 0 20px rgba(239, 68, 68, 0.2)',
      },
      borderRadius: {
        '2xl': '1rem',
        '3xl': '1.5rem',
      },
      transitionTimingFunction: {
        'out-expo': 'cubic-bezier(0.32, 0.72, 0, 1)',
      },
    },
  },
  plugins: [],
};
