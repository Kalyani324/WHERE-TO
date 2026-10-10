import { randomUUID } from 'node:crypto'
import { db } from './admin.js'
import {
  activePlans, activePlayers, connectedPlayers, countedQuizzes, countedUids, loadRoom, OpError, passportOf, proposerSet,
  roomRef, stepInputs, type RoomData,
} from './room.js'
import { aiGamePack, aiSidekick } from './aiJobs.js'
import { sampleStops, SAMPLES } from './samples.js'
import { LATE_GRACE_MS, MIN_PLAYERS, modeRules, PLAN_COLORS } from '../../src/shared/config.js'
import type { Phase, PublicPlan, RoomState } from '../../src/shared/schema.js'
import {
  buildPack, coinValues, computeFit, countedPlayers, dealbreakerConflicts, decideWinner, editTokens, eliminate, ENTRY_SCORE,
  entryForPlayer, groupProfile, implausible, journeyWarning, keepCount, normalizeName, overallResult, pickRandom, rng,
  revealCard, scoreRound1, scoreRound2, summarizeEntry, validStopCount, applyRunnerUpPick, resolveVetoes, planCost,
  RISK_LABEL, type AB, type KeepSkip, type QuizAnswer,
} from '../../src/engine/index.js'

type Updates = Record<string, unknown>
const now = () => Date.now()

const BOT_QUIZ: QuizAnswer[] = [
  { pace: 'relaxed', budget: 30000, maxHours: 8, dealbreakers: ['long_walk'] },
  { pace: 'packed', budget: 40000, maxHours: 9, dealbreakers: ['crowded'] },
  { pace: 'relaxed', budget: 22000, maxHours: 6, dealbreakers: ['early_start'] },
  { pace: 'packed', budget: 35000, maxHours: 8, dealbreakers: ['late_night'] },
  { pace: 'relaxed', budget: 18000, maxHours: 5, dealbreakers: ['crowded', 'early_start'] },
]

export const bots = (r: RoomData) => activePlayers(r).filter((u) => r.players[u].isBot)
const seedOf = (r: RoomData) => r.server.seed ?? r.meta.code

/** Writes demo-bot inputs for a step (dev flag only). Bots tap at random. */
function botInputs(r: RoomData, step: string, u: Updates) {
  const list = bots(r)
  if (!list.length) return
  const t = now()
  const rand = rng(`${seedOf(r)}:${step}:${t}`)
  const set = (uid: string, v: unknown) => {
    u[`inputs/${step}/${uid}`] = { v, t }
    u[`locks/${step}/${uid}`] = true
  }
  list.forEach((uid, i) => {
    if (step === 'proposals') {
      u[`locks/proposals/${uid}`] = true
    } else if (step === 'quiz') {
      u[`private/${uid}/quiz`] = { ...BOT_QUIZ[i % BOT_QUIZ.length], t }
      u[`locks/quiz/${uid}`] = true
    } else if (step === 'backing') {
      if (r.players[uid].role === 'proposer') return
      const plans = activePlans(r)
      if (plans.length) set(uid, plans[Math.floor(rand() * plans.length)].id)
    } else if (step.endsWith(':guess') || step.endsWith(':tap')) {
      set(uid, rand() < 0.5 ? 'a' : 'b')
    } else if (step.startsWith('r2:')) {
      set(uid, rand() < 0.6 ? 'keep' : 'skip')
    } else if (step === 'vote') {
      const f = r.results.finalists ?? []
      if (f.length) set(uid, f[Math.floor(rand() * f.length)])
    }
  })
}

/** Bots 0 and 1 propose sample plans (different destinations); the rest support. */
function botProposals(r: RoomData, u: Updates) {
  const list = bots(r).slice(0, 2)
  const taken = new Set(Object.values(r.plans).map((p) => normalizeName(p.destination)))
  const pool = SAMPLES.filter((s) => !taken.has(normalizeName(s.destination)))
  list.forEach((uid, i) => {
    const s = pool[(i * 3 + r.meta.code.charCodeAt(0)) % pool.length]
    if (!s) return
    u[`drafts/${uid}`] = {
      form: { destination: s.destination, country: s.country, mode: s.mode, hours: s.hours, journeyCost: s.journeyCost, stayPerNight: s.stayPerNight, mustDos: '' },
      stops: sampleStops(s, r.meta.days, `${uid}s`),
      source: 'sample',
      updatedAt: now(),
    }
    u[`server/estimates/${uid}`] = { hours: s.hours, cost: s.journeyCost }
  })
}

