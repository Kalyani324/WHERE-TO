import type { QuizAnswer, RiskTag } from './types.js'
import { RISK_TAGS } from './types.js'

export function median(xs: number[]): number {
  if (!xs.length) return 0
  const s = [...xs].sort((a, b) => a - b)
  const m = Math.floor(s.length / 2)
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2
}

export interface GroupProfile {
  n: number
  medianBudget: number
  medianHours: number
  relaxed: number
  packed: number
  dealbreakers: Record<RiskTag, number>
  topDealbreaker: { tag: RiskTag; count: number } | null
}

export function groupProfile(counted: QuizAnswer[]): GroupProfile {
  const dealbreakers = Object.fromEntries(RISK_TAGS.map((t) => [t, 0])) as Record<RiskTag, number>
  for (const q of counted) for (const d of new Set(q.dealbreakers)) dealbreakers[d]++
  let top: GroupProfile['topDealbreaker'] = null
  for (const t of RISK_TAGS) if (dealbreakers[t] > 0 && (!top || dealbreakers[t] > top.count)) top = { tag: t, count: dealbreakers[t] }
  return {
    n: counted.length,
    medianBudget: median(counted.map((q) => q.budget)),
    medianHours: median(counted.map((q) => q.maxHours)),
    relaxed: counted.filter((q) => q.pace === 'relaxed').length,
    packed: counted.filter((q) => q.pace === 'packed').length,
    dealbreakers,
    topDealbreaker: top,
  }
}

/** Counted players: submitted the quiz before the deadline (server time). */
export function countedPlayers(submissions: Record<string, { t: number }>, endsAt: number, graceMs = 750): string[] {
  return Object.entries(submissions)
    .filter(([, s]) => typeof s?.t === 'number' && s.t <= endsAt + graceMs)
    .map(([uid]) => uid)
}

export function isLate(t: number | undefined, endsAt: number, graceMs = 750): boolean {
  return typeof t !== 'number' || t > endsAt + graceMs
}
