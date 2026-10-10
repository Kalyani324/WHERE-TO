import type { Plan, Question, Tag } from './types.js'
import { ALL_TAGS } from './types.js'
import { matchPoints } from './tables.js'
import { matchShare } from './scoring.js'

export function sanitizeTags(tags: unknown): Tag[] {
  if (!Array.isArray(tags)) return []
  const set = new Set<Tag>()
  for (const t of tags) if (typeof t === 'string' && (ALL_TAGS as readonly string[]).includes(t)) set.add(t as Tag)
  return [...set]
}

export interface QuestionEval {
  valid: boolean
  reason?: string
  affected: number
  separation: number
}

export function evaluateQuestion(q: Question, plans: Plan[]): QuestionEval {
  if (!q.a.tags.length || !q.b.tags.length) return { valid: false, reason: 'empty', affected: 0, separation: 0 }
  if (q.a.tags.some((t) => q.b.tags.includes(t))) return { valid: false, reason: 'overlap', affected: 0, separation: 0 }
  let affected = 0
  let separation = 0
  for (const p of plans) {
    const pa = matchPoints(matchShare(p, q.a.tags))
    const pb = matchPoints(matchShare(p, q.b.tags))
    if (pa !== pb) affected++
    separation += Math.abs(pa - pb)
  }
  const need = Math.min(2, plans.length)
  if (affected < need) return { valid: false, reason: 'no-effect', affected, separation }
  return { valid: true, affected, separation }
}

/** Pick the `count` valid questions that separate the plans most. */
export function selectQuestions(candidates: Question[], plans: Plan[], count: number): Question[] {
  const seen = new Set<string>()
  const scored = candidates
    .filter((q) => {
      const key = [...q.a.tags].sort().join(',') + '|' + [...q.b.tags].sort().join(',')
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
    .map((q) => ({ q, e: evaluateQuestion(q, plans) }))
    .filter((x) => x.e.valid)
    .sort((x, y) => y.e.separation - x.e.separation || y.e.affected - x.e.affected)
  return scored.slice(0, count).map((x) => x.q)
}

/** Pre-written fallback questions. */
export const FALLBACK_QUESTIONS: Question[] = [
  { id: 'fb1', prompt: 'Sea breeze or hill mist?', a: { label: 'Sea breeze', tags: ['beach'] }, b: { label: 'Hill mist', tags: ['hills'] } },
  { id: 'fb2', prompt: 'City day or nature day?', a: { label: 'City day', tags: ['city', 'shopping'] }, b: { label: 'Nature day', tags: ['nature', 'hills'] } },
  { id: 'fb3', prompt: 'Food crawl or adventure day?', a: { label: 'Food crawl', tags: ['food'] }, b: { label: 'Adventure day', tags: ['adventure'] } },
  { id: 'fb4', prompt: 'Museums or markets?', a: { label: 'Museums & temples', tags: ['culture'] }, b: { label: 'Markets & malls', tags: ['shopping'] } },
  { id: 'fb5', prompt: 'Late nights or early trails?', a: { label: 'Late nights', tags: ['nightlife', 'late_night'] }, b: { label: 'Early trails', tags: ['early_start', 'long_walk'] } },
  { id: 'fb6', prompt: 'Beach shack or old town?', a: { label: 'Beach shack', tags: ['beach', 'food'] }, b: { label: 'Old town', tags: ['culture', 'city'] } },
  { id: 'fb7', prompt: 'Thrills or chills?', a: { label: 'Thrills', tags: ['adventure', 'long_walk'] }, b: { label: 'Chills', tags: ['beach', 'food'] } },
  { id: 'fb8', prompt: 'Forest or skyline?', a: { label: 'Forest', tags: ['nature'] }, b: { label: 'Skyline', tags: ['city', 'nightlife'] } },
]

/** Valid questions from candidates first, then fallbacks; relax the rule only if still short. */
export function buildPack(candidates: Question[], plans: Plan[], count: number): Question[] {
  let picked = selectQuestions(candidates, plans, count)
  if (picked.length < count) {
    const extra = selectQuestions(FALLBACK_QUESTIONS, plans, count).filter(
      (q) => !picked.some((p) => p.prompt === q.prompt),
    )
    picked = [...picked, ...extra].slice(0, count)
  }
  if (picked.length < count) {
    const rest = [...candidates, ...FALLBACK_QUESTIONS]
      .filter((q) => !picked.includes(q) && !q.a.tags.some((t) => q.b.tags.includes(t)))
      .map((q) => ({ q, s: evaluateQuestion(q, plans).separation }))
      .sort((a, b) => b.s - a.s)
      .map((x) => x.q)
    picked = [...picked, ...rest].slice(0, count)
  }
  return picked.map((q, i) => ({ ...q, id: `q${i}` }))
}
