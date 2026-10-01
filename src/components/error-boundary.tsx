import { Component, ErrorInfo, ReactNode } from 'react'

// Last-resort boundary: any render error shows a recoverable screen instead of
// a blank page. Kept dependency-free (no router context needed).
export class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }

  static getDerivedStateFromError(error: Error) {
    return { error }
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('UI error:', error, info)
  }

  render() {
    if (this.state.error) {
      return (
        <div className="grid min-h-screen place-items-center bg-paper p-6">
          <div className="w-full max-w-md rounded-card border border-card-border bg-white p-6 text-center shadow-card">
            <h1 className="text-title font-semibold">เกิดข้อผิดพลาดบางอย่าง</h1>
            <p className="mt-1 text-body text-ink-500">โปรดลองโหลดหน้าใหม่อีกครั้ง หากยังพบปัญหาโปรดแจ้งผู้ดูแลระบบ</p>
            <button
              type="button"
              onClick={() => location.reload()}
              className="mt-4 inline-flex h-11 items-center justify-center rounded-control bg-primary-deep px-5 text-body font-semibold text-white transition hover:bg-primary-deeper"
            >
              โหลดหน้าใหม่
            </button>
          </div>
        </div>
      )
    }
    return this.props.children
  }
}
