import { formatFullDate } from '../lib/dates';
import {
  formatAnalysisDurationMs,
  formatAnalysisPercent,
  formatAnalysisScore,
  getFormTakeaway
} from '../lib/formInsights';
import type { HistoryPoint, ProgressSnapshot, RecentSetInsight, StreakSnapshot } from '../types/app';
import { StatCard } from './StatCard';

interface HistoryScreenProps {
  progress: ProgressSnapshot;
  streakSnapshot: StreakSnapshot;
  last7Days: HistoryPoint[];
  last30Days: HistoryPoint[];
}

function RecentSetCard({ insight }: { insight: RecentSetInsight }) {
  return (
    <article className="session-analysis-card">
      <div className="session-analysis-card__header">
        <div>
          <span className="analysis-card__label">{formatFullDate(insight.date)}</span>
          <strong className="session-analysis-card__title">{insight.reps} reps</strong>
        </div>
        <span className="session-analysis-card__score">{formatAnalysisScore(insight.avgQualityScore)}</span>
      </div>

      <div className="session-analysis-card__grid">
        <span>Depth {formatAnalysisPercent(insight.avgDepth)}</span>
        <span>Tempo {formatAnalysisDurationMs(insight.avgCycleMs)}</span>
      </div>
    </article>
  );
}

function TrendGraph({
  title,
  points,
  summary,
  accentClassName
}: {
  title: string;
  points: HistoryPoint[];
  summary: string;
  accentClassName: string;
}) {
  const maxValue = Math.max(...points.map((point) => point.totalReps), 1);

  return (
    <article className="trend-graph-card">
      <div className="panel__header trend-graph-card__header">
        <div>
          <p className="eyebrow">{title}</p>
          <p className="subtle-copy">{summary}</p>
        </div>
      </div>

      <div className="trend-graph">
        {points.map((point) => {
          const barHeight = Math.max((point.totalReps / maxValue) * 100, point.totalReps > 0 ? 10 : 2);

          return (
            <div key={point.date} className="trend-graph__day">
              <div className="trend-graph__bar-wrap" aria-hidden="true">
                <span className={`trend-graph__bar ${accentClassName}`} style={{ height: `${barHeight}%` }} />
              </div>
              <span className="trend-graph__label">{point.totalReps}</span>
              <span className={point.hitGoal ? 'trend-graph__date is-hit' : 'trend-graph__date'}>
                {formatFullDate(point.date)}
              </span>
            </div>
          );
        })}
      </div>
    </article>
  );
}

export function HistoryScreen({ progress, streakSnapshot, last7Days, last30Days }: HistoryScreenProps) {
  const recentSets = progress.form.recentSets.slice(0, 3);

  return (
    <section className="screen">
      <header className="panel progress-overview">
        <div>
          <p className="eyebrow">Form snapshot</p>
          <h1>{formatAnalysisScore(progress.form.week.avgQualityScore)} this week</h1>
          <p className="subtle-copy">{getFormTakeaway(progress.form.week)}</p>
        </div>

        <div className="progress-overview__metrics">
          <div className="progress-overview__metric">
            <span>Depth</span>
            <strong>{formatAnalysisPercent(progress.form.week.avgDepth)}</strong>
          </div>
          <div className="progress-overview__metric">
            <span>Tempo</span>
            <strong>{formatAnalysisDurationMs(progress.form.week.avgCycleMs)}</strong>
          </div>
          <div className="progress-overview__metric">
            <span>Consistency</span>
            <strong>{formatAnalysisScore(progress.form.week.consistencyScore)}</strong>
          </div>
          <div className="progress-overview__metric">
            <span>Tracked reps</span>
            <strong>{progress.form.week.analyzedReps}</strong>
          </div>
        </div>

        <div className="inline-badges">
          <span className="inline-badge">Month {formatAnalysisScore(progress.form.month.avgQualityScore)}</span>
          <span className="inline-badge">Lifetime {formatAnalysisScore(progress.form.lifetime.avgQualityScore)}</span>
        </div>
      </header>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Progress</p>
            <h2>Week, month, lifetime</h2>
          </div>
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
      </section>

      <div className="stats-grid progress-stats-grid">
        <StatCard label="Current streak" value={`${streakSnapshot.current} days`} accent="lime" />
        <StatCard
          label="Best day"
          value={progress.lifetime.bestDayReps}
          helper={progress.lifetime.bestDayDate ? formatFullDate(progress.lifetime.bestDayDate) : 'No sessions yet'}
        />
        <StatCard label="Goal days" value={progress.lifetime.goalDays} accent="amber" helper="lifetime total" />
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Trend graphs</p>
            <h2>How volume is moving</h2>
          </div>
        </div>

        <div className="trend-graphs">
          <TrendGraph
            title="Last 7 days"
            points={last7Days}
            summary="Quick glance at your weekly rhythm."
            accentClassName="trend-graph__bar--lime"
          />
          <TrendGraph
            title="Last 30 days"
            points={last30Days}
            summary="Longer trend for consistency and momentum."
            accentClassName="trend-graph__bar--amber"
          />
        </div>
      </section>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Recent sets</p>
            <h2>How your latest sessions felt</h2>
          </div>
        </div>

        {recentSets.length > 0 ? (
          <div className="session-analysis-list">
            {recentSets.map((insight) => (
              <RecentSetCard key={insight.id} insight={insight} />
            ))}
          </div>
        ) : (
          <p className="subtle-copy">Finish a few auto-counted reps and your recent session summaries will show here.</p>
        )}
      </section>
    </section>
  );
}
