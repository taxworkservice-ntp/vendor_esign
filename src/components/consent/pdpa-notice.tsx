import type { ReactNode } from 'react'

// Collapsible PDPA privacy notice. Shared by the signing screen and the
// self-onboarding page so the disclosure wording has a single home. `detail`
// carries any extra, screen-specific lines under the main statement.
export function PdpaNotice({ text, detail }: { text: string; detail?: ReactNode }) {
  return (
    <details className="rounded-control border border-card-border">
      <summary className="cursor-pointer px-3.5 py-2.5 text-label font-medium text-primary-text">
        ประกาศความเป็นส่วนตัว (PDPA)
      </summary>
      <div className="space-y-2 border-t border-card-border px-3.5 py-3 text-label leading-relaxed text-ink-600">
        <p>{text}</p>
        {detail}
      </div>
    </details>
  )
}
