'use client'

import { useState } from 'react'
import { PLATFORM, type Account, type ScheduledPost } from '@/lib/api'

const fmt = (iso: string) => {
  const d = new Date(iso)
  return isNaN(+d) ? iso : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}
const platform = (p: string) => PLATFORM[p] ?? p
const SIM_PREVIEW = 3 // simulated rows shown before "show more" (real ones always shown first)

export function Schedule({ accounts, posts }: { accounts: Account[]; posts: ScheduledPost[] }) {
  const [showAllSim, setShowAllSim] = useState(false)
  const handle = new Map(accounts.map((a) => [a.id, a.handle]))
  const realAccounts = accounts.filter((a) => a.kind === 'real')
  const simCount = accounts.length - realAccounts.length

  const byTime = (a: ScheduledPost, b: ScheduledPost) => a.postAt.localeCompare(b.postAt)
  const realPosts = posts.filter((p) => p.kind === 'real').sort(byTime)
  const simPosts = posts.filter((p) => p.kind === 'simulated').sort(byTime)
  const simShown = showAllSim ? simPosts : simPosts.slice(0, SIM_PREVIEW)

  const row = (p: ScheduledPost) => (
    <tr key={p.id}>
      <td>
        {platform(p.platform)} {handle.get(p.accountId) ?? p.accountId}
      </td>
      <td className="sched__caption">{p.caption}</td>
      <td>{fmt(p.postAt)}</td>
      <td>
        <span className={`status status--${p.status}`}>{p.status}</span>
      </td>
    </tr>
  )

  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Schedule</h2>
        <span className="muted">
          {accounts.length} accounts
        </span>
      </header>

      <div className="accounts">
        {realAccounts.map((a) => (
          <div key={a.id} className="account">
            <span className="account__platform">{platform(a.platform)}</span>
            <span className="account__handle">{a.handle}</span>
          </div>
        ))}
        {simCount > 0 && (
          <div className="account account--sim">
            <span className="account__platform">+{simCount}</span>
            <span className="account__handle">more</span>
          </div>
        )}
      </div>

      {posts.length === 0 ? (
        <p className="muted empty">Nothing scheduled yet. Approve a video to fan it out.</p>
      ) : (
        <>
          <table className="sched">
            <thead>
              <tr>
                <th>Account</th>
                <th>Caption</th>
                <th>Time</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {realPosts.map(row)}
              {simShown.map(row)}
            </tbody>
          </table>
          {simPosts.length > SIM_PREVIEW && (
            <button className="btn btn--ghost btn--block" onClick={() => setShowAllSim((v) => !v)}>
              {showAllSim ? 'Show fewer' : `Show ${simPosts.length - SIM_PREVIEW} more`}
            </button>
          )}
        </>
      )}
    </section>
  )
}
