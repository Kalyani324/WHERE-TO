import type { AB, KeepSkip, Plan, QuizAnswer, Question, Tag } from './types.js'
import { matchPoints, sharePoints } from './tables.js'
import { scoredCost, scoredHours } from './plan.js'

/** Rival-weight rule: owners excluded, other proposers at half weight, everyone else full. */
export function tapWeight(voter: string, plan: Pick<Plan, 'owners'>, proposers: ReadonlySet<string>): number {
  if (plan.owners.includes(voter)) return 0
  if (proposers.has(voter)) return 0.5
  return 1
}

export function matchShare(plan: Pick<Plan, 'stops'>, tags: readonly Tag[]): number {
  if (plan.stops.length === 0) return 0
  const set = new Set(tags)
  const n = plan.stops.filter((s) => s.tags.some((t) => set.has(t))).length
  return n / plan.stops.length
}

export type Overall = AB | 'split'

/** Overall, unweighted result shown on screen. */
export function overallResult(taps: Record<string, AB>): { a: number; b: number; result: Overall } {
  let a = 0
  let b = 0
  for (const v of Object.values(taps)) v === 'a' ? a++ : b++
  return { a, b, result: a === b ? 'split' : a > b ? 'a' : 'b' }
}

export interface QuestionPlanScore {
  winner: AB | 'tie'
  points: number
  share: number
}

export function questionScoreForPlan(
  plan: Plan,
  q: Question,
  taps: Record<string, AB>,
  proposers: ReadonlySet<string>,
): QuestionPlanScore {
  let wa = 0
  let wb = 0
  for (const [uid, v] of Object.entries(taps)) {
    const w = tapWeight(uid, plan, proposers)
    if (v === 'a') wa += w
    else wb += w
  }
  const sa = matchShare(plan, q.a.tags)
  const sb = matchShare(plan, q.b.tags)
  if (wa === wb) {
    const pa = matchPoints(sa)
    const pb = matchPoints(sb)
    return pa >= pb ? { winner: 'tie', points: pa, share: sa } : { winner: 'tie', points: pb, share: sb }
  }
  const winner: AB = wa > wb ? 'a' : 'b'
  const share = winner === 'a' ? sa : sb
  return { winner, points: matchPoints(share), share }
}

export interface Round1Input {
  plans: Plan[]
  questions: Question[]
  /** questionId → uid → tap */
  taps: Record<string, Record<string, AB>>
  /** questionId → uid → guess */
  guesses: Record<string, Record<string, AB>>
  /** uids owning any plan */
  proposers: ReadonlySet<string>
  /** uid → plan that benefits from their guesses (own plan or backed plan). */
  beneficiary: Record<string, string | undefined>
  guessCap: number
}

export interface Round1PlanResult {
  perQuestion: QuestionPlanScore[]
  tapPoints: number
  correctGuesses: number
  guessBonus: number
  total: number
}

export function guessIsCorrect(guess: AB | undefined, overall: Overall): boolean {
  if (!guess) return false
  return overall === 'split' || guess === overall
}

export function scoreRound1(input: Round1Input): Record<string, Round1PlanResult> {
  const out: Record<string, Round1PlanResult> = {}
  const correct: Record<string, number> = {}
  for (const q of input.questions) {
    const overall = overallResult(input.taps[q.id] ?? {}).result
    for (const [uid, g] of Object.entries(input.guesses[q.id] ?? {})) {
      const pid = input.beneficiary[uid]
      if (!pid) continue
      if (guessIsCorrect(g, overall)) correct[pid] = (correct[pid] ?? 0) + 1
    }
  }
  for (const plan of input.plans) {
    const perQuestion = input.questions.map((q) => questionScoreForPlan(plan, q, input.taps[q.id] ?? {}, input.proposers))
    const tapPoints = perQuestion.reduce((s, x) => s + x.points, 0)
    const c = correct[plan.id] ?? 0
    const guessBonus = Math.min(input.guessCap, c)
    out[plan.id] = { perQuestion, tapPoints, correctGuesses: c, guessBonus, total: tapPoints + guessBonus }
  }
  return out
}

export interface CardResult {
  stopId: string
  keep: number
  skip: number
  points: number
  weak: boolean
}

export function keepSkipCard(
  plan: Plan,
  stopId: string,
  taps: Record<string, KeepSkip>,
  proposers: ReadonlySet<string>,
): CardResult {
  let keep = 0
  let skip = 0
  for (const [uid, v] of Object.entries(taps)) {
    const w = tapWeight(uid, plan, proposers)
    if (v === 'keep') keep += w
    else skip += w
  }
  if (keep > skip) return { stopId, keep, skip, points: 2, weak: false }
  if (keep === skip) return { stopId, keep, skip, points: 1, weak: false }
  return { stopId, keep, skip, points: 0, weak: true }
}

export interface RealityCheck {
  n: number
  cost: number
  hours: number
  budgetCount: number
  journeyCount: number
  budgetShare: number
  journeyShare: number
  budgetPoints: number
  journeyPoints: number
}

export function realityCheck(plan: Plan, counted: QuizAnswer[], days: number): RealityCheck {
  const cost = scoredCost(plan, days)
  const hours = scoredHours(plan)
  const n = counted.length
  const budgetCount = counted.filter((q) => q.budget >= cost).length
  const journeyCount = counted.filter((q) => q.maxHours >= hours).length
  const budgetShare = n ? budgetCount / n : 0
  const journeyShare = n ? journeyCount / n : 0
  return {
    n,
    cost,
    hours,
    budgetCount,
    journeyCount,
    budgetShare,
    journeyShare,
    budgetPoints: sharePoints(budgetShare),
    journeyPoints: sharePoints(journeyShare),
  }
}

export interface Round2PlanResult {
  cards: CardResult[]
  keepPoints: number
  reality: RealityCheck
  total: number
}

export interface Round2Input {
  plans: Plan[]
  /** planId → stopIds (stored random picks) */
  cards: Record<string, string[]>
  /** stopId → uid → tap */
  taps: Record<string, Record<string, KeepSkip>>
  proposers: ReadonlySet<string>
  counted: QuizAnswer[]
  days: number
}

export function scoreRound2(input: Round2Input): Record<string, Round2PlanResult> {
  const out: Record<string, Round2PlanResult> = {}
  for (const plan of input.plans) {
    const cards = (input.cards[plan.id] ?? []).map((sid) => keepSkipCard(plan, sid, input.taps[sid] ?? {}, input.proposers))
    const keepPoints = cards.reduce((s, c) => s + c.points, 0)
    const reality = realityCheck(plan, input.counted, input.days)
    out[plan.id] = { cards, keepPoints, reality, total: keepPoints + reality.budgetPoints + reality.journeyPoints }
  }
  return out
}
