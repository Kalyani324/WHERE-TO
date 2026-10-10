import { randomUUID } from 'node:crypto'
import { roomRef, loadRoom, OpError, activePlayers, connectedPlayers, humanCount, activePlans, countedQuizzes, type RoomData } from './room.js'
import { advance, bots, checkStepOpen, enter, makePlan, recomputePlan, reveal, sidekick, stateFor } from './flow.js'
import { aiDraft, aiEditOptions, aiTitle, fallbackTitle, type DraftInput } from './aiJobs.js'
import { db } from './admin.js'
import { AVATARS, MAX_PLAYERS, MIN_PLAYERS, modeRules, type Avatar } from '../../src/shared/config.js'
import type { PublicPlan } from '../../src/shared/schema.js'
import {
  applyEdit, cleanText, editFacts, fallbackEditComment, isProfane, MODES, normalizeName, SLOTS, sanitizeTags, validateStops,
  type EditAction, type Mode, type Stop,
} from '../../src/engine/index.js'

type Body = Record<string, unknown>
const now = () => Date.now()
const LETTERS = 'ABCDEFGHJKLMNPQRSTUVWXYZ'
const BOT_NAMES = ['Asha', 'Rohan', 'Meera', 'Kabir', 'Zoya', 'Arjun', 'Isha', 'Dev', 'Tara']

const str = (v: unknown, max = 200) => cleanText(v, max)
const num = (v: unknown, min = 0, max = 1e7) => Math.min(max, Math.max(min, Math.round(Number(v) || 0)))

function safeName(v: unknown): string {
  const n = str(v, 20)
  if (!n) throw new OpError('Pick a nickname.')
  if (isProfane(n)) throw new OpError('Please pick a different nickname.')
  return n
}

function requirePlayer(r: RoomData, uid: string) {
  const p = r.players[uid]
  if (!p || p.removed) throw new OpError('You are not in this room.', 403)
  return p
}
function requireHost(r: RoomData, uid: string) {
  if (r.meta.hostUid !== uid) throw new OpError('Only the host can do that.', 403)
}

function cleanStop(raw: unknown, days: number): Stop {
  const r = (raw ?? {}) as Record<string, unknown>
  const name = str(r.name, 60)
  if (!name) throw new OpError('Each stop needs a name.')
  return {
    id: str(r.id, 40) || `s${randomUUID().slice(0, 8)}`,
    name: isProfane(name) ? '****' : name,
    day: num(r.day, 1, days),
    slot: (SLOTS as readonly string[]).includes(String(r.slot)) ? (r.slot as Stop['slot']) : 'afternoon',
    cost: num(r.cost, 0, 1e6),
    tags: sanitizeTags(r.tags),
    note: str(r.note, 100),
  }
}

export async function create(uid: string, b: Body) {
  const name = safeName(b.name)
  const avatar = (AVATARS as readonly string[]).includes(String(b.avatar)) ? (b.avatar as Avatar) : 'compass'
  for (let i = 0; i < 20; i++) {
    const code = Array.from({ length: 4 }, () => LETTERS[Math.floor(Math.random() * LETTERS.length)]).join('')
    const ref = roomRef(code)
    const tx = await ref.child('meta').transaction((m) =>
      m && now() - (m as { createdAt: number }).createdAt < 24 * 3600e3
        ? undefined
        : { code, createdAt: now(), hostUid: uid, devBots: !!b.bots, quick: b.quick !== false, start: str(b.start, 60) || 'Bengaluru', days: num(b.days, 2, 5) || 3, currency: 'INR' },
    )
    if (!tx.committed) continue
    await ref.update({
      state: { phase: 'lobby', step: 'lobby', endsAt: null },
      [`players/${uid}`]: { name, avatar, title: fallbackTitle(uid + name), joinedAt: now() },
      server: { seed: randomUUID() },
      plans: null, results: null, inputs: null, locks: null, drafts: null, private: null, pack: null, sidekick: null,
    })
    aiTitle(code, name, uid).then((t) => ref.child(`players/${uid}/title`).set(t)).catch(() => {})
    return { code }
  }
  throw new OpError('Could not create a room, try again.', 500)
}

export async function join(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  const existing = r.players[uid]
  if (existing && !existing.removed) return { code, rejoined: true }
  if (existing?.removed) throw new OpError('The host removed you from this room.', 403)
  if (r.state.phase !== 'lobby') throw new OpError('This game has already started.', 409)
  const name = safeName(b.name)
  if (activePlayers(r).length >= MAX_PLAYERS) throw new OpError('Room is full (10 players).', 409)
  if (activePlayers(r).some((u) => r.players[u].name.toLowerCase() === name.toLowerCase())) throw new OpError('That nickname is taken in this room.')
  const avatar = (AVATARS as readonly string[]).includes(String(b.avatar)) ? (b.avatar as Avatar) : 'compass'
  await roomRef(code).child(`players/${uid}`).set({ name, avatar, title: fallbackTitle(uid + name), joinedAt: now() })
  aiTitle(code, name, uid).then((t) => roomRef(code).child(`players/${uid}/title`).set(t)).catch(() => {})
  return { code }
}

