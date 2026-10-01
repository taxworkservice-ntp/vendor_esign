// Design tokens — single source of truth (mirrors invoice-system's
// src/design/tokens.ts). `tailwind.config.ts` imports these; components consume
// the resulting roles (`text-body`, `bg-page-bg`, `rounded-card`) rather than
// raw px/hex. scripts/check-design.mjs enforces that at build time.

export const colors = {
  // Warm neutral ramp. Previously Tailwind slate verbatim (a cool blue-grey),
  // which fought the warm paper surfaces below: cool greys under #F7F6F3 read
  // slightly grubby. The mid-tones sit about one step darker than the Notion
  // greys they are derived from, because Notion tunes its greys for WHITE
  // surfaces and warm paper costs roughly 0.3 of contrast. Every text role
  // clears 4.5:1 on both card-white and page-bg.
  ink: {
    50: '#fafaf9',
    100: '#f1f1ef',
    300: '#e3e1de',
    400: '#a8a29e', // decorative only (2.3:1) — icons, placeholders, not body text
    500: '#6b6a67', // muted text — 5.0:1 on paper
    600: '#5f5e5b',
    700: '#4a4947',
    800: '#454442', // was missing; the scale used to jump 700 -> 900
    900: '#37352f',
  },
  // surfaces
  // One paper token, not two. There was a `page-bg` (#F7F6F3) here alongside a
  // `paper` (#f7f5f0) defined in tailwind.config.ts — `page-bg` was used zero
  // times and `paper` seven, so the live page background was not the value
  // being documented. `paper` now lives here, where the header says the source
  // of truth is, and carries the validated warm shell grey.
  paper: '#F7F6F3',
  'card-border': '#E8E6DF',
  'paper-field': '#FAF9F6',
  // semantic
  // The accent. Measured against WCAG 2.1, not eyeballed:
  //
  //   as a FILL with white text      4.57:1  PASS (AA needs 4.50)
  //   as TEXT on card-white          4.57:1  PASS
  //   as TEXT on page paper          4.22:1  FAIL
  //   as TEXT on primary-soft        3.98:1  FAIL
  //
  // So it is safe as a button, a checkbox fill, a selected-page pill and a focus
  // ring, but NOT as accent-coloured text on a light surface. That job belongs to
  // `primary-text` below. Lightening the soft fill was tried and does not rescue
  // it: even #F3F9FF only reaches 4.31:1, and that is too close to white to read
  // as tinted anyway.
  primary: '#0075de',
  'primary-soft': '#E7F0FF',
  // The text half of the accent: the same hue darkened until it clears 4.5:1 on
  // primary-soft (4.75:1) and on paper (5.04:1), while still taking white text at
  // 5.45:1. Ten call sites need this — active nav item, active filter chip,
  // status badges, the WHT segmented control — i.e. everywhere the accent is a
  // label rather than a surface.
  'primary-text': '#0069c8',
  // The old primary-deep/primary-deeper existed only to give the navy button a
  // hover; a flat accent uses brightness() for that instead, so they were dead
  // weight and are not coming back.
  //
  // Semantics are dark because they are chosen for TEXT contrast on their -soft
  // backgrounds (success reads 8.2:1). They are not fill colours — do not use
  // them as a button background, use danger for the button only.
  success: '#27500A',
  'success-soft': '#EAF3DE',
  // The FILL half of success, used only where a status chip is a solid block —
  // currently "ออกใบเสร็จแล้ว", the terminal state of the receipt lifecycle. It was
  // previously `success` itself, which as a full chip read almost black-green
  // (9.38:1 with white) and was the heaviest object on the list page.
  //
  // Lightened to 5.37:1 with white text: still comfortably AA, unmistakably
  // green, and clearly a different object from `signed`'s soft tint (4.70:1
  // between the two). The progression grey -> blue-soft -> green-soft -> green
  // fill -> amber -> grey -> red therefore survives; collapsing `issued` onto
  // `success-soft` would have made it indistinguishable from `signed`.
  'success-fill': '#37791A',
  warning: '#633806',
  'warning-soft': '#FAEEDA',
  danger: '#791F1F',
  'danger-soft': '#FCEBEB',
  // accent-teal removed. "signed" is a success state, not a fourth hue — a
  // single-badge reason to carry an extra colour is the opposite of a system.
} as const

export const fontSize = {
  micro: ['10px', { lineHeight: '14px' }],
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