function stateFor(r: RoomData, phase: Phase, step: string, seconds: number | null, extra: Partial<RoomState> = {}): RoomState {
  return {
    phase,
    step,
    endsAt: seconds == null ? null : now() + seconds * 1000,
    paused: null,
    notice: null,
    quizExtended: r.state.quizExtended ?? false,
    hostNotice: r.state.hostNotice ?? null,
    ...extra,
  }
}

function enter(r: RoomData, u: Updates, st: RoomState) {
  u.state = st
  botInputs(r, st.step, u)
}

/** Plans get entry, plausibility and Fit recomputed from private data. */
export function recomputePlan(r: RoomData, p: PublicPlan): PublicPlan {
  const players = activePlayers(r)
  const statuses = players.map((uid) => entryForPlayer(passportOf(r, uid), p).status)
  const entry = summarizeEntry(statuses, p)
  const counted = countedQuizzes(r)
  const est = p.estimate ?? null
  const flags = Object.keys(r.server.flaggers?.[p.id] ?? {}).length
  const threshold = Math.min(3, Math.max(2, Math.ceil(0.3 * counted.length)))
  const checkBadge = implausible(p.journey, est) || flags >= threshold
  const withBadge = { ...p, checkBadge }
  const fit = computeFit(withBadge, counted, statuses.map((s) => ENTRY_SCORE[s]), r.meta.days)
  const prev = p.fit?.fit
  return {
    ...withBadge,
    entry,
    fit,
    fitDelta: prev != null ? Math.round((fit.fit - prev) * 10) / 10 : 0,
    flagCount: flags,
    conflicts: dealbreakerConflicts(withBadge, counted),
    journeyWarning: journeyWarning(p.journey.hours, r.meta.days),
  }
}

export function makePlan(r: RoomData, uid: string, planId: string): PublicPlan | null {
  const d = r.drafts[uid]
  if (!d) return null
  const f = d.form
  const idx = Object.keys(r.plans).length
  return {
    id: planId,
    owners: [uid],
    ownerNames: [r.players[uid]?.name ?? 'Player'],
    destination: f.destination,
    country: f.country,
    journey: { mode: f.mode, hours: Number(f.hours) || 0, cost: Number(f.journeyCost) || 0 },
    stayPerNight: Number(f.stayPerNight) || 0,
    stops: (d.stops ?? []).map((s) => ({ ...s, tags: s.tags ?? [], changedInVersion: 1 })),
    version: 1,
    estimate: r.server.estimates?.[uid] ?? null,
    checkBadge: false,
    status: 'active',
    color: PLAN_COLORS[idx % PLAN_COLORS.length],
    createdAt: now(),
  }
}

export async function sidekick(code: string, facts: string, fallback: string) {
  const ref = db().ref(`rooms/${code}/server/sidekickAt`)
  const tx = await ref.transaction((t: number | null) => (t && now() - t < 10000 ? undefined : now()))
  if (!tx.committed) return
  const requestedAt = now()
  const text = await aiSidekick(code, facts, fallback)
  if (now() - requestedAt > 15000) return
  const line = { text, at: now() }
  await db().ref(`rooms/${code}/sidekick`).update({ latest: line, [`history/${requestedAt}`]: line })
}

function allLocked(r: RoomData, step: string): boolean {
  const locks = r.locks[step] ?? {}
  let need = connectedPlayers(r)
  if (step === 'backing') need = need.filter((u) => r.players[u].role !== 'proposer')
  if (step.startsWith('r2:')) {
    const card = r.results.r2?.cards[r.state.card ?? 0]
    const owners = card ? r.plans[card.planId]?.owners ?? [] : []
    need = need.filter((u) => !owners.includes(u))
  }
  if (step === 'consolation') return false
  return need.length > 0 && need.every((u) => locks[u])
}

const r1Step = (q: number, sub: string) => `r1:${q}:${sub}`