export async function settings(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  requireHost(r, uid)
  if (r.state.phase !== 'lobby') throw new OpError('Settings are locked once the game starts.')
  const u: Record<string, unknown> = {}
  if (b.quick != null) u['meta/quick'] = !!b.quick
  if (b.days != null) u['meta/days'] = num(b.days, 2, 5)
  if (b.start != null) u['meta/start'] = str(b.start, 60) || r.meta.start
  await roomRef(code).update(u)
  return {}
}

export async function addBots(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  requireHost(r, uid)
  if (!r.meta.devBots) throw new OpError('Bots are only available on ?bots=1 links.', 403)
  if (r.state.phase !== 'lobby') throw new OpError('Add bots in the lobby.')
  const room = MAX_PLAYERS - activePlayers(r).length
  const n = Math.min(room, num(b.count, 1, 9))
  const used = new Set(activePlayers(r).map((u) => r.players[u].name))
  const names = BOT_NAMES.filter((x) => !used.has(`${x} (bot)`))
  const u: Record<string, unknown> = {}
  for (let i = 0; i < n && i < names.length; i++) {
    const id = `bot_${randomUUID().slice(0, 8)}`
    const name = `${names[i]} (bot)`
    u[`players/${id}`] = { name, avatar: AVATARS[(i + 3) % AVATARS.length], title: fallbackTitle(id), joinedAt: now() + i, isBot: true }
  }
  await roomRef(code).update(u)
  return { added: Object.keys(u).length }
}

export async function remove(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  requireHost(r, uid)
  const target = str(b.target, 64)
  if (!r.players[target] || target === uid) throw new OpError('Cannot remove that player.')
  if (r.state.phase === 'lobby') await roomRef(code).child(`players/${target}`).remove()
  else await roomRef(code).child(`players/${target}/removed`).set(true)
  return {}
}

export async function start(uid: string, code: string) {
  const r = await loadRoom(code)
  requireHost(r, uid)
  if (r.state.phase !== 'lobby') return {}
  if (activePlayers(r).length < MIN_PLAYERS) throw new OpError('You need at least 3 players.')
  const u: Record<string, unknown> = {}
  enter(r, u, stateFor(r, 'quiz', 'quiz', modeRules(r.meta.quick).timers.quiz, { quizExtended: false }))
  await roomRef(code).update(u)
  return {}
}

export async function restartQuiz(uid: string, code: string) {
  const r = await loadRoom(code)
  requireHost(r, uid)
  if (r.state.step !== 'quiz') throw new OpError('Not in the quiz.')
  const u: Record<string, unknown> = { private: null, locks: null }
  for (const p of activePlayers(r)) u[`players/${p}/counted`] = null
  enter({ ...r, private: {} }, u, stateFor(r, 'quiz', 'quiz', modeRules(r.meta.quick).timers.quiz, { quizExtended: false }))
  await roomRef(code).update(u)
  return {}
}

export async function pause(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  requirePlayer(r, uid)
  const live = connectedPlayers(r).length
  if (b.resume) {
    if (!r.state.paused) return {}
    if (live < MIN_PLAYERS) throw new OpError('Still waiting for 3 players.')
    await roomRef(code).child('state').update({ paused: null, endsAt: r.state.paused.remaining != null ? now() + r.state.paused.remaining : null })
  } else {
    if (r.state.paused || r.state.phase === 'lobby' || r.state.phase === 'reveal') return {}
    if (live >= MIN_PLAYERS) throw new OpError('Enough players are connected.')
    const remaining = r.state.endsAt ? Math.max(5000, r.state.endsAt - now()) : null
    await roomRef(code).child('state').update({ paused: { remaining, at: now() }, endsAt: null })
  }
  return {}
}

export async function claimHost(uid: string, code: string) {
  const r = await loadRoom(code)
  requirePlayer(r, uid)
  if (r.presence[r.meta.hostUid] && !r.players[r.meta.hostUid]?.removed) throw new OpError('The host is still here.')
  const humans = activePlayers(r).filter((u) => !r.players[u].isBot && r.presence[u])
  humans.sort((a, b) => r.presence[a].since - r.presence[b].since)
  if (humans[0] !== uid) throw new OpError('Another player is next in line.')
  await roomRef(code).update({ 'meta/hostUid': uid, 'state/hostNotice': { text: `${r.players[uid].name} is now the host.`, at: now() } })
  return {}
}

