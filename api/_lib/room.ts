import { db } from './admin.js'
import type { PublicPlan, PublicPlayer, RoomMeta, RoomResults, RoomState } from '../../src/shared/schema.js'
import type { Question, QuizAnswer } from '../../src/engine/index.js'

export interface RoomData {
  meta: RoomMeta
  state: RoomState
  players: Record<string, PublicPlayer>
  presence: Record<string, { since: number }>
  plans: Record<string, PublicPlan>
  results: RoomResults
  pack?: Question[]
  inputs: Record<string, Record<string, { v: unknown; t: number }>>
  locks: Record<string, Record<string, boolean>>
  drafts: Record<string, import('../../src/shared/schema.js').Draft>
  private: Record<string, { quiz?: QuizAnswer & { t: number }; passport?: string }>
  server: {
    seed?: string
    estimates?: Record<string, { hours: number; cost: number }>
    flaggers?: Record<string, Record<string, boolean>>
    lock?: { step: string; at: number }
    sidekickAt?: number
    consolationOptions?: unknown
    stopScores?: Record<string, number>
  }
}

export class OpError extends Error {
  code: number
  constructor(msg: string, code = 400) {
    super(msg)
    this.code = code
  }
}

export const roomRef = (code: string) => db().ref(`rooms/${code}`)

export async function loadRoom(code: string): Promise<RoomData> {
  const v = (await roomRef(code).get()).val()
  if (!v?.meta) throw new OpError('Room not found', 404)
  return {
    meta: v.meta,
    state: v.state ?? { phase: 'lobby', step: 'lobby', endsAt: null },
    players: v.players ?? {},
    presence: v.presence ?? {},
    plans: Object.fromEntries(Object.entries(v.plans ?? {}).map(([k, p]) => [k, normPlan(p as PublicPlan)])),
    results: v.results ?? {},
    pack: v.pack,
    inputs: v.inputs ?? {},
    locks: v.locks ?? {},
    drafts: Object.fromEntries(Object.entries(v.drafts ?? {}).map(([k, d]) => [k, { ...(d as object), stops: (d as { stops?: unknown[] }).stops ?? [] } as never])),
    private: v.private ?? {},
    server: v.server ?? {},
  }
}

/** RTDB drops empty arrays; restore them. */
export function normPlan(p: PublicPlan): PublicPlan {
  return {
    ...p,
    owners: p.owners ?? [],
    ownerNames: p.ownerNames ?? [],
    stops: (p.stops ?? []).map((s) => ({ ...s, tags: s.tags ?? [] })),
  }
}

export const activePlayers = (r: RoomData) =>
  Object.entries(r.players).filter(([, p]) => !p.removed).map(([uid]) => uid)

export const connectedPlayers = (r: RoomData) =>
  activePlayers(r).filter((uid) => r.players[uid].isBot || r.presence[uid])

export const humanCount = (r: RoomData) => activePlayers(r).filter((u) => !r.players[u].isBot).length

export const countedUids = (r: RoomData) => activePlayers(r).filter((u) => r.players[u].counted)

export const countedQuizzes = (r: RoomData): QuizAnswer[] =>
  countedUids(r)
    .map((u) => r.private[u]?.quiz)
    .filter((q): q is QuizAnswer & { t: number } => !!q)
    .map((q) => ({ pace: q.pace, budget: Number(q.budget), maxHours: Number(q.maxHours), dealbreakers: q.dealbreakers ?? [] }))

export const passportOf = (r: RoomData, uid: string) => r.private[uid]?.passport || 'India'

export const activePlans = (r: RoomData) => Object.values(r.plans).filter((p) => p.status === 'active')

export const proposerSet = (r: RoomData) => new Set(Object.values(r.plans).flatMap((p) => p.owners))

export function stepInputs<T>(r: RoomData, step: string): Record<string, { v: T; t: number }> {
  return (r.inputs[step] ?? {}) as Record<string, { v: T; t: number }>
}
