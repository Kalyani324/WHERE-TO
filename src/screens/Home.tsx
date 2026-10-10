import { useState } from 'react'
import { MapPin } from 'lucide-react'
import { api } from '../lib/api'
import { AVATARS, type Avatar } from '../shared/config'
import { AvatarIcon, Banner, PrimaryButton } from '../ui/components'

export function AvatarPicker({ value, onChange }: { value: Avatar; onChange: (a: Avatar) => void }) {
  return (
    <div className="row wrap" style={{ gap: 8 }} role="radiogroup" aria-label="Avatar">
      {AVATARS.map((a) => (
        <button
          key={a} type="button" role="radio" aria-checked={value === a} aria-label={a} onClick={() => onChange(a)}
          className="avatar" style={{ width: 48, height: 48, ['--ring' as string]: value === a ? 'var(--accent)' : 'var(--border)', color: value === a ? 'var(--accent)' : 'var(--text-2)' }}
        >
          <AvatarIcon avatar={a} size={20} />
        </button>
      ))}
    </div>
  )
}

export function JoinForm({ code: initialCode, onJoined, bots }: { code?: string; onJoined: (code: string) => void; bots: boolean }) {
  const [mode, setMode] = useState<'join' | 'create'>(initialCode ? 'join' : 'create')
  const [name, setName] = useState(() => localStorage.getItem('wt-name') ?? '')
  const [avatar, setAvatar] = useState<Avatar>(() => (localStorage.getItem('wt-avatar') as Avatar) || 'compass')
  const [code, setCode] = useState(initialCode ?? '')
  const [quick, setQuick] = useState(true)
  const [days, setDays] = useState(3)
  const [start, setStart] = useState('Bengaluru')
  const [busy, setBusy] = useState(false)
  const [err, setErr] = useState('')

  const go = async () => {
    setErr('')
    setBusy(true)
    localStorage.setItem('wt-name', name)
    localStorage.setItem('wt-avatar', avatar)
    try {
      if (mode === 'create') {
        const r = await api<{ code: string }>('create', { name, avatar, quick, days, start, bots })
        onJoined(r.code)
      } else {
        const c = code.trim().toUpperCase()
        await api('join', { code: c, name, avatar })
        onJoined(c)
      }
    } catch (e) {
      setErr((e as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="stack-lg">
      {!initialCode && (
        <div className="seg" role="group" aria-label="Create or join">
          <button aria-pressed={mode === 'create'} onClick={() => setMode('create')}>New room</button>
          <button aria-pressed={mode === 'join'} onClick={() => setMode('join')}>Join with code</button>
        </div>
      )}
      <div className="card stack-lg">
        {mode === 'join' && (
          <div className="field">
            <label htmlFor="code">Room code</label>
            <input id="code" className="input code" maxLength={4} autoCapitalize="characters" autoComplete="off" value={code} onChange={(e) => setCode(e.target.value.replace(/[^a-z]/gi, ''))} placeholder="ABCD" />
          </div>
        )}
        <div className="field">
          <label htmlFor="name">Your nickname</label>
          <input id="name" className="input" maxLength={20} value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Kalyani" autoComplete="nickname" />
        </div>
        <div className="field">
          <span className="label">Avatar</span>
          <AvatarPicker value={avatar} onChange={setAvatar} />
        </div>
        {mode === 'create' && (
          <>
            <div className="field">
              <span className="label">Mode</span>
              <div className="seg">
                <button aria-pressed={quick} onClick={() => setQuick(true)}>Quick · ~5 min</button>
                <button aria-pressed={!quick} onClick={() => setQuick(false)}>Full · ~12 min</button>
              </div>
            </div>
            <div className="row" style={{ gap: 12, alignItems: 'flex-end' }}>
              <div className="field" style={{ width: 110 }}>
                <label htmlFor="days">Trip days</label>
                <select id="days" className="input" value={days} onChange={(e) => setDays(Number(e.target.value))}>
                  {[2, 3, 4, 5].map((d) => <option key={d} value={d}>{d} days</option>)}
                </select>
              </div>
              <div className="field grow">
                <label htmlFor="start">Starting from</label>
                <input id="start" className="input" maxLength={40} value={start} onChange={(e) => setStart(e.target.value)} />
              </div>
            </div>
          </>
        )}
        {err && <Banner kind="error">{err}</Banner>}
        <PrimaryButton onClick={go} busy={busy} disabled={!name.trim() || (mode === 'join' && code.length !== 4)}>
          {mode === 'create' ? 'Create room' : 'Join room'}
        </PrimaryButton>
      </div>
    </div>
  )
}

export function Home({ onJoined, bots, code }: { onJoined: (code: string) => void; bots: boolean; code?: string }) {
  return (
    <div className="stack-lg" style={{ paddingTop: 8 }}>
      <div className="stack" style={{ gap: 10 }}>
        <span className="pill neutral" style={{ alignSelf: 'flex-start' }}><MapPin size={14} /> Group trip, settled</span>
        <h1>Where to?</h1>
        <p className="lead muted">Everyone pitches a trip, plays a few quick rounds, and the group lands on one plan. Takes about five minutes.</p>
      </div>
      <JoinForm code={code} onJoined={onJoined} bots={bots} />
      {bots && <Banner kind="info">Demo mode: the host can add bots in the lobby.</Banner>}
    </div>
  )
}
