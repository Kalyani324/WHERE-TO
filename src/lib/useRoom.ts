import { useEffect, useMemo, useState } from 'react'
import { onDisconnect, onValue, ref, remove, serverTimestamp, set, type Unsubscribe } from 'firebase/database'
import { db } from './firebase'
import type { Draft, PublicPlan, PublicPlayer, RoomMeta, RoomResults, RoomState, SidekickLine } from '../shared/schema'
import type { Question } from '../engine'

export interface Room {
  meta: RoomMeta | null
  state: RoomState | null
  players: Record<string, PublicPlayer>
  presence: Record<string, { since: number }>
  plans: Record<string, PublicPlan>
  results: RoomResults
  pack: Question[]
  sidekick: SidekickLine | null
  locks: Record<string, Record<string, boolean>>
  draft: Draft | null
  seen: Record<string, number>
  myQuiz: boolean
  connected: boolean
  loaded: boolean
  missing: boolean
}

const EMPTY: Room = {
  meta: null, state: null, players: {}, presence: {}, plans: {}, results: {}, pack: [], sidekick: null, locks: {},
  draft: null, seen: {}, myQuiz: false, connected: true, loaded: false, missing: false,
}

function normPlan(p: PublicPlan): PublicPlan {
  return { ...p, owners: p.owners ?? [], ownerNames: p.ownerNames ?? [], stops: (p.stops ?? []).map((s) => ({ ...s, tags: s.tags ?? [] })), cards: p.cards ?? [] }
}

/** Subscribes to every public path of a room plus this player's own private paths. */
export function useRoom(code: string | null, uid: string | null): Room {
  const [room, setRoom] = useState<Room>(EMPTY)
  useEffect(() => {
    if (!code || !uid) return
    setRoom(EMPTY)
    const base = `rooms/${code}`
    const subs: Unsubscribe[] = []
    const on = <K extends keyof Room>(path: string, key: K, map: (v: unknown) => Room[K]) =>
      subs.push(onValue(ref(db, path), (s) => setRoom((r) => ({ ...r, [key]: map(s.val()) })), () => {}))
    subs.push(
      onValue(ref(db, `${base}/meta`), (s) => setRoom((r) => ({ ...r, meta: s.val(), loaded: true, missing: !s.exists() })), () =>
        setRoom((r) => ({ ...r, loaded: true, missing: true })),
      ),
    )
    on(`${base}/state`, 'state', (v) => v as RoomState)
    on(`${base}/players`, 'players', (v) => (v ?? {}) as Room['players'])
    on(`${base}/presence`, 'presence', (v) => (v ?? {}) as Room['presence'])
    on(`${base}/plans`, 'plans', (v) => Object.fromEntries(Object.entries((v ?? {}) as Record<string, PublicPlan>).map(([k, p]) => [k, normPlan(p)])))
    on(`${base}/results`, 'results', (v) => (v ?? {}) as RoomResults)
    on(`${base}/pack`, 'pack', (v) => ((v ?? []) as Question[]).map((q) => ({ ...q, a: { ...q.a, tags: q.a.tags ?? [] }, b: { ...q.b, tags: q.b.tags ?? [] } })))
    on(`${base}/sidekick/latest`, 'sidekick', (v) => v as SidekickLine | null)
    on(`${base}/locks`, 'locks', (v) => (v ?? {}) as Room['locks'])
    on(`${base}/drafts/${uid}`, 'draft', (v) => (v ? ({ ...(v as Draft), stops: ((v as Draft).stops ?? []).map((s) => ({ ...s, tags: s.tags ?? [] })) }) : null))
    on(`${base}/seen/${uid}`, 'seen', (v) => (v ?? {}) as Record<string, number>)
    on(`.info/connected`, 'connected', (v) => !!v)

    // presence: written on every (re)connect, removed on disconnect
    const pres = ref(db, `${base}/presence/${uid}`)
    subs.push(
      onValue(ref(db, '.info/connected'), (s) => {
        if (!s.val()) return
        onDisconnect(pres).remove().then(() => set(pres, { since: serverTimestamp() })).catch(() => {})
      }),
    )
    return () => {
      subs.forEach((u) => u())
      remove(pres).catch(() => {})
    }
  }, [code, uid])
  return room
}

/** Server-clock-corrected now(), ticking every 250ms. */
export function useNow(intervalMs = 250): number {
  const [offset, setOffset] = useState(0)
  const [t, setT] = useState(Date.now())
  useEffect(() => onValue(ref(db, '.info/serverTimeOffset'), (s) => setOffset(Number(s.val()) || 0)), [])
  useEffect(() => {
    const id = setInterval(() => setT(Date.now()), intervalMs)
    return () => clearInterval(id)
  }, [intervalMs])
  return t + offset
}

export function useDerived(room: Room, uid: string | null) {
  return useMemo(() => {
    const active = Object.entries(room.players).filter(([, p]) => !p.removed)
    const connected = active.filter(([id, p]) => p.isBot || room.presence[id])
    const me = uid ? room.players[uid] : undefined
    const isHost = !!uid && room.meta?.hostUid === uid
    const plans = Object.values(room.plans).sort((a, b) => (b.scores?.total ?? 0) - (a.scores?.total ?? 0) || a.createdAt - b.createdAt)
    return { active, connected, me, isHost, plans, myPlan: me?.planId ? room.plans[me.planId] : undefined }
  }, [room, uid])
}
