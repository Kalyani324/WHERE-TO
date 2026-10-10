import { motion } from 'motion/react'
import { ArrowLeft, Flag, Sparkles } from 'lucide-react'
import { ref, set } from 'firebase/database'
import { useEffect, useState } from 'react'
import { db } from '../lib/firebase'
import { api } from '../lib/api'
import type { Ctx } from '../lib/ctx'
import type { PublicPlan } from '../shared/schema'
import { hasGreenDot, planCost, planPace, RISK_TAGS, sortStops, stopIsNew, type Stop } from '../engine'
import { EntryPill, FitBar, hrs, inr, ModeIcon, NumberRoll, StatusPill } from './components'

export function GreenDot({ plan, ctx }: { plan: PublicPlan; ctx: Ctx }) {
  const own = plan.owners.includes(ctx.uid)
  if (!hasGreenDot(plan.version, ctx.room.seen[plan.id], own) || plan.version <= 1) return null
  return <span className="green-dot" role="img" aria-label="Changed since you last looked" />
}

export function PlanRow({ plan, ctx, onOpen }: { plan: PublicPlan; ctx: Ctx; onOpen: () => void }) {
  const out = plan.status === 'out'
  return (
    <motion.button layout className={`plan-row ${out ? 'out' : ''}`} onClick={onOpen} transition={{ duration: 0.25 }}>
      <span className="dot" style={{ background: plan.color }} aria-hidden />
      <div className="grow">
        <div className="row">
          <span className="dest ellipsis">{plan.destination}</span>
          <GreenDot plan={plan} ctx={ctx} />
        </div>
        <div className="owners ellipsis">{plan.ownerNames.join(' & ')}</div>
      </div>
      {out ? <span className="pill neutral">Out</span> : <EntryPill entry={plan.entry} />}
      <span className="score">{plan.scores ? <NumberRoll value={plan.scores.total} /> : <span className="muted">–</span>}</span>
    </motion.button>
  )
}

export function PlansTab({ ctx }: { ctx: Ctx }) {
  const plans = ctx.d.plans
  const active = plans.filter((p) => p.status === 'active')
  const out = plans.filter((p) => p.status === 'out')
  if (!plans.length) return <EmptyState text="Plans appear here once someone locks one in." />
  return (
    <div className="stack">
      <div className="row between">
        <h2>Plans</h2>
        <span className="small muted num">{active.length} in play</span>
      </div>
      {[...active, ...out].map((p) => (
        <PlanRow key={p.id} plan={p} ctx={ctx} onOpen={() => ctx.openPlan(p.id)} />
      ))}
      <p className="small muted">A green dot means the plan changed since you last opened it.</p>
    </div>
  )
}

function EmptyState({ text }: { text: string }) {
  return (
    <div className="card flat center" style={{ padding: 32 }}>
      <p className="muted">{text}</p>
    </div>
  )
}

const DAYS = (n: number) => Array.from({ length: n }, (_, i) => i + 1)

