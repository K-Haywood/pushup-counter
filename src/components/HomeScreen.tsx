import { useEffect, useState } from 'react';
import { formatFullDate } from '../lib/dates';
import type { DashboardSummary, DayRecord, SetRecord } from '../types/app';
import { StatCard } from './StatCard';

interface HomeScreenProps {
  summary: DashboardSummary;
  today: DayRecord;
  currentSet: SetRecord | null;
  onSaveGoal: (goal: number) => void;
}

export function HomeScreen({ summary, today, currentSet, onSaveGoal }: HomeScreenProps) {
  const [goalDraft, setGoalDraft] = useState(today.dailyGoal.toString());

  useEffect(() => {
    setGoalDraft(today.dailyGoal.toString());
  }, [today.dailyGoal]);

  const progress = today.dailyGoal > 0 ? Math.min(1, today.totalReps / today.dailyGoal) : 0;
  const levelProgress =
    (summary.allTimeReps - summary.currentLevelStart) /
    Math.max(1, summary.nextLevelTarget - summary.currentLevelStart);

  return (
    <section className="screen">
      <header className="hero-card">
        <div>
          <p className="eyebrow">Today</p>
          <h1>Pushup Counter</h1>
          <p className="hero-date">{formatFullDate(today.date)}</p>
        </div>
        <div
          className="goal-ring"
          style={{
            background: `conic-gradient(#84ffad ${progress * 360}deg, rgba(148, 163, 184, 0.18) 0deg)`
          }}
          aria-label={`Goal progress ${Math.round(progress * 100)} percent`}
        >
          <div className="goal-ring__inner">
            <span className="goal-ring__value">{today.totalReps}</span>
            <span className="goal-ring__label">reps</span>
          </div>
        </div>
      </header>

      <div className="stats-grid">
        <StatCard label="Daily goal" value={today.dailyGoal} accent="lime" helper={`${summary.remaining} left`} />
        <StatCard label="Sets today" value={today.sets.length} helper={`${currentSet?.reps ?? 0} in current set`} />
        <StatCard label="Goal streak" value={`${summary.streak} days`} helper={`Best ${summary.longestStreak}`} />
        <StatCard
          label={`Level ${summary.level}`}
          value={summary.allTimeReps}
          accent="amber"
          helper={`${summary.nextLevelTarget - summary.allTimeReps} reps to next level`}
        />
      </div>

      <section className="panel">
        <div className="panel__header">
          <div>
            <p className="eyebrow">Goal editor</p>
            <h2>Adjust today&apos;s target</h2>
          </div>
          <div className="level-meter" aria-hidden="true">
            <span
              className="level-meter__fill"
              style={{ width: `${Math.min(100, Math.max(0, levelProgress * 100))}%` }}
            />
          </div>
        </div>

        <form
          className="goal-editor"
          onSubmit={(event) => {
            event.preventDefault();
            onSaveGoal(Number(goalDraft));
          }}
        >
          <label className="field">
            <span>Daily goal</span>
            <input
              type="number"
              min={1}
              step={1}
              inputMode="numeric"
              value={goalDraft}
              onChange={(event) => setGoalDraft(event.target.value)}
            />
          </label>
          <button className="primary-button" type="submit">
            Save goal
          </button>
        </form>
      </section>

      <section className="panel">
        <p className="eyebrow">How to use it</p>
        <h2>Quick setup for better counts</h2>
        <ul className="instruction-list">
          <li>Place the phone 2 to 3 meters away with your full body visible.</li>
          <li>Use a side-on profile so the elbow angle is easy to track.</li>
          <li>Turn on the camera, calibrate at the top position, then start a set.</li>
          <li>Use +1 or -1 if the app needs a quick correction.</li>
        </ul>
      </section>
    </section>
  );
}
