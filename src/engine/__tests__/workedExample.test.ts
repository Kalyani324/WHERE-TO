import { describe, expect, it } from 'vitest'
import {
  applyEdit, applyRunnerUpPick, computeFit, dealbreakerConflicts, decideWinner, editFacts, editTokens, eliminate,
  ENTRY_SCORE, entryForPlayer, fallbackEditComment, groupProfile, keepCount, overallResult, planCost, planPace,
  planRiskTags, realityCheck, resolveVetoes, revealCard, scoreRound1, scoreRound2, summarizeEntry, VISA_GUY_CHECKER,
} from '../index'
import type { AB, KeepSkip, Plan, QuizAnswer, Question, Stop, Tag } from '../index'

// Section 15 worked example: test data only.
const DAYS = 3
const P = ['anu', 'ben', 'chitra', 'dev', 'eesha', 'faris', 'gita', 'hari'] as const
type Uid = (typeof P)[number]

const quiz: Record<Uid, QuizAnswer> = {
  anu: { budget: 40000, maxHours: 9, pace: 'packed', dealbreakers: ['crowded'] },
  ben: { budget: 35000, maxHours: 8, pace: 'packed', dealbreakers: ['long_walk'] },
  chitra: { budget: 38000, maxHours: 8, pace: 'relaxed', dealbreakers: ['long_walk', 'crowded'] },
  dev: { budget: 18000, maxHours: 5, pace: 'relaxed', dealbreakers: ['early_start'] },
  eesha: { budget: 30000, maxHours: 7, pace: 'relaxed', dealbreakers: ['long_walk'] },
  faris: { budget: 33000, maxHours: 9, pace: 'packed', dealbreakers: ['late_night'] },
  gita: { budget: 22000, maxHours: 6, pace: 'relaxed', dealbreakers: ['crowded', 'early_start'] },
  hari: { budget: 36000, maxHours: 8, pace: 'relaxed', dealbreakers: ['long_walk'] },
}
const counted = P.map((p) => quiz[p])

let sid = 0
const stop = (day: number, tags: Tag[], cost: number, name = `stop${++sid}`): Stop => ({
  id: name, name, day, slot: 'morning', cost, tags, note: '',
})

const mkPlan = (id: string, owner: Uid, destination: string, country: string, hours: number, journeyCost: number, stay: number, stops: Stop[]): Plan => ({
  id, owners: [owner], destination, country, journey: { mode: 'train', hours, cost: journeyCost }, stayPerNight: stay,
  stops, version: 1, status: 'active', estimate: { hours, cost: journeyCost }, checkBadge: false,
})

const gokarna = mkPlan('gokarna', 'anu', 'Gokarna', 'India', 7, 3000, 1000, [
  stop(1, ['beach', 'long_walk', 'nature'], 300, 'g-coastal-walk'),
  stop(1, ['beach', 'nature'], 300, 'g2'),
  stop(1, ['beach', 'food'], 400, 'g3'),
  stop(2, ['beach', 'adventure'], 400, 'g4'),
  stop(2, ['beach', 'food'], 300, 'g5'),
  stop(2, ['hills', 'early_start'], 300, 'g-sunrise-trek'),
  stop(3, ['nature'], 300, 'g7'),
  stop(3, ['hills'], 400, 'g8'),
  stop(3, ['culture', 'food'], 300, 'g9'),
])
const ooty = mkPlan('ooty', 'ben', 'Ooty', 'India', 5.5, 3000, 2500, [
  stop(1, ['hills', 'nature'], 500, 'o1'),
  stop(1, ['nature', 'crowded'], 500, 'o-lake-boating'),
  stop(2, ['hills', 'food'], 500, 'o3'),
  stop(2, ['nature'], 500, 'o4'),
  stop(3, ['hills', 'food'], 500, 'o5'),
  stop(3, ['culture', 'shopping'], 500, 'o6'),
])
const dubai = mkPlan('dubai', 'chitra', 'Dubai', 'United Arab Emirates', 7, 20000, 3000, [
  stop(1, ['beach'], 1000, 'd1'),
  stop(1, ['city', 'shopping', 'crowded'], 1000, 'd-mall'),
  stop(2, ['food', 'city'], 1000, 'd3'),
  stop(2, ['nature', 'adventure', 'late_night'], 1000, 'd-desert-safari'),
  stop(3, ['food', 'culture'], 1000, 'd5'),
  stop(3, ['city', 'culture'], 1000, 'd6'),
])
const wayanad = mkPlan('wayanad', 'dev', 'Wayanad', 'India', 2.5, 1000, 1500, [
  stop(1, ['nature', 'long_walk'], 400, 'w1'),
  stop(1, ['hills'], 300, 'w2'),
  stop(2, ['nature'], 300, 'w3'),
  stop(2, ['hills'], 300, 'w4'),
  stop(3, ['nature', 'food'], 400, 'w5'),
  stop(3, ['culture'], 300, 'w6'),
])
const plans = [gokarna, ooty, dubai, wayanad]
const proposers = new Set<string>(['anu', 'ben', 'chitra', 'dev'])
const backing: Record<string, string> = { eesha: 'gokarna', faris: 'gokarna', gita: 'wayanad', hari: 'dubai' }
const beneficiary: Record<string, string> = { anu: 'gokarna', ben: 'ooty', chitra: 'dubai', dev: 'wayanad', ...backing }
const supporters = (id: string) => Object.values(backing).filter((b) => b === id).length

