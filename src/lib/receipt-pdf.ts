// Client-side "Download PDF" that matches the on-screen preview exactly.
//
// The receipt is authored once — as the HTML/CSS sheet in ReceiptView. html2canvas
// snapshots that exact DOM and jsPDF places it on a full A4 page, so the download
// is pixel-identical to the preview (same font, spacing, panels, teal bar).
//
// (Previously this was a separate hand-coded pdf-lib layout that drifted from the
// preview. The server keeps its own vector pdf-lib builder for real issuance.)
//
// html2canvas + jsPDF are code-split — loaded only when the user downloads.

/** Snapshot one element onto a single A4 page and return the PDF bytes. */
export async function elementToA4PdfBytes(el: HTMLElement): Promise<Uint8Array> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
  // Guard against the on-screen fit-to-width zoom skewing the capture.
  const prevZoom = el.style.zoom
  el.style.zoom = '1'
  // The export class normalizes the sheet to a clean, border-less A4 page.
  el.classList.add('pdf-export')
  try {
    const canvas = await html2canvas(el, {
      scale: 2,
      backgroundColor: '#ffffff',
      useCORS: true,
      logging: false,
    })
    const pdf = new jsPDF({ unit: 'pt', format: 'a4', orientation: 'portrait' })
    pdf.addImage(canvas.toDataURL('image/jpeg', 0.95), 'JPEG', 0, 0, 595.28, 841.89)
    return new Uint8Array(pdf.output('arraybuffer'))
  } finally {
    el.classList.remove('pdf-export')
    el.style.zoom = prevZoom
  }
}

export async function downloadElementAsA4Pdf(el: HTMLElement, filename: string): Promise<void> {
  const bytes = await elementToA4PdfBytes(el)
  // `bytes.slice().buffer` gives a plain ArrayBuffer BlobPart (avoids the
  // SharedArrayBuffer variance in the newer Uint8Array typings).
  const blob = new Blob([bytes.slice().buffer], { type: 'application/pdf' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 0)
}
