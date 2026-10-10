import { createHash } from 'node:crypto'
import { db } from './admin.js'
import { AiHttpError, generateJsonText, providerConfigured } from './provider.js'
import { AI_ROOM_CAP } from '../../src/shared/config.js'

export type AiSource = 'ai' | 'mock' | 'cache' | 'fallback'

export interface AiRequest<T> {
  room: string
  kind: string
  prompt: string
  /** Validate/normalize parsed JSON. Return null if invalid. */
  validate: (raw: unknown) => T | null
  /** Mock output used when no API key is configured. */
  mock: () => T | null
  /** Max total time to spend (queue wait + retries) before falling back. */
  budgetMs?: number
}

export interface AiResult<T> {
  value: T | null
  source: AiSource
  error?: string
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const RPM = () => Number(process.env.AI_RPM || 8)

/** Global per-minute request counter shared by all rooms (the queue). Waits for a slot. */
async function takeSlot(deadline: number): Promise<boolean> {
  while (Date.now() < deadline) {
    const minute = Math.floor(Date.now() / 60000)
    const ref = db().ref(`_ai/rate/${minute}`)
    const tx = await ref.transaction((n: number | null) => ((n ?? 0) >= RPM() ? undefined : (n ?? 0) + 1))
    if (tx.committed) return true
    const wait = 60000 - (Date.now() % 60000) + 50
    if (Date.now() + wait > deadline) return false
    await sleep(wait)
  }
  return false
}

async function takeRoomBudget(room: string): Promise<boolean> {
  const tx = await db()
    .ref(`rooms/${room}/server/aiCalls`)
    .transaction((n: number | null) => ((n ?? 0) >= AI_ROOM_CAP ? undefined : (n ?? 0) + 1))
  return tx.committed
}

function parseJson(text: string): unknown {
  const t = text.trim().replace(/^```(?:json)?\s*/i, '').replace(/```$/, '')
  return JSON.parse(t)
}

/**
 * Single entry point for every AI call: per-room cap, cache, global queue,
 * 10s timeout with one retry, exponential backoff on HTTP 429, schema validation.
 * Returns value null when the caller should use its pre-written fallback.
 */
export async function aiJson<T>(req: AiRequest<T>): Promise<AiResult<T>> {
  if (!providerConfigured()) {
    const v = req.mock()
    return { value: v, source: v ? 'mock' : 'fallback' }
  }
  const key = createHash('sha1').update(`${req.kind}\n${req.prompt}`).digest('hex')
  const cacheRef = db().ref(`_ai/cache/${key}`)
  const cached = (await cacheRef.get()).val()
  if (cached) {
    const v = req.validate(cached.v)
    if (v) return { value: v, source: 'cache' }
  }
  if (!(await takeRoomBudget(req.room))) return { value: null, source: 'fallback', error: 'room-cap' }
  const deadline = Date.now() + (req.budgetMs ?? 20000)
  let timeouts = 0
  let backoff = 1000
  let lastErr = ''
  while (Date.now() < deadline) {
    if (!(await takeSlot(deadline))) return { value: null, source: 'fallback', error: 'queue-timeout' }
    try {
      const text = await generateJsonText(req.prompt, Math.min(10000, Math.max(1000, deadline - Date.now())))
      const v = req.validate(parseJson(text))
      if (!v) return { value: null, source: 'fallback', error: 'invalid-json' }
      await cacheRef.set({ v, at: Date.now() }).catch(() => {})
      return { value: v, source: 'ai' }
    } catch (e) {
      lastErr = e instanceof Error ? e.message : String(e)
      if (e instanceof AiHttpError && (e.status === 429 || e.status >= 500)) {
        if (Date.now() + backoff > deadline) break
        await sleep(backoff + Math.random() * 300)
        backoff *= 2
        continue
      }
      if (e instanceof Error && e.name === 'AbortError' && timeouts++ < 1) continue
      if (e instanceof SyntaxError) return { value: null, source: 'fallback', error: 'bad-json' }
      break
    }
  }
  return { value: null, source: 'fallback', error: lastErr || 'timeout' }
}

/** Player text is passed as quoted data, capped, never as instructions. */
export function asData(s: string): string {
  return JSON.stringify(String(s ?? '').slice(0, 200))
}
