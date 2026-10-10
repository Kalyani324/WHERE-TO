// Local stand-in for Vercel functions: serves api/*.ts on :3001 (Vite proxies /api here).
import http from 'node:http'
import handler from '../api/game.ts'

const port = Number(process.env.API_PORT || 3001)
http
  .createServer(async (req, res) => {
    const chunks: Buffer[] = []
    for await (const c of req) chunks.push(c as Buffer)
    const raw = Buffer.concat(chunks).toString('utf8')
    const r = req as http.IncomingMessage & { body?: unknown }
    try { r.body = raw ? JSON.parse(raw) : {} } catch { r.body = {} }
    const resp = res as http.ServerResponse & { status: (n: number) => typeof resp; json: (b: unknown) => void }
    resp.status = (n: number) => { res.statusCode = n; return resp }
    resp.json = (b: unknown) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify(b)) }
    if (!req.url?.startsWith('/api/game')) return resp.status(404).json({ error: 'not found' })
    await handler(r as never, resp as never)
  })
  .listen(port, () => console.log(`dev api on http://localhost:${port}`))
