import { ref, serverTimestamp, set } from 'firebase/database'
import { db } from './firebase'
import type { Room, useDerived } from './useRoom'

export interface Ctx {
  code: string
  uid: string
  room: Room
  d: ReturnType<typeof useDerived>
  now: number
  toast: (s: string) => void
  openPlan: (id: string) => void
  board: boolean
}

export async function submit(ctx: Ctx, value: unknown, step = ctx.room.state?.step ?? '') {
  const base = `rooms/${ctx.code}`
  if (value !== undefined) await set(ref(db, `${base}/inputs/${step}/${ctx.uid}`), { v: value, t: serverTimestamp() })
  await set(ref(db, `${base}/locks/${step}/${ctx.uid}`), true)
}

export const isLocked = (ctx: Ctx, step = ctx.room.state?.step ?? '') => !!ctx.room.locks[step]?.[ctx.uid]

/** Players expected to lock in this step (mirrors the server rule). */
export function needed(ctx: Ctx): string[] {
  const { room, d } = ctx
  const step = room.state?.step ?? ''
  let need = d.connected.map(([id]) => id)
  if (step === 'backing') need = need.filter((u) => room.players[u].role !== 'proposer')
  if (step.startsWith('r2:')) {
    const card = room.results.r2?.cards?.[room.state?.card ?? 0]
    const owners = card ? room.plans[card.planId]?.owners ?? [] : []
    need = need.filter((u) => !owners.includes(u))
  }
  return need
}

export function lockedCount(ctx: Ctx): { n: number; total: number } {
  const step = ctx.room.state?.step ?? ''
  const need = needed(ctx)
  const locks = ctx.room.locks[step] ?? {}
  return { n: need.filter((u) => locks[u]).length, total: need.length }
}
