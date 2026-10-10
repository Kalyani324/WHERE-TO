/** Deterministic randomness derived from a seed stored in the room. */
export function hashString(s: string): number {
  let h = 2166136261 >>> 0
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  return h >>> 0
}

export function rng(seed: string): () => number {
  let a = hashString(seed)
  return () => {
    a |= 0
    a = (a + 0x6d2b79f5) | 0
    let t = Math.imul(a ^ (a >>> 15), 1 | a)
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export function shuffle<T>(items: readonly T[], seed: string): T[] {
  const r = rng(seed)
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(r() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

export function pickRandom<T>(items: readonly T[], count: number, seed: string): T[] {
  return shuffle(items, seed).slice(0, count)
}

/** One coin value per id, in [0, 1). Higher wins. */
export function coinValues(ids: readonly string[], seed: string): Record<string, number> {
  const out: Record<string, number> = {}
  for (const id of ids) out[id] = rng(`${seed}:${id}`)()
  return out
}
