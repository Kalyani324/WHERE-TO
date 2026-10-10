import type { Plan, QuizAnswer, RiskTag } from './types.js'
import { planRiskTags } from './plan.js'

export const RISK_LABEL: Record<RiskTag, string> = {
  long_walk: 'long walk',
  crowded: 'crowds',
  early_start: 'early start',
  late_night: 'late night',
}

const withRisk = (stops: Plan['stops'], tag: RiskTag) => stops.some((s) => s.tags.includes(tag))

export interface EditFacts {
  destination: string
  removed: RiskTag[]
  added: RiskTag[]
  conflictDelta: number
  remaining: { tag: RiskTag; count: number } | null
  n: number
}

export function editFacts(before: Plan, after: Plan, counted: QuizAnswer[]): EditFacts {
  const rb = new Set(planRiskTags(before.stops))
  const ra = new Set(planRiskTags(after.stops))
  const removed = [...rb].filter((t) => !ra.has(t))
  const added = [...ra].filter((t) => !rb.has(t))
  const conflicted = (risks: Set<RiskTag>) => counted.filter((q) => q.dealbreakers.some((d) => risks.has(d))).length
  let remaining: EditFacts['remaining'] = null
  for (const t of ra) {
    const c = counted.filter((q) => q.dealbreakers.includes(t)).length
    if (c > 0 && (!remaining || c > remaining.count) && withRisk(after.stops, t)) remaining = { tag: t, count: c }
  }
  return {
    destination: after.destination,
    removed,
    added,
    conflictDelta: conflicted(rb) - conflicted(ra),
    remaining,
    n: counted.length,
  }
}

/** Pre-written fallback comment built only from computed facts. */
export function fallbackEditComment(f: EditFacts): string {
  const first =
    f.removed.length && f.conflictDelta > 0
      ? `${f.destination} dropped the ${RISK_LABEL[f.removed[0]]}, so ${f.conflictDelta} fewer player${f.conflictDelta === 1 ? ' has' : 's have'} a conflict.`
      : f.added.length
        ? `${f.destination} added a ${RISK_LABEL[f.added[0]]} stop, which some players flagged.`
        : `${f.destination} changed a stop.`
  const second = f.remaining
    ? ` The ${RISK_LABEL[f.remaining.tag]} still bothers ${f.remaining.count} of ${f.n}.`
    : ' No dealbreakers left on it.'
  return first + second
}
