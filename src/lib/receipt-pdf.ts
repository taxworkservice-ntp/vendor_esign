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

export async function downloadElementAsA4Pdf(el: HTMLElement, filename: string): Promise<void> {
  const [{ default: html2canvas }, { jsPDF }] = await Promise.all([import('html2canvas'), import('jspdf')])
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
    pdf.save(filename)
  } finally {
    el.classList.remove('pdf-export')
  }
}
