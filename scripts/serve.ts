// Single-port server: built client from dist/ plus the API handler. Used to host the app without Vercel.
import http from 'node:http'
import { readFile } from 'node:fs/promises'
import { extname, join, normalize } from 'node:path'
import handler from '../api/game.ts'

const port = Number(process.env.PORT || 8080)
const dist = join(import.meta.dirname, '..', 'dist')
const types: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff', '.json': 'application/json', '.ico': 'image/x-icon',
}

http
  .createServer(async (req, res) => {
    const url = (req.url || '/').split('?')[0]
    if (url.startsWith('/api/game')) {
      const chunks: Buffer[] = []
      for await (const c of req) chunks.push(c as Buffer)
      const r = req as http.IncomingMessage & { body?: unknown }
      try { r.body = JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}') } catch { r.body = {} }
      const resp = res as http.ServerResponse & { status: (n: number) => typeof resp; json: (b: unknown) => void }
      resp.status = (n: number) => { res.statusCode = n; return resp }
      resp.json = (b: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)) }
      return handler(r as never, resp as never)
    }
    const file = join(dist, normalize(url).replace(/^(\.\.[/\\])+/, ''))
    const target = extname(file) && file.startsWith(dist) ? file : join(dist, 'index.html')
    try {
      const body = await readFile(target)
      res.setHeader('content-type', types[extname(target)] || 'application/octet-stream')
      if (target.includes('/assets/')) res.setHeader('cache-control', 'public, max-age=31536000, immutable')
      res.end(body)
    } catch {
      res.setHeader('content-type', types['.html'])
      res.end(await readFile(join(dist, 'index.html')))
    }
  })
  .listen(port, () => console.log(`WHERE TO? on http://localhost:${port}`))
