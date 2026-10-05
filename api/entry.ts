import type { Hono } from 'hono'
import { readdirSync } from 'node:fs'

let appPromise: Promise<Hono> | null = null
function getApp(): Promise<Hono> {
  if (!appPromise) {
    appPromise = (async () => {
      const { app } = await import('../server/src/api')
      const { adminApp } = await import('../server/src/admin')
      app.route('/api/admin-op', adminApp)
      return app
    })()
  }
  return appPromise
}

export default {
  async fetch(request: Request): Promise<Response> {
    try {
      const app = await getApp()
      const url = new URL(request.url)
      const route = url.searchParams.get('__route')
      if (route === null) return app.fetch(request)
      url.searchParams.delete('__route')
      url.pathname = route ? `/api/${route}` : '/api'
      const init: RequestInit = { method: request.method, headers: request.headers }
      if (request.method !== 'GET' && request.method !== 'HEAD') init.body = await request.arrayBuffer()
      return app.fetch(new Request(url.toString(), init))
    } catch (e) {
      const ls = (p: string) => {
        try {
          return readdirSync(p).join(', ')
        } catch (err) {
          return 'ERR ' + (err instanceof Error ? err.message : err)
        }
      }
      return new Response(
        'DIAG: ' + (e instanceof Error ? e.stack : String(e)) +
          '\n\n/var/task: ' + ls('/var/task') +
          '\n\n/var/task/api: ' + ls('/var/task/api') +
          '\n\n/var/task/server: ' + ls('/var/task/server') +
          '\n\n/var/task/server/src: ' + ls('/var/task/server/src') +
          '\n\n/var/task/server/assets/fonts: ' + ls('/var/task/server/assets/fonts'),
        { status: 200, headers: { 'content-type': 'text/plain; charset=utf-8' } },
      )
    }
  },
}
