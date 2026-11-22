'use client'

import type { BestTimes as BestTimesData } from '@/lib/api'

type Point = BestTimesData['byHour'][number]
const hourLabel = (h: number) => (h === 0 ? '12a' : h < 12 ? `${h}a` : h === 12 ? '12p' : `${h - 12}p`)

export function BestTimes({ data }: { data: BestTimesData | null }) {
  const points = data?.byHour ?? []
  const max = Math.max(1, ...points.map((d) => d.score))
  const best = points.reduce<Point | null>((b, d) => (!b || d.score > b.score ? d : b), null)

  return (
    <section className="panel">
      <header className="panel__head">
        <h2>Best time to post</h2>
      </header>
      {best && (
        <p className="muted">
          Peak engagement around <strong>{hourLabel(best.hour)}</strong> (Toronto time)
        </p>
      )}
      <div className="bars" role="img" aria-label="Engagement score by hour">
        {points.map((d) => (
          <div key={d.hour} className="bars__col" title={`${hourLabel(d.hour)}: ${d.score}`}>
            <div
              className={`bars__bar ${d === best ? 'bars__bar--best' : ''}`}
              style={{ height: `${(d.score / max) * 100}%` }}
            />
            <span className="bars__x">{d.hour % 3 === 0 ? hourLabel(d.hour) : ''}</span>
          </div>
        ))}
      </div>
    </section>
  )
}
