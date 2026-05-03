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
          bg:           '#0A0A0F',
          surface:      '#12121A',
          'surface-2':  '#1A1A25',
          border:       '#2A2A3A',
          'border-light': '#3A3A4A',
          text:         '#E4E4ED',
          'text-muted': '#8888A0',
          'text-dim':   '#5A5A70',
          green:        '#22C55E',
          red:          '#EF4444',
          yellow:       '#EAB308',
          blue:         '#3B82F6',
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
