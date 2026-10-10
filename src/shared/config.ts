export interface Timers {
  quiz: number
  quizExtend: number
  proposals: number
  passport: number
  backing: number
  guess: number
  tap: number
  reveal: number
  results: number
  edit: number
  card: number
  finalcheck: number
  vote: number
  consolation: number
}

export const NORMAL_TIMERS: Timers = {
  quiz: 45, quizExtend: 30, proposals: 180, passport: 20, backing: 20, guess: 5, tap: 10, reveal: 4,
  results: 20, edit: 45, card: 8, finalcheck: 20, vote: 30, consolation: 30,
}

/** Quick Mode: ~4-5 minutes for booth demos. */
export const QUICK_TIMERS: Timers = {
  quiz: 30, quizExtend: 20, proposals: 90, passport: 10, backing: 10, guess: 5, tap: 10, reveal: 3,
  results: 10, edit: 20, card: 8, finalcheck: 10, vote: 15, consolation: 20,
}

export interface ModeRules {
  questions: number
  cardsPerPlan: number
  guessCap: number
  timers: Timers
}

export function modeRules(quick: boolean): ModeRules {
  return quick
    ? { questions: 2, cardsPerPlan: 2, guessCap: 1, timers: QUICK_TIMERS }
    : { questions: 3, cardsPerPlan: 3, guessCap: 2, timers: NORMAL_TIMERS }
}

export const MIN_PLAYERS = 3
export const MAX_PLAYERS = 10
export const AI_ROOM_CAP = 60
export const LATE_GRACE_MS = 750

export const PLAN_COLORS = ['#6C8EAD', '#B5838D', '#7FA37F', '#C9A66B', '#8E7DBE', '#5FA8A0', '#C47F6B', '#7D8FA3', '#A3A066', '#B07AA1']

export const AVATARS = ['compass', 'mountain', 'waves', 'sun', 'tent', 'camera', 'coffee', 'map', 'leaf', 'moon'] as const
export type Avatar = (typeof AVATARS)[number]

export const COUNTRIES = [
  'India', 'United Arab Emirates', 'Thailand', 'Malaysia', 'Indonesia', 'Vietnam', 'Singapore', 'Japan', 'Sri Lanka',
  'Nepal', 'Bhutan', 'Maldives', 'United Kingdom', 'France', 'Germany', 'Italy', 'Spain', 'Switzerland', 'Turkey',
  'United States', 'Canada', 'Australia', 'New Zealand', 'Saudi Arabia', 'Qatar', 'Oman', 'South Korea', 'China',
  'Bangladesh', 'Pakistan', 'Philippines', 'South Africa', 'Kenya', 'Egypt', 'Netherlands', 'Ireland', 'Other',
]