/** Advance the room from `expected` step to the next one. Idempotent. */
export async function advance(code: string, expected: string, force = false): Promise<{ ok: boolean; step?: string; noop?: boolean }> {
  let r = await loadRoom(code)
  if (r.state.step !== expected) return { ok: true, noop: true }
  if (r.state.paused) return { ok: true, noop: true }
  const due = r.state.endsAt != null && now() >= r.state.endsAt - 250
  if (!due && !force && !allLocked(r, expected)) return { ok: true, noop: true }
  const lockRef = roomRef(code).child('server/lock')
  const tx = await lockRef.transaction((l: { step: string; at: number } | null) =>
    l && l.step === expected && now() - l.at < 25000 ? undefined : { step: expected, at: now() },
  )
  if (!tx.committed) return { ok: true, noop: true }
  r = await loadRoom(code)
  if (r.state.step !== expected) return { ok: true, noop: true }
  const u: Updates = {}
  const after: (() => Promise<void>)[] = []
  const rules = modeRules(r.meta.quick)
  const T = rules.timers
  const st = r.state
  const step = st.step

  if (step === 'quiz') {
    const subs = Object.fromEntries(Object.entries(r.private).filter(([, p]) => p.quiz).map(([k, p]) => [k, { t: p.quiz!.t }]))
    const counted = countedPlayers(subs, st.endsAt ?? now(), LATE_GRACE_MS).filter((uid) => r.players[uid] && !r.players[uid].removed)
    if (counted.length < MIN_PLAYERS) {
      if (!st.quizExtended) {
        enter(r, u, { ...st, endsAt: now() + T.quizExtend * 1000, quizExtended: true, notice: 'Fewer than 3 answers so far. Extended once.' })
      } else {
        u.state = { ...st, endsAt: null, notice: 'quiz-short' }
      }
    } else {
      for (const uid of activePlayers(r)) u[`players/${uid}/counted`] = counted.includes(uid)
      u['results/countedTotal'] = counted.length
      u['results/totalPlayers'] = activePlayers(r).length
      botProposals(r, u)
      enter(r, u, stateFor(r, 'proposals', 'proposals', T.proposals))
    }
  } else if (step === 'proposals') {
    // auto-lock drafts with ≥3 valid stops; others become supporters
    const plans = { ...r.plans }
    for (const uid of activePlayers(r)) {
      const d = r.drafts[uid]
      const p = r.players[uid]
      if (p.role === 'proposer' && p.planId && plans[p.planId]) continue
      if (d && !d.locked && validStopCount(d.stops ?? [], r.meta.days) >= 3 && d.form?.destination) {
        const id = `p${randomUUID().slice(0, 8)}`
        const plan = makePlan({ ...r, plans }, uid, id)
        if (plan) {
          plans[id] = plan
          u[`drafts/${uid}/locked`] = true
          u[`drafts/${uid}/planId`] = id
          u[`players/${uid}/role`] = 'proposer'
          u[`players/${uid}/planId`] = id
          continue
        }
      }
      u[`players/${uid}/role`] = 'supporter'
      u[`players/${uid}/planId`] = null
    }
    const n = Object.keys(plans).length
    if (n === 0) {
      enter(r, u, stateFor(r, 'proposals', `proposals`, T.proposals, { notice: 'No plans yet. Someone needs to propose a trip.' }))
      u[`server/lock`] = null
    } else if (n === 1) {
      for (const [id, p] of Object.entries(plans)) u[`plans/${id}`] = recomputePlan(r, p)
      enter(r, u, stateFor(r, 'single', 'single', null))
    } else {
      const rr = { ...r, plans }
      for (const [id, p] of Object.entries(plans)) u[`plans/${id}`] = recomputePlan(rr, p)
      u['results/profile'] = groupProfile(countedQuizzes(r))
      enter(r, u, stateFor(r, 'passport', 'passport', T.passport))
      const planList = Object.values(plans)
      after.push(async () => {
        const { candidates } = await aiGamePack(code, planList)
        const pack = buildPack(candidates, planList, rules.questions)
        await roomRef(code).child('pack').set(pack)
      })
      const prof = groupProfile(countedQuizzes(r))
      const top = prof.topDealbreaker
      const fb = `Median budget is ₹${prof.medianBudget.toLocaleString('en-IN')} and ${prof.relaxed} of ${prof.n} want it relaxed.${top ? ` ${top.count} of ${prof.n} want to avoid ${RISK_LABEL[top.tag as keyof typeof RISK_LABEL] ?? top.tag}.` : ''}`
      after.push(() => sidekick(code, fb, fb))
    }
  } else if (step === 'single') {
    return { ok: true, noop: true }
  } else if (step === 'passport') {
    if (!r.pack?.length) u.pack = buildPack([], activePlans(r), rules.questions)
    const anySupporter = activePlayers(r).some((uid) => r.players[uid].role !== 'proposer')
    if (anySupporter) enter(r, u, stateFor(r, 'backing', 'backing', T.backing))
    else enter(r, u, stateFor(r, 'r1', r1Step(0, 'guess'), T.guess, { q: 0, sub: 'guess' }))
  } else if (step === 'backing') {
    const backs = stepInputs<string>(r, 'backing')
    for (const [uid, b] of Object.entries(backs)) {
      if (r.players[uid]?.role === 'proposer' || b.t > (st.endsAt ?? 0) + LATE_GRACE_MS || !r.plans[b.v]) continue
      u[`server/backing/${uid}`] = b.v
    }
    const counts: Record<string, number> = {}
    for (const [uid, b] of Object.entries(backs)) if (u[`server/backing/${uid}`]) counts[b.v] = (counts[b.v] ?? 0) + 1
    for (const p of activePlans(r)) u[`plans/${p.id}/supporters`] = counts[p.id] ?? 0
    enter(r, u, stateFor(r, 'r1', r1Step(0, 'guess'), T.guess, { q: 0, sub: 'guess' }))
  } else if (step.startsWith('r1:')) {
    const q = st.q ?? 0
    const pack = r.pack ?? []
    if (st.sub === 'guess') enter(r, u, stateFor(r, 'r1', r1Step(q, 'tap'), T.tap, { q, sub: 'tap' }))
    else if (st.sub === 'tap') {
      const taps = validTaps<AB>(r, step)
      const o = overallResult(taps)
      u[`results/r1/questions/${pack[q]?.id ?? `q${q}`}`] = { id: pack[q]?.id ?? `q${q}`, a: o.a, b: o.b, result: o.result }
      enter(r, u, stateFor(r, 'r1', r1Step(q, 'reveal'), T.reveal, { q, sub: 'reveal' }))
    } else if (q + 1 < pack.length) {
      enter(r, u, stateFor(r, 'r1', r1Step(q + 1, 'guess'), T.guess, { q: q + 1, sub: 'guess' }))
    } else {
      scoreR1(r, u, rules.guessCap)
      enter(r, u, stateFor(r, 'results1', 'results1', T.results))
      after.push(() => {
        const ranked = activePlans(r).map((p) => p.destination)
        const fb = `Round 1 is in. ${ranked.length} plans still standing. Check the Fit tab before you edit.`
        return sidekick(code, fb, fb)
      })
    }
  } else if (step === 'results1') {
    enter(r, u, stateFor(r, 'edit1', 'edit1', T.edit))
  } else if (step === 'edit1' || step === 'edit2') {
    for (const p of activePlans(r)) {
      u[`plans/${p.id}/tokens`] = 0
      u[`plans/${p.id}/correctionAvailable`] = false
    }
    if (step === 'edit1') {
      const cards: { planId: string; stopId: string }[] = []
      const per: Record<string, string[]> = {}
      for (const p of activePlans(r)) {
        per[p.id] = pickRandom(p.stops.map((s) => s.id), rules.cardsPerPlan, `${seedOf(r)}:cards:${p.id}`)
        u[`plans/${p.id}/cards`] = per[p.id]
      }
      for (let i = 0; i < rules.cardsPerPlan; i++) for (const p of activePlans(r)) if (per[p.id][i]) cards.push({ planId: p.id, stopId: per[p.id][i] })
      u['results/r2/cards'] = cards
      const rr = { ...r, results: { ...r.results, r2: { cards } } }
      enter(rr, u, stateFor(rr, 'r2', 'r2:0', T.card, { card: 0 }))
    } else {
      const fin = r.results.finalists ?? activePlans(r).map((p) => p.id)
      const counted = countedQuizzes(r)
      for (const id of fin) {
        const p = recomputePlan(r, r.plans[id])
        delete u[`plans/${id}/tokens`]
        delete u[`plans/${id}/correctionAvailable`]
        u[`plans/${id}`] = { ...p, tokens: 0, correctionAvailable: false }
        u[`results/final/${id}`] = { conflicts: dealbreakerConflicts(p, counted), fit: p.fit?.fit ?? 0 }
      }
      enter(r, u, stateFor(r, 'finalcheck', 'finalcheck', T.finalcheck))
    }
  } else if (step.startsWith('r2:')) {
    const i = st.card ?? 0
    const cards = r.results.r2?.cards ?? []
    const card = cards[i]
    if (card) {
      const taps = validTaps<KeepSkip>(r, step)
      const owners = r.plans[card.planId]?.owners ?? []
      let keep = 0
      let skip = 0
      for (const [uid, v] of Object.entries(taps)) if (!owners.includes(uid)) v === 'keep' ? keep++ : skip++
      u[`results/r2/cardResults/${card.stopId}`] = { keep, skip, result: keep === skip ? 'tie' : keep > skip ? 'keep' : 'skip' }
    }
    if (i + 1 < cards.length) enter(r, u, stateFor(r, 'r2', `r2:${i + 1}`, T.card, { card: i + 1 }))
    else {
      scoreR2(r, u)
      enter(r, u, stateFor(r, 'results2', 'results2', T.results))
    }
  } else if (step === 'results2') {
    enter(r, u, stateFor(r, 'edit2', 'edit2', T.edit))
  } else if (step === 'finalcheck') {
    enter(r, u, stateFor(r, 'vote', 'vote', T.vote))
  } else if (step === 'vote') {
    reveal(r, u, false)
    enter(r, u, stateFor(r, 'reveal', 'consolation', T.consolation))
  } else if (step === 'consolation') {
    applyConsolations(r, u)
    u.state = stateFor(r, 'reveal', 'done', null)
  } else {
    return { ok: true, noop: true }
  }
  if (st.endsAt) u[`results/deadlines/${step.replace(/:/g, '_')}`] = st.endsAt
  u['server/lock'] = null
  await roomRef(code).update(u)
  for (const f of after) await f().catch((e) => console.error('after', e))
  return { ok: true, step: (u.state as RoomState | undefined)?.step }
}

