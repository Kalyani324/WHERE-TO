// Plays a full Quick Mode game against the emulator: 3 real (anonymous) clients + N bots.
// Usage: npx tsx scripts/smoke.ts [bots=2]
import { initializeApp, deleteApp } from 'firebase/app'
import { connectAuthEmulator, getAuth, signInAnonymously } from 'firebase/auth'
import { connectDatabaseEmulator, get, getDatabase, ref, serverTimestamp, set, onDisconnect } from 'firebase/database'

const API = process.env.API_URL || 'http://localhost:3001/api/game'
const nBots = Number(process.argv[2] ?? 2)
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

async function client(i: number) {
  const app = initializeApp({ projectId: 'demo-whereto', apiKey: 'demo-key', databaseURL: 'http://127.0.0.1:9000?ns=demo-whereto-default-rtdb' }, `c${i}`)
  const auth = getAuth(app)
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true })
  const db = getDatabase(app)
  connectDatabaseEmulator(db, '127.0.0.1', 9000)
  const { user } = await signInAnonymously(auth)
  const call = async (body: Record<string, unknown>) => {
    const token = await user.getIdToken()
    const res = await fetch(API, { method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}` }, body: JSON.stringify(body) })
    const j = (await res.json()) as Record<string, unknown>
    if (!res.ok) throw new Error(`${body.op}: ${j.error}`)
    return j
  }
  return { app, db, uid: user.uid, call, name: ['Kal', 'Ravi', 'Neha'][i] }
}

async function main() {
  const cs = await Promise.all([0, 1, 2].map(client))
  const [host] = cs
  const { code } = (await host.call({ op: 'create', name: host.name, avatar: 'compass', bots: true, quick: true, days: 3, start: 'Bengaluru' })) as { code: string }
  console.log('room', code)
  for (const c of cs.slice(1)) await c.call({ op: 'join', code, name: c.name, avatar: 'map' })
  for (const c of cs) {
    const pr = ref(c.db, `rooms/${code}/presence/${c.uid}`)
    await set(pr, { since: serverTimestamp() })
    onDisconnect(pr).remove()
  }
  if (nBots) console.log('bots', await host.call({ op: 'addBots', code, count: nBots }))

  // privacy checks
  const deny = async (path: string) => {
    try { await get(ref(cs[1].db, path)); throw new Error(`READ ALLOWED: ${path}`) } catch (e) { if (String(e).includes('READ ALLOWED')) throw e }
  }
  await host.call({ op: 'start', code })
  const r = (p: string) => get(ref(host.db, `rooms/${code}/${p}`)).then((s) => s.val())
  let last = ''
  const t0 = Date.now()
  while (Date.now() - t0 < 6 * 60e3) {
    const st = await r('state')
    if (st.step === 'done') break
    if (st.step !== last) { console.log(`${((Date.now() - t0) / 1000).toFixed(0)}s`, st.step, st.notice ?? ''); last = st.step }
    const step = st.step as string
    const lockAll = async (v: (i: number) => unknown) => {
      for (const [i, c] of cs.entries()) {
        await set(ref(c.db, `rooms/${code}/inputs/${step}/${c.uid}`), { v: v(i), t: serverTimestamp() }).catch(() => {})
        await set(ref(c.db, `rooms/${code}/locks/${step}/${c.uid}`), true)
      }
    }
    if (step === 'quiz') {
      for (const [i, c] of cs.entries()) {
        await set(ref(c.db, `rooms/${code}/private/${c.uid}/passport`), 'India')
        await set(ref(c.db, `rooms/${code}/private/${c.uid}/quiz`), { pace: i ? 'relaxed' : 'packed', budget: 25000 + i * 5000, maxHours: 8, dealbreakers: ['crowded'], t: serverTimestamp() }).catch(() => {})
        await set(ref(c.db, `rooms/${code}/locks/quiz/${c.uid}`), true)
      }
      await deny(`rooms/${code}/private/${host.uid}`)
      await deny(`rooms/${code}/inputs`)
    } else if (step === 'proposals') {
      const p = cs[0]
      const out = (await p.call({ op: 'draft', code, destination: 'Gokarna', country: 'India', mode: 'train', mustDos: 'beach sunset' })) as { stops: unknown[] }
      await set(ref(p.db, `rooms/${code}/drafts/${p.uid}`), { form: { destination: 'Gokarna', country: 'India', mode: 'train', hours: 9, journeyCost: 2400, stayPerNight: 2500, mustDos: '' }, stops: out.stops, source: 'mock', updatedAt: Date.now() })
      console.log('  lock', await p.call({ op: 'lock', code }))
      for (const c of cs) await set(ref(c.db, `rooms/${code}/locks/proposals/${c.uid}`), true)
    } else if (step === 'backing') {
      const plans = Object.keys((await r('plans')) ?? {})
      await lockAll((i) => plans[i % plans.length])
    } else if (step.startsWith('r1:') && !step.endsWith('reveal')) {
      await lockAll((i) => (i % 2 ? 'b' : 'a'))
    } else if (step.startsWith('r2:')) {
      await lockAll((i) => (i === 2 ? 'skip' : 'keep'))
    } else if (step === 'edit1') {
      const plan = (await r(`plans`))[(await r(`players/${host.uid}`)).planId]
      if (plan?.status === 'active' && plan.tokens) {
        const { options } = (await host.call({ op: 'editOptions', code, planId: plan.id, action: 'add', day: 1 })) as { options: unknown[] }
        console.log('  edit', await host.call({ op: 'edit', code, planId: plan.id, kind: 'add', stop: { ...(options[0] as object), day: 2 } }).catch((e) => String(e)))
      }
    } else if (step === 'vote') {
      const fin = (await r('results/finalists')) as string[]
      await lockAll((i) => fin[i % fin.length])
    }
    const res = await host.call({ op: 'advance', code, step, force: ['results1', 'results2', 'passport', 'finalcheck'].includes(step) })
    if (res.noop) {
      const fresh = await r('state')
      if (fresh.step === step) await sleep(fresh.endsAt ? Math.min(1500, Math.max(200, fresh.endsAt - Date.now())) : 1000)
    }
  }
  const results = await r('results')
  const plans = await r('plans')
  console.log('finalists', results.finalists, 'r1', JSON.stringify(results.r1?.plans))
  console.log('REVEAL', JSON.stringify(results.reveal, null, 1).slice(0, 1500))
  console.log('plans', Object.values(plans).map((p) => `${(p as { destination: string }).destination}:${(p as { status: string }).status}:${JSON.stringify((p as { scores: unknown }).scores)}`))
  console.log('sidekick', JSON.stringify(await r('sidekick/latest')))
  await Promise.all(cs.map((c) => deleteApp(c.app)))
  process.exit(0)
}
main().catch((e) => { console.error('FAIL', e); process.exit(1) })