export function StopList({ stops, days, seen, highlight }: { stops: Stop[]; days: number; seen?: number; highlight?: (s: Stop) => React.ReactNode }) {
  const sorted = sortStops(stops)
  return (
    <div className="stack">
      {DAYS(days).map((d) => (
        <div key={d} className="card tight">
          <div className="section-label" style={{ marginBottom: 4 }}>Day {d}</div>
          {sorted.filter((s) => s.day === d).map((s) => (
            <div key={s.id} className={`stop ${seen != null && stopIsNew(s.changedInVersion, seen) && (s.changedInVersion ?? 1) > 1 ? 'new' : ''}`}>
              <span className="slot">{s.slot}</span>
              <div className="grow stack" style={{ gap: 4 }}>
                <div className="row between" style={{ alignItems: 'flex-start' }}>
                  <span style={{ fontWeight: 600 }}>{s.name}</span>
                  <span className="small muted num" style={{ whiteSpace: 'nowrap' }}>{s.cost ? inr(s.cost) : 'Free'}</span>
                </div>
                {s.note && <span className="small muted">{s.note}</span>}
                <div className="row wrap" style={{ gap: 6 }}>
                  {seen != null && stopIsNew(s.changedInVersion, seen) && (s.changedInVersion ?? 1) > 1 && <span className="pill info" style={{ height: 22 }}>NEW</span>}
                  {s.weak && <StatusPill kind="caution">Weak</StatusPill>}
                  {s.tags.map((t) => (
                    <span key={t} className={`tag ${(RISK_TAGS as readonly string[]).includes(t) ? 'risk' : ''}`}>{t.replace('_', ' ')}</span>
                  ))}
                </div>
                {highlight?.(s)}
              </div>
            </div>
          ))}
          {!sorted.some((s) => s.day === d) && <p className="small muted">No stops yet.</p>}
        </div>
      ))}
    </div>
  )
}

export function PlanCard({ plan, days, compact }: { plan: PublicPlan; days: number; compact?: boolean }) {
  const cost = planCost(plan, days)
  return (
    <div className="card plan-card">
      <div className="head">
        <span className="bar" style={{ background: plan.color }} aria-hidden />
        <div className="grow">
          <div className="row between">
            <h3 className="ellipsis">{plan.destination}</h3>
            <span className="muted"><ModeIcon mode={plan.journey.mode} /></span>
          </div>
          <div className="small muted ellipsis">{plan.country} · by {plan.ownerNames.join(' & ')}</div>
        </div>
      </div>
      <hr className="divider-dashed" />
      <div className="facts">
        <div className="fact"><div className="v num">{inr(cost)}</div><div className="k">per person</div></div>
        <div className="fact"><div className="v num">{hrs(plan.journey.hours)}</div><div className="k">journey, one way</div></div>
        <div className="fact"><div className="v" style={{ textTransform: 'capitalize' }}>{planPace(plan.stops, days)}</div><div className="k">pace</div></div>
      </div>
      {!compact && (
        <div className="row wrap" style={{ marginTop: 14, gap: 6 }}>
          <EntryPill entry={plan.entry} />
          {plan.checkBadge && <StatusPill kind="caution">Check</StatusPill>}
          {plan.journeyWarning && <StatusPill kind="caution">Long journey</StatusPill>}
          {plan.status === 'out' && <span className="pill neutral">Out</span>}
        </div>
      )}
    </div>
  )
}

export function PlanView({ ctx, planId, onBack }: { ctx: Ctx; planId: string; onBack: () => void }) {
  const plan = ctx.room.plans[planId]
  const [seenAtOpen] = useState(() => ctx.room.seen[planId] ?? 0)
  const [flagged, setFlagged] = useState(false)
  useEffect(() => {
    if (plan) set(ref(db, `rooms/${ctx.code}/seen/${ctx.uid}/${planId}`), plan.version).catch(() => {})
  }, [plan?.version, planId, ctx.code, ctx.uid, plan])
  if (!plan) return null
  const days = ctx.room.meta?.days ?? 3
  const me = ctx.d.me
  const canFlag = !!me?.counted && !plan.owners.includes(ctx.uid) && !['lobby', 'quiz', 'proposals', 'reveal'].includes(ctx.room.state?.phase ?? '')
  const flag = async () => {
    try {
      await api('flag', { code: ctx.code, planId })
      setFlagged(true)
      ctx.toast('Flag noted. Thanks.')
    } catch (e) {
      ctx.toast((e as Error).message)
    }
  }
  return (
    <div className="stack-lg">
      <button className="btn ghost small" style={{ alignSelf: 'flex-start', marginLeft: -12 }} onClick={onBack}>
        <ArrowLeft size={16} /> Back
      </button>
      <PlanCard plan={plan} days={days} />
      {plan.entry && (
        <div className="small muted">
          Entry: {plan.entry.label}
          {plan.entry.permitNote ? ` · ${plan.entry.permitNote}` : ''}
        </div>
      )}
      {plan.checkBadge && (
        <div className="banner caution">
          <Sparkles size={16} />
          <div>
            Journey looks optimistic.{plan.estimate ? ` Our estimate is about ${hrs(plan.estimate.hours)} and ${inr(plan.estimate.cost)}; scoring uses that.` : ' Scoring uses the estimate until the owner corrects it.'}
          </div>
        </div>
      )}
      {plan.fit && ctx.room.results.fitVisible && (
        <div className="card tight stack" style={{ gap: 8 }}>
          <div className="row between"><span className="section-label">Fit</span><span className="num" style={{ fontWeight: 600 }}><NumberRoll value={plan.fit.fit} format={(n) => n.toFixed(1)} /></span></div>
          <FitBar value={plan.fit.fit} color={plan.color} delta={plan.fitDelta} />
        </div>
      )}
      <StopList stops={plan.stops} days={days} seen={seenAtOpen} />
      {canFlag && (
        <button className="btn ghost small" onClick={flag} disabled={flagged} style={{ alignSelf: 'center' }}>
          <Flag size={15} /> {flagged ? 'Flagged' : 'Looks off?'}
        </button>
      )}
    </div>
  )
}