export async function draft(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  requirePlayer(r, uid)
  checkStepOpen(r, ['proposals'])
  const mode: Mode = (MODES as readonly string[]).includes(String(b.mode)) ? (b.mode as Mode) : 'train'
  const input: DraftInput = {
    destination: str(b.destination, 60),
    country: str(b.country, 60) || 'India',
    mode,
    start: r.meta.start,
    days: r.meta.days,
    mustDos: str(b.mustDos, 200),
  }
  if (!input.destination) throw new OpError('Where to? Add a destination.')
  if (isProfane(input.destination)) throw new OpError('Please use a different destination name.')
  const out = await aiDraft(code, input)
  if (out.estimate) await roomRef(code).child(`server/estimates/${uid}`).set(out.estimate)
  return { stops: out.stops, source: out.source, estimate: out.estimate }
}

export async function lock(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  const p = requirePlayer(r, uid)
  checkStepOpen(r, ['proposals'])
  if (p.role === 'proposer' && p.planId) return { planId: p.planId }
  const d = r.drafts[uid]
  if (!d?.form?.destination) throw new OpError('Save your plan first.')
  const v = validateStops((d.stops ?? []).map((s) => cleanStop(s, r.meta.days)), r.meta.days)
  if (!v.ok) throw new OpError(v.errors[0] ?? 'Check your stops.')
  if (isProfane(d.form.destination)) throw new OpError('Please use a different destination name.')
  const dup = activePlans(r).find((x) => normalizeName(x.destination) === normalizeName(d.form.destination))
  if (dup && b.coOwn == null) return { duplicate: { planId: dup.id, ownerNames: dup.ownerNames, destination: dup.destination } }
  const u: Record<string, unknown> = {}
  if (dup && b.coOwn) {
    u[`plans/${dup.id}/owners`] = [...dup.owners, uid]
    u[`plans/${dup.id}/ownerNames`] = [...dup.ownerNames, p.name]
    u[`players/${uid}/role`] = 'proposer'
    u[`players/${uid}/planId`] = dup.id
    u[`drafts/${uid}/locked`] = true
    u[`drafts/${uid}/planId`] = dup.id
    await roomRef(code).update(u)
    return { planId: dup.id, coOwned: true }
  }
  const id = `p${randomUUID().slice(0, 8)}`
  const rr = { ...r, drafts: { ...r.drafts, [uid]: { ...d, stops: d.stops.map((s) => cleanStop(s, r.meta.days)) } } }
  const plan = makePlan(rr, uid, id)!
  u[`plans/${id}`] = plan
  u[`players/${uid}/role`] = 'proposer'
  u[`players/${uid}/planId`] = id
  u[`drafts/${uid}/locked`] = true
  u[`drafts/${uid}/planId`] = id
  await roomRef(code).update(u)
  return { planId: id }
}

export async function singleChoice(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  requireHost(r, uid)
  if (r.state.step !== 'single') throw new OpError('Not now.')
  const u: Record<string, unknown> = {}
  if (b.choice === 'more') {
    enter(r, u, stateFor(r, 'proposals', 'proposals', modeRules(r.meta.quick).timers.proposals, { notice: 'Add another idea.' }))
  } else {
    reveal(r, u, true)
    u.state = stateFor(r, 'reveal', 'done', null)
  }
  await roomRef(code).update(u)
  return {}
}

function ownedEditablePlan(r: RoomData, uid: string, planId: string): PublicPlan {
  const plan = r.plans[planId]
  if (!plan || !plan.owners.includes(uid)) throw new OpError('You can only edit your own plan.', 403)
  if (plan.status !== 'active') throw new OpError('This plan is out.')
  return plan
}

export async function editOptions(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  checkStepOpen(r, ['edit1', 'edit2'])
  const plan = ownedEditablePlan(r, uid, str(b.planId, 40))
  const replacing = plan.stops.find((s) => s.id === b.stopId)
  const day = replacing?.day ?? num(b.day, 1, r.meta.days)
  const res = await aiEditOptions(code, plan, r.meta.days, String(b.action ?? 'add'), day, replacing)
  return res
}

