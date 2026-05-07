/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        bitcoin: {
          orange:      '#F7931A',
          'orange-dark':  '#E8850F',
          'orange-light': '#FFB347',
        },
        mim: {
          bg:             'var(--mim-bg)',
          surface:        'var(--mim-surface)',
          'surface-2':    'var(--mim-surface-2)',
          border:         'var(--mim-border)',
          'border-light': 'var(--mim-border-light)',
          text:           'var(--mim-text)',
          'text-muted':   'var(--mim-text-muted)',
          'text-dim':     'var(--mim-text-dim)',
          green:          '#22C55E',
          red:            '#EF4444',
          yellow:         '#EAB308',
          blue:           '#3B82F6',
        },
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'monospace'],
        sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'pulse-live': 'pulse 1.5s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'fade-in':    'fadeIn 0.3s ease-in-out',
      },
      keyframes: {
        fadeIn: {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
    },
  },
  plugins: [],
};
