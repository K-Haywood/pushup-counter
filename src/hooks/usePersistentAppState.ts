import { useEffect, useState } from 'react';
import { APP_STORAGE_KEY } from '../lib/defaults';
import {
  addRepToActiveSet,
  buildHistoryWindow,
  buildProgressSnapshot,
  computeStreakSnapshot,
  endSet,
  ensureDayRecord,
  getLatestUpdatedAt,
  getDashboardSummary,
  loadStoredStateFromIndexedDb,
  loadStoredState,
  resetActiveSet,
  saveStoredState,
  saveStoredStateToIndexedDb,
  startSet
} from '../lib/storage';
import { getLocalDateKey } from '../lib/dates';
import type { AppSettings, RepTelemetry, StoredAppState } from '../types/app';

export function usePersistentAppState() {
  const [state, setState] = useState<StoredAppState>(() => loadStoredState(APP_STORAGE_KEY));
  const [hasHydratedStorage, setHasHydratedStorage] = useState(false);
  const [storageStatus, setStorageStatus] = useState<'loading' | 'saved' | 'error'>('loading');
  const [lastSavedAt, setLastSavedAt] = useState<string | null>(null);

  useEffect(() => {
    let active = true;

    void loadStoredStateFromIndexedDb()
      .then((indexedState) => {
        if (!active) {
          return;
        }

        if (indexedState) {
          setState((current) => {
            const currentLatest = Date.parse(getLatestUpdatedAt(current) ?? '') || 0;
            const indexedLatest = Date.parse(getLatestUpdatedAt(indexedState) ?? '') || 0;
            return indexedLatest > currentLatest ? indexedState : current;
          });
          setLastSavedAt(getLatestUpdatedAt(indexedState));
        }

        setStorageStatus('saved');
      })
      .catch(() => {
        if (!active) {
          return;
        }

        setStorageStatus('error');
      })
      .finally(() => {
        if (active) {
          setHasHydratedStorage(true);
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (!hasHydratedStorage) {
      return;
    }

    saveStoredState(APP_STORAGE_KEY, state);
    void saveStoredStateToIndexedDb(state)
      .then(() => {
        setStorageStatus('saved');
        setLastSavedAt(new Date().toISOString());
      })
      .catch(() => {
        setStorageStatus('error');
      });
  }, [state, hasHydratedStorage]);

  function updateState(mutator: (draft: StoredAppState) => void): void {
    setState((current) => {
      const draft = structuredClone(current) as StoredAppState;
      const today = ensureDayRecord(draft, getLocalDateKey());

      if (draft.session.activeDate && draft.session.activeDate !== today.date && draft.session.activeSetId) {
        endSet(draft, draft.session.activeDate);
      }

      mutator(draft);
      draft.updatedAt = new Date().toISOString();
      draft.streakSnapshot = computeStreakSnapshot(draft.days, getLocalDateKey());
      return draft;
    });
  }

  const today = ensureDayRecord(state, getLocalDateKey());
  const currentSet =
    state.session.activeDate === today.date
      ? today.sets.find((set) => set.id === state.session.activeSetId) ?? null
      : null;

  return {
    state,
    today,
    currentSet,
    summary: getDashboardSummary(state, today.date),
    last7Days: buildHistoryWindow(state, 7),
    last30Days: buildHistoryWindow(state, 30),
    progress: buildProgressSnapshot(state),
    storageStatus,
    lastSavedAt,
    replaceState(nextState: StoredAppState) {
      setState(() => {
        const draft = structuredClone(nextState) as StoredAppState;
        draft.updatedAt = draft.updatedAt || new Date().toISOString();
        draft.streakSnapshot = computeStreakSnapshot(draft.days, getLocalDateKey());
        return draft;
      });
    },
    setTodayGoal(goal: number) {
      updateState((draft) => {
        const day = ensureDayRecord(draft, getLocalDateKey());
        day.dailyGoal = Math.max(1, Math.round(goal));
        day.updatedAt = new Date().toISOString();
      });
    },
    startSet() {
      updateState((draft) => {
        startSet(draft, getLocalDateKey());
      });
    },
    endSet() {
      updateState((draft) => {
        endSet(draft, getLocalDateKey());
      });
    },
    addAutoRep(repTelemetry: RepTelemetry) {
      updateState((draft) => {
        addRepToActiveSet(draft, 1, 'auto', repTelemetry);
      });
    },
    adjustCurrentSet(delta: number) {
      updateState((draft) => {
        addRepToActiveSet(draft, delta, 'manual');
      });
    },
    resetCurrentSet() {
      updateState((draft) => {
        resetActiveSet(draft);
      });
    },
    updateSettings(patch: Partial<AppSettings>) {
      updateState((draft) => {
        draft.settings = {
          ...draft.settings,
          ...patch
        };
      });
    }
  };
}
