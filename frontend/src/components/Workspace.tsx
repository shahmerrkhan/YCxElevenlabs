'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { ConversationProvider, useConversation, useConversationClientTool } from '@elevenlabs/react'
import {
  api,
  isApproved,
  isTerminal,
  mockActions,
  USE_MOCK,
  type Account,
  type BestTimes as BestTimesData,
  type Job,
  type ScheduledPost,
} from '@/lib/api'
import { CallPanel, MiniDock, type Line } from './CallPanel'
import { VideoCard } from './VideoCard'
import { Schedule } from './Schedule'
import { BestTimes } from './BestTimes'

const AGENT_ID = process.env.NEXT_PUBLIC_ELEVENLABS_AGENT_ID
const COMPANY = process.env.NEXT_PUBLIC_COMPANY_NAME || 'Kiln'
const POLL_MS = 2000 // contract: poll GET /jobs/:id every 2 seconds
const STATUS_PREFIX = '[status]' // our messages to the agent; shown as system lines in the transcript

export default function Workspace() {
  return (
    <ConversationProvider agentId={AGENT_ID}>
      <WorkspaceInner />
    </ConversationProvider>
  )
}

/*
 * Agent ↔ browser (docs/API_CONTRACT.md, "Agent to browser"):
 * 1. Agent calls POST /jobs (server tool), then the client tool showJob({ jobId }).
 * 2. We poll the job. On awaiting_approval or failed we sendUserMessage once so the agent speaks.
 * 3. Approval is spoken only; the agent calls approve. We keep polling until posted/failed,
 *    then refresh the schedule.
 */
