import type { Plan } from './types.js'

export type EntryStatus = 'none' | 'permit' | 'visa_easy' | 'visa_medium' | 'visa_hard' | 'unknown'

export const ENTRY_SCORE: Record<EntryStatus, number> = {
  none: 100,
  permit: 90,
  visa_easy: 80,
  visa_medium: 60,
  visa_hard: 40,
  unknown: 50,
}

export const ENTRY_LABEL: Record<EntryStatus, string> = {
  none: 'None',
  permit: 'Permit',
  visa_easy: 'Visa: Easy',
  visa_medium: 'Visa: Medium',
  visa_hard: 'Visa: Hard',
  unknown: 'Unknown',
}

export const VISA_GUY_BASE = 'https://visaguy.ae/country/'
export const VISA_GUY_CHECKER = 'https://visa-eligibility.visaguy.ae/'

export interface EntryRow {
  name: string
  aliases: string[]
  country: string
  /** Status for an Indian passport (demo data). */
  status: EntryStatus
  note?: string
}

/** Demo data, Indian passport only. Not official advice. */
export const ENTRY_TABLE: EntryRow[] = [
  { name: 'Goa', aliases: ['north goa', 'south goa', 'panaji'], country: 'India', status: 'none' },
  { name: 'Gokarna', aliases: [], country: 'India', status: 'none' },
  { name: 'Ooty', aliases: ['udhagamandalam', 'ooty nilgiris'], country: 'India', status: 'none' },
  { name: 'Wayanad', aliases: [], country: 'India', status: 'none' },
  { name: 'Munnar', aliases: [], country: 'India', status: 'none' },
  { name: 'Gangtok', aliases: ['sikkim', 'north sikkim'], country: 'India', status: 'permit', note: 'Some areas (e.g. Nathula, North Sikkim) need a protected area permit.' },
  { name: 'Leh', aliases: ['ladakh', 'leh ladakh'], country: 'India', status: 'permit', note: 'Inner line permit needed for Nubra, Pangong and similar areas.' },
  { name: 'Dubai', aliases: ['abu dhabi'], country: 'United Arab Emirates', status: 'visa_easy' },
  { name: 'Bangkok', aliases: ['phuket', 'pattaya', 'krabi', 'thailand'], country: 'Thailand', status: 'none' },
  { name: 'Kuala Lumpur', aliases: ['langkawi', 'malaysia'], country: 'Malaysia', status: 'none' },
  { name: 'Bali', aliases: ['ubud', 'indonesia'], country: 'Indonesia', status: 'visa_easy' },
  { name: 'Hanoi', aliases: ['ho chi minh city', 'da nang', 'vietnam'], country: 'Vietnam', status: 'visa_easy' },
  { name: 'Singapore', aliases: [], country: 'Singapore', status: 'visa_medium' },
  { name: 'Tokyo', aliases: ['kyoto', 'osaka', 'japan'], country: 'Japan', status: 'visa_medium' },
  { name: 'London', aliases: ['uk', 'edinburgh'], country: 'United Kingdom', status: 'visa_hard' },
  { name: 'Paris', aliases: ['france'], country: 'France', status: 'visa_hard' },
]

/** visaguy.ae/country pages that exist (checked by scripts/check-links.ts). */
export const VISA_GUY_PAGES: Record<string, string> = {
  Thailand: 'thailand/',
  Malaysia: 'malaysia/',
  Indonesia: 'indonesia/',
  Vietnam: 'vietnam-visa-from-dubai/',
  Singapore: 'singapore-visa-from-dubai/',
  Japan: 'japan-visa-from-dubai-uae/',
  'United Kingdom': 'uk-visa-dubai-uae/',
  France: 'france-visa-from-uae/',
}

export function visaGuyUrl(country: string): string {
  const p = VISA_GUY_PAGES[country]
  return p ? VISA_GUY_BASE + p : VISA_GUY_CHECKER
}

export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function findEntryRow(destination: string, country: string): EntryRow | undefined {
  const n = normalizeName(destination)
  return ENTRY_TABLE.find(
    (r) => r.country === country && (normalizeName(r.name) === n || r.aliases.includes(n)),
  )
}

export interface PlayerEntry {
  status: EntryStatus
  inTable: boolean
  domestic: boolean
  message: string
}

export function entryForPlayer(passport: string, plan: Pick<Plan, 'destination' | 'country'>): PlayerEntry {
  const domestic = passport === plan.country
  if (passport !== 'India') {
    // Table covers only the Indian passport. A plan in your own country is domestic.
    if (domestic) return { status: 'none', inTable: false, domestic, message: 'No known requirement, check local rules' }
    return { status: 'unknown', inTable: false, domestic, message: 'Check with The Visa Guy' }
  }
  const row = findEntryRow(plan.destination, plan.country)
  if (row) {
    const status = row.status
    const message =
      status === 'none' ? 'No visa needed' : status === 'permit' ? (row.note ?? 'Permit needed') : `${ENTRY_LABEL[status]} (demo data)`
    return { status, inTable: true, domestic, message }
  }
  if (domestic) return { status: 'none', inTable: false, domestic, message: 'No known requirement, check local rules' }
  return { status: 'unknown', inTable: false, domestic, message: 'Check with The Visa Guy' }
}

const WORST_ORDER: EntryStatus[] = ['visa_hard', 'unknown', 'visa_medium', 'visa_easy', 'permit', 'none']

export interface PlanEntrySummary {
  total: number
  worst: EntryStatus
  counts: Record<EntryStatus, number>
  visaCount: number
  unknownCount: number
  permitCount: number
  /** Worst visa tier present among visa holders. */
  visaTier: EntryStatus | null
  label: string
  showVisaGuy: boolean
  visaGuyUrl: string | null
  permitNote: string | null
  avgScore: number
}

export function summarizeEntry(statuses: EntryStatus[], plan: Pick<Plan, 'destination' | 'country'>): PlanEntrySummary {
  const counts: Record<EntryStatus, number> = { none: 0, permit: 0, visa_easy: 0, visa_medium: 0, visa_hard: 0, unknown: 0 }
  for (const s of statuses) counts[s]++
  const total = statuses.length
  const worst = WORST_ORDER.find((s) => counts[s] > 0) ?? 'none'
  const visaCount = counts.visa_easy + counts.visa_medium + counts.visa_hard
  const visaTier = (['visa_hard', 'visa_medium', 'visa_easy'] as EntryStatus[]).find((s) => counts[s] > 0) ?? null
  const parts: string[] = []
  if (visaCount) parts.push(`${visaCount} of ${total} need a visa (${ENTRY_LABEL[visaTier!].replace('Visa: ', '')})`)
  if (counts.unknown) parts.push(`Check entry for ${counts.unknown} player${counts.unknown === 1 ? '' : 's'}`)
  if (counts.permit) parts.push(`${counts.permit} of ${total} need a permit`)
  const label = parts.length ? parts.join(' · ') : 'No visa needed'
  const showVisaGuy = visaCount + counts.unknown > 0
  const row = findEntryRow(plan.destination, plan.country)
  return {
    total,
    worst,
    counts,
    visaCount,
    unknownCount: counts.unknown,
    permitCount: counts.permit,
    visaTier,
    label,
    showVisaGuy,
    visaGuyUrl: showVisaGuy ? visaGuyUrl(plan.country) : null,
    permitNote: counts.permit ? (row?.note ?? 'Permit needed for some areas.') : null,
    avgScore: total ? statuses.reduce((s, x) => s + ENTRY_SCORE[x], 0) / total : 100,
  }
}
