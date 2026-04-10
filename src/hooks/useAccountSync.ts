import { useEffect, useRef, useState } from 'react';
import { loadRemoteState, saveRemoteState } from '../lib/cloudSync';
import { isSupabaseConfigured, supabase } from '../lib/supabase';
import type { AccountSessionState, StoredAppState } from '../types/app';

interface UseAccountSyncArgs {
  state: StoredAppState;
  replaceState: (nextState: StoredAppState) => void;
}

const DEFAULT_STATUS: AccountSessionState = {
  isConfigured: isSupabaseConfigured,
  isLoading: isSupabaseConfigured,
  isSignedIn: false,
  userEmail: null,
  syncStatus: isSupabaseConfigured ? 'loading' : 'disabled',
  lastSyncedAt: null,
  statusMessage: isSupabaseConfigured
    ? 'Cloud sync is ready. Sign in to keep progress across devices.'
    : 'Cloud sync is not configured yet.',
  errorMessage: null
};

export function useAccountSync({ state, replaceState }: UseAccountSyncArgs) {
  const [account, setAccount] = useState<AccountSessionState>(DEFAULT_STATUS);
  const latestStateRef = useRef(state);
  const replaceStateRef = useRef(replaceState);
  const lastPushedAtRef = useRef<string | null>(null);
  const remoteReadyRef = useRef(false);
  const syncTimerRef = useRef<number | null>(null);

  useEffect(() => {
    latestStateRef.current = state;
  }, [state]);

  useEffect(() => {
    replaceStateRef.current = replaceState;
  }, [replaceState]);

  useEffect(() => {
    const client = supabase;
    if (!client) {
      setAccount((current) => ({
        ...current,
        isLoading: false,
        isSignedIn: false,
        syncStatus: 'disabled',
        statusMessage: 'Cloud sync is not configured yet.'
      }));
      return;
    }
    const supabaseClient = client as NonNullable<typeof supabase>;

    let active = true;

    async function hydrateSession() {
      setAccount((current) => ({
        ...current,
        isLoading: true,
        syncStatus: 'loading',
        statusMessage: 'Checking your account...'
      }));

      const { data, error } = await supabaseClient.auth.getSession();
      if (!active) {
        return;
      }

      if (error) {
        setAccount((current) => ({
          ...current,
          isLoading: false,
          syncStatus: 'error',
          errorMessage: error.message,
          statusMessage: 'Could not load your account.'
        }));
        return;
      }

      const nextSession = data.session;
      setAccount((current) => ({
        ...current,
        isLoading: false,
        isSignedIn: Boolean(nextSession),
        userEmail: nextSession?.user.email ?? null,
        syncStatus: nextSession ? 'loading' : 'idle',
        statusMessage: nextSession
          ? 'Loading your cloud backup...'
          : 'Sign in to sync progress across devices.',
        errorMessage: null
      }));
    }

    void hydrateSession();

    const {
      data: { subscription }
    } = supabaseClient.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) {
        return;
      }

      remoteReadyRef.current = false;
      lastPushedAtRef.current = null;

      setAccount((current) => ({
        ...current,
        isLoading: false,
        isSignedIn: Boolean(nextSession),
        userEmail: nextSession?.user.email ?? null,
        syncStatus: nextSession ? 'loading' : 'idle',
        statusMessage: nextSession
          ? 'Loading your cloud backup...'
          : 'Sign in to sync progress across devices.',
        errorMessage: null,
        lastSyncedAt: null
      }));
    });

    return () => {
      active = false;
      subscription.unsubscribe();
    };
  }, []);

  useEffect(() => {
    const client = supabase;
    if (!client || !account.isSignedIn || !account.userEmail) {
      remoteReadyRef.current = false;
      return;
    }
    const supabaseClient = client as NonNullable<typeof supabase>;

    let active = true;

    async function loadInitialBackup() {
      setAccount((current) => ({
        ...current,
        syncStatus: 'loading',
        statusMessage: 'Checking cloud backup...'
      }));

      try {
        const session = await supabaseClient.auth.getSession();
        const userId = session.data.session?.user.id;

        if (!userId || !active) {
          return;
        }

        const remoteState = await loadRemoteState(userId);
        if (!active) {
          return;
        }

        if (remoteState) {
          const localUpdatedAt = Date.parse(latestStateRef.current.updatedAt);
          const remoteUpdatedAt = Date.parse(remoteState.updatedAt);

          if (Number.isFinite(remoteUpdatedAt) && remoteUpdatedAt > localUpdatedAt) {
            replaceStateRef.current(remoteState);
            latestStateRef.current = remoteState;
          }

          lastPushedAtRef.current = remoteState.updatedAt;
          setAccount((current) => ({
            ...current,
            syncStatus: 'synced',
            lastSyncedAt: remoteState.updatedAt,
            statusMessage: 'Cloud backup loaded.',
            errorMessage: null
          }));
        } else {
          setAccount((current) => ({
            ...current,
            syncStatus: 'synced',
            statusMessage: 'Connected. Your first backup will save automatically.',
            errorMessage: null
          }));
        }
      } catch (error) {
        if (!active) {
          return;
        }

        setAccount((current) => ({
          ...current,
          syncStatus: 'error',
          statusMessage: 'Cloud backup failed to load.',
          errorMessage: error instanceof Error ? error.message : 'Unknown sync error'
        }));
      } finally {
        if (active) {
          remoteReadyRef.current = true;
        }
      }
    }

    void loadInitialBackup();

    return () => {
      active = false;
    };
  }, [account.isSignedIn, account.userEmail]);

  useEffect(() => {
    const client = supabase;
    if (!client || !account.isSignedIn || !remoteReadyRef.current) {
      return;
    }
    const supabaseClient = client as NonNullable<typeof supabase>;

    if (lastPushedAtRef.current === state.updatedAt) {
      return;
    }

    setAccount((current) => ({
      ...current,
      syncStatus: 'syncing',
      statusMessage: 'Saving cloud backup...'
    }));

    if (syncTimerRef.current != null) {
      window.clearTimeout(syncTimerRef.current);
    }

    syncTimerRef.current = window.setTimeout(() => {
      const session = supabaseClient.auth.getSession();
      void session.then(async (result) => {
        const { data } = result;
        const userId = data.session?.user.id;
        if (!userId) {
          return;
        }

        try {
          await saveRemoteState(userId, state);
          lastPushedAtRef.current = state.updatedAt;
          setAccount((current) => ({
            ...current,
            syncStatus: 'synced',
            lastSyncedAt: state.updatedAt,
            statusMessage: 'Cloud backup saved.',
            errorMessage: null
          }));
        } catch (error) {
          setAccount((current) => ({
            ...current,
            syncStatus: 'error',
            statusMessage: 'Cloud backup could not be saved.',
            errorMessage: error instanceof Error ? error.message : 'Unknown sync error'
          }));
        }
      });
    }, 1200);

    return () => {
      if (syncTimerRef.current != null) {
        window.clearTimeout(syncTimerRef.current);
        syncTimerRef.current = null;
      }
    };
  }, [account.isSignedIn, state, state.updatedAt]);

  async function sendMagicLink(email: string): Promise<void> {
    const client = supabase;
    if (!client) {
      return;
    }
    const supabaseClient = client as NonNullable<typeof supabase>;

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      throw new Error('Enter an email address.');
    }

    setAccount((current) => ({
      ...current,
      syncStatus: 'loading',
      statusMessage: 'Sending sign-in link...',
      errorMessage: null
    }));

    const { error } = await supabaseClient.auth.signInWithOtp({
      email: trimmedEmail,
      options: {
        emailRedirectTo: window.location.origin
      }
    });

    if (error) {
      setAccount((current) => ({
        ...current,
        syncStatus: 'error',
        statusMessage: 'Could not send sign-in link.',
        errorMessage: error.message
      }));
      throw error;
    }

    setAccount((current) => ({
      ...current,
      syncStatus: 'idle',
      statusMessage: 'Check your email for the sign-in link.'
    }));
  }

  async function signOut(): Promise<void> {
    const client = supabase;
    if (!client) {
      return;
    }
    const supabaseClient = client as NonNullable<typeof supabase>;

    await supabaseClient.auth.signOut();
    setAccount((current) => ({
      ...current,
      isSignedIn: false,
      userEmail: null,
      syncStatus: 'idle',
      lastSyncedAt: null,
      statusMessage: 'Signed out. Cloud sync is paused.',
      errorMessage: null
    }));
  }

  async function syncNow(): Promise<void> {
    const client = supabase;
    if (!client || !account.isSignedIn) {
      return;
    }
    const supabaseClient = client as NonNullable<typeof supabase>;

    const { data } = await supabaseClient.auth.getSession();
    const userId = data.session?.user.id;
    if (!userId) {
      return;
    }

    setAccount((current) => ({
      ...current,
      syncStatus: 'syncing',
      statusMessage: 'Saving cloud backup...'
    }));

    await saveRemoteState(userId, latestStateRef.current);
    lastPushedAtRef.current = latestStateRef.current.updatedAt;

    setAccount((current) => ({
      ...current,
      syncStatus: 'synced',
      lastSyncedAt: latestStateRef.current.updatedAt,
      statusMessage: 'Cloud backup saved.',
      errorMessage: null
    }));
  }

  return {
    account,
    sendMagicLink,
    signOut,
    syncNow
  };
}