function validTaps<T>(r: RoomData, step: string): Record<string, T> {
  const out: Record<string, T> = {}
  const endsAt = r.state.endsAt ?? now()
  for (const [uid, x] of Object.entries(stepInputs<T>(r, step))) {
    if (!r.players[uid] || r.players[uid].removed) continue
    if (x.t > endsAt + LATE_GRACE_MS) continue
    out[uid] = x.v
  }
  return out
}

function backingMap(r: RoomData, u: Updates): Record<string, string> {
  const out: Record<string, string> = { ...((r.server as { backing?: Record<string, string> }).backing ?? {}) }
  for (const [k, v] of Object.entries(u)) if (k.startsWith('server/backing/')) out[k.slice(15)] = v as string
  return out
}

function scoreR1(r: RoomData, u: Updates, guessCap: number) {
  const pack = r.pack ?? []
  const plans = activePlans(r)
  const taps: Record<string, Record<string, AB>> = {}
  const guesses: Record<string, Record<string, AB>> = {}
  pack.forEach((q, i) => {
    taps[q.id] = filterLate<AB>(r, r1Step(i, 'tap'))
    guesses[q.id] = filterLate<AB>(r, r1Step(i, 'guess'))
  })
  const backing = backingMap(r, u)
  const beneficiary: Record<string, string | undefined> = {}
  for (const uid of activePlayers(r)) {
    const p = r.players[uid]
    beneficiary[uid] = p.role === 'proposer' ? p.planId ?? undefined : backing[uid]
  }
  const res = scoreRound1({ plans, questions: pack, taps, guesses, proposers: proposerSet(r), beneficiary, guessCap })
  const keep = keepCount(plans.length, 1)
  const coin = coinValues(plans.map((p) => p.id), `${seedOf(r)}:coin:r1`)
  const elim = eliminate(
    plans.map((p) => ({ id: p.id, primary: res[p.id].total, roundScore: res[p.id].total, supporters: p.supporters ?? 0 })),
    keep,
    coin,
  )
  const pub: Record<string, unknown> = {}
  for (const p of plans) {
    const x = res[p.id]
    pub[p.id] = { perQuestion: x.perQuestion.map((q) => q.points), tapPoints: x.tapPoints, guessBonus: x.guessBonus, total: x.total }
    u[`plans/${p.id}/scores`] = { r1: x.total, total: x.total }
  }
  u['results/r1/plans'] = pub
  u['results/r1/kept'] = elim.kept
  u['results/r1/out'] = elim.out
  u['results/r1/coinFlip'] = elim.coinFlip
  u['results/r1/coinValues'] = coin
  u['results/fitVisible'] = true
  const tokens = editTokens(Object.fromEntries(elim.kept.map((id) => [id, res[id].total])))
  for (const id of elim.out) {
    u[`plans/${id}/status`] = 'out'
    u[`plans/${id}/outRound`] = 1
  }
  for (const id of elim.kept) {
    const p = recomputePlan(r, r.plans[id])
    u[`plans/${id}/fit`] = p.fit
    u[`plans/${id}/fitDelta`] = 0
    u[`plans/${id}/tokens`] = tokens[id]
    u[`plans/${id}/correctionAvailable`] = !!p.checkBadge && !r.plans[id].correctionUsed
  }
}

