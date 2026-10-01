// Class-name joiner with real Tailwind conflict resolution.
//
// This used to be `filter(Boolean).join(' ')`, which concatenates without
// understanding Tailwind. That works right up until a caller passes an override:
// `cn('h-11 px-5', 'h-9')` emitted BOTH heights and the winner was decided by
// stylesheet order, not by the caller's intent. Every component in src/components/ui
// takes a `className` for exactly this purpose, so the override was unreliable in
// all of them.
//
// tailwind-merge resolves conflicts last-wins (matching how the components are
// written), and clsx handles the conditional/array/object forms that `&&` chains
// cannot express cleanly. Both were already in package.json and unused.
import { clsx, type ClassValue } from 'clsx'
import { extendTailwindMerge } from 'tailwind-merge'

const twMerge = extendTailwindMerge({
  extend: {
    // `size-*`, and these tokens, are custom; tailwind-merge must know which
    // prefixes conflict so `text-body` and `text-ink-500` resolve rather than
    // both surviving.
    classGroups: {
      'font-size': [{ text: ['micro', 'label', 'body', 'title', 'subtitle', 'display', 'page', 'hero'] }],
      rounded: [{ rounded: ['card', 'control'] }],
    },
  },
})

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs))
}