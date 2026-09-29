// Design tokens — single source of truth (mirrors invoice-system's
// src/design/tokens.ts). `tailwind.config.ts` imports these; components consume
// the resulting roles (`text-body`, `bg-page-bg`, `rounded-card`) rather than
// raw px/hex. Adoption is incremental — legacy utility classes still build.

export const colors = {
  ink: {
    50: '#f8fafc',
    100: '#f1f5f9',
    300: '#cbd5e1',
    400: '#94a3b8',
    500: '#64748b',
    600: '#475569',
    700: '#334155',
    900: '#1a2332',
  },
  // surfaces
  'page-bg': '#F7F6F3',
  'card-border': '#E8E6DF',
  'paper-field': '#FAF9F6',
  // semantic
  primary: '#378ADD',
  'primary-soft': '#E6F1FB',
  'primary-deep': '#0C447C',
  success: '#27500A',
  'success-soft': '#EAF3DE',
  warning: '#633806',
  'warning-soft': '#FAEEDA',
  danger: '#791F1F',
  'danger-soft': '#FCEBEB',
  'accent-teal': '#0F766E',
} as const

export const fontSize = {
  label: ['12px', { lineHeight: '18px' }],
  body: ['14px', { lineHeight: '22px' }],
  title: ['17px', { lineHeight: '24px' }],
  subtitle: ['20px', { lineHeight: '29px' }],
  display: ['22px', { lineHeight: '31px' }],
  page: ['26px', { lineHeight: '35px' }],
  hero: ['33px', { lineHeight: '40px' }],
} as const

export const borderRadius = {
  card: '10px',
  control: '8px',
} as const
