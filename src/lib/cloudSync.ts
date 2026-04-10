import type { StoredAppState } from '../types/app';
import { deserializeStoredState } from './storage';
import { isSupabaseConfigured, supabase } from './supabase';

const TABLE_NAME = 'pushup_counter_states';

export interface RemoteStateRecord {
  user_id: string;
  payload: string | StoredAppState;
  updated_at: string;
}

export function isCloudSyncAvailable(): boolean {
  return isSupabaseConfigured && Boolean(supabase);
}

export async function loadRemoteState(userId: string): Promise<StoredAppState | null> {
  if (!supabase) {
    return null;
  }

  const { data, error } = await supabase
    .from(TABLE_NAME)
    .select('payload, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    throw error;
  }

  if (!data?.payload) {
    return null;
  }

  if (typeof data.payload === 'string') {
    return deserializeStoredState(data.payload);
  }

  return deserializeStoredState(JSON.stringify(data.payload));
}

export async function saveRemoteState(userId: string, state: StoredAppState): Promise<void> {
  if (!supabase) {
    return;
  }

  const { error } = await supabase.from(TABLE_NAME).upsert(
    {
      user_id: userId,
      payload: state,
      updated_at: state.updatedAt
    },
    {
      onConflict: 'user_id'
    }
  );

  if (error) {
    throw error;
  }
}