function filterLate<T>(r: RoomData, step: string): Record<string, T> {
  // Each step stores its own endsAt in history; we approximate with the inputs' own server timestamps
  // compared against the recorded deadline for that step.
  const deadlines = (r.results as { deadlines?: Record<string, number> }).deadlines ?? {}
  const endsAt = deadlines[step.replace(/:/g, '_')] ?? Number.MAX_SAFE_INTEGER
  const out: Record<string, T> = {}
  for (const [uid, x] of Object.entries(stepInputs<T>(r, step))) {
    if (!r.players[uid] || r.players[uid].removed) continue
    if (x.t > endsAt + LATE_GRACE_MS) continue
    out[uid] = x.v
  }
  return out
}

function scoreR2(r: RoomData, u: Updates) {
  const plans = activePlans(r)
  const cards = r.results.r2?.cards ?? []
  const per: Record<string, string[]> = {}
  const taps: Record<string, Record<string, KeepSkip>> = {}
  cards.forEach((c, i) => {
    ;(per[c.planId] ??= []).push(c.stopId)
    taps[c.stopId] = filterLate<KeepSkip>(r, `r2:${i}`)
  })
  // include the card currently being closed
  const last = cards[r.state.card ?? 0]
  if (last) taps[last.stopId] = validTaps<KeepSkip>(r, r.state.step)
  const counted = countedQuizzes(r)
  const res = scoreRound2({ plans, cards: per, taps, proposers: proposerSet(r), counted, days: r.meta.days })
  const cum: Record<string, number> = {}
  const pub: Record<string, unknown> = {}
  for (const p of plans) {
    const x = res[p.id]
    cum[p.id] = (p.scores?.r1 ?? 0) + x.total
    pub[p.id] = {
      cards: x.cards.map((c) => ({ stopId: c.stopId, points: c.points, weak: c.weak })),
      keepPoints: x.keepPoints, budgetShare: x.reality.budgetShare, journeyShare: x.reality.journeyShare,
      budgetPoints: x.reality.budgetPoints, journeyPoints: x.reality.journeyPoints, total: x.total, cumulative: cum[p.id],
    }
    u[`plans/${p.id}/scores`] = { r1: p.scores?.r1 ?? 0, r2: x.total, total: cum[p.id] }
    const weak = new Set(x.cards.filter((c) => c.weak).map((c) => c.stopId))
    p.stops.forEach((s, i) => {
      if (weak.has(s.id)) u[`plans/${p.id}/stops/${i}/weak`] = true
    })
    for (const c of x.cards) u[`server/stopScores/${c.stopId}`] = c.points
  }
  const coin = coinValues(plans.map((p) => p.id), `${seedOf(r)}:coin:r2`)
  const elim = eliminate(
    plans.map((p) => ({ id: p.id, primary: cum[p.id], roundScore: res[p.id].total, supporters: p.supporters ?? 0 })),
    keepCount(plans.length, 2),
    coin,
  )
  u['results/r2/plans'] = pub
  u['results/r2/kept'] = elim.kept
  u['results/r2/out'] = elim.out
  u['results/r2/coinFlip'] = elim.coinFlip
  u['results/finalists'] = elim.kept
  for (const id of elim.out) {
    u[`plans/${id}/status`] = 'out'
    u[`plans/${id}/outRound`] = 2
  }
  const tokens = editTokens(Object.fromEntries(elim.kept.map((id) => [id, res[id].total])))
  for (const id of elim.kept) u[`plans/${id}/tokens`] = tokens[id]
}

