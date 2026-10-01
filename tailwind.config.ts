import type { Config } from 'tailwindcss'
import { borderRadius, colors, fontSize } from './src/design/tokens'

// Design tokens come from src/design/tokens.ts (also mirrored in
// invoice-system). Roles are additive: legacy utility classes still build while
// pages migrate to `text-body`, `bg-page-bg`, `rounded-card`, semantic colours.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['"IBM Plex Sans Thai"', '"Sarabun"', 'system-ui', 'sans-serif'],
      },
      colors: {
        ...colors,
      },
      fontSize: { ...fontSize } as unknown as Record<string, [string, { lineHeight: string }]>,
      borderRadius: { ...borderRadius },
      boxShadow: {
        // Tinted with the current ink-900 (#37352f). These previously hardcoded
        // rgb(26 35 50), the old cool navy, which left a blue-grey shadow under
        // warm neutrals.
        card: '0 1px 2px rgb(55 53 47 / 0.06), 0 8px 24px -12px rgb(55 53 47 / 0.18)',
        overlay: '0 10px 40px -12px rgb(55 53 47 / 0.28)',
      },
    },
  },
  plugins: [],
} satisfies Omit<Config, 'content'> & { content: string[] }
