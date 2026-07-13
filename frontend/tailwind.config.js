/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // Terminal palette — "Bloomberg meets Linear". Green/red reserved for P&L.
        bg: '#08090c',
        panel: '#0d0f14',
        panel2: '#12141b',
        line: 'rgba(255,255,255,0.08)',
        ink: '#e6e8ec',
        muted: '#7a828e',
        accent: '#4c8fe8',
        up: '#2ebd85',
        down: '#f6465d',
      },
      fontFamily: {
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'Menlo', 'monospace'],
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        '2xs': ['0.6875rem', { lineHeight: '1rem' }],
      },
    },
  },
  plugins: [],
};