export async function edit(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  checkStepOpen(r, ['edit1', 'edit2'])
  const plan = ownedEditablePlan(r, uid, str(b.planId, 40))
  const tokens = plan.tokens ?? 0
  if (tokens <= 0) throw new OpError('No edit tokens left.')
  const kind = String(b.kind)
  let action: EditAction
  if (kind === 'remove') action = { kind, stopId: str(b.stopId, 40) }
  else if (kind === 'swap') action = { kind, stopId: str(b.stopId, 40), stop: cleanStop({ ...(b.stop as object), id: `e${randomUUID().slice(0, 8)}` }, r.meta.days) }
  else if (kind === 'add') action = { kind, stop: cleanStop({ ...(b.stop as object), id: `e${randomUUID().slice(0, 8)}` }, r.meta.days) }
  else throw new OpError('Unknown edit.')
  const res = applyEdit(plan, action, r.meta.days)
  if (!res.ok) throw new OpError(res.errors[0] ?? 'That edit breaks the stop rules.')
  const updated = recomputePlan(r, { ...plan, ...res.plan, fit: plan.fit } as PublicPlan)
  await roomRef(code).child(`plans/${plan.id}`).set({ ...updated, tokens: tokens - 1 })
  const facts = editFacts(plan, updated, countedQuizzes(r))
  const fb = fallbackEditComment(facts)
  sidekick(code, JSON.stringify(facts), fb).catch(() => {})
  return { fit: updated.fit?.fit, delta: updated.fitDelta }
}

export async function correctJourney(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  checkStepOpen(r, ['edit1', 'edit2'])
  const plan = ownedEditablePlan(r, uid, str(b.planId, 40))
  if (!plan.correctionAvailable || plan.correctionUsed) throw new OpError('No correction available.')
  const journey = { ...plan.journey, hours: num(b.hours, 0, 200) || plan.journey.hours, cost: num(b.cost, 0, 1e7) || plan.journey.cost }
  const flaggersCleared = { ...r, server: { ...r.server, flaggers: { ...r.server.flaggers, [plan.id]: {} } } }
  const updated = recomputePlan(flaggersCleared, { ...plan, journey })
  await roomRef(code).update({
    [`plans/${plan.id}`]: { ...updated, correctionUsed: true, correctionAvailable: false, version: plan.version + 1 },
    [`server/flaggers/${plan.id}`]: null,
  })
  return { checkBadge: updated.checkBadge }
}

export async function flag(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  const p = requirePlayer(r, uid)
  if (!p.counted) throw new OpError('Only players who took the quiz can flag.')
  if (['lobby', 'quiz', 'proposals', 'reveal'].includes(r.state.phase)) throw new OpError('Flagging opens once plans are locked.')
  const plan = r.plans[str(b.planId, 40)]
  if (!plan || plan.owners.includes(uid)) throw new OpError('You cannot flag that plan.')
  const flaggers = { ...(r.server.flaggers?.[plan.id] ?? {}), [uid]: true }
  const rr = { ...r, server: { ...r.server, flaggers: { ...r.server.flaggers, [plan.id]: flaggers } } }
  const updated = recomputePlan(rr, plan)
  await roomRef(code).update({
    [`server/flaggers/${plan.id}/${uid}`]: true,
    [`plans/${plan.id}/flagCount`]: updated.flagCount,
    [`plans/${plan.id}/checkBadge`]: updated.checkBadge,
    [`plans/${plan.id}/fit`]: updated.fit,
  })
  return { flagged: true }
}

export async function consolationOptions(uid: string, code: string) {
  const r = await loadRoom(code)
  const rev = r.results.reveal
  if (!rev || r.state.step !== 'consolation' || !rev.runnerUp) throw new OpError('No consolation now.')
  if (!r.plans[rev.runnerUp]?.owners.includes(uid)) throw new OpError('Only the runner-up picks.', 403)
  const plan = r.plans[rev.winner]
  const cached = r.server.consolationOptions as Stop[] | undefined
  if (cached?.length) return { options: cached }
  const day = 1 + Math.floor(Math.random() * r.meta.days)
  const res = await aiEditOptions(code, plan, r.meta.days, 'add', day)
  await roomRef(code).child('server/consolationOptions').set(res.options)
  return { options: res.options }
}

export async function consolationPick(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  checkStepOpen(r, ['consolation'])
  const rev = r.results.reveal!
  if (!rev.runnerUp || !r.plans[rev.runnerUp]?.owners.includes(uid)) throw new OpError('Only the runner-up picks.', 403)
  const opts = (r.server.consolationOptions as Stop[] | undefined) ?? []
  const pick = opts.find((o) => o.id === b.stopId)
  if (!pick) throw new OpError('Pick one of the options.')
  await roomRef(code).update({ 'server/runnerUpPick': pick, [`locks/consolation_pick/${uid}`]: true, 'results/reveal/consolation/picked': pick.name })
  return {}
}

export async function doAdvance(uid: string, code: string, b: Body) {
  const r = await loadRoom(code)
  requirePlayer(r, uid)
  const force = !!b.force && r.meta.hostUid === uid && ['results1', 'results2', 'passport', 'finalcheck', 'proposals'].includes(r.state.step)
  return advance(code, str(b.step, 40), force)
}

export { bots, db, humanCount }
