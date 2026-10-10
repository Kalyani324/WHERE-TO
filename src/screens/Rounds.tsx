// Round 1, results, edits, Round 2, final check, vote and reveal.
import { useEffect, useState } from 'react'
import { motion, useReducedMotion } from 'motion/react'
import confetti from 'canvas-confetti'
import { ArrowRightLeft, Check, ExternalLink, Plus, Trash2, Trophy, X } from 'lucide-react'
import { api } from '../lib/api'
import { isLocked, submit, type Ctx } from '../lib/ctx'
import type { PublicPlan } from '../shared/schema'
import { planCost, type Stop } from '../engine'
import { Banner, EntryPill, FitBar, haptic, hrs, inr, NumberRoll, PrimaryButton, RouteLoader, Sheet, StatusPill } from '../ui/components'
import { PlanCard, PlanRow, StopList } from '../ui/plans'

function Choice({ label, sub, pressed, onClick, disabled }: { label: string; sub?: string; pressed: boolean; onClick: () => void; disabled?: boolean }) {
  return (
    <motion.button className="choice" aria-pressed={pressed} onClick={onClick} disabled={disabled} whileTap={{ scale: 0.985 }}
      drag={disabled ? false : 'x'} dragConstraints={{ left: 0, right: 0 }} dragElastic={0.2}
      onDragEnd={(_, i) => { if (Math.abs(i.offset.x) > 60) onClick() }}>
      <span className="big">{label}</span>
      {sub && <span className="small muted">{sub}</span>}
      {pressed && <span className="locked-in"><Check size={15} /> Locked in</span>}
    </motion.button>
  )
}

function useLocal<T>(step: string) {
  const [v, setV] = useState<{ step: string; v: T } | null>(null)
  return [v?.step === step ? v.v : null, (x: T) => setV({ step, v: x })] as const
}

export function Round1({ ctx }: { ctx: Ctx }) {
  const st = ctx.room.state!
  const q = ctx.room.pack[st.q ?? 0]
  const [pick, setPick] = useLocal<'a' | 'b'>(st.step)
  if (!q) return <RouteLoader label="Shuffling the questions…" />
  const choose = (v: 'a' | 'b') => {
    setPick(v)
    haptic()
    submit(ctx, v).catch(() => ctx.toast('Could not save. Try again.'))
  }
  if (st.sub === 'reveal') {
    const r = ctx.room.results.r1?.questions?.[q.id]
    const total = (r?.a ?? 0) + (r?.b ?? 0) || 1
    return (
      <div className="stack-lg">
        <h2 className="center">{q.prompt}</h2>
        {(['a', 'b'] as const).map((k) => (
          <div key={k} className="card tight stack" style={{ gap: 8, borderColor: r?.result === k ? 'var(--accent)' : undefined }}>
            <div className="row between"><span style={{ fontWeight: 600 }}>{q[k].label}</span><span className="num">{r?.[k] ?? 0}</span></div>
            <div className="fit-track"><motion.div className="fit-fill" style={{ background: 'var(--accent)' }} initial={{ width: 0 }} animate={{ width: `${((r?.[k] ?? 0) / total) * 100}%` }} /></div>
          </div>
        ))}
        <p className="center muted">{r?.result === 'split' ? 'A perfect split.' : `The group leans ${q[r?.result as 'a' | 'b']?.label ?? ''}.`}</p>
      </div>
    )
  }
  return (
    <div className="stack-lg">
      <h2 className="center">{q.prompt}</h2>
      {st.sub === 'guess' && <p className="center muted">Guess what the group will pick. Right guesses earn a bonus for your plan.</p>}
      <div className="choice-grid">
        <Choice label={q.a.label} pressed={pick === 'a'} onClick={() => choose('a')} />
        <Choice label={q.b.label} pressed={pick === 'b'} onClick={() => choose('b')} />
      </div>
    </div>
  )
}

