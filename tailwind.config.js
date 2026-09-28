/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"Sarabun"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ink: {
          900: '#1a2332',
          700: '#334155',
          500: '#64748b',
          400: '#94a3b8',
        },
        paper: '#f7f5f0',
      },
      boxShadow: {
        card: '0 1px 2px rgb(26 35 50 / 0.06), 0 8px 24px -12px rgb(26 35 50 / 0.18)',
      },
    },
  },
  plugins: [],
}
