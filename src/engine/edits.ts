import type { Plan, Stop } from './types.js'
import { validateStops } from './plan.js'

export type EditAction =
  | { kind: 'add'; stop: Stop }
  | { kind: 'swap'; stopId: string; stop: Stop }
  | { kind: 'remove'; stopId: string }

export interface EditResult {
  ok: boolean
  plan: Plan
  errors: string[]
}

/** Apply one edit. version goes up by 1 and new stops carry changedInVersion. */
export function applyEdit(plan: Plan, action: EditAction, days: number): EditResult {
  const version = plan.version + 1
  let stops: Stop[]
  if (action.kind === 'add') {
    stops = [...plan.stops, { ...action.stop, changedInVersion: version }]
  } else if (action.kind === 'swap') {
    if (!plan.stops.some((s) => s.id === action.stopId)) return { ok: false, plan, errors: ['Stop not found.'] }
    stops = plan.stops.map((s) => (s.id === action.stopId ? { ...action.stop, changedInVersion: version } : s))
  } else {
    if (!plan.stops.some((s) => s.id === action.stopId)) return { ok: false, plan, errors: ['Stop not found.'] }
    stops = plan.stops.filter((s) => s.id !== action.stopId)
  }
  const v = validateStops(stops, days)
  if (!v.ok) return { ok: false, plan, errors: v.errors }
  return { ok: true, plan: { ...plan, stops, version }, errors: [] }
}

/** Green dot: plan changed since you last opened it. Your own plan never shows a dot. */
export function hasGreenDot(version: number, lastSeen: number | undefined, isOwn: boolean): boolean {
  if (isOwn) return false
  return version > (lastSeen ?? 0)
}

export function stopIsNew(changedInVersion: number | undefined, lastSeen: number | undefined): boolean {
  return (changedInVersion ?? 0) > (lastSeen ?? 0) && (changedInVersion ?? 0) > 1
}