export function Results({ ctx, round }: { ctx: Ctx; round: 1 | 2 }) {
  const res = round === 1 ? ctx.room.results.r1 : ctx.room.results.r2
  const reduce = useReducedMotion()
  const plans = ctx.d.plans.filter((p) => p.status === 'active' || p.outRound === round)
  return (
    <div className="stack-lg">
      <p className="lead">{round === 1 ? 'Round 1 scores are in.' : 'Round 2 is done. Two finalists remain.'}</p>
      <div className="stack">
        {plans.map((p, i) => (
          <motion.div key={p.id} initial={reduce ? { opacity: 0 } : { opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}>
            <PlanRow plan={p} ctx={ctx} onOpen={() => ctx.openPlan(p.id)} />
          </motion.div>
        ))}
      </div>
      {res?.coinFlip && res.coinFlip.length > 0 && <Banner kind="info">Tied scores were split by a coin flip.</Banner>}
      {(res?.out ?? []).length > 0 && <p className="small muted">Out this round: {(res?.out ?? []).map((id) => ctx.room.plans[id]?.destination).join(', ')}. Their owners keep playing.</p>}
      {ctx.d.isHost && <button className="btn block" onClick={() => api('advance', { code: ctx.code, step: ctx.room.state!.step, force: true }).catch(() => {})}>Continue</button>}
    </div>
  )
}

export function Edit({ ctx }: { ctx: Ctx }) {
  const plan = ctx.d.myPlan
  if (!plan || plan.status !== 'active')
    return (
      <div className="stack-lg">
        <p className="lead">Owners are editing their plans.</p>
        <p className="muted">Watch for green dots in Plans and the Fit tab moving.</p>
        <RouteLoader label="Edits in progress" />
      </div>
    )
  return <Editor ctx={ctx} plan={plan} />
}

function Editor({ ctx, plan }: { ctx: Ctx; plan: PublicPlan }) {
  const days = ctx.room.meta?.days ?? 3
  const tokens = plan.tokens ?? 0
  const [sheet, setSheet] = useState<{ action: 'swap' | 'add'; stop?: Stop; day: number } | null>(null)
  const [options, setOptions] = useState<Stop[] | null>(null)
  const [busy, setBusy] = useState(false)
  const [hours, setHours] = useState(plan.estimate?.hours ?? plan.journey.hours)
  const [cost, setCost] = useState(plan.estimate?.cost ?? plan.journey.cost)
  const open = async (action: 'swap' | 'add', day: number, stop?: Stop) => {
    setSheet({ action, day, stop })
    setOptions(null)
    try {
      const r = await api<{ options: Stop[] }>('editOptions', { code: ctx.code, planId: plan.id, action, day, stopId: stop?.id })
      setOptions(r.options)
    } catch (e) {
      ctx.toast((e as Error).message)
      setOptions([])
    }
  }
  const apply = async (body: Record<string, unknown>) => {
    setBusy(true)
    try {
      const r = await api<{ fit?: number; delta?: number }>('edit', { code: ctx.code, planId: plan.id, ...body })
      haptic()
      ctx.toast(r.delta ? `Fit ${r.delta > 0 ? '+' : ''}${r.delta}` : 'Saved')
      setSheet(null)
    } catch (e) {
      ctx.toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const perDay = (d: number) => plan.stops.filter((s) => s.day === d).length
  return (
    <div className="stack-lg">
      <div className="row between">
        <p className="lead">Tune your plan</p>
        <span className="pill neutral num">{tokens} edit{tokens === 1 ? '' : 's'} left</span>
      </div>
      {plan.fit && <div className="card tight stack" style={{ gap: 8 }}><div className="row between small"><span className="muted">Fit</span><b className="num"><NumberRoll value={plan.fit.fit} format={(n) => n.toFixed(1)} /></b></div><FitBar value={plan.fit.fit} color={plan.color} delta={plan.fitDelta} /></div>}
      {plan.correctionAvailable && !plan.correctionUsed && (
        <div className="card stack">
          <h3>Fix the journey (free, once)</h3>
          <p className="small muted">Your plan has a Check badge. Enter realistic numbers to clear it.</p>
          <div className="row" style={{ gap: 10 }}>
            <input className="input num" type="number" value={hours} onChange={(e) => setHours(Number(e.target.value))} aria-label="Hours one way" />
            <input className="input num" type="number" value={cost} onChange={(e) => setCost(Number(e.target.value))} aria-label="Journey cost" />
          </div>
          <button className="btn" onClick={() => api('correctJourney', { code: ctx.code, planId: plan.id, hours, cost }).then(() => ctx.toast('Journey updated')).catch((e) => ctx.toast(e.message))}>Save journey</button>
        </div>
      )}
      {tokens <= 0 ? <Banner kind="info">No edits left. Your plan is set for the next round.</Banner> : null}
      <StopList stops={plan.stops} days={days} highlight={(s) => tokens > 0 ? (
        <div className="row" style={{ gap: 6 }}>
          <button className="btn small" onClick={() => open('swap', s.day, s)}><ArrowRightLeft size={14} /> Swap</button>
          <button className="btn small ghost" disabled={busy || perDay(s.day) <= 1 || plan.stops.length <= 3} onClick={() => apply({ kind: 'remove', stopId: s.id })}><Trash2 size={14} /> Remove</button>
        </div>
      ) : null} />
      {tokens > 0 && (
        <div className="row wrap" style={{ gap: 8 }}>
          {Array.from({ length: days }, (_, i) => i + 1).filter((d) => perDay(d) < 4).map((d) => (
            <button key={d} className="btn small" onClick={() => open('add', d)}><Plus size={14} /> Add to day {d}</button>
          ))}
        </div>
      )}
      <Sheet open={!!sheet} onClose={() => setSheet(null)} label="Pick a stop">
        <div className="stack">
          <h3>{sheet?.action === 'swap' ? `Swap ${sheet.stop?.name}` : `Add to day ${sheet?.day}`}</h3>
          {!options && <RouteLoader label="Finding options…" />}
          {options?.length === 0 && <Banner kind="caution">No suggestions right now. Try again in a moment.</Banner>}
          {options?.map((o) => (
            <button key={o.id} className="choice" style={{ minHeight: 80 }} disabled={busy}
              onClick={() => apply(sheet!.action === 'swap' ? { kind: 'swap', stopId: sheet!.stop!.id, stop: { ...o, day: sheet!.day } } : { kind: 'add', stop: { ...o, day: sheet!.day } })}>
              <span className="row between"><b>{o.name}</b><span className="small muted num">{o.cost ? inr(o.cost) : 'Free'}</span></span>
              <span className="small muted">{o.note}</span>
              <span className="small muted">{o.tags.map((t) => t.replace('_', ' ')).join(' · ')}</span>
            </button>
          ))}
        </div>
      </Sheet>
    </div>
  )
}

export function Round2({ ctx }: { ctx: Ctx }) {
  const st = ctx.room.state!
  const card = ctx.room.results.r2?.cards?.[st.card ?? 0]
  const plan = card ? ctx.room.plans[card.planId] : undefined
  const stop = plan?.stops.find((s) => s.id === card?.stopId)
  const [pick, setPick] = useLocal<'keep' | 'skip'>(st.step)
  if (!card || !plan || !stop) return <RouteLoader label="Dealing cards…" />
  const own = plan.owners.includes(ctx.uid)
  const choose = (v: 'keep' | 'skip') => {
    setPick(v)
    haptic()
    submit(ctx, v).catch(() => ctx.toast('Could not save. Try again.'))
  }
  return (
    <div className="stack-lg">
      <div className="card stack" style={{ gap: 10 }}>
        <span className="row small muted"><span className="dot" style={{ background: plan.color }} />{plan.destination} · Day {stop.day}, <span style={{ textTransform: 'capitalize' }}>{stop.slot}</span></span>
        <h2>{stop.name}</h2>
        {stop.note && <p className="muted">{stop.note}</p>}
        <div className="row wrap" style={{ gap: 6 }}>
          <span className="tag num">{stop.cost ? inr(stop.cost) : 'Free'}</span>
          {stop.tags.map((t) => <span key={t} className="tag">{t.replace('_', ' ')}</span>)}
        </div>
      </div>
      {own ? (
        <Banner kind="info">This is your stop. Sit this one out.</Banner>
      ) : (
        <div className="choice-grid" style={{ gridTemplateColumns: '1fr 1fr' }}>
          <Choice label="Keep" pressed={pick === 'keep'} onClick={() => choose('keep')} />
          <Choice label="Skip" pressed={pick === 'skip'} onClick={() => choose('skip')} />
        </div>
      )}
    </div>
  )
}

export function FinalCheck({ ctx }: { ctx: Ctx }) {
  const fin = ctx.room.results.finalists ?? []
  const days = ctx.room.meta?.days ?? 3
  return (
    <div className="stack-lg">
      <p className="lead">The final two. Take a look before you vote.</p>
      {fin.map((id) => {
        const p = ctx.room.plans[id]
        if (!p) return null
        const f = ctx.room.results.final?.[id]
        return (
          <button key={id} onClick={() => ctx.openPlan(id)} style={{ all: 'unset', cursor: 'pointer' }}>
            <PlanCard plan={p} days={days} />
            <div className="row between small muted" style={{ padding: '8px 4px 0' }}>
              <span className="num">Fit {f?.fit?.toFixed(1) ?? '–'}</span>
              <span className="num">{f?.conflicts ?? 0} dealbreaker clash{(f?.conflicts ?? 0) === 1 ? '' : 'es'}</span>
              <span className="num">{p.scores?.total ?? 0} pts</span>
            </div>
          </button>
        )
      })}
      {ctx.d.isHost && <button className="btn block" onClick={() => api('advance', { code: ctx.code, step: 'finalcheck', force: true }).catch(() => {})}>Go to vote</button>}
    </div>
  )
}

export function Vote({ ctx }: { ctx: Ctx }) {
  const fin = ctx.room.results.finalists ?? []
  const [pick, setPick] = useLocal<string>('vote')
  const locked = isLocked(ctx)
  const choose = (id: string | null) => {
    setPick(id ?? 'abstain')
    haptic()
    submit(ctx, id ?? undefined).catch(() => ctx.toast('Could not save. Try again.'))
  }
  return (
    <div className="stack-lg">
      <p className="lead center">Secret vote. Everyone votes, even if your plan is out.</p>
      <div className="choice-grid">
        {fin.map((id) => {
          const p = ctx.room.plans[id]
          return p ? <Choice key={id} label={p.destination} sub={`${p.ownerNames.join(' & ')} · ${inr(planCost(p, ctx.room.meta?.days ?? 3))}`} pressed={pick === id} onClick={() => choose(id)} /> : null
        })}
      </div>
      <button className="btn ghost block" disabled={locked && pick === 'abstain'} onClick={() => choose(null)}>{pick === 'abstain' ? 'Abstained' : 'Abstain'}</button>
    </div>
  )
}

export function Reveal({ ctx }: { ctx: Ctx }) {
  const rev = ctx.room.results.reveal
  const reduce = useReducedMotion()
  const [stage, setStage] = useState(reduce ? 3 : 0)
  useEffect(() => {
    if (reduce) return
    const t1 = setTimeout(() => setStage(1), 700)
    const t2 = setTimeout(() => {
      setStage(2)
      confetti({ particleCount: 70, spread: 70, startVelocity: 32, origin: { y: 0.35 }, colors: ['#0F766E', '#2DD4BF', '#C9A66B', '#6C8EAD'], disableForReducedMotion: true })
    }, 1500)
    const t3 = setTimeout(() => setStage(3), 2300)
    return () => [t1, t2, t3].forEach(clearTimeout)
  }, [reduce])
  if (!rev) return <RouteLoader label="Counting votes…" />
  const w = ctx.room.plans[rev.winner]
  const ru = rev.runnerUp ? ctx.room.plans[rev.runnerUp] : undefined
  const c = rev.card
  const cons = rev.consolation
  const step = ctx.room.state?.step
  return (
    <div className="stack-lg">
      <div className="stack" style={{ gap: 10 }}>
        {!rev.single && [w, ru].filter(Boolean).map((p, i) => (
          <motion.div key={p!.id} initial={reduce ? { opacity: 0 } : { opacity: 0, x: i ? 40 : -40 }} animate={{ opacity: stage >= 2 && p!.id !== rev.winner ? 0.55 : 1, x: 0, scale: stage >= 2 && p!.id === rev.winner ? 1.02 : 1 }} transition={{ duration: 0.35, delay: i * 0.15 }}>
            <div className="plan-row" style={p!.id === rev.winner && stage >= 2 ? { borderColor: 'var(--accent)' } : undefined}>
              <span className="dot" style={{ background: p!.color }} />
              <div className="grow"><div className="dest">{p!.destination}</div><div className="owners">{p!.ownerNames.join(' & ')}</div></div>
              {stage >= 1 && <span className="num score">{rev.tally[p!.id] ?? 0} <span className="small muted">{(rev.tally[p!.id] ?? 0) === 1 ? "vote" : "votes"}</span></span>}
              {stage >= 2 && p!.id === rev.winner && <Trophy size={18} color="var(--accent)" aria-label="Winner" />}
            </div>
          </motion.div>
        ))}
      </div>
      {stage >= 2 && w && (
        <motion.div className="stack-lg" initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.3 }}>
          <div className="center stack" style={{ gap: 6 }}>
            <span className="section-label">You're going to</span>
            <h1>{w.destination}</h1>
            <span className="muted small">
              {rev.single ? 'The only plan, locked in.' : rev.tieBreak === 'none' ? `${rev.tally[w.id] ?? 0} of ${rev.voters} votes` : rev.tieBreak === 'conflicts' ? 'Tied vote, won on fewer dealbreaker clashes' : rev.tieBreak === 'score' ? 'Tied vote, won on total score' : 'Tied all the way, won on a coin flip'}
            </span>
          </div>
          <div className="card stack-lg">
            <div className="row between"><h3>Trip reality check</h3><EntryPill entry={rev.entry} /></div>
            <div className="stat-grid">
              <Stat v={stage >= 3 ? c.cost : 0} f={inr} k={`per person · ${c.affordCount} of ${c.n} can afford`} />
              <Stat v={stage >= 3 ? c.hours : 0} f={hrs} k={`one way · OK for ${c.journeyOkCount} of ${c.n}`} />
              <div><div className="hero-num" style={{ textTransform: 'capitalize', fontSize: 'var(--fs-22)' }}>{c.pace}</div><div className="small muted">pace · fits {c.paceFitCount} of {c.n}</div></div>
              <Stat v={stage >= 3 ? c.conflicts : 0} k="dealbreaker clashes" />
            </div>
            <p className="small muted">{rev.entry.label}</p>
            {rev.entry.showVisaGuy && rev.entry.visaGuyUrl && (
              <a className="btn primary block" href={rev.entry.visaGuyUrl} target="_blank" rel="noreferrer"><ExternalLink size={16} /> Check visas with The Visa Guy</a>
            )}
          </div>
          <Consolation ctx={ctx} />
          {cons?.done && (cons.pick || (cons.vetoed?.length ?? 0) > 0) && (
            <div className="card stack">
              <h3>Final tweaks</h3>
              {cons.pick && <p className="small">Runner-up added <b>{(cons.pick.stop as Stop).name}</b>.</p>}
              {(cons as { vetoedNames?: string[] }).vetoedNames?.length ? <p className="small">Vetoed: {(cons as { vetoedNames?: string[] }).vetoedNames!.join(', ')}.</p> : null}
              {cons.agreed && <p className="small muted num">Agreed plan: {cons.agreed.stops} stops · {inr(cons.agreed.cost)} per person</p>}
            </div>
          )}
          <StopList stops={w.stops} days={ctx.room.meta?.days ?? 3} />
          {step === 'done' && <a className="btn block" href="/">Play again</a>}
        </motion.div>
      )}
    </div>
  )
}

function Stat({ v, f, k }: { v: number; f?: (n: number) => string; k: string }) {
  return (
    <div>
      <div className="hero-num"><NumberRoll value={v} format={f} /></div>
      <div className="small muted">{k}</div>
    </div>
  )
}

function Consolation({ ctx }: { ctx: Ctx }) {
  const rev = ctx.room.results.reveal!
  const step = ctx.room.state?.step
  const [opts, setOpts] = useState<Stop[] | null>(null)
  const [picked, setPicked] = useState<string | null>(null)
  const [veto, setVeto] = useState<string | null>(null)
  const ru = rev.runnerUp ? ctx.room.plans[rev.runnerUp] : undefined
  const isRunnerUp = !!ru?.owners.includes(ctx.uid)
  const eliminated = Object.values(ctx.room.plans).some((p) => p.status === 'out' && p.owners.includes(ctx.uid))
  useEffect(() => {
    if (step === 'consolation' && isRunnerUp && !opts) api<{ options: Stop[] }>('consolationOptions', { code: ctx.code }).then((r) => setOpts(r.options)).catch(() => setOpts([]))
  }, [step, isRunnerUp, opts, ctx.code])
  if (step !== 'consolation') return null
  const w = ctx.room.plans[rev.winner]
  if (isRunnerUp)
    return (
      <div className="card stack">
        <h3>Runner-up perk</h3>
        <p className="small muted">Add one stop to the winning plan.</p>
        {!opts && <RouteLoader label="Finding options…" />}
        {opts?.map((o) => (
          <button key={o.id} className="choice" style={{ minHeight: 72 }} aria-pressed={picked === o.id} onClick={() => api('consolationPick', { code: ctx.code, stopId: o.id }).then(() => setPicked(o.id)).catch((e) => ctx.toast(e.message))}>
            <b>{o.name}</b><span className="small muted">Day {o.day} · {o.note}</span>
          </button>
        ))}
      </div>
    )
  if (eliminated && w)
    return (
      <div className="card stack">
        <h3>Veto one stop</h3>
        <p className="small muted">Your plan went out, so you can nominate one stop to drop. Up to two vetoes apply.</p>
        {w.stops.map((s) => (
          <button key={s.id} className="btn block" style={{ justifyContent: 'space-between' }} aria-pressed={veto === s.id} onClick={() => { setVeto(s.id); submit(ctx, s.id).catch(() => {}) }}>
            <span>{s.name}</span>{veto === s.id ? <StatusPill kind="caution">Nominated</StatusPill> : <X size={16} />}
          </button>
        ))}
      </div>
    )
  return <p className="small muted center">Runner-up and eliminated players are making final tweaks…</p>
}

export { PrimaryButton }
