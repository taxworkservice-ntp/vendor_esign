import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Portable static build — no host-specific plugins.
// Deploy the dist/ output to any static host.
export default defineConfig({
  plugins: [react()],
  // strictPort: fail loudly instead of silently sliding to 5174 —
  // two servers on two ports caused real confusion during testing.
  server: { port: 5173, strictPort: true },
})
