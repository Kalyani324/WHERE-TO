import type { AB, FitResult, GroupProfile, KeepSkip, Mode, Plan, PlanEntrySummary, QuizAnswer, Question, RevealCard, Stop } from '../engine/index.js'
import type { Avatar } from './config.js'

export type Phase =
  | 'lobby' | 'quiz' | 'proposals' | 'single' | 'passport' | 'backing' | 'r1' | 'results1' | 'edit1'
  | 'r2' | 'results2' | 'edit2' | 'finalcheck' | 'vote' | 'reveal'

export interface RoomMeta {
  code: string
  createdAt: number
  hostUid: string
  devBots: boolean
  quick: boolean
  start: string
  days: number
  currency: string
}

export interface RoomState {
  phase: Phase
  /** Unique key for the current step; inputs and locks are stored under it. */
  step: string
  q?: number
  sub?: 'guess' | 'tap' | 'reveal'
  card?: number
  endsAt: number | null
  paused?: { remaining: number; at: number } | null
  notice?: string | null
  quizExtended?: boolean
  hostNotice?: { text: string; at: number } | null
}

export interface PublicPlayer {
  name: string
  avatar: Avatar
  title: string
  joinedAt: number
  isBot?: boolean
  role?: 'proposer' | 'supporter'
  planId?: string | null
  counted?: boolean
  removed?: boolean
}

export interface PublicPlan extends Plan {
  color: string
  ownerNames: string[]
  createdAt: number
  entry?: PlanEntrySummary
  fit?: FitResult
  fitDelta?: number
  scores?: { r1?: number; r2?: number; total: number }
  tokens?: number
  correctionAvailable?: boolean
  correctionUsed?: boolean
  flagCount?: number
  cards?: string[]
  conflicts?: number
  outRound?: 1 | 2
  supporters?: number
  journeyWarning?: boolean
}

export interface DraftForm {
  destination: string
  country: string
  mode: Mode
  hours: number
  journeyCost: number
  stayPerNight: number
  mustDos: string
}

export interface Draft {
  form: DraftForm
  stops: Stop[]
  source?: 'ai' | 'mock' | 'sample' | 'blank'
  locked?: boolean
  planId?: string
  updatedAt?: number
}

export interface QuestionResult {
  id: string
  a: number
  b: number
  result: AB | 'split'
}

export interface Round1Published {
  questions: Record<string, QuestionResult>
  plans?: Record<string, { perQuestion: number[]; tapPoints: number; guessBonus: number; total: number }>
  kept?: string[]
  out?: string[]
  coinFlip?: string[]
}

export interface Round2Published {
  cards: { planId: string; stopId: string }[]
  plans?: Record<
    string,
    { cards: { stopId: string; points: number; weak: boolean }[]; keepPoints: number; budgetShare: number; journeyShare: number; budgetPoints: number; journeyPoints: number; total: number; cumulative: number }
  >
  cardResults?: Record<string, { keep: number; skip: number; result: KeepSkip | 'tie' }>
  kept?: string[]
  out?: string[]
  coinFlip?: string[]
}

export interface RevealPublished {
  winner: string
  runnerUp: string | null
  tally: Record<string, number>
  tieBreak: 'none' | 'conflicts' | 'score' | 'coin'
  voters: number
  card: RevealCard
  entry: PlanEntrySummary
  single?: boolean
  consolation?: {
    pick?: { stop: Stop; replaced: string | null } | null
    vetoed?: string[]
    filled?: Stop[]
    agreed?: { cost: number; stops: number }
    done?: boolean
  }
}

export interface RoomResults {
  profile?: GroupProfile
  countedTotal?: number
  totalPlayers?: number
  r1?: Round1Published
  r2?: Round2Published
  finalists?: string[]
  final?: Record<string, { conflicts: number; fit: number }>
  reveal?: RevealPublished
  fitVisible?: boolean
  deadlines?: Record<string, number>
}

export interface SidekickLine {
  text: string
  at: number
}

export interface TimedInput<T> {
  v: T
  t: number
}

export type QuizInput = QuizAnswer
export type { Question }
