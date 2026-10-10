import { animate, AnimatePresence, motion, useReducedMotion } from 'motion/react'
import { useEffect, useRef, useState, type ReactNode } from 'react'
import {
  AlertTriangle, Bus, Camera, Car, Check, CircleHelp, Coffee, Compass, FileCheck2, Info, Leaf, Map as MapIcon, MapPin, Moon, Mountain,
  Plane, ShieldCheck, Ship, Sun, Tent, TrainFront, Waves, XCircle,
} from 'lucide-react'
import type { Mode } from '../engine'
import type { PlanEntrySummary } from '../engine'
import type { Avatar } from '../shared/config'

export const DISCLAIMER = 'Entry info is a demo guide, not legal advice. Check official sources or The Visa Guy before you book.'

export function Footer() {
  return <p className="footer">{DISCLAIMER}</p>
}

export function ModeIcon({ mode, size = 18 }: { mode: Mode; size?: number }) {
  const C = { train: TrainFront, bus: Bus, car: Car, ferry: Ship, flight: Plane }[mode] ?? TrainFront
  return <C size={size} strokeWidth={1.75} aria-label={mode} />
}

const AVATAR_ICONS: Record<Avatar, typeof Compass> = {
  compass: Compass, mountain: Mountain, waves: Waves, sun: Sun, tent: Tent, camera: Camera, coffee: Coffee, map: MapIcon, leaf: Leaf, moon: Moon,
}
export function AvatarIcon({ avatar, size = 18 }: { avatar: Avatar; size?: number }) {
  const C = AVATAR_ICONS[avatar] ?? Compass
  return <C size={size} strokeWidth={1.75} />
}

export function PrimaryButton({ children, busy, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement> & { busy?: boolean }) {
  return (
    <button className={`btn primary block ${rest.className ?? ''}`} {...rest} disabled={rest.disabled || busy}>
      {busy ? <span className="muted-dots">Working</span> : children}
    </button>
  )
}

/** Smoothly counts between numeric values. */
export function NumberRoll({ value, format, className }: { value: number; format?: (n: number) => string; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(value)
  const reduce = useReducedMotion()
  const fmt = format ?? ((n: number) => String(Math.round(n)))
  useEffect(() => {
    const el = ref.current
    if (!el) return
    if (reduce || prev.current === value) {
      el.textContent = fmt(value)
      prev.current = value
      return
    }
    const c = animate(prev.current, value, { duration: 0.45, ease: [0.2, 0.7, 0.2, 1], onUpdate: (v) => (el.textContent = fmt(v)) })
    prev.current = value
    return () => c.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value, reduce])
  return (
    <span ref={ref} className={`num ${className ?? ''}`}>
      {fmt(value)}
    </span>
  )
}

export function TimerRing({ endsAt, total, now, paused }: { endsAt: number | null; total: number; now: number; paused?: boolean }) {
  const left = endsAt ? Math.max(0, endsAt - now) : 0
  const secs = Math.ceil(left / 1000)
  const frac = endsAt && total > 0 ? Math.min(1, left / (total * 1000)) : 0
  const r = 28
  const c = 2 * Math.PI * r
  const urgent = !!endsAt && secs <= 5 && secs > 0 && !paused
  return (
    <div className={`timer ${urgent ? 'urgent' : ''}`} role="timer" aria-label={`${secs} seconds left`}>
      <svg viewBox="0 0 64 64" width="64" height="64" aria-hidden>
        <circle cx="32" cy="32" r={r} fill="none" stroke="var(--border)" strokeWidth="3" />
        <circle
          cx="32" cy="32" r={r} fill="none" stroke="var(--accent)" strokeWidth="3" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - frac)} style={{ transition: 'stroke-dashoffset 250ms linear' }}
        />
      </svg>
      <span className="t num">{paused ? '||' : endsAt ? secs : '–'}</span>
    </div>
  )
}

export function PlayerChip({ name, title, avatar, ring, offline, right }: { name: string; title?: string; avatar: Avatar; ring?: string; offline?: boolean; right?: ReactNode }) {
  return (
    <div className={`player-chip ${offline ? 'offline' : ''}`}>
      <span className="avatar" style={{ ['--ring' as string]: ring ?? 'var(--border)' }}>
        <AvatarIcon avatar={avatar} />
      </span>
      <div className="grow">
        <div className="name ellipsis">{name}</div>
        {title && <div className="title ellipsis">{offline ? 'Reconnecting…' : title}</div>}
      </div>
      {right}
    </div>
  )
}

