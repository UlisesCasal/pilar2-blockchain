/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        chalk: '#FAFAF7',
        stone: '#F0EDE6',
        graphite: '#1A1A1A',
        slate: '#6B7280',
        'assayers-gold': '#B8860B',
        malachite: '#2D6A4F',
        garnet: '#9B2335',
      },
      fontFamily: {
        serif: ['"DM Serif Display"', 'serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