const questions: Question[] = [
  { id: 'q1', prompt: 'Sea breeze or hill mist?', a: { label: 'Sea breeze', tags: ['beach'] }, b: { label: 'Hill mist', tags: ['hills'] } },
  { id: 'q2', prompt: 'City day or nature day?', a: { label: 'City day', tags: ['city', 'shopping'] }, b: { label: 'Nature day', tags: ['nature', 'hills'] } },
  { id: 'q3', prompt: 'Food crawl or adventure day?', a: { label: 'Food crawl', tags: ['food'] }, b: { label: 'Adventure day', tags: ['adventure'] } },
]
const taps = (aSide: Uid[]): Record<string, AB> => Object.fromEntries(P.map((p) => [p, aSide.includes(p) ? 'a' : 'b']))
const r1Taps = {
  q1: taps(['anu', 'chitra', 'eesha', 'faris', 'hari']), // sea 5-3
  q2: taps(['chitra', 'faris']), // nature 6-2
  q3: taps(['ben', 'chitra', 'eesha', 'gita', 'hari']), // food 5-3
}
const r1Guesses: Record<string, Record<string, AB>> = {
  q1: { anu: 'a', eesha: 'a', ben: 'b', dev: 'b', gita: 'b', chitra: 'a', hari: 'b', faris: 'b' },
  q2: { faris: 'b', hari: 'b', chitra: 'a', ben: 'a', dev: 'a', gita: 'a', anu: 'a', eesha: 'a' },
  q3: { hari: 'b', chitra: 'b', ben: 'a', dev: 'b', gita: 'b', anu: 'b', eesha: 'b', faris: 'b' },
}

const entryScores = (plan: Plan) => P.map(() => ENTRY_SCORE[entryForPlayer('India', plan).status])
const fitOf = (plan: Plan) => computeFit(plan, counted, entryScores(plan), DAYS)

describe('Section 15 setup', () => {
  it('plan costs, pace and risk tags match the proposals table', () => {
    expect(planCost(gokarna, DAYS)).toBe(8000)
    expect(planCost(ooty, DAYS)).toBe(11000)
    expect(planCost(dubai, DAYS)).toBe(32000)
    expect(planCost(wayanad, DAYS)).toBe(6000)
    expect(planPace(gokarna.stops, DAYS)).toBe('packed')
    expect(planPace(ooty.stops, DAYS)).toBe('relaxed')
    expect(planRiskTags(gokarna.stops)).toEqual(['long_walk', 'early_start'])
    expect(planRiskTags(ooty.stops)).toEqual(['crowded'])
    expect(planRiskTags(dubai.stops)).toEqual(['crowded', 'late_night'])
    expect(planRiskTags(wayanad.stops)).toEqual(['long_walk'])
  })

  it('group profile: median ₹34,000, 5 of 8 relaxed, long walks top dealbreaker 4 of 8', () => {
    const g = groupProfile(counted)
    expect(g.n).toBe(8)
    expect(g.medianBudget).toBe(34000)
    expect(g.relaxed).toBe(5)
    expect(g.topDealbreaker).toEqual({ tag: 'long_walk', count: 4 })
  })

  it('entry: Gokarna/Ooty/Wayanad none, Dubai Visa: Easy', () => {
    expect(entryForPlayer('India', gokarna).status).toBe('none')
    expect(entryForPlayer('India', ooty).status).toBe('none')
    expect(entryForPlayer('India', dubai).status).toBe('visa_easy')
  })
})