const ENTRY_UI: Record<string, { cls: string; label: string; Icon: typeof Check }> = {
  none: { cls: 'success', label: 'None', Icon: ShieldCheck },
  permit: { cls: 'info', label: 'Permit', Icon: FileCheck2 },
  visa_easy: { cls: 'info', label: 'Visa: Easy', Icon: FileCheck2 },
  visa_medium: { cls: 'caution', label: 'Visa: Medium', Icon: AlertTriangle },
  visa_hard: { cls: 'error', label: 'Visa: Hard', Icon: XCircle },
  unknown: { cls: 'neutral', label: 'Unknown', Icon: CircleHelp },
}
export function EntryPill({ entry, status }: { entry?: PlanEntrySummary; status?: string }) {
  const s = status ?? entry?.worst ?? 'unknown'
  const u = ENTRY_UI[s] ?? ENTRY_UI.unknown
  return (
    <span className={`pill ${u.cls}`} title={entry?.label}>
      <u.Icon size={14} strokeWidth={2} aria-hidden />
      {u.label}
    </span>
  )
}

export function StatusPill({ kind, children }: { kind: 'success' | 'caution' | 'error' | 'info' | 'neutral'; children: ReactNode }) {
  const Icon = { success: Check, caution: AlertTriangle, error: XCircle, info: Info, neutral: Info }[kind]
  return (
    <span className={`pill ${kind}`}>
      <Icon size={14} strokeWidth={2} aria-hidden />
      {children}
    </span>
  )
}

export function Banner({ kind, children }: { kind: 'success' | 'caution' | 'error' | 'info'; children: ReactNode }) {
  const Icon = { success: Check, caution: AlertTriangle, error: XCircle, info: Info }[kind]
  return (
    <div className={`banner ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>
      <Icon size={16} strokeWidth={2} aria-hidden />
      <div>{children}</div>
    </div>
  )
}

export function FitBar({ value, color, delta, height }: { value: number; color: string; delta?: number; height?: number }) {
  const [show, setShow] = useState(false)
  useEffect(() => {
    if (!delta) return
    setShow(true)
    const t = setTimeout(() => setShow(false), 1600)
    return () => clearTimeout(t)
  }, [delta, value])
  return (
    <div className="row" style={{ gap: 10 }}>
      <div className="fit-track grow" style={height ? { height } : undefined}>
        <motion.div className="fit-fill" style={{ background: color }} initial={false} animate={{ width: `${Math.max(2, Math.min(100, value))}%` }} transition={{ duration: 0.5, ease: [0.2, 0.7, 0.2, 1] }} />
      </div>
      <AnimatePresence>
        {show && delta ? (
          <motion.span className={`small num ${delta > 0 ? '' : ''}`} style={{ color: delta > 0 ? 'var(--success)' : 'var(--error)', fontWeight: 600 }} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            {delta > 0 ? `+${delta}` : delta}
          </motion.span>
        ) : null}
      </AnimatePresence>
    </div>
  )
}

/** Waiting state: a dotted route drawing itself between two pins. */
export function RouteLoader({ label }: { label: string }) {
  const reduce = useReducedMotion()
  return (
    <div className="route-loader" role="status" aria-live="polite">
      <svg width="180" height="48" viewBox="0 0 180 48" aria-hidden>
        <motion.path
          d="M18 34 C 60 4, 120 44, 162 14" fill="none" stroke="var(--accent)" strokeWidth="2" strokeDasharray="2 6" strokeLinecap="round"
          initial={{ pathLength: reduce ? 1 : 0 }} animate={{ pathLength: 1 }}
          transition={reduce ? undefined : { duration: 1.6, repeat: Infinity, repeatType: 'loop', ease: 'easeInOut', repeatDelay: 0.3 }}
        />
        <g transform="translate(8 18)"><MapPin size={20} color="var(--text-2)" strokeWidth={1.75} /></g>
        <g transform="translate(152 -2)"><MapPin size={20} color="var(--text-2)" strokeWidth={1.75} /></g>
      </svg>
      <span className="small">{label}</span>
    </div>
  )
}

export function LockCount({ n, total }: { n: number; total: number }) {
  return (
    <p className="lockcount num" aria-live="polite">
      {n} of {total} locked in
    </p>
  )
}

export function Sheet({ open, onClose, children, label }: { open: boolean; onClose: () => void; children: ReactNode; label: string }) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div className="sheet-backdrop" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} onClick={onClose}>
          <motion.div
            className="sheet" role="dialog" aria-label={label} aria-modal onClick={(e) => e.stopPropagation()}
            initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }} transition={{ duration: 0.22, ease: [0.2, 0.7, 0.2, 1] }}
          >
            <div className="grab" />
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  )
}

export const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`
export const hrs = (n: number) => `${Math.round(n * 10) / 10}h`

export function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* unsupported */
  }
}
