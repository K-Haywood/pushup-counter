import { APP_STATE_VERSION, DEFAULT_SETTINGS, createEmptyStoredState } from './defaults';
import { addDays, getLocalDateKey, getPreviousDateKey, listDateKeysBack } from './dates';
import type {
  AppSettings,
  DashboardSummary,
  DayRecord,
  HistoryPoint,
  SetRecord,
  StoredAppState,
  StreakSnapshot
} from '../types/app';

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function ensureNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ensureBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

export function loadStoredState(storageKey: string): StoredAppState {
  if (typeof window === 'undefined') {
    return createEmptyStoredState();
  }

  const raw = window.localStorage.getItem(storageKey);
  if (!raw) {
    return createEmptyStoredState();
  }

  try {
    const parsed = JSON.parse(raw) as Partial<StoredAppState>;
    const base = createEmptyStoredState();

    const settings: AppSettings = {
      defaultDailyGoal: ensureNumber(parsed.settings?.defaultDailyGoal, DEFAULT_SETTINGS.defaultDailyGoal),
      soundEnabled: ensureBoolean(parsed.settings?.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
      vibrationEnabled: ensureBoolean(parsed.settings?.vibrationEnabled, DEFAULT_SETTINGS.vibrationEnabled),
      cameraFacingMode: parsed.settings?.cameraFacingMode === 'user' ? 'user' : 'environment',
      preferredCameraId:
        typeof parsed.settings?.preferredCameraId === 'string' ? parsed.settings.preferredCameraId : null,
      smoothingFrames: ensureNumber(parsed.settings?.smoothingFrames, DEFAULT_SETTINGS.smoothingFrames),
      topThreshold: ensureNumber(parsed.settings?.topThreshold, DEFAULT_SETTINGS.topThreshold),
      bottomThreshold: ensureNumber(parsed.settings?.bottomThreshold, DEFAULT_SETTINGS.bottomThreshold),
      minLandmarkVisibility: ensureNumber(
        parsed.settings?.minLandmarkVisibility,
        DEFAULT_SETTINGS.minLandmarkVisibility
      ),
      bodyAlignmentTolerance: ensureNumber(
        parsed.settings?.bodyAlignmentTolerance,
        DEFAULT_SETTINGS.bodyAlignmentTolerance
      ),
      sideViewMaxRatio: ensureNumber(parsed.settings?.sideViewMaxRatio, DEFAULT_SETTINGS.sideViewMaxRatio),
      frontViewMinRatio: ensureNumber(parsed.settings?.frontViewMinRatio, DEFAULT_SETTINGS.frontViewMinRatio),
      armSymmetryTolerance: ensureNumber(
        parsed.settings?.armSymmetryTolerance,
        DEFAULT_SETTINGS.armSymmetryTolerance
      ),
      cooldownMs: ensureNumber(parsed.settings?.cooldownMs, DEFAULT_SETTINGS.cooldownMs),
      calibrationHoldMs: ensureNumber(parsed.settings?.calibrationHoldMs, DEFAULT_SETTINGS.calibrationHoldMs)
    };

    const days = Object.fromEntries(
      Object.entries(parsed.days ?? {}).map(([date, value]) => {
        const day = value as Partial<DayRecord>;
        return [
          date,
          {
            date,
            dailyGoal: ensureNumber(day.dailyGoal, settings.defaultDailyGoal),
            totalReps: ensureNumber(day.totalReps, 0),
            updatedAt: typeof day.updatedAt === 'string' ? day.updatedAt : new Date().toISOString(),
            sets: (day.sets ?? []).map((set) => ({
              id: typeof set.id === 'string' ? set.id : generateId('set'),
              startedAt: typeof set.startedAt === 'string' ? set.startedAt : new Date().toISOString(),
              endedAt: typeof set.endedAt === 'string' ? set.endedAt : null,
              reps: ensureNumber(set.reps, 0),
              autoCountedReps: ensureNumber(set.autoCountedReps, 0),
              manualAdjustments: ensureNumber(set.manualAdjustments, 0),
              corrections: (set.corrections ?? []).map((correction) => ({
                id: typeof correction.id === 'string' ? correction.id : generateId('correction'),
                timestamp:
                  typeof correction.timestamp === 'string'
                    ? correction.timestamp
                    : new Date().toISOString(),
                delta: ensureNumber(correction.delta, 0),
                reason: correction.reason === 'reset' ? 'reset' : 'manual'
              }))
            }))
          } satisfies DayRecord
        ];
      })
    );

    return {
      version: ensureNumber(parsed.version, APP_STATE_VERSION),
      settings,
      days,
      session: {
        activeSetId: typeof parsed.session?.activeSetId === 'string' ? parsed.session.activeSetId : null,
        activeDate: typeof parsed.session?.activeDate === 'string' ? parsed.session.activeDate : null
      },
      streakSnapshot: parsed.streakSnapshot ?? base.streakSnapshot
    };
  } catch {
    return createEmptyStoredState();
  }
}

export function saveStoredState(storageKey: string, state: StoredAppState): void {
  if (typeof window === 'undefined') {
    return;
  }

  window.localStorage.setItem(storageKey, JSON.stringify(state));
}

export function ensureDayRecord(state: StoredAppState, dateKey = getLocalDateKey()): DayRecord {
  if (!state.days[dateKey]) {
    state.days[dateKey] = {
      date: dateKey,
      dailyGoal: state.settings.defaultDailyGoal,
      totalReps: 0,
      sets: [],
      updatedAt: new Date().toISOString()
    };
  }

  return state.days[dateKey];
}

function getActiveSet(day: DayRecord, activeSetId: string | null): SetRecord | null {
  if (!activeSetId) {
    return null;
  }

  return day.sets.find((set) => set.id === activeSetId) ?? null;
}

function qualifiesForStreak(day: DayRecord | undefined): boolean {
  if (!day) {
    return false;
  }

  return day.totalReps >= day.dailyGoal && day.dailyGoal > 0;
}

export function computeStreakSnapshot(days: Record<string, DayRecord>, todayKey = getLocalDateKey()): StreakSnapshot {
  const orderedKeys = Object.keys(days).sort();
  let longest = 0;
  let running = 0;

  for (const key of orderedKeys) {
    if (qualifiesForStreak(days[key])) {
      running += 1;
      longest = Math.max(longest, running);
    } else {
      running = 0;
    }
  }

  let current = 0;
  let cursor = qualifiesForStreak(days[todayKey]) ? todayKey : getPreviousDateKey(todayKey);

  while (qualifiesForStreak(days[cursor])) {
    current += 1;
    cursor = getLocalDateKey(addDays(new Date(cursor), -1));
  }

  return { current, longest };
}

export function getDashboardSummary(
  state: StoredAppState,
  todayKey = getLocalDateKey()
): DashboardSummary {
  const today = ensureDayRecord(state, todayKey);
  const currentSet = getActiveSet(today, state.session.activeSetId);
  const allTimeReps = Object.values(state.days).reduce((sum, day) => sum + day.totalReps, 0);
  const level = Math.floor(allTimeReps / 100) + 1;
  const currentLevelStart = (level - 1) * 100;
  const nextLevelTarget = level * 100;

  return {
    todayTotal: today.totalReps,
    dailyGoal: today.dailyGoal,
    remaining: Math.max(0, today.dailyGoal - today.totalReps),
    setCount: today.sets.length,
    currentSetReps: currentSet?.reps ?? 0,
    streak: state.streakSnapshot.current,
    longestStreak: state.streakSnapshot.longest,
    allTimeReps,
    level,
    currentLevelStart,
    nextLevelTarget
  };
}

export function buildHistoryWindow(
  state: StoredAppState,
  length: number,
  today = new Date()
): HistoryPoint[] {
  const keys = listDateKeysBack(length, today);
  return keys.map((dateKey) => {
    const day = state.days[dateKey];
    return {
      date: dateKey,
      totalReps: day?.totalReps ?? 0,
      dailyGoal: day?.dailyGoal ?? state.settings.defaultDailyGoal,
      hitGoal: qualifiesForStreak(day)
    };
  });
}

export function startSet(state: StoredAppState, dateKey = getLocalDateKey()): void {
  const day = ensureDayRecord(state, dateKey);

  if (state.session.activeSetId && state.session.activeDate === dateKey) {
    return;
  }

  if (state.session.activeSetId && state.session.activeDate && state.days[state.session.activeDate]) {
    const previousDay = state.days[state.session.activeDate];
    const previousSet = getActiveSet(previousDay, state.session.activeSetId);
    if (previousSet && !previousSet.endedAt) {
      previousSet.endedAt = new Date().toISOString();
    }
  }

  const newSet: SetRecord = {
    id: generateId('set'),
    startedAt: new Date().toISOString(),
    endedAt: null,
    reps: 0,
    autoCountedReps: 0,
    manualAdjustments: 0,
    corrections: []
  };

  day.sets.push(newSet);
  day.updatedAt = new Date().toISOString();
  state.session.activeSetId = newSet.id;
  state.session.activeDate = dateKey;
}

export function endSet(state: StoredAppState, dateKey = getLocalDateKey()): void {
  const day = ensureDayRecord(state, dateKey);
  const set = getActiveSet(day, state.session.activeSetId);
  if (set && !set.endedAt) {
    set.endedAt = new Date().toISOString();
  }

  day.updatedAt = new Date().toISOString();
  state.session.activeSetId = null;
  state.session.activeDate = null;
}

export function addRepToActiveSet(state: StoredAppState, delta: number, source: 'auto' | 'manual'): void {
  const day = ensureDayRecord(state, getLocalDateKey());
  const set = getActiveSet(day, state.session.activeSetId);

  if (!set || delta === 0) {
    return;
  }

  const nextSetReps = Math.max(0, set.reps + delta);
  const appliedDelta = nextSetReps - set.reps;
  if (appliedDelta === 0) {
    return;
  }

  set.reps = nextSetReps;
  set.manualAdjustments += source === 'manual' ? appliedDelta : 0;
  set.autoCountedReps += source === 'auto' ? appliedDelta : 0;
  day.totalReps = Math.max(0, day.totalReps + appliedDelta);
  day.updatedAt = new Date().toISOString();

  if (source === 'manual') {
    set.corrections.push({
      id: generateId('correction'),
      timestamp: new Date().toISOString(),
      delta: appliedDelta,
      reason: 'manual'
    });
  }
}

export function resetActiveSet(state: StoredAppState): void {
  const day = ensureDayRecord(state, getLocalDateKey());
  const set = getActiveSet(day, state.session.activeSetId);
  if (!set || set.reps === 0) {
    return;
  }

  const removed = set.reps;
  day.totalReps = Math.max(0, day.totalReps - removed);
  set.reps = 0;
  set.autoCountedReps = 0;
  set.manualAdjustments = 0;
  set.corrections.push({
    id: generateId('correction'),
    timestamp: new Date().toISOString(),
    delta: -removed,
    reason: 'reset'
  });
  day.updatedAt = new Date().toISOString();
}
