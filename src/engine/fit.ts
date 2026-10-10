import type { Plan, QuizAnswer } from './types.js'
import { planPace, planRiskTags, scoredCost, scoredHours } from './plan.js'

export interface FitParts {
  budget: number
  journey: number
  pace: number
  dealbreakers: number
  entry: number
}

export interface FitResult {
  parts: FitParts
  fit: number
}

const pct = (n: number, d: number) => (d ? (n / d) * 100 : 0)

/**
 * Fit = average of 5 parts (0-100). Quiz-based parts use counted players only;
 * entry uses every player's entry score.
 */
export function computeFit(plan: Plan, counted: QuizAnswer[], entryScores: number[], days: number): FitResult {
  const n = counted.length
  const cost = scoredCost(plan, days)
  const hours = scoredHours(plan)
  const pace = planPace(plan.stops, days)
  const risks = new Set(planRiskTags(plan.stops))
  const parts: FitParts = {
    budget: pct(counted.filter((q) => q.budget >= cost).length, n),
    journey: pct(counted.filter((q) => q.maxHours >= hours).length, n),
    pace: pct(counted.filter((q) => q.pace === pace).length, n),
    dealbreakers: pct(counted.filter((q) => !q.dealbreakers.some((d) => risks.has(d))).length, n),
    entry: entryScores.length ? entryScores.reduce((s, x) => s + x, 0) / entryScores.length : 100,
  }
  const fit = (parts.budget + parts.journey + parts.pace + parts.dealbreakers + parts.entry) / 5
  return { parts, fit: Math.round(fit * 10) / 10 }
}
