export const VIBE_TAGS = ['beach', 'hills', 'nature', 'city', 'food', 'adventure', 'culture', 'shopping', 'nightlife'] as const
export const RISK_TAGS = ['long_walk', 'crowded', 'early_start', 'late_night'] as const
export type VibeTag = (typeof VIBE_TAGS)[number]
export type RiskTag = (typeof RISK_TAGS)[number]
export type Tag = VibeTag | RiskTag
export const ALL_TAGS: readonly Tag[] = [...VIBE_TAGS, ...RISK_TAGS]

export type Pace = 'relaxed' | 'packed'
export type Mode = 'train' | 'bus' | 'car' | 'ferry' | 'flight'
export const MODES: readonly Mode[] = ['train', 'bus', 'car', 'ferry', 'flight']
export type Slot = 'morning' | 'afternoon' | 'evening' | 'night'
export const SLOTS: readonly Slot[] = ['morning', 'afternoon', 'evening', 'night']

export interface Stop {
  id: string
  name: string
  day: number
  slot: Slot
  cost: number
  tags: Tag[]
  note: string
  changedInVersion?: number
  weak?: boolean
}

export interface Journey {
  mode: Mode
  hours: number
  cost: number
}

export interface Estimate {
  hours: number
  cost: number
}

export interface Plan {
  id: string
  owners: string[]
  destination: string
  country: string
  journey: Journey
  stayPerNight: number
  stops: Stop[]
  version: number
  estimate?: Estimate | null
  checkBadge?: boolean
  status: 'active' | 'out'
}

export interface QuizAnswer {
  pace: Pace
  budget: number
  maxHours: number
  dealbreakers: RiskTag[]
}

export interface QuestionOption {
  label: string
  tags: Tag[]
}

export interface Question {
  id: string
  prompt: string
  a: QuestionOption
  b: QuestionOption
}

export type AB = 'a' | 'b'
export type KeepSkip = 'keep' | 'skip'
