import { serve } from '@hono/node-server'
import { config as dotenv } from 'dotenv'
import { app } from './api'

dotenv({ path: '.env.local' })
dotenv()

const port = Number(process.env.PORT ?? 8787)
serve({ fetch: app.fetch, port, hostname: '127.0.0.1' })
console.log(`pilot api listening on http://127.0.0.1:${port} (localhost only — put behind a reverse proxy in prod)`)
