import { useState } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Bot, Copy, Minus, Plus, X } from 'lucide-react'
import { api } from '../lib/api'
import type { Ctx } from '../lib/ctx'
import { MAX_PLAYERS, MIN_PLAYERS } from '../shared/config'
import { Banner, PlayerChip, PrimaryButton } from '../ui/components'

export function Lobby({ ctx, bots }: { ctx: Ctx; bots: boolean }) {
  const { room, d } = ctx
  const [busy, setBusy] = useState(false)
  const [botN, setBotN] = useState(2)
  const link = `${location.origin}/r/${ctx.code}${bots ? '?bots=1' : ''}`
  const players = d.active.sort(([, a], [, b]) => a.joinedAt - b.joinedAt)
  const n = players.length
  const room_left = MAX_PLAYERS - n
  const run = async (op: string, body: Record<string, unknown> = {}) => {
    setBusy(true)
    try {
      await api(op, { code: ctx.code, ...body })
    } catch (e) {
      ctx.toast((e as Error).message)
    } finally {
      setBusy(false)
    }
  }
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link)
      ctx.toast('Link copied')
    } catch {
      ctx.toast(link)
    }
  }
  const meta = room.meta!
  return (
    <div className="stack-lg">
      <div className="card center stack" style={{ alignItems: 'center', gap: 16 }}>
        <span className="section-label">Room code</span>
        <div className="room-code" aria-label={`Room code ${ctx.code.split('').join(' ')}`}>{ctx.code}</div>
        <div className="qr"><QRCodeSVG value={link} size={132} level="M" /></div>
        <button className="btn small" onClick={copy}><Copy size={15} /> Copy invite link</button>
        <p className="small muted">{meta.quick ? 'Quick Mode' : 'Full game'} · {meta.days} days · from {meta.start}</p>
      </div>

      <div className="stack">
        <div className="row between">
          <h3>Players</h3>
          <span className="small muted num">{n} of {MAX_PLAYERS}</span>
        </div>
        <div className="player-list">
          {players.map(([id, p]) => (
            <PlayerChip
              key={id} name={id === ctx.uid ? `${p.name} (you)` : p.name} title={p.isBot ? 'Demo bot' : p.title} avatar={p.avatar}
              ring={id === meta.hostUid ? 'var(--accent)' : undefined} offline={!p.isBot && !room.presence[id]}
              right={d.isHost && id !== ctx.uid ? (
                <button className="icon-btn" style={{ width: 32, height: 32 }} aria-label={`Remove ${p.name}`} onClick={() => run('remove', { target: id })}><X size={15} /></button>
              ) : undefined}
            />
          ))}
        </div>
      </div>

      {d.isHost && bots && meta.devBots && room_left > 0 && (
        <div className="card tight row between">
          <span className="row small" style={{ fontWeight: 600 }}><Bot size={16} /> Add bots</span>
          <div className="row">
            <button className="icon-btn" aria-label="Fewer bots" onClick={() => setBotN(Math.max(1, botN - 1))}><Minus size={16} /></button>
            <span className="num" style={{ width: 20, textAlign: 'center', fontWeight: 600 }}>{Math.min(botN, room_left)}</span>
            <button className="icon-btn" aria-label="More bots" onClick={() => setBotN(Math.min(room_left, botN + 1))}><Plus size={16} /></button>
            <button className="btn small" disabled={busy} onClick={() => run('addBots', { count: Math.min(botN, room_left) })}>Add bot{botN > 1 ? 's' : ''}</button>
          </div>
        </div>
      )}

      {d.isHost ? (
        <div className="stack sticky-cta">
          {n < MIN_PLAYERS && <Banner kind="info">Waiting for at least {MIN_PLAYERS} players. Share the code or QR.</Banner>}
          <PrimaryButton disabled={n < MIN_PLAYERS} busy={busy} onClick={() => run('start')}>Start game</PrimaryButton>
        </div>
      ) : (
        <Banner kind="info">Waiting for {room.players[meta.hostUid]?.name ?? 'the host'} to start.</Banner>
      )}
    </div>
  )
}
