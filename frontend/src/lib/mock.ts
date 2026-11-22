// In-browser fake backend so the frontend runs before the real one exists.
// Shapes come from the shared ../mocks/*.json (the contract's examples). Everything is sample data.
// Turn off with NEXT_PUBLIC_USE_MOCK=false.
import type { Account, BestTimes, Job, JobStatus, ScheduledPost } from './api'
import accountsSeed from '../../../mocks/accounts.json'
import bestTimesSeed from '../../../mocks/best-times.json'
import jobSeed from '../../../mocks/get-job.json'

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms))

// The live backend has 100 accounts (2-3 real). Pad the seed with simulated ones to match.
const accounts: Account[] = [
  ...(accountsSeed as Account[]),
  ...Array.from({ length: 100 - accountsSeed.length }, (_, i): Account => {
    const n = i + accountsSeed.length + 1
    return {
      id: `acct_${String(n).padStart(3, '0')}`,
      platform: ['tiktok', 'instagram', 'youtube'][n % 3],
      handle: `@sample_${n}`,
      kind: 'simulated',
    }
  }),
]

const SCRIPT =
  "Three midterms in one week and I hadn't opened my notes once. I dropped tonight's lecture into Kiln, it made me a quiz, and I got half of it wrong. Which, honestly, is the point."

type MockJob = { created: number; approvedAt: number | null }
const jobs = new Map<string, MockJob>()
let schedule: ScheduledPost[] = []
let n = 0

function statusOf(j: MockJob): JobStatus {
  if (j.approvedAt) return Date.now() - j.approvedAt < 2500 ? 'posting' : 'posted'
  const t = (Date.now() - j.created) / 1000
  if (t < 1) return 'queued'
  if (t < 3) return 'scripting'
  if (t < 4.5) return 'voicing'
  if (t < 6.5) return 'rendering'
  return 'awaiting_approval'
}

export const mock = {
  // --- stand-ins for the agent's POSTs (mock mode only) ---
  async createJob() {
    await wait(200)
    const id = `job_${String(++n).padStart(3, '0')}`
    jobs.set(id, { created: Date.now(), approvedAt: null })
    return { id, status: 'queued' as JobStatus }
  },
  async approveJob(id: string) {
    await wait(300)
    const j = jobs.get(id)
    if (!j || statusOf(j) !== 'awaiting_approval') throw new Error('invalid_status')
    j.approvedAt = Date.now()
    const now = Date.now()
    schedule = accounts.map((a, i) => ({
      id: `post_${id}_${i}`,
      jobId: id,
      accountId: a.id,
      platform: a.platform,
      caption: 'three midterms, zero notes opened',
      postAt: new Date(now + (a.kind === 'real' ? 60_000 * i : 3_600_000 * (1 + (i % 48)))).toISOString(),
      status: 'scheduled',
      kind: a.kind,
    }))
    return { id, status: 'posting' as JobStatus }
  },

  // --- GETs, same shapes as the contract ---
  async getJob(id: string): Promise<Job> {
    await wait(120)
    const j = jobs.get(id)
    if (!j) throw new Error('no such job')
    const status = statusOf(j)
    const has = (s: JobStatus[]) => s.includes(status)
    const ready = has(['awaiting_approval', 'posting', 'posted'])
    if (status === 'posted') {
      schedule = schedule.map((p) => (p.jobId === id && p.kind === 'real' ? { ...p, status: 'posted' } : p))
    }
    return {
      id,
      status,
      script: has(['voicing', 'rendering']) || ready ? SCRIPT : null,
      audioUrl: ready ? jobSeed.audioUrl : null,
      videoUrl: ready ? null : null, // the contract's example URL is a placeholder; the UI shows a script preview
      error: null,
    }
  },
  async getAccounts() {
    return accounts
  },
  async getSchedule() {
    return schedule
  },
  async getBestTimes(): Promise<BestTimes> {
    return bestTimesSeed as BestTimes
  },
}
