'use client'

import { useEffect, useRef } from 'react'
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

  const live = status === 'connected' || status === 'connecting'
  const label =
    status === 'connecting'
      ? 'Connecting…'
      : status === 'connected'
        ? isSpeaking
          ? 'Speaking'
          : 'Listening'
        : 'Ready'

  async function onCall() {
    if (live) return endSession()
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true })
    } catch {
      alert('Microphone access is needed to talk to your coworker.')
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
        <Mascot />
      </div>

      <button
        className={`call__btn ${live ? 'call__btn--end' : ''}`}
        onClick={onCall}
        disabled={!AGENT_ID}
      >
        {live ? 'End call' : 'Call'}
      </button>
      {!AGENT_ID && <p className="hint">Set NEXT_PUBLIC_ELEVENLABS_AGENT_ID in .env.local to enable voice.</p>}
      {message && <p className="hint hint--err">{message}</p>}

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
