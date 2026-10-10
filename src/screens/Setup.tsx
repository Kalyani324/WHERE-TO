// Quiz, proposals, passport control, single-plan choice and backing.
import { useEffect, useMemo, useRef, useState } from 'react'
import { ref, serverTimestamp, set } from 'firebase/database'
import { Check, Plus, Sparkles, Trash2, UserRound } from 'lucide-react'
import { db } from '../lib/firebase'
import { api } from '../lib/api'
import { isLocked, submit, type Ctx } from '../lib/ctx'
import { COUNTRIES } from '../shared/config'
import type { DraftForm } from '../shared/schema'
import { implausible, MODES, RISK_TAGS, SLOTS, validateStops, VIBE_TAGS, type Mode, type Pace, type RiskTag, type Stop, type Tag } from '../engine'
import { RISK_LABEL } from '../engine'
import { Banner, haptic, inr, ModeIcon, PrimaryButton, RouteLoader } from '../ui/components'
import { PlanRow } from '../ui/plans'

export function Quiz({ ctx }: { ctx: Ctx }) {
  const locked = isLocked(ctx)
  const [passport, setPassport] = useState('India')
  const [pace, setPace] = useState<Pace>('relaxed')
  const [budget, setBudget] = useState(25000)
  const [maxHours, setMaxHours] = useState(8)
  const [deal, setDeal] = useState<RiskTag[]>([])
  const [busy, setBusy] = useState(false)
  const st = ctx.room.state!
  if (st.notice === 'quiz-short')
    return (
      <div className="stack-lg">
        <Banner kind="caution">Fewer than 3 people answered in time, so the game is paused.</Banner>
        {ctx.d.isHost ? (
          <PrimaryButton onClick={() => api('restartQuiz', { code: ctx.code }).catch((e) => ctx.toast(e.message))}>Restart the quiz</PrimaryButton>
        ) : (
          <p className="muted center">Waiting for the host to restart the quiz.</p>
        )}
      </div>
    )
  if (locked) return <RouteLoader label="Answers in. Waiting for the others." />
  const send = async () => {
    setBusy(true)
    try {
      const base = `rooms/${ctx.code}/private/${ctx.uid}`
      await set(ref(db, `${base}/passport`), passport)
      await set(ref(db, `${base}/quiz`), { pace, budget, maxHours, dealbreakers: deal, t: serverTimestamp() })
      await submit(ctx, undefined)
      haptic()
    } catch {
      ctx.toast('Could not save. You may have already answered.')
      await submit(ctx, undefined).catch(() => {})
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="stack-lg">
      <p className="muted">Private. Only group totals are ever shown.</p>
      <div className="card stack-lg">
        <div className="field">
          <span className="label">Pace</span>
          <div className="seg">
            <button aria-pressed={pace === 'relaxed'} onClick={() => setPace('relaxed')}>Relaxed</button>
            <button aria-pressed={pace === 'packed'} onClick={() => setPace('packed')}>Packed</button>
          </div>
        </div>
        <div className="field">
          <div className="row between"><label htmlFor="budget">Max budget per person</label><span className="num" style={{ fontWeight: 600 }}>{inr(budget)}</span></div>
          <input id="budget" type="range" min={5000} max={100000} step={1000} value={budget} onChange={(e) => setBudget(Number(e.target.value))} />
        </div>
        <div className="field">
          <div className="row between"><label htmlFor="hours">Max journey, one way</label><span className="num" style={{ fontWeight: 600 }}>{maxHours} h</span></div>
          <input id="hours" type="range" min={1} max={24} step={1} value={maxHours} onChange={(e) => setMaxHours(Number(e.target.value))} />
        </div>
        <div className="field">
          <span className="label">Dealbreakers</span>
          <div className="chips">
            {RISK_TAGS.map((t) => (
              <button key={t} className="chip-toggle" aria-pressed={deal.includes(t)} onClick={() => setDeal(deal.includes(t) ? deal.filter((x) => x !== t) : [...deal, t])}>
                {deal.includes(t) && <Check size={14} />} {RISK_LABEL[t].replace(/^./, (c) => c.toUpperCase())}
              </button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="passport">Passport country</label>
          <select id="passport" className="input" value={passport} onChange={(e) => setPassport(e.target.value)}>
            {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
          </select>
          <span className="small muted">Used only for entry checks. Never shown to anyone.</span>
        </div>
      </div>
      <div className="sticky-cta"><PrimaryButton busy={busy} onClick={send}>Lock in answers</PrimaryButton></div>
    </div>
  )
}

const emptyForm = (start: string): DraftForm => ({ destination: '', country: 'India', mode: 'train', hours: 0, journeyCost: 0, stayPerNight: 0, mustDos: start ? '' : '' })
let sidc = 0
const blankStop = (day: number): Stop => ({ id: `u${Date.now().toString(36)}${sidc++}`, name: '', day, slot: 'afternoon', cost: 0, tags: [], note: '' })

export function Proposals({ ctx }: { ctx: Ctx }) {
  const me = ctx.d.me
  const [mode, setMode] = useState<'choose' | 'propose'>(ctx.room.draft?.form?.destination ? 'propose' : 'choose')
  if (me?.role === 'proposer' && me.planId) {
    const plan = ctx.room.plans[me.planId]
    return (
      <div className="stack-lg">
        <Banner kind="success">Your plan is locked{plan && plan.owners.length > 1 ? `, co-owned with ${plan.ownerNames.filter((n) => n !== me.name).join(', ')}` : ''}.</Banner>
        <LockedPlans ctx={ctx} />
      </div>
    )
  }
  if (isLocked(ctx) && mode === 'choose')
    return (
      <div className="stack-lg">
        <Banner kind="info">You are supporting this round. You still play every game.</Banner>
        <button className="btn block" onClick={() => setMode('propose')}>Actually, I want to propose</button>
        <LockedPlans ctx={ctx} />
      </div>
    )
  if (mode === 'choose')
    return (
      <div className="stack-lg">
        <p className="lead">Got a trip in mind? Pitch it. Otherwise, support and play.</p>
        <button className="choice" onClick={() => setMode('propose')}>
          <span className="big">Propose a trip</span>
          <span className="muted">Pick a place, the AI drafts a plan, you tweak it.</span>
        </button>
        <button className="choice" onClick={() => submit(ctx, undefined)}>
          <span className="big">I'll support</span>
          <span className="muted">You'll back a plan and play every round.</span>
        </button>
        <LockedPlans ctx={ctx} />
      </div>
    )
  return <ProposalForm ctx={ctx} onCancel={() => setMode('choose')} />
}

function LockedPlans({ ctx }: { ctx: Ctx }) {
  const plans = ctx.d.plans
  if (!plans.length) return null
  return (
    <div className="stack">
      <span className="section-label">Locked so far</span>
      {plans.map((p) => <PlanRow key={p.id} plan={p} ctx={ctx} onOpen={() => ctx.openPlan(p.id)} />)}
    </div>
  )
}

function ProposalForm({ ctx, onCancel }: { ctx: Ctx; onCancel: () => void }) {
  const days = ctx.room.meta?.days ?? 3
  const saved = ctx.room.draft
  const [form, setForm] = useState<DraftForm>(() => saved?.form ?? emptyForm(ctx.room.meta?.start ?? ''))
  const [stops, setStops] = useState<Stop[]>(() => saved?.stops ?? [])
  const [source, setSource] = useState(saved?.source)
  const [estimate, setEstimate] = useState<{ hours: number; cost: number } | null>(null)
  const [busy, setBusy] = useState<'' | 'draft' | 'lock'>('')
  const [err, setErr] = useState('')
  const [dup, setDup] = useState<{ ownerNames: string[]; destination: string } | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined)

  useEffect(() => {
    clearTimeout(timer.current)
    timer.current = setTimeout(() => {
      set(ref(db, `rooms/${ctx.code}/drafts/${ctx.uid}`), { form, stops, source: source ?? 'blank', updatedAt: Date.now() }).catch(() => {})
    }, 400)
    return () => clearTimeout(timer.current)
  }, [form, stops, source, ctx.code, ctx.uid])

  const upd = (k: keyof DraftForm, v: unknown) => setForm((f) => ({ ...f, [k]: v }))
  const updStop = (id: string, patch: Partial<Stop>) => setStops((s) => s.map((x) => (x.id === id ? { ...x, ...patch } : x)))
  const validation = useMemo(() => validateStops(stops.filter((s) => s.name.trim()), days), [stops, days])
  const warn = estimate && implausible({ hours: Number(form.hours), cost: Number(form.journeyCost) }, estimate)

  const draft = async () => {
    setErr('')
    setBusy('draft')
    try {
      const r = await api<{ stops: Stop[]; source: string; estimate: { hours: number; cost: number } | null }>('draft', {
        code: ctx.code, destination: form.destination, country: form.country, mode: form.mode, mustDos: form.mustDos,
      })
      if (r.stops.length) setStops(r.stops)
      else {
        setStops([blankStop(1), blankStop(2), blankStop(Math.min(3, days))])
        setErr('The AI is busy. Add a few stops yourself.')
      }
      setSource(r.source as never)
      setEstimate(r.estimate)
      if (r.estimate) setForm((f) => ({ ...f, hours: f.hours || r.estimate!.hours, journeyCost: f.journeyCost || r.estimate!.cost, stayPerNight: f.stayPerNight || 2500 }))
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  const lock = async (coOwn?: boolean) => {
    setErr('')
    setBusy('lock')
    try {
      const clean = stops.filter((s) => s.name.trim())
      await set(ref(db, `rooms/${ctx.code}/drafts/${ctx.uid}`), { form: { ...form, hours: Number(form.hours), journeyCost: Number(form.journeyCost), stayPerNight: Number(form.stayPerNight) }, stops: clean, source: source ?? 'blank', updatedAt: Date.now() })
      const r = await api<{ planId?: string; duplicate?: { ownerNames: string[]; destination: string } }>('lock', { code: ctx.code, ...(coOwn == null ? {} : { coOwn }) })
      if (r.duplicate) setDup(r.duplicate)
      else {
        await submit(ctx, undefined)
        haptic()
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy('')
    }
  }

  if (dup)
    return (
      <div className="stack-lg">
        <h2>Same trip as {dup.ownerNames.join(' & ')}'s?</h2>
        <p className="muted">There is already a {dup.destination} plan. Team up or keep yours separate.</p>
        <PrimaryButton busy={busy === 'lock'} onClick={() => { setDup(null); lock(true) }}>Co-own their plan</PrimaryButton>
        <button className="btn block" onClick={() => { setDup(null); lock(false) }}>Keep mine separate</button>
      </div>
    )

  return (
    <div className="stack-lg">
      <div className="card stack-lg">
        <div className="field">
          <label htmlFor="dest">Destination</label>
          <input id="dest" className="input" maxLength={60} value={form.destination} onChange={(e) => upd('destination', e.target.value)} placeholder="e.g. Gokarna" />
        </div>
        <div className="field">
          <label htmlFor="country">Country</label>
          <select id="country" className="input" value={form.country} onChange={(e) => upd('country', e.target.value)}>
            {COUNTRIES.map((c) => <option key={c}>{c}</option>)}
          </select>
        </div>
        <div className="field">
          <span className="label">Getting there</span>
          <div className="seg" style={{ gridAutoColumns: 'minmax(0,1fr)' }}>
            {MODES.map((m) => (
              <button key={m} aria-pressed={form.mode === m} onClick={() => upd('mode', m as Mode)} aria-label={m} title={m}><ModeIcon mode={m} size={18} /></button>
            ))}
          </div>
        </div>
        <div className="field">
          <label htmlFor="must">Must-dos (optional)</label>
          <textarea id="must" className="input" maxLength={200} value={form.mustDos} onChange={(e) => upd('mustDos', e.target.value)} placeholder="Sunset at the beach, seafood…" />
        </div>
        <button className="btn block" onClick={draft} disabled={!form.destination.trim() || busy !== ''}>
          <Sparkles size={16} /> {stops.length ? 'Redraft with AI' : 'Draft my plan'}
        </button>
      </div>
      {busy === 'draft' && <RouteLoader label="Drafting your itinerary…" />}
      {err && <Banner kind="caution">{err}</Banner>}

      {stops.length > 0 && busy !== 'draft' && (
        <>
          <div className="card stack-lg">
            <h3>Journey and stay</h3>
            <div className="row" style={{ gap: 10 }}>
              <NumField label="Hours, one way" value={form.hours} onChange={(v) => upd('hours', v)} step={0.5} />
              <NumField label="Journey ₹, round trip" value={form.journeyCost} onChange={(v) => upd('journeyCost', v)} />
            </div>
            <NumField label="Stay ₹ per night, per person" value={form.stayPerNight} onChange={(v) => upd('stayPerNight', v)} />
            {warn && <Banner kind="caution">These look low. Our estimate is about {estimate!.hours} h and {inr(estimate!.cost)}. You can lock anyway, but the plan will get a Check badge and score on our estimate.</Banner>}
          </div>
          <div className="stack">
            <div className="row between">
              <h3>Stops</h3>
              <span className="small muted">{source === 'ai' ? 'AI draft' : source === 'sample' || source === 'mock' ? 'Sample draft' : 'Your stops'}</span>
            </div>
            {Array.from({ length: days }, (_, i) => i + 1).map((day) => (
              <div key={day} className="card tight stack" style={{ gap: 10 }}>
                <div className="row between"><span className="section-label">Day {day}</span>
                  <button className="btn ghost small" disabled={stops.filter((s) => s.day === day).length >= 4} onClick={() => setStops([...stops, blankStop(day)])}><Plus size={14} /> Stop</button>
                </div>
                {stops.filter((s) => s.day === day).map((s) => (
                  <StopEditor key={s.id} stop={s} onChange={(p) => updStop(s.id, p)} onRemove={() => setStops(stops.filter((x) => x.id !== s.id))} />
                ))}
              </div>
            ))}
            {!validation.ok && <Banner kind="info">{validation.errors[0]}</Banner>}
          </div>
          <div className="sticky-cta stack">
            <PrimaryButton busy={busy === 'lock'} disabled={!validation.ok || !form.destination.trim()} onClick={() => lock()}>Lock my plan</PrimaryButton>
          </div>
        </>
      )}
      <button className="btn ghost block" onClick={onCancel}>Back</button>
    </div>
  )
}

function NumField({ label, value, onChange, step = 100 }: { label: string; value: number; onChange: (v: number) => void; step?: number }) {
  return (
    <div className="field grow">
      <label>{label}</label>
      <input className="input num" type="number" inputMode="decimal" min={0} step={step} value={value || ''} onChange={(e) => onChange(Number(e.target.value))} />
    </div>
  )
}

function StopEditor({ stop, onChange, onRemove }: { stop: Stop; onChange: (p: Partial<Stop>) => void; onRemove: () => void }) {
  const [open, setOpen] = useState(!stop.name)
  if (!open)
    return (
      <div className="row" style={{ gap: 10 }}>
        <button className="grow" style={{ background: 'none', border: 0, padding: 0, textAlign: 'left' }} onClick={() => setOpen(true)}>
          <div style={{ fontWeight: 600 }}>{stop.name}</div>
          <div className="small muted"><span style={{ textTransform: 'capitalize' }}>{stop.slot}</span> · {stop.cost ? inr(stop.cost) : 'Free'}{stop.tags.length ? ` · ${stop.tags.map((t) => t.replace('_', ' ')).join(', ')}` : ''}</div>
        </button>
        <button className="icon-btn" aria-label={`Remove ${stop.name}`} onClick={onRemove}><Trash2 size={16} /></button>
      </div>
    )
  return (
    <div className="stack" style={{ gap: 8, padding: 10, borderRadius: 12, background: 'var(--surface-2)' }}>
      <input className="input" placeholder="Stop name" maxLength={60} value={stop.name} onChange={(e) => onChange({ name: e.target.value })} />
      <div className="row" style={{ gap: 8 }}>
        <select className="input" value={stop.slot} onChange={(e) => onChange({ slot: e.target.value as Stop['slot'] })}>
          {SLOTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <input className="input num" type="number" inputMode="numeric" placeholder="₹ cost" value={stop.cost || ''} onChange={(e) => onChange({ cost: Number(e.target.value) })} />
      </div>
      <div className="chips">
        {[...VIBE_TAGS, ...RISK_TAGS].map((t) => (
          <button key={t} className="chip-toggle" style={{ minHeight: 34 }} aria-pressed={stop.tags.includes(t as Tag)} onClick={() => onChange({ tags: stop.tags.includes(t as Tag) ? stop.tags.filter((x) => x !== t) : [...stop.tags, t as Tag].slice(0, 4) })}>
            {t.replace('_', ' ')}
          </button>
        ))}
      </div>
      <div className="row between">
        <button className="btn ghost small danger" onClick={onRemove}><Trash2 size={14} /> Remove</button>
        <button className="btn small" disabled={!stop.name.trim()} onClick={() => setOpen(false)}><Check size={14} /> Done</button>
      </div>
    </div>
  )
}

export function Passport({ ctx }: { ctx: Ctx }) {
  const prof = ctx.room.results.profile
  return (
    <div className="stack-lg">
      <p className="lead">Passport control. Each plan shows what entry looks like for the group.</p>
      {prof && (
        <div className="card tight row between small">
          <span>Median budget <b className="num">{inr(prof.medianBudget)}</b></span>
          <span className="num">{prof.relaxed} relaxed · {prof.packed} packed</span>
        </div>
      )}
      <div className="stack">
        {ctx.d.plans.map((p) => (
          <div key={p.id} className="stack" style={{ gap: 4 }}>
            <PlanRow plan={p} ctx={ctx} onOpen={() => ctx.openPlan(p.id)} />
            {p.entry && <span className="small muted" style={{ paddingLeft: 16 }}>{p.entry.label}</span>}
          </div>
        ))}
      </div>
      <p className="small muted">Something look off? Open a plan and tap "Looks off?".</p>
      {ctx.d.isHost && <button className="btn block" onClick={() => api('advance', { code: ctx.code, step: 'passport', force: true }).catch(() => {})}>Continue</button>}
    </div>
  )
}

export function Single({ ctx }: { ctx: Ctx }) {
  const plan = ctx.d.plans[0]
  return (
    <div className="stack-lg">
      <h2>Only one plan came in</h2>
      {plan && <PlanRow plan={plan} ctx={ctx} onOpen={() => ctx.openPlan(plan.id)} />}
      {ctx.d.isHost ? (
        <>
          <PrimaryButton onClick={() => api('singleChoice', { code: ctx.code, choice: 'lock' }).catch((e) => ctx.toast(e.message))}>Lock it in</PrimaryButton>
          <button className="btn block" onClick={() => api('singleChoice', { code: ctx.code, choice: 'more' }).catch((e) => ctx.toast(e.message))}>Add another idea</button>
        </>
      ) : (
        <Banner kind="info">The host decides: lock it in, or reopen proposals.</Banner>
      )}
    </div>
  )
}

export function Backing({ ctx }: { ctx: Ctx }) {
  const [pick, setPick] = useState<string | null>(null)
  if (ctx.d.me?.role === 'proposer')
    return <RouteLoader label="Supporters are picking a plan to back." />
  const choose = async (id: string) => {
    setPick(id)
    haptic()
    await submit(ctx, id).catch(() => ctx.toast('Could not save. Try again.'))
  }
  return (
    <div className="stack-lg">
      <p className="lead">Back one plan. Its points become your points.</p>
      <div className="choice-grid">
        {ctx.d.plans.map((p) => (
          <button key={p.id} className="choice" style={{ minHeight: 88 }} aria-pressed={pick === p.id} onClick={() => choose(p.id)}>
            <span className="row"><span className="dot" style={{ background: p.color }} /><span className="big" style={{ fontSize: 'var(--fs-17)' }}>{p.destination}</span></span>
            <span className="small muted"><UserRound size={13} style={{ verticalAlign: -2 }} /> {p.ownerNames.join(' & ')}</span>
          </button>
        ))}
      </div>
      {pick && <span className="locked-in" style={{ alignSelf: 'center' }}><Check size={16} /> Locked in</span>}
    </div>
  )
}
