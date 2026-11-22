'use client'

import { PLATFORM, type ScheduledPost } from '@/lib/api'

const fmt = (iso: string) => {
  const d = new Date(iso)
  return isNaN(+d) ? iso : d.toLocaleString([], { weekday: 'short', hour: 'numeric', minute: '2-digit' })
}
const platform = (p: string) => PLATFORM[p] ?? p
const HANDLE = '@kiln.study' // the only real account. /accounts lists it only after someone's post

export function Schedule({ posts }: { posts: ScheduledPost[] }) {
  const row = (p: ScheduledPost) => (
    <tr key={p.id}>
      <td>
        {platform(p.platform)} {HANDLE}
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
      </header>

      {posts.length > 0 && (
        <div className="accounts">
          <div className="account">
            <span className="account__platform">{platform(posts[0].platform)}</span>
            <span className="account__handle">{HANDLE}</span>
          </div>
        </div>
      )}

      {posts.length === 0 ? (
        <p className="muted empty">Nothing posted yet. An approved video shows up here once it is live.</p>
      ) : (
        <table className="sched">
          <thead>
            <tr>
              <th>Account</th>
              <th>Caption</th>
              <th>Time</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>{[...posts].sort((a, b) => a.postAt.localeCompare(b.postAt)).map(row)}</tbody>
        </table>
      )}
    </section>
  )
}
