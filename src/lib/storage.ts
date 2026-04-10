import { APP_STATE_VERSION, DEFAULT_SETTINGS, createEmptyStoredState } from './defaults';
import { addDays, getLocalDateKey, getPreviousDateKey, listDateKeysBack } from './dates';
import type {
  AppSettings,
  DashboardSummary,
  DayRecord,
  FormAnalyticsSummary,
  HistoryPoint,
  ProgressPeriodSummary,
  ProgressSnapshot,
  RecentSetInsight,
  RepAnalysis,
  RepTelemetry,
  SetRecord,
  StoredAppState,
  StreakSnapshot
} from '../types/app';

const INDEXED_DB_NAME = 'pushup-counter-db';
const INDEXED_DB_VERSION = 1;
const INDEXED_DB_STORE = 'app-state';
const INDEXED_DB_RECORD_ID = 'current';

function generateId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`;
}

function ensureNumber(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

function ensureBoolean(value: unknown, fallback: boolean): boolean {
  return typeof value === 'boolean' ? value : fallback;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function averageOrNull(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function createEmptyFormAnalytics(): FormAnalyticsSummary {
  return {
    analyzedReps: 0,
    avgQualityScore: null,
    avgDepth: null,
    avgCycleMs: null,
    avgDownMs: null,
    avgUpMs: null,
    avgBottomHoldMs: null,
    consistencyScore: null
  };
}

function toRepAnalysis(rawRep: Partial<RepAnalysis>): RepAnalysis {
  return {
    id: typeof rawRep.id === 'string' ? rawRep.id : generateId('rep'),
    countedAt: typeof rawRep.countedAt === 'string' ? rawRep.countedAt : new Date().toISOString(),
    downMs: rawRep.downMs == null ? null : ensureNumber(rawRep.downMs, 0),
    upMs: rawRep.upMs == null ? null : ensureNumber(rawRep.upMs, 0),
    cycleMs: rawRep.cycleMs == null ? null : ensureNumber(rawRep.cycleMs, 0),
    bottomHoldMs: rawRep.bottomHoldMs == null ? null : ensureNumber(rawRep.bottomHoldMs, 0),
    depth: clamp(ensureNumber(rawRep.depth, 0), 0, 1),
    confidence: clamp(ensureNumber(rawRep.confidence, 0), 0, 1),
    alignmentScore: clamp(ensureNumber(rawRep.alignmentScore, 0), 0, 1),
    qualityScore: clamp(ensureNumber(rawRep.qualityScore, 0), 0, 100)
  };
}

function openStorageDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(INDEXED_DB_NAME, INDEXED_DB_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(INDEXED_DB_STORE)) {
        database.createObjectStore(INDEXED_DB_STORE);
      }
    };

    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Failed to open IndexedDB.'));
  });
}

function migrateLegacyNumberSetting(
  rawValue: unknown,
  nextDefault: number,
  legacyDefault: number,
  parsedVersion: number
): number {
  const resolved = ensureNumber(rawValue, nextDefault);

  if (parsedVersion < 2 && (rawValue == null || resolved === legacyDefault)) {
    return nextDefault;
  }

  return resolved;
}

function migrateRecentNumberSetting(
  rawValue: unknown,
  nextDefault: number,
  recentDefault: number,
  parsedVersion: number,
  targetVersion: number
): number {
  const resolved = ensureNumber(rawValue, nextDefault);

  if (parsedVersion < targetVersion && (rawValue == null || resolved === recentDefault)) {
    return nextDefault;
  }

  return resolved;
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
    const parsedVersion = ensureNumber(parsed.version, APP_STATE_VERSION);

    const settings: AppSettings = {
      defaultDailyGoal: ensureNumber(parsed.settings?.defaultDailyGoal, DEFAULT_SETTINGS.defaultDailyGoal),
      soundEnabled: ensureBoolean(parsed.settings?.soundEnabled, DEFAULT_SETTINGS.soundEnabled),
      vibrationEnabled: ensureBoolean(parsed.settings?.vibrationEnabled, DEFAULT_SETTINGS.vibrationEnabled),
      cameraFacingMode: parsed.settings?.cameraFacingMode === 'user' ? 'user' : 'environment',
      preferredCameraId:
        typeof parsed.settings?.preferredCameraId === 'string' ? parsed.settings.preferredCameraId : null,
      smoothingFrames: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.smoothingFrames,
          DEFAULT_SETTINGS.smoothingFrames,
          5,
          parsedVersion
        ),
        DEFAULT_SETTINGS.smoothingFrames,
        4,
        parsedVersion,
        3
      ),
      topThreshold: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.topThreshold,
          DEFAULT_SETTINGS.topThreshold,
          155,
          parsedVersion
        ),
        DEFAULT_SETTINGS.topThreshold,
        142,
        parsedVersion,
        4
      ),
      bottomThreshold: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.bottomThreshold,
          DEFAULT_SETTINGS.bottomThreshold,
          95,
          parsedVersion
        ),
        DEFAULT_SETTINGS.bottomThreshold,
        118,
        parsedVersion,
        4
      ),
      minLandmarkVisibility: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.minLandmarkVisibility,
          DEFAULT_SETTINGS.minLandmarkVisibility,
          0.65,
          parsedVersion
        ),
        DEFAULT_SETTINGS.minLandmarkVisibility,
        0.45,
        parsedVersion,
        4
      ),
      bodyAlignmentTolerance: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.bodyAlignmentTolerance,
          DEFAULT_SETTINGS.bodyAlignmentTolerance,
          0.12,
          parsedVersion
        ),
        DEFAULT_SETTINGS.bodyAlignmentTolerance,
        0.18,
        parsedVersion,
        3
      ),
      sideViewMaxRatio: ensureNumber(parsed.settings?.sideViewMaxRatio, DEFAULT_SETTINGS.sideViewMaxRatio),
      frontViewMinRatio: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.frontViewMinRatio,
          DEFAULT_SETTINGS.frontViewMinRatio,
          0.55,
          parsedVersion
        ),
        DEFAULT_SETTINGS.frontViewMinRatio,
        0.42,
        parsedVersion,
        3
      ),
      armSymmetryTolerance: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.armSymmetryTolerance,
          DEFAULT_SETTINGS.armSymmetryTolerance,
          0.14,
          parsedVersion
        ),
        DEFAULT_SETTINGS.armSymmetryTolerance,
        0.28,
        parsedVersion,
        3
      ),
      cooldownMs: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.cooldownMs,
          DEFAULT_SETTINGS.cooldownMs,
          650,
          parsedVersion
        ),
        DEFAULT_SETTINGS.cooldownMs,
        700,
        parsedVersion,
        3
      ),
      calibrationHoldMs: migrateRecentNumberSetting(
        migrateLegacyNumberSetting(
          parsed.settings?.calibrationHoldMs,
          DEFAULT_SETTINGS.calibrationHoldMs,
          1200,
          parsedVersion
        ),
        DEFAULT_SETTINGS.calibrationHoldMs,
        900,
        parsedVersion,
        3
      )
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
              })),
              repAnalytics: (set.repAnalytics ?? []).map((rep) => toRepAnalysis(rep))
            }))
          } satisfies DayRecord
        ];
      })
    );

    return {
      version: APP_STATE_VERSION,
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

export async function loadStoredStateFromIndexedDb(): Promise<StoredAppState | null> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return null;
  }

  const database = await openStorageDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, 'readonly');
    const store = transaction.objectStore(INDEXED_DB_STORE);
    const request = store.get(INDEXED_DB_RECORD_ID);

    request.onsuccess = () => {
      const rawState = request.result;
      database.close();

      if (!rawState || typeof rawState.payload !== 'string') {
        resolve(null);
        return;
      }

      try {
        window.localStorage.setItem('pushup-counter:indexeddb-import', rawState.payload);
        resolve(loadStoredState('pushup-counter:indexeddb-import'));
        window.localStorage.removeItem('pushup-counter:indexeddb-import');
      } catch (error) {
        reject(error);
      }
    };

    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('Failed to read IndexedDB state.'));
    };
  });
}

export async function saveStoredStateToIndexedDb(state: StoredAppState): Promise<void> {
  if (typeof window === 'undefined' || !('indexedDB' in window)) {
    return;
  }

  const database = await openStorageDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(INDEXED_DB_STORE, 'readwrite');
    const store = transaction.objectStore(INDEXED_DB_STORE);
    store.put(
      {
        id: INDEXED_DB_RECORD_ID,
        payload: JSON.stringify(state),
        savedAt: new Date().toISOString()
      },
      INDEXED_DB_RECORD_ID
    );

    transaction.oncomplete = () => {
      database.close();
      resolve();
    };
    transaction.onerror = () => {
      database.close();
      reject(transaction.error ?? new Error('Failed to save IndexedDB state.'));
    };
  });
}

export function getLatestUpdatedAt(state: StoredAppState): string | null {
  const timestamps = Object.values(state.days)
    .map((day) => Date.parse(day.updatedAt))
    .filter((value) => Number.isFinite(value));

  if (timestamps.length === 0) {
    return null;
  }

  return new Date(Math.max(...timestamps)).toISOString();
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

function countMeaningfulSets(day: DayRecord): number {
  return day.sets.filter((set) => set.reps > 0 || set.autoCountedReps > 0 || Boolean(set.endedAt)).length;
}

function summarizeRepAnalytics(repAnalytics: RepAnalysis[]): FormAnalyticsSummary {
  if (repAnalytics.length === 0) {
    return createEmptyFormAnalytics();
  }

  const cycleDurations = repAnalytics
    .map((rep) => rep.cycleMs)
    .filter((value): value is number => value != null && Number.isFinite(value));
  const averageCycle = averageOrNull(cycleDurations);
  const cycleVariance =
    averageCycle == null || cycleDurations.length < 2
      ? null
      : cycleDurations.reduce((sum, value) => sum + (value - averageCycle) ** 2, 0) / cycleDurations.length;
  const cycleDeviation = cycleVariance == null ? null : Math.sqrt(cycleVariance);
  const consistencyScore =
    averageCycle == null || cycleDeviation == null
      ? null
      : Math.round(clamp(1 - cycleDeviation / Math.max(averageCycle, 1), 0, 1) * 100);

  return {
    analyzedReps: repAnalytics.length,
    avgQualityScore: averageOrNull(repAnalytics.map((rep) => rep.qualityScore)),
    avgDepth: averageOrNull(repAnalytics.map((rep) => rep.depth)),
    avgCycleMs: averageCycle,
    avgDownMs: averageOrNull(
      repAnalytics.map((rep) => rep.downMs).filter((value): value is number => value != null && Number.isFinite(value))
    ),
    avgUpMs: averageOrNull(
      repAnalytics.map((rep) => rep.upMs).filter((value): value is number => value != null && Number.isFinite(value))
    ),
    avgBottomHoldMs: averageOrNull(
      repAnalytics
        .map((rep) => rep.bottomHoldMs)
        .filter((value): value is number => value != null && Number.isFinite(value))
    ),
    consistencyScore
  };
}

function listTrackedSets(days: DayRecord[]): Array<{ date: string; set: SetRecord }> {
  return days.flatMap((day) =>
    day.sets
      .filter((set) => set.reps > 0 || set.autoCountedReps > 0 || Boolean(set.endedAt))
      .map((set) => ({
        date: day.date,
        set
      }))
  );
}

function summarizeFormAnalyticsForSets(sets: SetRecord[]): FormAnalyticsSummary {
  return summarizeRepAnalytics(sets.flatMap((set) => set.repAnalytics));
}

function buildRecentSetInsight(date: string, set: SetRecord): RecentSetInsight {
  const summary = summarizeRepAnalytics(set.repAnalytics);

  return {
    id: set.id,
    date,
    startedAt: set.startedAt,
    endedAt: set.endedAt,
    reps: set.reps,
    analyzedReps: summary.analyzedReps,
    avgQualityScore: summary.avgQualityScore,
    avgDepth: summary.avgDepth,
    avgCycleMs: summary.avgCycleMs,
    avgDownMs: summary.avgDownMs,
    avgUpMs: summary.avgUpMs,
    avgBottomHoldMs: summary.avgBottomHoldMs,
    consistencyScore: summary.consistencyScore,
    bestRepQuality:
      set.repAnalytics.length > 0 ? Math.max(...set.repAnalytics.map((rep) => rep.qualityScore)) : null
  };
}

function summarizePeriod(days: DayRecord[]): ProgressPeriodSummary {
  const totalReps = days.reduce((sum, day) => sum + day.totalReps, 0);
  const totalSets = days.reduce((sum, day) => sum + countMeaningfulSets(day), 0);
  const activeDays = days.filter((day) => day.totalReps > 0).length;
  const goalDays = days.filter((day) => qualifiesForStreak(day)).length;

  return {
    totalReps,
    totalSets,
    activeDays,
    goalDays,
    averagePerDay: days.length > 0 ? totalReps / days.length : 0
  };
}

function getExistingOrEmptyDay(state: StoredAppState, dateKey: string): DayRecord {
  return (
    state.days[dateKey] ?? {
      date: dateKey,
      dailyGoal: state.settings.defaultDailyGoal,
      totalReps: 0,
      sets: [],
      updatedAt: new Date(0).toISOString()
    }
  );
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

export function buildProgressSnapshot(
  state: StoredAppState,
  today = new Date()
): ProgressSnapshot {
  const weekDays = listDateKeysBack(7, today).map((dateKey) => getExistingOrEmptyDay(state, dateKey));
  const monthDays = listDateKeysBack(30, today).map((dateKey) => getExistingOrEmptyDay(state, dateKey));
  const lifetimeDays = Object.values(state.days).sort((a, b) => a.date.localeCompare(b.date));
  const weekSets = listTrackedSets(weekDays).map((entry) => entry.set);
  const monthSets = listTrackedSets(monthDays).map((entry) => entry.set);
  const lifetimeTrackedSets = listTrackedSets(lifetimeDays);
  const bestDay = lifetimeDays.reduce<DayRecord | null>(
    (currentBest, day) => {
      if (!currentBest || day.totalReps > currentBest.totalReps) {
        return day;
      }

      return currentBest;
    },
    null
  );

  return {
    week: summarizePeriod(weekDays),
    month: summarizePeriod(monthDays),
    lifetime: {
      ...summarizePeriod(lifetimeDays),
      trackedDays: lifetimeDays.length,
      bestDayDate: bestDay?.date ?? null,
      bestDayReps: bestDay?.totalReps ?? 0
    },
    form: {
      week: summarizeFormAnalyticsForSets(weekSets),
      month: summarizeFormAnalyticsForSets(monthSets),
      lifetime: summarizeFormAnalyticsForSets(lifetimeTrackedSets.map((entry) => entry.set)),
      recentSets: lifetimeTrackedSets
        .map(({ date, set }) => buildRecentSetInsight(date, set))
        .sort(
          (left, right) =>
            Date.parse(right.endedAt ?? right.startedAt) - Date.parse(left.endedAt ?? left.startedAt)
        )
        .slice(0, 6)
    }
  };
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
    corrections: [],
    repAnalytics: []
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

export function addRepToActiveSet(
  state: StoredAppState,
  delta: number,
  source: 'auto' | 'manual',
  repTelemetry?: RepTelemetry
): void {
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

  if (source === 'auto' && appliedDelta > 0 && repTelemetry) {
    set.repAnalytics.push(
      toRepAnalysis({
        ...repTelemetry,
        countedAt: new Date().toISOString()
      })
    );
  } else if (source === 'manual' && appliedDelta < 0 && set.repAnalytics.length > 0) {
    set.repAnalytics.splice(Math.max(0, set.repAnalytics.length + appliedDelta), Math.abs(appliedDelta));
  }

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
  set.repAnalytics = [];
  set.corrections.push({
    id: generateId('correction'),
    timestamp: new Date().toISOString(),
    delta: -removed,
    reason: 'reset'
  });
  day.updatedAt = new Date().toISOString();
}
