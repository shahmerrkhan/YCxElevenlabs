'use client'

import { useState } from 'react'
import { USE_MOCK, type Job, type JobStatus } from '@/lib/api'

const STEPS = ['Script', 'Voice', 'Video', 'Ready', 'Posted'] as const
const STEP_OF: Record<JobStatus, number> = {
  queued: 0,
  scripting: 0,
  voicing: 1,
  rendering: 2,
  awaiting_approval: 3,
  posting: 4,
  posted: 5, // all done
  failed: -1,
}
const WORKING_LABEL: Partial<Record<JobStatus, string>> = {
  queued: 'Starting…',
  scripting: 'Writing the script…',
  voicing: 'Recording the voiceover…',
  rendering: 'Building the video…',
}

type Props = {
  job: Job | null
  tracking: boolean // a job id is known (showJob called), even before the first poll returns
  onMockMake?: () => void // mock mode only
  onMockApprove?: () => void // mock mode only
}

export function VideoCard({ job, tracking, onMockMake, onMockApprove }: Props) {
  const [muted, setMuted] = useState(true)
  const [videoBroken, setVideoBroken] = useState<string | null>(null)
  const status = job?.status
  const step = status ? STEP_OF[status] : tracking ? 0 : -1
  const hasVideo = !!job?.videoUrl && videoBroken !== job.videoUrl
  const ready = status === 'awaiting_approval' || status === 'posting' || status === 'posted'

  return (
    <section className="panel video">
      <header className="panel__head">
        <h2>Today’s UGC</h2>
        {onMockMake && (!tracking || status === 'posted' || status === 'failed') && (
          <button className="btn btn--ghost" onClick={onMockMake}>
            Make it <span className="tag">mock</span>
          </button>
        )}
      </header>

      <div className="video__body">
        <div className="phone">
          {hasVideo ? (
            <>
              {/* iOS only autoplays muted video; tap to turn sound on */}
              <video
                src={job!.videoUrl!}
                autoPlay
                loop
                playsInline
                muted={muted}
                onClick={() => setMuted((m) => !m)}
                onError={() => setVideoBroken(job!.videoUrl)}
              />
              {muted && (
                <button className="phone__unmute" onClick={() => setMuted(false)}>
                  Tap for sound
                </button>
              )}
            </>
          ) : (
            <div className="phone__placeholder">
              {!tracking && <span>Ask your coworker for today’s video</span>}
              {tracking && status !== 'failed' && !ready && (
                <>
                  <div className="spinner" />
                  <span>{(status && WORKING_LABEL[status]) || 'Starting…'}</span>
                </>
              )}
              {ready && (
                <>
                  <p className="phone__caption">{firstLine(job?.script)}</p>
                  <span className="tag">{USE_MOCK ? 'sample preview' : 'video unavailable, script preview'}</span>
                </>
              )}
              {status === 'failed' && (
                <div className="phone__error">
                  <strong>Couldn’t finish this one</strong>
                  <span>{job?.error?.message || 'Something went wrong.'}</span>
                </div>
              )}
            </div>
          )}
        </div>

        <div className="video__side">
          {tracking && (
            <ol className="steps">
              {STEPS.map((name, i) => (
                <li
                  key={name}
                  className={
                    status === 'failed' ? '' : i < step ? 'done' : i === step ? (i === 3 ? 'wait' : 'active') : ''
                  }
                >
                  {name}
                </li>
              ))}
            </ol>
          )}

          {status === 'failed' && (
            <div className="alert" role="alert">
              <strong>Failed</strong> <code>{job?.error?.code}</code>
              <p>{job?.error?.message}</p>
              <p className="muted">Ask your coworker to try again.</p>
            </div>
          )}

          {job?.script && (
            <div className="script">
              <span className="eyebrow">Script</span>
              <p>{job.script}</p>
            </div>
          )}

          {/* Approval is spoken only: the agent calls approve after a "yes". */}
          {status === 'awaiting_approval' && (
            <div className="video__cta">
              <div className="voicecta" role="status">
                <span className="voicecta__dot" aria-hidden />
                Say <strong>“yes, post it”</strong> to approve
              </div>
              {onMockApprove && (
                <button className="btn btn--ghost btn--block" onClick={onMockApprove}>
                  Approve <span className="tag">mock</span>
                </button>
              )}
            </div>
          )}
          {status === 'posting' && <div className="donebar">Posting…</div>}
          {status === 'posted' && <div className="donebar donebar--ok">Posted ✓</div>}
        </div>
      </div>
    </section>
  )
}

const firstLine = (s?: string | null) => (s ? s.replace(/^\[sample\]\s*/, '').split(/(?<=[.!?])\s/)[0] : '')
