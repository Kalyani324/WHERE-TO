/** Plans kept after each round, by N (a co-owned plan counts once). */
export function keepCount(n: number, round: 1 | 2): number {
  if (n <= 1) return n
  if (round === 2) return 2
  if (n === 2) return 2
  if (n <= 6) return 3
  if (n <= 8) return 4
  return 5
}

export interface RankEntry {
  id: string
  /** Score that decides the cut (round score for R1, cumulative for R2). */
  primary: number
  /** Higher score this round (first tie-break). */
  roundScore: number
  supporters: number
}

export interface EliminationResult {
  ranking: string[]
  kept: string[]
  out: string[]
  /** Plans whose place at the cut line was settled by the stored coin flip. */
  coinFlip: string[]
}

export function eliminate(entries: RankEntry[], keep: number, coin: Record<string, number>): EliminationResult {
  const cmpNoCoin = (a: RankEntry, b: RankEntry) =>
    b.primary - a.primary || b.roundScore - a.roundScore || b.supporters - a.supporters
  const sorted = [...entries].sort((a, b) => cmpNoCoin(a, b) || (coin[b.id] ?? 0) - (coin[a.id] ?? 0))
  const kept = sorted.slice(0, keep).map((e) => e.id)
  const out = sorted.slice(keep).map((e) => e.id)
  let coinFlip: string[] = []
  if (keep > 0 && keep < sorted.length) {
    const last = sorted[keep - 1]
    const first = sorted[keep]
    if (cmpNoCoin(last, first) === 0) coinFlip = sorted.filter((e) => cmpNoCoin(e, last) === 0).map((e) => e.id)
  }
  return { ranking: sorted.map((e) => e.id), kept, out, coinFlip }
}

/** Edit tokens: 1 per active plan, +1 for the top scorer(s) of the round just played. */
export function editTokens(roundScores: Record<string, number>): Record<string, number> {
  const vals = Object.values(roundScores)
  const top = vals.length ? Math.max(...vals) : 0
  const out: Record<string, number> = {}
  for (const [id, s] of Object.entries(roundScores)) out[id] = 1 + (s === top ? 1 : 0)
  return out
}
