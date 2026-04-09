import { useEffect, useState } from 'react';
import { APP_STORAGE_KEY } from '../lib/defaults';
import {
  addRepToActiveSet,
  buildHistoryWindow,
  computeStreakSnapshot,
  endSet,
  ensureDayRecord,
  getDashboardSummary,
  loadStoredState,
  resetActiveSet,
  saveStoredState,
  startSet
} from '../lib/storage';
import { getLocalDateKey } from '../lib/dates';
import type { AppSettings, StoredAppState } from '../types/app';

export function usePersistentAppState() {
  const [state, setState] = useState<StoredAppState>(() => loadStoredState(APP_STORAGE_KEY));

  useEffect(() => {
    saveStoredState(APP_STORAGE_KEY, state);
  }, [state]);

  function updateState(mutator: (draft: StoredAppState) => void): void {
    setState((current) => {
      const draft = structuredClone(current) as StoredAppState;
      const today = ensureDayRecord(draft, getLocalDateKey());

      if (draft.session.activeDate && draft.session.activeDate !== today.date && draft.session.activeSetId) {
        endSet(draft, draft.session.activeDate);
      }

      mutator(draft);
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
    addAutoRep() {
      updateState((draft) => {
        addRepToActiveSet(draft, 1, 'auto');
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