describe('Round 1', () => {
  const r1 = scoreRound1({ plans, questions, taps: r1Taps, guesses: r1Guesses, proposers, beneficiary, guessCap: 2 })

  it('overall results: sea 5-3, nature 6-2, food 5-3', () => {
    expect(overallResult(r1Taps.q1)).toEqual({ a: 5, b: 3, result: 'a' })
    expect(overallResult(r1Taps.q2)).toEqual({ a: 2, b: 6, result: 'b' })
    expect(overallResult(r1Taps.q3)).toEqual({ a: 5, b: 3, result: 'a' })
  })

  it('weighting never changed the winners', () => {
    for (const p of plans) expect(r1[p.id].perQuestion.map((x) => x.winner)).toEqual(['a', 'b', 'a'])
  })

  it('per-question points, guess bonus and totals', () => {
    expect(r1.gokarna.perQuestion.map((x) => x.points)).toEqual([3, 3, 2])
    expect(r1.ooty.perQuestion.map((x) => x.points)).toEqual([0, 3, 2])
    expect(r1.dubai.perQuestion.map((x) => x.points)).toEqual([1, 1, 2])
    expect(r1.wayanad.perQuestion.map((x) => x.points)).toEqual([0, 3, 1])
    expect([r1.gokarna.tapPoints, r1.ooty.tapPoints, r1.dubai.tapPoints, r1.wayanad.tapPoints]).toEqual([8, 5, 4, 4])
    expect(r1.gokarna.correctGuesses).toBe(3)
    expect([r1.gokarna.guessBonus, r1.ooty.guessBonus, r1.dubai.guessBonus, r1.wayanad.guessBonus]).toEqual([2, 1, 2, 0])
    expect([r1.gokarna.total, r1.ooty.total, r1.dubai.total, r1.wayanad.total]).toEqual([10, 6, 6, 4])
  })

  it('N = 4 keeps 3: Wayanad is out', () => {
    expect(keepCount(4, 1)).toBe(3)
    const res = eliminate(
      plans.map((p) => ({ id: p.id, primary: r1[p.id].total, roundScore: r1[p.id].total, supporters: supporters(p.id) })),
      3,
      {},
    )
    expect(res.out).toEqual(['wayanad'])
    expect(res.kept.sort()).toEqual(['dubai', 'gokarna', 'ooty'])
  })

  it('Quick Mode caps the Guess bonus at +1', () => {
    const q = scoreRound1({ plans, questions, taps: r1Taps, guesses: r1Guesses, proposers, beneficiary, guessCap: 1 })
    expect(q.gokarna.guessBonus).toBe(1)
    expect(q.dubai.guessBonus).toBe(1)
  })
})

// Edits applied during the first edit window
const gokarna2 = applyEdit(gokarna, { kind: 'swap', stopId: 'g-sunrise-trek', stop: stop(2, ['beach', 'food'], 300, 'g-beach-cafe') }, DAYS).plan
const ooty2 = applyEdit(ooty, { kind: 'remove', stopId: 'o-lake-boating' }, DAYS).plan
const dubai2 = applyEdit(dubai, { kind: 'swap', stopId: 'd-mall', stop: stop(1, ['culture'], 1000, 'd-creek-boat') }, DAYS).plan

