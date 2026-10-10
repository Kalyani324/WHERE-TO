import { AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { BarChart3, Gamepad2, ListChecks, Moon, Sun, Volume2, VolumeX } from 'lucide-react'
import { signIn } from './lib/firebase'
import { api } from './lib/api'
import { useDerived, useNow, useRoom } from './lib/useRoom'
import { lockedCount, type Ctx } from './lib/ctx'
import { MIN_PLAYERS, modeRules } from './shared/config'
import { Banner, Footer, LockCount, RouteLoader, TimerRing } from './ui/components'
import { FitTab, PlansTab, PlanView } from './ui/plans'
import { Home, JoinForm } from './screens/Home'
import { Lobby } from './screens/Lobby'
import { Backing, Passport, Proposals, Quiz, Single } from './screens/Setup'
import { Edit, FinalCheck, Results, Reveal, Round1, Round2, Vote } from './screens/Rounds'

type Tab = 'game' | 'plans' | 'fit'
const bots = new URLSearchParams(location.search).has('bots')
const codeFromPath = () => location.pathname.match(/^\/r\/([A-Za-z]{4})/)?.[1]?.toUpperCase() ?? null

function useTheme() {
  const [pref, setPref] = useState<'system' | 'light' | 'dark'>(() => (localStorage.getItem('wt-theme') as never) || 'system')
  const [sys, setSys] = useState(() => matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => {
    const m = matchMedia('(prefers-color-scheme: dark)')
    const f = () => setSys(m.matches)
    m.addEventListener('change', f)
    return () => m.removeEventListener('change', f)
  }, [])
  const dark = pref === 'dark' || (pref === 'system' && sys)
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light'
  }, [dark])
  const toggle = () => {
    const next = dark ? 'light' : 'dark'
    setPref(next)
    localStorage.setItem('wt-theme', next)
  }
  return { dark, toggle }
}

