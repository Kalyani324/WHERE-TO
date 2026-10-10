const BAD = [
  'fuck', 'shit', 'bitch', 'bastard', 'asshole', 'dick', 'cunt', 'slut', 'whore', 'nigger', 'nigga', 'fag', 'faggot',
  'retard', 'rape', 'porn', 'chutiya', 'madarchod', 'bhenchod', 'behenchod', 'gandu', 'randi', 'bhosdi', 'lavda', 'lauda',
]

export const MAX_TEXT = 200

/** Cap length, strip control chars, mask profanity. */
export function cleanText(input: unknown, max = MAX_TEXT): string {
  let s = typeof input === 'string' ? input : ''
  s = s.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max)
  for (const w of BAD) {
    const re = new RegExp(`\\b${w}\\w*`, 'gi')
    s = s.replace(re, (m) => m[0] + '*'.repeat(Math.max(2, m.length - 1)))
  }
  return s
}

export function isProfane(input: string): boolean {
  return cleanText(input, 10_000) !== input.replace(/\s+/g, ' ').trim().slice(0, 10_000)
}
