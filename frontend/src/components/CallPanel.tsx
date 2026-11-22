'use client'

import { useEffect, useRef, useState } from 'react'
import { useConversationControls, useConversationMode, useConversationStatus } from '@elevenlabs/react'
import { Mascot } from './Mascot'

export type Line = { role: 'user' | 'agent' | 'system'; text: string; id: number }

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID

export function CallPanel({ lines, company }: { lines: Line[]; company: string }) {
  const { status, message } = useConversationStatus()
  const { isSpeaking } = useConversationMode()
  const { startSession, endSession } = useConversationControls()
  const bottom = useRef<HTMLDivElement>(null)
  useEffect(() => {
    bottom.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [lines])

  // Instant feedback on tap: the SDK stays "disconnected" while the mic permission prompt is open.
  const [starting, setStarting] = useState(false)
  const [micError, setMicError] = useState<string | null>(null)
  useEffect(() => {
    if (status === 'disconnected' || !starting) return
    const id = requestAnimationFrame(() => setStarting(false)) // SDK took over (connecting/connected/error)
    return () => cancelAnimationFrame(id)
  }, [status, starting])

  const live = status === 'connected' || status === 'connecting'
  const label =
    status === 'connecting' || starting
      ? 'Connecting…'
      : status === 'connected'
        ? isSpeaking
          ? 'Speaking'
          : 'Listening'
        : 'Ready'

  async function onCall() {
    if (live) return endSession()
    if (starting) return
    setMicError(null)
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      setMicError('The mic only works over HTTPS. Open the https:// link of this app to talk.')
      return
    }
    setStarting(true)
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      stream.getTracks().forEach((t) => t.stop()) // only asking permission; the SDK opens its own stream
    } catch (e) {
      setStarting(false)
      const name = (e as DOMException)?.name
      setMicError(
        name === 'NotAllowedError'
          ? 'Mic is blocked. Allow microphone access for this site (address bar → site settings), then tap Call again.'
          : name === 'NotFoundError'
            ? 'No microphone found. Connect one and tap Call again.'
            : 'Couldn’t start the mic. Tap Call to try again.',
      )
      return
    }
    startSession()
  }

  return (
    <section className="panel call">
      <header className="call__head">
        <span className="eyebrow">Growth coworker · {company}</span>
        <span className={`pill pill--${status}`}>{label}</span>
      </header>

      <div className="call__stage">
        <Mascot starting={starting} />
      </div>

      <button
        className={`call__btn ${live ? 'call__btn--end' : ''}`}
        onClick={onCall}
        disabled={!AGENT_ID}
      >
        {live ? 'End call' : starting ? 'Calling…' : 'Call'}
      </button>
      {!AGENT_ID && <p className="hint">Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID in .env.local to enable voice.</p>}
      {micError && (
        <p className="hint hint--err" role="alert">
          {micError}
        </p>
      )}
      {message && !micError && <p className="hint hint--err">{message}</p>}

      <div className="transcript" aria-live="polite">
        {lines.length === 0 && <p className="transcript__empty">Try saying “make today’s UGC”.</p>}
        {lines.map((l) => (
          <div key={l.id} className={`bubble bubble--${l.role}`}>
            {l.text}
          </div>
        ))}
        <div ref={bottom} />
      </div>
    </section>
  )
}

// Phone only: floating pill so the call stays visible on the Video / Schedule tabs.
export function MiniDock({ onOpen }: { onOpen: () => void }) {
  const { status } = useConversationStatus()
  const { isSpeaking } = useConversationMode()
  const { endSession } = useConversationControls()
  return (
    <div className="dock">
      <button className="dock__main" onClick={onOpen} aria-label="Back to call">
        <Mascot size="sm" />
        <span className="dock__label">
          {status === 'connecting' ? 'Connecting…' : isSpeaking ? 'Speaking…' : 'Listening…'}
        </span>
      </button>
      <button className="dock__end" onClick={() => endSession()}>
        End
      </button>
    </div>
  )
}
