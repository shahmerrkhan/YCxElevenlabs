// Types and GET calls for docs/API_CONTRACT.md. Do not change shapes without telling the team.
// The frontend only ever GETs. Both POSTs need the tool secret and are made by the ElevenLabs agent.
import { mock } from './mock'

export type JobStatus =
  | 'queued'
  | 'scripting'
  | 'voicing'
  | 'rendering'
  | 'awaiting_approval'
  | 'posting'
  | 'posted'
  | 'failed'
export type ApiError = { code: string; message: string }
export type Job = {
  id: string
  status: JobStatus
  script: string | null
  audioUrl: string | null
  videoUrl: string | null
  error: ApiError | null
}
export type Kind = 'real' | 'simulated'
export type Account = { id: string; platform: string; handle: string; kind: Kind }
export type ScheduledPost = {
  id: string
  jobId: string
  accountId: string
  platform: string
  caption: string
  postAt: string
  status: 'scheduled' | 'posting' | 'posted' | 'failed'
  kind: Kind
}
export type BestTimes = { label: string; byHour: { hour: number; score: number }[] }

export const USE_MOCK = process.env.NEXT_PUBLIC_USE_MOCK !== 'false'
const BASE = '/api'

/** Thrown for a 404 (e.g. a job id from the URL that the backend no longer has). Not an outage. */
export class NotFoundError extends Error {}

async function get<T>(path: string): Promise<T> {
  const res = await fetch(BASE + path, { cache: 'no-store' })
  if (!res.ok) {
    const body = await res.json().catch(() => null)
    const msg = body?.error?.message || `GET ${path} -> ${res.status}`
    throw res.status === 404 ? new NotFoundError(msg) : new Error(msg)
  }
  return res.json() as Promise<T>
}

export const api = USE_MOCK
  ? mock
  : {
      getJob: (id: string) => get<Job>(`/jobs/${encodeURIComponent(id)}`),
      getAccounts: () => get<Account[]>('/accounts'),
      getSchedule: () => get<ScheduledPost[]>('/schedule'),
      getBestTimes: () => get<BestTimes>('/best-times'),
    }

/** Mock-only stand-ins for the agent's POSTs, for rehearsing without the agent. */
export const mockActions = USE_MOCK ? { createJob: mock.createJob, approveJob: mock.approveJob } : null

export const isTerminal = (s?: JobStatus) => s === 'posted' || s === 'failed'
export const isApproved = (s?: JobStatus) => s === 'posting' || s === 'posted'

export const PLATFORM: Record<string, string> = {
  tiktok: 'TikTok',
  instagram: 'Instagram',
  youtube: 'YouTube',
}