describe('Fit Meter and edits', () => {
  it('Fit appears: Ooty 82.5, Gokarna 67.5, Dubai 66', () => {
    expect(fitOf(ooty).fit).toBe(82.5)
    expect(fitOf(gokarna).fit).toBe(67.5)
    expect(fitOf(dubai).fit).toBe(66)
  })

  it('edit tokens: Anu 2, Ben 1, Chitra 1', () => {
    expect(editTokens({ gokarna: 10, ooty: 6, dubai: 6 })).toEqual({ gokarna: 2, ooty: 1, dubai: 1 })
  })

  it('dealbreaker fit changes: 25→50, 62.5→100, 50→87.5', () => {
    expect(fitOf(gokarna).parts.dealbreakers).toBe(25)
    expect(fitOf(gokarna2).parts.dealbreakers).toBe(50)
    expect(fitOf(ooty).parts.dealbreakers).toBe(62.5)
    expect(fitOf(ooty2).parts.dealbreakers).toBe(100)
    expect(fitOf(dubai).parts.dealbreakers).toBe(50)
    expect(fitOf(dubai2).parts.dealbreakers).toBe(87.5)
  })

  it('edits bump version and mark new stops', () => {
    expect(gokarna2.version).toBe(2)
    expect(gokarna2.stops.find((s) => s.id === 'g-beach-cafe')?.changedInVersion).toBe(2)
  })

  it('Fit after edits: Ooty 90, Dubai 73.5, Gokarna 72.5', () => {
    expect(fitOf(ooty2).fit).toBe(90)
    expect(fitOf(dubai2).fit).toBe(73.5)
    expect(fitOf(gokarna2).fit).toBe(72.5)
  })

  it('sidekick facts: 2 fewer players have a conflict, long walk still bothers 4 of 8', () => {
    const f = editFacts(gokarna, gokarna2, counted)
    expect(f.removed).toEqual(['early_start'])
    expect(f.conflictDelta).toBe(2)
    expect(f.remaining).toEqual({ tag: 'long_walk', count: 4 })
    expect(fallbackEditComment(f)).toBe('Gokarna dropped the early start, so 2 fewer players have a conflict. The long walk still bothers 4 of 8.')
  })
})

describe('Round 2', () => {
  const active = [gokarna2, ooty2, dubai2]
  const cards = { gokarna: ['g2', 'g3', 'g4'], ooty: ['o1', 'o3', 'o4'], dubai: ['d1', 'd3', 'd5'] }
  const all = (v: KeepSkip): Record<string, KeepSkip> => Object.fromEntries(P.map((p) => [p, v]))
  const r2Taps = { g2: all('keep'), g3: all('keep'), g4: all('skip'), o1: all('keep'), o3: all('skip'), o4: all('skip'), d1: all('keep'), d3: all('keep'), d5: all('skip') }
  const r2 = scoreRound2({ plans: active, cards, taps: r2Taps, proposers, counted, days: DAYS })

  it('keep or skip, budget and journey shares, round totals', () => {
    expect([r2.gokarna.keepPoints, r2.ooty.keepPoints, r2.dubai.keepPoints]).toEqual([4, 2, 4])
    expect(r2.gokarna.reality.budgetShare).toBe(1)
    expect(r2.gokarna.reality.journeyShare).toBe(0.75)
    expect(r2.ooty.reality.budgetShare).toBe(1)
    expect(r2.ooty.reality.journeyShare).toBe(0.875)
    expect(r2.dubai.reality.budgetShare).toBe(0.625)
    expect(r2.dubai.reality.journeyShare).toBe(0.75)
    expect([r2.gokarna.reality.budgetPoints, r2.gokarna.reality.journeyPoints]).toEqual([3, 3])
    expect([r2.ooty.reality.budgetPoints, r2.ooty.reality.journeyPoints]).toEqual([3, 3])
    expect([r2.dubai.reality.budgetPoints, r2.dubai.reality.journeyPoints]).toEqual([2, 3])
    expect([r2.gokarna.total, r2.ooty.total, r2.dubai.total]).toEqual([10, 8, 9])
    expect(r2.ooty.cards.filter((c) => c.weak).length).toBe(2)
  })

  it('cumulative 20 / 15 / 14: Ooty out by one point', () => {
    const cum = { gokarna: 10 + 10, dubai: 6 + 9, ooty: 6 + 8 }
    expect(cum).toEqual({ gokarna: 20, dubai: 15, ooty: 14 })
    const res = eliminate(
      active.map((p) => ({ id: p.id, primary: cum[p.id as keyof typeof cum], roundScore: r2[p.id].total, supporters: supporters(p.id) })),
      keepCount(3, 2),
      {},
    )
    expect(res.kept).toEqual(['gokarna', 'dubai'])
    expect(res.out).toEqual(['ooty'])
    expect(editTokens({ gokarna: r2.gokarna.total, dubai: r2.dubai.total })).toEqual({ gokarna: 2, dubai: 1 })
  })
})

