// Bundle the server into a single self-contained Vercel function.
//
// Vercel transpiles each .ts file in place without bundling, so the server's
// extensionless relative imports fail under Node's ESM loader at runtime. This
// produces one api/entry.js with no relative imports, which Vercel serves as a
// function. Run from `npm run build` (see package.json / vercel.json).
import { build } from 'esbuild'

await build({
  entryPoints: ['server/entry.ts'],
  outfile: 'api/entry.js',
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  sourcemap: true,
  logLevel: 'info',
})
