import type { Plan, QuizAnswer, Stop } from './types.js'
import { planPace, planRiskTags, scoredCost, scoredHours } from './plan.js'

/** (player, risk tag) pairs where the plan has the tag and a counted player picked it. */
export function dealbreakerConflicts(plan: Pick<Plan, 'stops'>, counted: QuizAnswer[]): number {
  const risks = new Set(planRiskTags(plan.stops))
  let n = 0
  for (const q of counted) for (const d of new Set(q.dealbreakers)) if (risks.has(d)) n++
  return n
}

export function playersWithConflict(plan: Pick<Plan, 'stops'>, counted: QuizAnswer[]): number {
  const risks = new Set(planRiskTags(plan.stops))
  return counted.filter((q) => q.dealbreakers.some((d) => risks.has(d))).length
}

export interface WinnerResult {
  winner: string
  tally: Record<string, number>
  tieBreak: 'none' | 'conflicts' | 'score' | 'coin'
  tied: string[]
}

export function decideWinner(
  finalists: string[],
  votes: Record<string, string>,
  conflicts: Record<string, number>,
  cumulative: Record<string, number>,
  coin: Record<string, number>,
): WinnerResult {
  const tally: Record<string, number> = {}
  for (const f of finalists) tally[f] = 0
  for (const v of Object.values(votes)) if (v in tally) tally[v]++
  const max = Math.max(...finalists.map((f) => tally[f]))
  let tied = finalists.filter((f) => tally[f] === max)
  if (tied.length === 1) return { winner: tied[0], tally, tieBreak: 'none', tied: [] }
  const all = [...tied]
  const minC = Math.min(...tied.map((f) => conflicts[f] ?? 0))
  tied = tied.filter((f) => (conflicts[f] ?? 0) === minC)
  if (tied.length === 1) return { winner: tied[0], tally, tieBreak: 'conflicts', tied: all }
  const maxS = Math.max(...tied.map((f) => cumulative[f] ?? 0))
  tied = tied.filter((f) => (cumulative[f] ?? 0) === maxS)
  if (tied.length === 1) return { winner: tied[0], tally, tieBreak: 'score', tied: all }
  tied.sort((a, b) => (coin[b] ?? 0) - (coin[a] ?? 0))
  return { winner: tied[0], tally, tieBreak: 'coin', tied: all }
}

export interface RevealCard {
  n: number
  cost: number
  affordCount: number
  hours: number
  journeyOkCount: number
  pace: 'relaxed' | 'packed'
  paceFitCount: number
  conflicts: number
  stops: number
}

export function revealCard(plan: Plan, counted: QuizAnswer[], days: number): RevealCard {
  const cost = scoredCost(plan, days)
  const hours = scoredHours(plan)
  const pace = planPace(plan.stops, days)
  return {
    n: counted.length,
    cost,
    affordCount: counted.filter((q) => q.budget >= cost).length,
    hours,
    journeyOkCount: counted.filter((q) => q.maxHours >= hours).length,
    pace,
    paceFitCount: counted.filter((q) => q.pace === pace).length,
    conflicts: dealbreakerConflicts(plan, counted),
    stops: plan.stops.length,
  }
}

/**
 * Runner-up pick: added as a stop. If that day already has 4 stops it replaces the
 * stop flagged weak, else the lowest-scoring one (lowest `stopScore`, then latest in the day).
 */
export function applyRunnerUpPick(stops: Stop[], pick: Stop, stopScore: Record<string, number> = {}): { stops: Stop[]; replaced: string | null } {
  const sameDay = stops.filter((s) => s.day === pick.day)
  if (sameDay.length < 4) return { stops: [...stops, pick], replaced: null }
  const weak = sameDay.find((s) => s.weak)
  const victim =
    weak ??
    [...sameDay].sort((a, b) => (stopScore[a.id] ?? 0) - (stopScore[b.id] ?? 0) || sameDay.indexOf(b) - sameDay.indexOf(a))[0]
  return { stops: stops.map((s) => (s.id === victim.id ? pick : s)), replaced: victim.id }
}

export interface VetoResult {
  vetoed: string[]
  /** Days left with no stops after vetoes (need a replacement). */
  emptyDays: number[]
}

/**
 * Vetoes are capped at 2. The most-nominated stops are vetoed (ties by stored coin value).
 * A veto can't take the plan below 3 stops, and only one veto can land on any single day.
 */
export function resolveVetoes(stops: Stop[], nominations: Record<string, string>, coin: Record<string, number>, cap = 2): VetoResult {
  const count: Record<string, number> = {}
  for (const sid of Object.values(nominations)) if (stops.some((s) => s.id === sid)) count[sid] = (count[sid] ?? 0) + 1
  const order = Object.keys(count).sort((a, b) => count[b] - count[a] || (coin[b] ?? 0) - (coin[a] ?? 0))
  const vetoed: string[] = []
  const days = new Set<number>()
  for (const sid of order) {
    if (vetoed.length >= cap) break
    if (stops.length - vetoed.length - 1 < 3) break
    const stop = stops.find((s) => s.id === sid)!
    if (days.has(stop.day)) continue
    vetoed.push(sid)
    days.add(stop.day)
  }
  const remaining = stops.filter((s) => !vetoed.includes(s.id))
  const emptyDays = [...days].filter((d) => !remaining.some((s) => s.day === d)).sort()
  return { vetoed, emptyDays }
}
