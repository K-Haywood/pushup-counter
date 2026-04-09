import { formatHistoryLabel } from '../lib/dates';
import type { HistoryPoint, StreakSnapshot } from '../types/app';
import { StatCard } from './StatCard';

interface HistoryScreenProps {
  last7Days: HistoryPoint[];
  last30Days: HistoryPoint[];
  streakSnapshot: StreakSnapshot;
}

function HistorySection({ title, points }: { title: string; points: HistoryPoint[] }) {
  const maxValue = Math.max(...points.map((point) => point.totalReps), 1);

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">History</p>
          <h2>{title}</h2>
        </div>
      </div>
      <div className="history-bars">
        {points.map((point) => (
          <div key={point.date} className="history-bars__row">
            <div className="history-bars__label-wrap">
              <span className="history-bars__label">{formatHistoryLabel(point.date)}</span>
              <span className={point.hitGoal ? 'history-bars__badge is-hit' : 'history-bars__badge'}>
                {point.hitGoal ? 'Goal hit' : 'In progress'}
              </span>
            </div>
            <div className="history-bars__track" aria-hidden="true">
              <span
                className="history-bars__fill"
                style={{ width: `${(point.totalReps / maxValue) * 100}%` }}
              />
            </div>
            <span className="history-bars__value">
              {point.totalReps} / {point.dailyGoal}
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

export function HistoryScreen({
  last7Days,
  last30Days,
  streakSnapshot
}: HistoryScreenProps) {
  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <p className="eyebrow">Progress</p>
          <h1>Local history</h1>
        </div>
      </header>

      <div className="stats-grid">
        <StatCard label="Current streak" value={`${streakSnapshot.current} days`} accent="lime" />
        <StatCard label="Longest streak" value={`${streakSnapshot.longest} days`} accent="amber" />
        <StatCard
          label="Last 7 days"
          value={last7Days.reduce((sum, point) => sum + point.totalReps, 0)}
          helper="total reps"
        />
        <StatCard
          label="Last 30 days"
          value={last30Days.reduce((sum, point) => sum + point.totalReps, 0)}
          helper="total reps"
        />
      </div>

      <HistorySection title="Last 7 days" points={last7Days} />
      <HistorySection title="Last 30 days" points={last30Days} />
    </section>
  );
}
