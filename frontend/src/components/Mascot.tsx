'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useConversationControls, useConversationMode, useConversationStatus } from '@elevenlabs/react'

/*
 * Hamster mascot: public/hamster.png with an SVG overlay for the mouth and eyelids.
 * Overlay coordinates are in the cropped image's pixel space (670 x 622).
 *   mouth "w" junction ≈ (336, 283), eyes ≈ (229, 203) and (441, 203), radius ≈ 52 x 54.
 * Mouth openness follows the agent's output volume.
 * Add ?talk to the URL to force talking (for testing without a call).
 */
const VB_W = 670
const VB_H = 622
const MOUTH = { x: 336, y: 284 }
const EYES = [
  { x: 229, y: 203 },
  { x: 441, y: 203 },
]
const EYE_RX = 55
const EYE_RY = 58
const LID_TOP = '#eba840' // sampled fur colour around the eyes
const LID_BOTTOM = '#f1b450'
const LINE = '#8c5918'

export function Mascot({ size = 'lg' }: { size?: 'lg' | 'sm' }) {
  const { status } = useConversationStatus()
  const { isSpeaking } = useConversationMode()
  const { getOutputVolume } = useConversationControls()
  const [open, setOpen] = useState(0) // 0 = closed, 1 = wide open
  const [forceTalk, setForceTalk] = useState(false)
  const raf = useRef(0)

  useEffect(() => {
    // Read once on mount (client-only), avoids SSR mismatch.
    const id = requestAnimationFrame(() => setForceTalk(new URLSearchParams(location.search).has('talk')))
    return () => cancelAnimationFrame(id)
  }, [])

  const talking = forceTalk || (status === 'connected' && isSpeaking)

  useEffect(() => {
    if (!talking) {
      const id = requestAnimationFrame(() => setOpen(0))
      return () => cancelAnimationFrame(id)
    }
    const start = performance.now()
    let cur = 0
    const tick = (now: number) => {
      let v = 0
      if (!forceTalk) {
        try {
          v = Math.min(1, getOutputVolume() * 4)
        } catch {
          /* not connected yet */
        }
      }
      // Fallback flap if volume isn't available (or in ?talk mode): syllable-ish rhythm.
      if (v < 0.02) {
        const t = (now - start) / 1000
        v = Math.max(0, Math.sin(t * 22) * 0.65 + Math.sin(t * 6.1) * 0.35)
      }
      cur = cur * 0.45 + v * 0.55
      setOpen(cur)
      raf.current = requestAnimationFrame(tick)
    }
    raf.current = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf.current)
  }, [talking, forceTalk, getOutputVolume])

  const state = talking ? 'speaking' : status === 'connected' ? 'listening' : status === 'connecting' ? 'connecting' : 'idle'

  // Open mouth shape: a rounded "D" hanging under the w.
  const mw = 26 + 28 * open // half-width
  const mh = 8 + 60 * open // depth
  const top = MOUTH.y + 2
  const mouthPath = `M ${MOUTH.x - mw} ${top}
    Q ${MOUTH.x} ${top - 6} ${MOUTH.x + mw} ${top}
    Q ${MOUTH.x + mw} ${top + mh} ${MOUTH.x} ${top + mh}
    Q ${MOUTH.x - mw} ${top + mh} ${MOUTH.x - mw} ${top} Z`

  return (
    <div className={`mascot mascot--${size} mascot--${state}`} aria-label={`Hamster is ${state}`}>
      <div
        className="mascot__body"
        style={talking ? { transform: `scale(${1 + open * 0.025}, ${1 - open * 0.035})` } : undefined}
      >
        <Image src="/hamster.png" alt="" width={600} height={557} priority draggable={false} className="mascot__img" />
        <svg className="mascot__overlay" viewBox={`0 0 ${VB_W} ${VB_H}`} aria-hidden>
          <defs>
            <linearGradient id={`lid-${size}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={LID_TOP} />
              <stop offset="100%" stopColor={LID_BOTTOM} />
            </linearGradient>
          </defs>
          {/* eyelids (blink) */}
          {EYES.map((e, i) => (
            <g key={i} className="mascot__lid">
              <ellipse cx={e.x} cy={e.y} rx={EYE_RX} ry={EYE_RY} fill={`url(#lid-${size})`} />
              <path
                d={`M ${e.x - EYE_RX + 10} ${e.y + 8} Q ${e.x} ${e.y + 32} ${e.x + EYE_RX - 10} ${e.y + 8}`}
                stroke={LINE}
                strokeWidth={7}
                strokeLinecap="round"
                fill="none"
              />
            </g>
          ))}
          {/* mouth */}
          {open > 0.06 && (
            <g>
              <clipPath id={`mouth-${size}`}>
                <path d={mouthPath} />
              </clipPath>
              <path d={mouthPath} fill="#5b2412" />
              <ellipse
                cx={MOUTH.x}
                cy={top + mh + 4}
                rx={mw * 0.7}
                ry={mh * 0.45}
                fill="#f08a9a"
                clipPath={`url(#mouth-${size})`}
              />
              <path d={mouthPath} fill="none" stroke={LINE} strokeWidth={6} strokeLinejoin="round" />
            </g>
          )}
        </svg>
      </div>
      <div className="mascot__shadow" />
    </div>
  )
}
