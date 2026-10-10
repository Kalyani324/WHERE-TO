import { auth, signIn } from './firebase'

export class ApiError extends Error {}

/** All server actions go through one endpoint. Retries once on network failure. */
export async function api<T = Record<string, unknown>>(op: string, body: Record<string, unknown> = {}): Promise<T> {
  const user = auth.currentUser ?? (await signIn())
  const send = async () => {
    const token = await user.getIdToken()
    return fetch('/api/game', {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` },
      body: JSON.stringify({ op, ...body }),
    })
  }
  let res: Response
  try {
    res = await send()
  } catch {
    await new Promise((r) => setTimeout(r, 800))
    try {
      res = await send()
    } catch {
      throw new ApiError('Connection trouble. Check your network and try again.')
    }
  }
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new ApiError(json.error || 'Something went wrong. Try again.')
  return json as T
}