function WorkspaceInner() {
  const [lines, setLines] = useState<Line[]>([])
  const [jobId, setJobId] = useState<string | null>(null)
  const [job, setJob] = useState<Job | null>(null)
  const [accounts, setAccounts] = useState<Account[]>([])
  const [schedule, setSchedule] = useState<ScheduledPost[]>([])
  const [bestTimes, setBestTimes] = useState<BestTimesData | null>(null)
  const [tab, setTab] = useState<Tab>('call')
  const lineId = useRef(0)
  const announced = useRef<Set<string>>(new Set()) // "<jobId>:<status>" already sent to the agent

  const addLine = useCallback((role: Line['role'], text: string) => {
    if (text.startsWith(STATUS_PREFIX)) {
      role = 'system'
      text = text.slice(STATUS_PREFIX.length).trim()
    }
    setLines((ls) => [...ls, { role, text, id: lineId.current++ }])
  }, [])

  const refreshSchedule = useCallback(() => {
    api.getSchedule().then(setSchedule).catch(console.warn)
  }, [])

  const convo = useConversation({
    onMessage: ({ role, message }) => addLine(role, message),
  })
  const connected = convo.status === 'connected'

  const trackJob = useCallback((id: string) => {
    setJobId(id)
    setJob(null)
    setTab('video') // demo: jump to the video as soon as a job starts
  }, [])

  useConversationClientTool('showJob', (params) => {
    const id = String(params.jobId ?? '')
    if (!id) return 'Missing jobId.'
    trackJob(id)
    return `Showing job ${id} on screen.`
  })

  // Initial data
  useEffect(() => {
    api.getAccounts().then(setAccounts).catch(console.warn)
    api.getBestTimes().then(setBestTimes).catch(console.warn)
    refreshSchedule()
  }, [refreshSchedule])

  // Light background refresh of the schedule (posting can take a while)
  useEffect(() => {
    const t = setInterval(refreshSchedule, 5000)
    return () => clearInterval(t)
  }, [refreshSchedule])

  // Poll the current job every 2 s until posted or failed
  useEffect(() => {
    if (!jobId) return
    let stop = false
    let timer: ReturnType<typeof setTimeout>
    const poll = async () => {
      try {
        const j = await api.getJob(jobId)
        if (stop) return
        setJob(j)
        if (isTerminal(j.status)) {
          refreshSchedule()
          return
        }
      } catch (e) {
        console.warn(e)
      }
      if (!stop) timer = setTimeout(poll, POLL_MS)
    }
    poll()
    return () => {
      stop = true
      clearTimeout(timer)
    }
  }, [jobId, refreshSchedule])

  // Tell the agent once when the video is ready or the job failed, so it speaks.
  // "Ready" is never approval: the agent must ask and wait for a spoken yes.
  useEffect(() => {
    if (!job || !connected) return
    const key = `${job.id}:${job.status}`
    if (announced.current.has(key)) return
    let msg: string | null = null
    if (job.status === 'awaiting_approval') {
      msg = `${STATUS_PREFIX} Job ${job.id} is awaiting_approval. The video is on my screen. This is not approval yet: ask me if I want to post it.`
    } else if (job.status === 'failed') {
      msg = `${STATUS_PREFIX} Job ${job.id} failed: ${job.error?.code ?? 'unknown'}, ${job.error?.message ?? 'no details'}.`
    }
    if (!msg) return
    announced.current.add(key)
    convo.sendUserMessage(msg)
  }, [job, connected, convo])

  // Once approved (agent called approve), show the schedule
  const approved = isApproved(job?.status)
  useEffect(() => {
    if (!approved) return
    const t = setTimeout(() => {
      setTab('schedule')
      refreshSchedule()
    }, 800)
    return () => clearTimeout(t)
  }, [approved, refreshSchedule])

  // Mock mode only: stand-ins for the agent's POSTs, so the flow can be rehearsed without it
  async function mockMake() {
    if (!mockActions) return
    addLine('system', 'Mock: starting today’s UGC')
    const { id } = await mockActions.createJob()
    trackJob(id)
  }
  async function mockApprove() {
    if (!mockActions || !jobId) return
    addLine('system', 'Mock: approved')
    await mockActions.approveJob(jobId).catch((e: Error) => addLine('system', `Mock approve failed: ${e.message}`))
  }

  const pane = (name: Tab) => `pane pane--${name} ${tab === name ? 'pane--active' : ''}`
  const live = convo.status === 'connected' || convo.status === 'connecting'

  return (
    <div className={`app ${tab !== 'call' && live ? 'app--docked' : ''}`}>
      <header className="topbar">
        <div className="brand">
          <span className="brand__dot" />
          <strong>{COMPANY}</strong>
          <span className="muted brand__sub">growth coworker</span>
        </div>
        {USE_MOCK && <span className="tag">mock · sample data</span>}
      </header>

      <main className="layout">
        <div className={pane('call')}>
          <CallPanel lines={lines} company={COMPANY} />
        </div>
        <div className={pane('video')}>
          <VideoCard
            job={job}
            tracking={!!jobId}
            onMockMake={mockActions ? mockMake : undefined}
            onMockApprove={mockActions ? mockApprove : undefined}
          />
        </div>
        <div className={pane('schedule')}>
          <Schedule accounts={accounts} posts={schedule} />
          <BestTimes data={bestTimes} />
        </div>
      </main>

      {/* Phone only: keep the mascot visible while on other tabs */}
      {tab !== 'call' && live && <MiniDock onOpen={() => setTab('call')} />}

      <nav className="tabbar" aria-label="Sections">
        {TABS.map(([key, label]) => (
          <button
            key={key}
            className={`tabbar__btn ${tab === key ? 'tabbar__btn--active' : ''}`}
            onClick={() => setTab(key)}
            aria-current={tab === key ? 'page' : undefined}
          >
            {label}
            {key === 'video' && job?.status === 'awaiting_approval' && <span className="tabbar__dot" />}
            {key === 'video' && job?.status === 'failed' && <span className="tabbar__dot tabbar__dot--err" />}
            {key === 'schedule' && schedule.length > 0 && <span className="tabbar__count">{schedule.length}</span>}
          </button>
        ))}
      </nav>
    </div>
  )
}

type Tab = 'call' | 'video' | 'schedule'
const TABS: [Tab, string][] = [
  ['call', 'Call'],
  ['video', 'Video'],
  ['schedule', 'Schedule'],
]
