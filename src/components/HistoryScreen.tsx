import { formatFullDate, formatHistoryLabel } from '../lib/dates';
import type {
  FormAnalyticsSummary,
  HistoryPoint,
  ProgressPeriodSummary,
  ProgressSnapshot,
  RecentSetInsight,
  StreakSnapshot
} from '../types/app';
import { StatCard } from './StatCard';

interface HistoryScreenProps {
  last7Days: HistoryPoint[];
  last30Days: HistoryPoint[];
  progress: ProgressSnapshot;
  streakSnapshot: StreakSnapshot;
  storageStatus: 'loading' | 'saved' | 'error';
  lastSavedAt: string | null;
}

function HistorySection({
  title,
  points,
  summary
}: {
  title: string;
  points: HistoryPoint[];
  summary: ProgressPeriodSummary;
}) {
  const maxValue = Math.max(...points.map((point) => point.totalReps), 1);

  return (
    <section className="panel">
      <div className="panel__header">
        <div>
          <p className="eyebrow">Trend</p>
          <h2>{title}</h2>
        </div>
      </div>

      <div className="progress-summary">
        <div className="progress-summary__item">
          <span>Total reps</span>
          <strong>{summary.totalReps}</strong>
        </div>
        <div className="progress-summary__item">
          <span>Sets</span>
          <strong>{summary.totalSets}</strong>
        </div>
        <div className="progress-summary__item">
          <span>Avg / day</span>
          <strong>{Math.round(summary.averagePerDay)}</strong>
        </div>
        <div className="progress-summary__item">
          <span>Goal days</span>
          <strong>{summary.goalDays}</strong>
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

function getStorageLabel(storageStatus: 'loading' | 'saved' | 'error') {
  if (storageStatus === 'loading') {
    return 'Loading local data...';
  }

  if (storageStatus === 'error') {
    return 'Local backup hit a problem. Your current session is still available.';
  }

  return 'Stored on this device in IndexedDB with a local cache fallback.';
}

function formatDurationMs(value: number | null) {
  if (value == null) {
    return 'Not enough data';
  }

  return `${(value / 1000).toFixed(2)}s`;
}

function formatPercent(value: number | null) {
  if (value == null) {
    return 'Not enough data';
  }

  return `${Math.round(value * 100)}%`;
}

function formatScore(value: number | null) {
  if (value == null) {
    return 'Not enough data';
  }

  return `${Math.round(value)}/100`;
}

function FormSection({
  title,
  summary
}: {
  title: string;
  summary: FormAnalyticsSummary;
}) {
  return (
    <article className="analysis-card">
      <span className="analysis-card__label">{title}</span>
      <strong className="analysis-card__value">{formatScore(summary.avgQualityScore)}</strong>
      <p className="analysis-card__helper">{summary.analyzedReps} tracked reps</p>
      <div className="analysis-card__metrics">
        <span>Depth {formatPercent(summary.avgDepth)}</span>
        <span>Tempo {formatDurationMs(summary.avgCycleMs)}</span>
        <span>Down {formatDurationMs(summary.avgDownMs)}</span>
        <span>Up {formatDurationMs(summary.avgUpMs)}</span>
        <span>Pause {formatDurationMs(summary.avgBottomHoldMs)}</span>
        <span>Consistency {formatScore(summary.consistencyScore)}</span>
      </div>
    </article>
  );
}

function RecentSetCard({ insight }: { insight: RecentSetInsight }) {
  return (
    <article className="session-analysis-card">
      <div className="session-analysis-card__header">
        <div>
          <span className="analysis-card__label">{formatFullDate(insight.date)}</span>
          <strong className="session-analysis-card__title">
            {insight.reps} reps{insight.endedAt ? '' : ' so far'}
          </strong>
        </div>
        <span className="session-analysis-card__score">{formatScore(insight.avgQualityScore)}</span>
      </div>

      <div className="session-analysis-card__grid">
        <span>Depth {formatPercent(insight.avgDepth)}</span>
        <span>Tempo {formatDurationMs(insight.avgCycleMs)}</span>
        <span>Down {formatDurationMs(insight.avgDownMs)}</span>
        <span>Up {formatDurationMs(insight.avgUpMs)}</span>
        <span>Pause {formatDurationMs(insight.avgBottomHoldMs)}</span>
        <span>Best rep {formatScore(insight.bestRepQuality)}</span>
      </div>
    </article>
  );
}

export function HistoryScreen({
  last7Days,
  last30Days,
  progress,
  streakSnapshot,
  storageStatus,
  lastSavedAt
}: HistoryScreenProps) {
  return (
    <section className="screen">
      <header className="progress-hero panel">
        <div>
          <p className="eyebrow">Progress</p>
          <h1>Week, month, lifetime</h1>
          <p className="subtle-copy">{getStorageLabel(storageStatus)}</p>
        </div>

        <div className="progress-trio">
          <article className="progress-period progress-period--lime">
            <span className="progress-period__label">This week</span>
            <strong className="progress-period__value">{progress.week.totalReps}</strong>
            <span className="progress-period__meta">{progress.week.totalSets} sets</span>
          </article>
          <article className="progress-period">
            <span className="progress-period__label">This month</span>
            <strong className="progress-period__value">{progress.month.totalReps}</strong>
            <span className="progress-period__meta">{progress.month.totalSets} sets</span>
          </article>
          <article className="progress-period progress-period--amber">
            <span className="progress-period__label">Lifetime</span>
            <strong className="progress-period__value">{progress.lifetime.totalReps}</strong>
            <span className="progress-period__meta">{progress.lifetime.totalSets} sets</span>
          </article>
        </div>
      </header>

      <div className="stats-grid">
        <StatCard label="Current streak" value={`${streakSnapshot.current} days`} accent="lime" />
        <StatCard label="Longest streak" value={`${streakSnapshot.longest} days`} accent="amber" />
        <StatCard label="Goal days" value={progress.lifetime.goalDays} helper="lifetime total" />
        <StatCard label="Active days" value={progress.lifetime.activeDays} helper="days with reps" />
      </div>

      <HistorySection title="This week" points={last7Days} summary={progress.week} />
      <HistorySection title="This month" points={last30Days} summary={progress.month} />

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Form analysis</p>
            <h2>Quality, depth, and tempo</h2>
            <p className="subtle-copy">Based on auto-counted reps captured during each set.</p>
          </div>
        </div>

        <div className="analysis-grid">
          <FormSection title="This week" summary={progress.form.week} />
          <FormSection title="This month" summary={progress.form.month} />
          <FormSection title="Lifetime" summary={progress.form.lifetime} />
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Lifetime</p>
            <h2>All-time totals</h2>
          </div>
        </div>

        <div className="progress-summary">
          <div className="progress-summary__item">
            <span>Tracked days</span>
            <strong>{progress.lifetime.trackedDays}</strong>
          </div>
          <div className="progress-summary__item">
            <span>Avg / day</span>
            <strong>{Math.round(progress.lifetime.averagePerDay)}</strong>
          </div>
          <div className="progress-summary__item">
            <span>Goal days</span>
            <strong>{progress.lifetime.goalDays}</strong>
          </div>
          <div className="progress-summary__item">
            <span>Best day</span>
            <strong>{progress.lifetime.bestDayReps}</strong>
          </div>
        </div>

        <div className="progress-storage">
          <div className="progress-storage__row">
            <span>Best day date</span>
            <strong>
              {progress.lifetime.bestDayDate ? formatFullDate(progress.lifetime.bestDayDate) : 'No sessions yet'}
            </strong>
          </div>
          <div className="progress-storage__row">
            <span>Saved locally</span>
            <strong>{lastSavedAt ? new Date(lastSavedAt).toLocaleString() : 'Waiting for first save'}</strong>
          </div>
          <div className="progress-storage__row">
            <span>Storage</span>
            <strong>{storageStatus === 'error' ? 'Needs attention' : 'Local only'}</strong>
          </div>
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Recent sets</p>
            <h2>Session analysis</h2>
          </div>
        </div>

        {progress.form.recentSets.length > 0 ? (
          <div className="session-analysis-list">
            {progress.form.recentSets.map((insight) => (
              <RecentSetCard key={insight.id} insight={insight} />
            ))}
          </div>
        ) : (
          <p className="subtle-copy">Finish a few auto-counted reps and your set analysis will show up here.</p>
        )}
      </section>
    </section>
  );
}