describe('Final', () => {
  const dubai3 = applyEdit(dubai2, { kind: 'swap', stopId: 'd-desert-safari', stop: stop(2, ['nature', 'adventure'], 1000, 'd-sunset-drive') }, DAYS).plan

  it('final edit: Dubai has no risk tags, Fit 76', () => {
    expect(planRiskTags(dubai3.stops)).toEqual([])
    expect(fitOf(dubai3).fit).toBe(76)
  })

  it('final check: Gokarna 4 conflicts, Dubai 0', () => {
    expect(dealbreakerConflicts(gokarna2, counted)).toBe(4)
    expect(dealbreakerConflicts(dubai3, counted)).toBe(0)
  })

  it('4-4 tie, fewer conflicts: Dubai wins', () => {
    const votes = { chitra: 'dubai', hari: 'dubai', ben: 'dubai', faris: 'dubai', anu: 'gokarna', eesha: 'gokarna', dev: 'gokarna', gita: 'gokarna' }
    const w = decideWinner(['gokarna', 'dubai'], votes, { gokarna: 4, dubai: 0 }, { gokarna: 20, dubai: 15 }, {})
    expect(w.tally).toEqual({ gokarna: 4, dubai: 4 })
    expect(w.winner).toBe('dubai')
    expect(w.tieBreak).toBe('conflicts')
  })

  it('reveal card for Dubai as voted', () => {
    const r = revealCard(dubai3, counted, DAYS)
    expect(r.cost).toBe(32000)
    expect(r.affordCount).toBe(5)
    expect(r.n - r.affordCount).toBe(3)
    expect(r.journeyOkCount).toBe(6)
    expect(r.pace).toBe('relaxed')
    expect(r.paceFitCount).toBe(5)
    expect(r.conflicts).toBe(0)
    const e = summarizeEntry(P.map(() => entryForPlayer('India', dubai3).status), dubai3)
    expect(e.visaCount).toBe(8)
    expect(e.visaTier).toBe('visa_easy')
    expect(e.label).toBe('8 of 8 need a visa (Easy)')
    expect(e.showVisaGuy).toBe(true)
    expect(e.visaGuyUrl).toBe(VISA_GUY_CHECKER)
  })

  it('if Gokarna had won: "No visa needed" and no button', () => {
    const e = summarizeEntry(P.map(() => entryForPlayer('India', gokarna2).status), gokarna2)
    expect(e.label).toBe('No visa needed')
    expect(e.showVisaGuy).toBe(false)
  })

  it('consolation: runner-up restaurant added, 2 vetoes within cap, stays above 3 stops', () => {
    const pick = applyRunnerUpPick(dubai3.stops, stop(2, ['food'], 1500, 'd-restaurant'))
    expect(pick.replaced).toBeNull()
    expect(pick.stops.length).toBe(7)
    const v = resolveVetoes(pick.stops, { ben: 'd1', dev: 'd5' }, {})
    expect(v.vetoed.sort()).toEqual(['d1', 'd5'])
    expect(pick.stops.length - v.vetoed.length).toBeGreaterThanOrEqual(3)
    expect(v.emptyDays).toEqual([])
  })

  it('reality check helper agrees with reveal card', () => {
    const rc = realityCheck(dubai3, counted, DAYS)
    expect(rc.budgetCount).toBe(5)
    expect(rc.journeyCount).toBe(6)
  })
})
