import type { Estimate, Journey } from './types.js'

/** Entered hours or journey cost below 60% of the AI estimate → "Check this". */
export function implausible(j: Pick<Journey, 'hours' | 'cost'>, est: Estimate | null | undefined): boolean {
  if (!est) return false
  return (est.hours > 0 && j.hours < 0.6 * est.hours) || (est.cost > 0 && j.cost < 0.6 * est.cost)
}

/** "Looks off" flags needed: 3 players, or 30% of counted players (minimum 2), whichever is lower. */
export function flagThreshold(counted: number): number {
  return Math.min(3, Math.max(2, Math.ceil(0.3 * counted)))
}

export function checkBadge(j: Pick<Journey, 'hours' | 'cost'>, est: Estimate | null | undefined, flags: number, counted: number): boolean {
  return implausible(j, est) || flags >= flagThreshold(counted)
}
