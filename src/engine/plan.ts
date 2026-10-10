import type { Journey, Pace, Plan, RiskTag, Stop } from './types.js'
import { RISK_TAGS } from './types.js'

export function effectiveJourney(plan: Pick<Plan, 'journey' | 'estimate' | 'checkBadge'>): Journey {
  const j = plan.journey
  if (!plan.checkBadge || !plan.estimate) return j
  return { ...j, hours: Math.max(j.hours, plan.estimate.hours), cost: Math.max(j.cost, plan.estimate.cost) }
}

export function stopsCost(stops: Stop[]): number {
  return stops.reduce((s, x) => s + (Number(x.cost) || 0), 0)
}

/** Cost per person = round-trip journey + stay per night × (days − 1) + stop costs. */
export function planCost(plan: Pick<Plan, 'journey' | 'stayPerNight' | 'stops'>, days: number): number {
  return plan.journey.cost + plan.stayPerNight * Math.max(0, days - 1) + stopsCost(plan.stops)
}

/** Cost used for Fit / Reality Check (worse values when badged). */
export function scoredCost(plan: Plan, days: number): number {
  return planCost({ ...plan, journey: effectiveJourney(plan) }, days)
}

export function scoredHours(plan: Plan): number {
  return effectiveJourney(plan).hours
}

export function avgStopsPerDay(stops: Stop[], days: number): number {
  return days > 0 ? stops.length / days : stops.length
}

export function planPace(stops: Stop[], days: number): Pace {
  return avgStopsPerDay(stops, days) <= 2.5 ? 'relaxed' : 'packed'
}

export function planRiskTags(stops: Stop[]): RiskTag[] {
  const set = new Set<string>()
  for (const s of stops) for (const t of s.tags) set.add(t)
  return RISK_TAGS.filter((t) => set.has(t))
}

/** Round-trip hours ÷ (days × 24). */
export function journeyShare(hoursOneWay: number, days: number): number {
  return (hoursOneWay * 2) / (days * 24)
}

export function journeyWarning(hoursOneWay: number, days: number): boolean {
  return journeyShare(hoursOneWay, days) > 0.25
}

export interface StopValidation {
  ok: boolean
  errors: string[]
}

export function validateStops(stops: Stop[], days: number): StopValidation {
  const errors: string[] = []
  if (stops.length < 3) errors.push('A plan needs at least 3 stops.')
  const perDay = new Map<number, number>()
  for (const s of stops) {
    if (!s.name?.trim()) errors.push('Every stop needs a name.')
    if (s.day < 1 || s.day > days) errors.push(`"${s.name}" is on a day outside the trip.`)
    perDay.set(s.day, (perDay.get(s.day) ?? 0) + 1)
  }
  for (const [d, n] of perDay) if (n > 4) errors.push(`Day ${d} has more than 4 stops.`)
  return { ok: errors.length === 0, errors: [...new Set(errors)] }
}

export function validStopCount(stops: Stop[], days: number): number {
  const perDay = new Map<number, number>()
  let n = 0
  for (const s of stops) {
    if (!s.name?.trim() || s.day < 1 || s.day > days) continue
    const c = (perDay.get(s.day) ?? 0) + 1
    if (c > 4) continue
    perDay.set(s.day, c)
    n++
  }
  return n
}

export function sortStops(stops: Stop[]): Stop[] {
  const order = { morning: 0, afternoon: 1, evening: 2, night: 3 } as const
  return [...stops].sort((a, b) => a.day - b.day || order[a.slot] - order[b.slot])
}
