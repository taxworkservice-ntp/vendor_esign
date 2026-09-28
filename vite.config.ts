import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// Portable static build — no host-specific plugins.
// Deploy the dist/ output to any static host.
export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
})