const PART_LABEL: Record<string, string> = { budget: 'Budget', journey: 'Journey', pace: 'Pace', dealbreakers: 'Dealbreakers', entry: 'Entry' }

export function FitTab({ ctx }: { ctx: Ctx }) {
  const [open, setOpen] = useState<string | null>(null)
  const plans = ctx.d.plans.filter((p) => p.status === 'active' && p.fit)
  if (!ctx.room.results.fitVisible || !plans.length)
    return (
      <div className="stack">
        <h2>Fit</h2>
        <div className="card flat center" style={{ padding: 32 }}><p className="muted">Fit shows up after Round 1.</p></div>
        <p className="small muted center">Readiness, not a verdict.</p>
      </div>
    )
  const sorted = [...plans].sort((a, b) => (b.fit?.fit ?? 0) - (a.fit?.fit ?? 0))
  return (
    <div className="stack">
      <div className="row between">
        <h2>Fit</h2>
        <span className="small muted">Readiness, not a verdict.</span>
      </div>
      <div className="card">
        {sorted.map((p, i) => (
          <div key={p.id} style={{ borderTop: i ? '1px solid var(--border)' : 0 }}>
            <button className="fit-row" onClick={() => setOpen(open === p.id ? null : p.id)} aria-expanded={open === p.id}>
              <div className="row between" style={{ width: '100%' }}>
                <span className="row" style={{ fontWeight: 600 }}><span className="dot" style={{ background: p.color }} />{p.destination}</span>
                <span className="num" style={{ fontWeight: 600 }}><NumberRoll value={p.fit!.fit} format={(n) => n.toFixed(1)} /></span>
              </div>
              <div style={{ width: '100%' }}><FitBar value={p.fit!.fit} color={p.color} delta={p.fitDelta} /></div>
            </button>
            {open === p.id && (
              <motion.div className="stack" style={{ gap: 8, paddingBottom: 14 }} initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}>
                {Object.entries(p.fit!.parts).map(([k, v]) => (
                  <div className="mini" key={k}>
                    <span className="muted">{PART_LABEL[k]}</span>
                    <div className="fit-track"><div className="fit-fill" style={{ width: `${Math.max(2, v)}%`, background: p.color }} /></div>
                    <span className="num" style={{ textAlign: 'right' }}>{Math.round(v)}</span>
                  </div>
                ))}
              </motion.div>
            )}
          </div>
        ))}
      </div>
      <p className="small muted">Fit averages budget, journey, pace, dealbreakers and entry for the players who took the quiz. It never picks the winner.</p>
    </div>
  )
}