function useWakeLock(on: boolean) {
  useEffect(() => {
    if (!on || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | null = null
    const get = () => navigator.wakeLock.request('screen').then((l) => (lock = l)).catch(() => {})
    get()
    const vis = () => document.visibilityState === 'visible' && get()
    document.addEventListener('visibilitychange', vis)
    return () => {
      document.removeEventListener('visibilitychange', vis)
      lock?.release().catch(() => {})
    }
  }, [on])
}

let audio: AudioContext | null = null
function beep(freq: number, ms: number) {
  try {
    audio ??= new AudioContext()
    const o = audio.createOscillator()
    const g = audio.createGain()
    o.frequency.value = freq
    g.gain.value = 0.04
    o.connect(g).connect(audio.destination)
    o.start()
    o.stop(audio.currentTime + ms / 1000)
  } catch {
    /* no audio */
  }
}

const TITLES: Record<string, string> = {
  quiz: 'Quick quiz', proposals: 'Pitch a trip', single: 'One plan', passport: 'Passport control', backing: 'Back a plan',
  results1: 'Round 1 results', edit1: 'Edit window', results2: 'Round 2 results', edit2: 'Last edits', finalcheck: 'Final check',
  vote: 'Final vote', reveal: 'The verdict',
}
function instruction(step: string, sub?: string): string {
  if (step.startsWith('r1:')) return sub === 'guess' ? 'Guess the group' : sub === 'tap' ? 'Pick one.' : 'Group result'
  if (step.startsWith('r2:')) return 'Keep or skip?'
  return { quiz: 'Answer privately.', proposals: 'Propose or support.', backing: 'Back one plan.', vote: 'Pick one.', edit1: 'Tune your plan.', edit2: 'Last chance to tune.' }[step] ?? ''
}
function stepTotal(quick: boolean, step: string): number {
  const T = modeRules(quick).timers
  if (step.startsWith('r1:')) return step.endsWith('guess') ? T.guess : step.endsWith('tap') ? T.tap : T.reveal
  if (step.startsWith('r2:')) return T.card
  return (T as unknown as Record<string, number>)[{ results1: 'results', results2: 'results', edit1: 'edit', edit2: 'edit' }[step] ?? step] ?? T.quiz
}

export default function App() {
  const theme = useTheme()
  const [uid, setUid] = useState<string | null>(null)
  const [authErr, setAuthErr] = useState('')
  const [code, setCode] = useState<string | null>(codeFromPath())
  const [tab, setTab] = useState<Tab>('game')
  const [planId, setPlanId] = useState<string | null>(null)
  const [toastMsg, setToast] = useState('')
  const [sound, setSound] = useState(false)
  const [board, setBoard] = useState(() => matchMedia('(min-width: 1024px) and (orientation: landscape)').matches)
  const reduce = useReducedMotion()

  useEffect(() => {
    signIn().then((u) => setUid(u.uid)).catch(() => setAuthErr('Could not sign in. Check your connection and reload.'))
    const m = matchMedia('(min-width: 1024px) and (orientation: landscape)')
    const f = () => setBoard(m.matches)
    m.addEventListener('change', f)
    const pop = () => setCode(codeFromPath())
    addEventListener('popstate', pop)
    return () => {
      m.removeEventListener('change', f)
      removeEventListener('popstate', pop)
    }
  }, [])

  const room = useRoom(code, uid)
  const d = useDerived(room, uid)
  const now = useNow()
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined)
  const toast = useCallback((s: string) => {
    setToast(s)
    clearTimeout(toastTimer.current)
    toastTimer.current = setTimeout(() => setToast(''), 2600)
  }, [])
  const goRoom = (c: string) => {
    history.pushState(null, '', `/r/${c}${bots ? '?bots=1' : ''}`)
    setCode(c)
  }
  const inGame = !!room.state && room.state.phase !== 'lobby'
  useWakeLock(inGame)

  const ctx: Ctx | null = code && uid ? { code, uid, room, d, now, toast, openPlan: (id) => { setPlanId(id); if (!board) setTab('plans') }, board } : null
  const st = room.state
  const step = st?.step ?? ''

  // Timer driver: the host advances when time is up or everyone is locked in; anyone backs up a stalled host.
  const lastCall = useRef('')
  const lc = ctx && st ? lockedCount(ctx) : { n: 0, total: 0 }
  useEffect(() => {
    if (!ctx || !st || st.paused || !d.me) return
    const due = st.endsAt != null && now >= st.endsAt
    const stalled = st.endsAt != null && now >= st.endsAt + 4000
    const allIn = lc.total > 0 && lc.n >= lc.total && !['passport', 'results1', 'results2', 'finalcheck', 'consolation', 'single'].includes(step)
    const mine = d.isHost ? due || allIn : stalled
    const key = `${step}:${st.endsAt}:${allIn}:${Math.floor(now / 3000)}`
    if (mine && lastCall.current !== key) {
      lastCall.current = key
      api('advance', { code: ctx.code, step }).catch(() => {})
    }
  })

  // Pause / resume and host handoff.
  const liveCount = d.connected.length
  const hostAway = !!room.meta && !room.presence[room.meta.hostUid]
  const [awaySince, setAwaySince] = useState<number | null>(null)
  useEffect(() => setAwaySince(hostAway ? Date.now() : null), [hostAway])
  useEffect(() => {
    if (!ctx || !st || !d.me || st.phase === 'lobby' || step === 'done') return
    if (d.isHost && !st.paused && liveCount < MIN_PLAYERS) api('pause', { code: ctx.code }).catch(() => {})
    if (d.isHost && st.paused && liveCount >= MIN_PLAYERS) api('pause', { code: ctx.code, resume: true }).catch(() => {})
  }, [liveCount, st?.paused, d.isHost, step]) // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!ctx || !awaySince || d.isHost || !d.me) return
    const humans = d.active.filter(([id, p]) => !p.isBot && room.presence[id]).sort(([a], [b]) => room.presence[a].since - room.presence[b].since)
    if (humans[0]?.[0] !== uid) return
    const t = setTimeout(() => api('claimHost', { code: ctx.code }).catch(() => {}), 5000)
    return () => clearTimeout(t)
  }, [awaySince, d.isHost]) // eslint-disable-line react-hooks/exhaustive-deps

  // Sound: last-5-seconds tick.
  const secsLeft = st?.endsAt ? Math.ceil((st.endsAt - now) / 1000) : null
  useEffect(() => {
    if (sound && secsLeft != null && secsLeft > 0 && secsLeft <= 5) beep(880, 60)
  }, [secsLeft, sound])
  useEffect(() => {
    if (sound && step === 'consolation') [523, 659, 784].forEach((f, i) => setTimeout(() => beep(f, 160), i * 170))
  }, [step, sound])

  useEffect(() => {
    if (room.state?.hostNotice && Date.now() - room.state.hostNotice.at < 8000) toast(room.state.hostNotice.text)
  }, [room.state?.hostNotice?.at]) // eslint-disable-line react-hooks/exhaustive-deps

  const topbar = (
    <header className="topbar">
      <a className="brand" href="/" style={{ color: 'inherit', textDecoration: 'none' }}>WHERE TO?</a>
      {code && room.meta && <span className="code-chip">{code}</span>}
      <span className="grow" />
      <button className="icon-btn" onClick={() => setSound(!sound)} aria-label={sound ? 'Sound off' : 'Sound on'}>{sound ? <Volume2 size={18} /> : <VolumeX size={18} />}</button>
      <button className="icon-btn" onClick={theme.toggle} aria-label="Toggle theme">{theme.dark ? <Sun size={18} /> : <Moon size={18} />}</button>
    </header>
  )

  let body: React.ReactNode
  let showTabs = false
  if (authErr) body = <Banner kind="error">{authErr}</Banner>
  else if (!uid) body = <RouteLoader label="Getting ready…" />
  else if (!code) body = <Home onJoined={goRoom} bots={bots} />
  else if (!room.loaded) body = <RouteLoader label="Finding your room…" />
  else if (room.missing) body = <div className="stack-lg"><Banner kind="error">Room {code} doesn't exist or has expired.</Banner><a className="btn block" href={bots ? '/?bots=1' : '/'}>Back home</a></div>
  else if (!d.me || d.me.removed) {
    body = d.me?.removed ? <Banner kind="error">The host removed you from this room.</Banner>
      : st?.phase !== 'lobby' ? <Banner kind="caution">This game has already started. Ask for a new room code.</Banner>
      : <div className="stack-lg"><h2>Join room <span className="mono">{code}</span></h2><JoinForm code={code} bots={bots} onJoined={goRoom} /></div>
  } else if (st && ctx) {
    showTabs = st.phase !== 'lobby' && !board
    const game = <GameScreen ctx={ctx} />
    const header = st.phase !== 'lobby' && (
      <div className="game-head" style={{ marginBottom: 20 }}>
        <span className="instruction">{TITLES[st.phase] ?? (step.startsWith('r1') ? 'Round 1 · This or that' : 'Round 2 · Keep or skip')}</span>
        {st.endsAt || st.paused ? <TimerRing endsAt={st.endsAt} total={stepTotal(!!room.meta?.quick, step)} now={now} paused={!!st.paused} /> : null}
        {instruction(step, st.sub) && <span className="small muted">{instruction(step, st.sub)}</span>}
      </div>
    )
    const status = (
      <div className="stack" style={{ marginBottom: 16 }}>
        {!room.connected && <Banner kind="caution">Reconnecting… your answers are safe.</Banner>}
        {st.paused && <Banner kind="caution">Paused. Fewer than 3 players are connected. It resumes when someone is back.</Banner>}
        {st.notice && st.notice !== 'quiz-short' && <Banner kind="info">{st.notice}</Banner>}
        {room.sidekick && now - room.sidekick.at < 25000 && <SidekickBubble text={room.sidekick.text} />}
      </div>
    )
    const gameCol = (
      <>
        {header}
        {status}
        <AnimatePresence mode="wait">
          <motion.div key={step} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.2 }}>
            {game}
          </motion.div>
        </AnimatePresence>
        {(step.startsWith('r1:') && st.sub !== 'reveal') || step.startsWith('r2:') || ['backing', 'vote', 'quiz'].includes(step) ? <div style={{ marginTop: 20 }}><LockCount n={lc.n} total={lc.total} /></div> : null}
      </>
    )
    if (board && st.phase !== 'lobby') {
      body = (
        <div className="board-grid">
          <div>{gameCol}</div>
          <div className="stack-lg">
            {planId ? <PlanView ctx={ctx} planId={planId} onBack={() => setPlanId(null)} /> : <PlansTab ctx={ctx} />}
            <FitTab ctx={ctx} />
          </div>
        </div>
      )
    } else if (tab === 'plans' && showTabs) {
      body = planId ? <PlanView ctx={ctx} planId={planId} onBack={() => setPlanId(null)} /> : <PlansTab ctx={ctx} />
    } else if (tab === 'fit' && showTabs) {
      body = <FitTab ctx={ctx} />
    } else body = st.phase === 'lobby' ? <Lobby ctx={ctx} bots={bots} /> : gameCol
  } else body = <RouteLoader label="Loading…" />

  const anyDot = ctx ? d.plans.some((p) => !p.owners.includes(uid!) && p.version > 1 && (room.seen[p.id] ?? 0) < p.version) : false
  return (
    <div className={`shell ${board ? 'board' : ''}`}>
      {topbar}
      <main className={`content ${showTabs ? '' : 'no-tabs'}`}>
        {body}
        <Footer />
      </main>
      {showTabs && (
        <nav className="tabs" role="tablist">
          {([['game', 'Game', Gamepad2], ['plans', 'Plans', ListChecks], ['fit', 'Fit', BarChart3]] as const).map(([k, label, Icon]) => (
            <button key={k} className="tab" role="tab" aria-selected={tab === k} onClick={() => { setTab(k); if (k !== 'plans') setPlanId(null) }}>
              <Icon size={20} strokeWidth={1.75} />
              {label}
              {k === 'plans' && anyDot && <span className="green-dot badge-dot" aria-label="Plans changed" />}
            </button>
          ))}
        </nav>
      )}
      <AnimatePresence>{toastMsg && <motion.div className="toast" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>{toastMsg}</motion.div>}</AnimatePresence>
    </div>
  )
}