export function reveal(r: RoomData, u: Updates, single: boolean) {
  const counted = countedQuizzes(r)
  const finalists = single ? Object.keys(r.plans) : r.results.finalists ?? activePlans(r).map((p) => p.id)
  const votes: Record<string, string> = {}
  if (!single) for (const [uid, v] of Object.entries(validTaps<string>(r, 'vote'))) if (finalists.includes(v)) votes[uid] = v
  const conflicts = Object.fromEntries(finalists.map((id) => [id, dealbreakerConflicts(r.plans[id], counted)]))
  const cumulative = Object.fromEntries(finalists.map((id) => [id, r.plans[id].scores?.total ?? 0]))
  const coin = coinValues(finalists, `${seedOf(r)}:coin:final`)
  const w = decideWinner(finalists, votes, conflicts, cumulative, coin)
  const plan = recomputePlan(r, r.plans[w.winner])
  const runnerUp = finalists.find((f) => f !== w.winner) ?? null
  u['results/reveal'] = {
    winner: w.winner,
    runnerUp,
    tally: w.tally,
    tieBreak: w.tieBreak,
    voters: Object.keys(votes).length,
    card: revealCard(plan, counted, r.meta.days),
    entry: plan.entry,
    single,
    consolation: { done: single },
  }
}

function applyConsolations(r: RoomData, u: Updates) {
  const rev = r.results.reveal
  if (!rev) return
  const plan = r.plans[rev.winner]
  let stops = plan.stops
  const version = plan.version + 1
  const pick = (r.server as { runnerUpPick?: import('../../src/engine/index.js').Stop }).runnerUpPick
  let pickRes: { stop: unknown; replaced: string | null } | null = null
  if (pick) {
    const res = applyRunnerUpPick(stops, { ...pick, changedInVersion: version }, r.server.stopScores ?? {})
    stops = res.stops
    pickRes = { stop: pick, replaced: res.replaced }
  }
  const eliminatedProposers = new Set(Object.values(r.plans).filter((p) => p.status === 'out').flatMap((p) => p.owners))
  const noms: Record<string, string> = {}
  for (const [uid, v] of Object.entries(validTaps<string>(r, 'consolation'))) if (eliminatedProposers.has(uid)) noms[uid] = v
  const coin = coinValues(stops.map((s) => s.id), `${seedOf(r)}:coin:veto`)
  const v = resolveVetoes(stops, noms, coin)
  stops = stops.filter((s) => !v.vetoed.includes(s.id))
  const filled: unknown[] = []
  const fillers = ((r.server as { fillers?: Record<string, import('../../src/engine/index.js').Stop> }).fillers ?? {})
  for (const d of v.emptyDays) {
    const f = fillers[d] ?? { id: `fill${d}`, name: 'Free time to explore', day: d, slot: 'afternoon', cost: 0, tags: ['nature'], note: 'Added after a veto emptied this day.' }
    const s = { ...f, day: d, changedInVersion: version }
    stops.push(s as never)
    filled.push(s)
  }
  const changed = !!pick || v.vetoed.length > 0
  if (changed) {
    u[`plans/${plan.id}/stops`] = stops
    u[`plans/${plan.id}/version`] = version
  }
  u['results/reveal/consolation'] = {
    pick: pickRes,
    vetoed: v.vetoed,
    vetoedNames: plan.stops.filter((s) => v.vetoed.includes(s.id)).map((s) => s.name),
    filled,
    agreed: { cost: planCost({ ...plan, stops }, r.meta.days), stops: stops.length },
    done: true,
  }
}

export function checkStepOpen(r: RoomData, steps: string[]) {
  if (!steps.includes(r.state.step)) throw new OpError('That window is closed.', 409)
  if (r.state.endsAt && now() > r.state.endsAt + LATE_GRACE_MS) throw new OpError('Time is up.', 409)
}

export { countedUids, stateFor, enter }
