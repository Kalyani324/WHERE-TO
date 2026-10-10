import { auth } from './_lib/admin.js'
import { OpError } from './_lib/room.js'
import * as ops from './_lib/ops.js'

interface Req { method?: string; headers: Record<string, string | string[] | undefined>; body?: unknown }
interface Res { status: (n: number) => Res; json: (b: unknown) => void }

const CODE = /^[A-Z]{4}$/

export default async function handler(req: Req, res: Res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST only' })
  try {
    const h = String(req.headers.authorization ?? '')
    const token = h.startsWith('Bearer ') ? h.slice(7) : ''
    if (!token) throw new OpError('Sign-in missing. Reload the page.', 401)
    const { uid } = await auth().verifyIdToken(token).catch(() => {
      throw new OpError('Sign-in expired. Reload the page.', 401)
    })
    const body = (typeof req.body === 'string' ? JSON.parse(req.body) : req.body ?? {}) as Record<string, unknown>
    const op = String(body.op ?? '')
    if (op === 'create') return res.status(200).json(await ops.create(uid, body))
    const code = String(body.code ?? '').toUpperCase()
    if (!CODE.test(code)) throw new OpError('Room codes are 4 letters.')
    const map: Record<string, (u: string, c: string, b: Record<string, unknown>) => Promise<unknown>> = {
      join: ops.join, settings: ops.settings, addBots: ops.addBots, remove: ops.remove, start: ops.start, restartQuiz: ops.restartQuiz,
      pause: ops.pause, claimHost: ops.claimHost, draft: ops.draft, lock: ops.lock, singleChoice: ops.singleChoice,
      editOptions: ops.editOptions, edit: ops.edit, correctJourney: ops.correctJourney, flag: ops.flag,
      consolationOptions: ops.consolationOptions, consolationPick: ops.consolationPick, advance: ops.doAdvance,
    }
    const fn = map[op]
    if (!fn) throw new OpError('Unknown action.')
    return res.status(200).json(await fn(uid, code, body))
  } catch (e) {
    if (e instanceof OpError) return res.status(e.code).json({ error: e.message })
    console.error(e)
    return res.status(500).json({ error: 'Something went wrong. Try again.' })
  }
}
