import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Portable static build — no host-specific plugins.
// Deploy the dist/ output to any static host.
export default defineConfig({
  plugins: [react()],
  define: {
    // Vercel sets VERCEL_ENV at build time (production | preview | development).
    // Exposed as a bare global so the client can force demo mode on previews —
    // a preview must never reach the production backend (see src/lib/api-base.ts).
    __VERCEL_ENV__: JSON.stringify(process.env.VERCEL_ENV ?? ''),
  },
  // strictPort: fail loudly instead of silently sliding to 5174 —
  // two servers on two ports caused real confusion during testing.
  server: { port: 5173, strictPort: true },
})
