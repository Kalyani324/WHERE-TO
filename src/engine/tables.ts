/** Match share (stops matching) → points. */
export function matchPoints(share: number): number {
  if (share >= 0.5) return 3
  if (share >= 0.3) return 2
  if (share >= 0.1) return 1
  return 0
}

/** Share of players (Reality Check) → points. */
export function sharePoints(share: number): number {
  if (share >= 0.75) return 3
  if (share >= 0.5) return 2
  if (share >= 0.25) return 1
  return 0
}