function SidekickBubble({ text }: { text: string }) {
  return (
    <motion.div className="card tight row" style={{ gap: 10, alignItems: 'flex-start' }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
      <span className="avatar sm" style={{ color: 'var(--accent)' }} aria-hidden>✦</span>
      <p className="small"><b>Sidekick</b> · {text}</p>
    </motion.div>
  )
}

function GameScreen({ ctx }: { ctx: Ctx }) {
  const st = ctx.room.state!
  const s = st.step
  if (s === 'quiz') return <Quiz ctx={ctx} />
  if (s === 'proposals') return <Proposals ctx={ctx} />
  if (s === 'single') return <Single ctx={ctx} />
  if (s === 'passport') return <Passport ctx={ctx} />
  if (s === 'backing') return <Backing ctx={ctx} />
  if (s.startsWith('r1:')) return <Round1 ctx={ctx} />
  if (s === 'results1') return <Results ctx={ctx} round={1} />
  if (s === 'results2') return <Results ctx={ctx} round={2} />
  if (s === 'edit1' || s === 'edit2') return <Edit ctx={ctx} />
  if (s.startsWith('r2:')) return <Round2 ctx={ctx} />
  if (s === 'finalcheck') return <FinalCheck ctx={ctx} />
  if (s === 'vote') return <Vote ctx={ctx} />
  if (st.phase === 'reveal') return <Reveal ctx={ctx} />
  return <RouteLoader label="Loading…" />
}
