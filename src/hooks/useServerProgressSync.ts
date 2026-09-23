'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { useSession } from 'next-auth/react';
import {
  LOCAL_STORAGE_SYNC_EVENT,
  getClientStoreSnapshot,
  setClientStoreEntries,
} from './useLocalStorage';

export const SERVER_PROGRESS_STORE_KEYS = [
  'nexora_subjects',
  'nexora_planner_blocks',
  'nexora_analytics',
  'nexora_study_prefs',
  'nexora_user_settings',
  'nexora_schedule_range',
  'nexora_daily_limits',
  'nexora_first_cycle_all_subjects',
  'nexora_onboarding',
  'nexora_session_timers',
  'nexora_backlog_last_auto_run_day',
  'nexora_xp_events',
  'nexora_unlocked_achievements',
] as const;

type ServerProgressStoreKey = (typeof SERVER_PROGRESS_STORE_KEYS)[number];
type ServerProgressPayload = Partial<Record<ServerProgressStoreKey, unknown>>;

type StoreSyncEventDetail = {
  key: string;
  value?: unknown;
  hasValue: boolean;
};

const serverProgressKeySet = new Set<string>(SERVER_PROGRESS_STORE_KEYS);

const LEGACY_KEY_MAP: Record<string, ServerProgressStoreKey> = {
  subjects: 'nexora_subjects',
  plannerBlocks: 'nexora_planner_blocks',
  analytics: 'nexora_analytics',
  studyPrefs: 'nexora_study_prefs',
  userSettings: 'nexora_user_settings',
  scheduleRange: 'nexora_schedule_range',
  dailyLimits: 'nexora_daily_limits',
  firstCycleAllSubjects: 'nexora_first_cycle_all_subjects',
  onboarding: 'nexora_onboarding',
  sessionTimers: 'nexora_session_timers',
  lastBacklogAutoRunDay: 'nexora_backlog_last_auto_run_day',
  xpEvents: 'nexora_xp_events',
  unlockedAchievements: 'nexora_unlocked_achievements',
};

const isRecord = (value: unknown): value is Record<string, unknown> => {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
};

const isStoreKey = (value: string): value is ServerProgressStoreKey => {
  return serverProgressKeySet.has(value);
};

const isEmptyValue = (value: unknown) => {
  if (value == null) return true;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === 'object') return Object.keys(value as Record<string, unknown>).length === 0;
  if (typeof value === 'string') return value.length === 0;
  return false;
};

const normalizePayload = (value: unknown): ServerProgressPayload => {
  if (!isRecord(value)) return {};

  const normalized: ServerProgressPayload = {};

  for (const [rawKey, rawValue] of Object.entries(value)) {
    if (isStoreKey(rawKey)) {
      normalized[rawKey] = rawValue;
      continue;
    }

    const mappedKey = LEGACY_KEY_MAP[rawKey];
    if (mappedKey) {
      normalized[mappedKey] = rawValue;
    }
  }

  return normalized;
};

export function useServerProgressSync() {
  const { status } = useSession();
  const [isReadyToSync, setIsReadyToSync] = useState(false);

  const applyingRemoteRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const saveInFlightRef = useRef(false);
  const queuedSaveRef = useRef<{ payload: ServerProgressPayload; hash: string } | null>(null);
  const lastSavedHashRef = useRef('');

  const buildPayload = useCallback((): ServerProgressPayload => {
    return getClientStoreSnapshot(SERVER_PROGRESS_STORE_KEYS) as ServerProgressPayload;
  }, []);

  const persist = useCallback(async (nextPayload: ServerProgressPayload, hash: string) => {
    if (saveInFlightRef.current) {
      queuedSaveRef.current = { payload: nextPayload, hash };
      return;
    }

    saveInFlightRef.current = true;

    try {
      const response = await fetch('/api/progress', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: nextPayload }),
      });

      const result = await response.json().catch(() => null);
      if (!response.ok || result?.success === false) {
        throw new Error(result?.error || 'Falha ao sincronizar progresso.');
      }

      lastSavedHashRef.current = hash;
    } catch (error) {
      console.warn('Falha ao sincronizar progresso no servidor:', error);
    } finally {
      saveInFlightRef.current = false;

      const queued = queuedSaveRef.current;
      queuedSaveRef.current = null;

      if (queued && queued.hash !== lastSavedHashRef.current) {
        void persist(queued.payload, queued.hash);
      }
    }
  }, []);

  const schedulePersist = useCallback(() => {
    const payload = buildPayload();
    if (Object.keys(payload).length === 0) return;

    const hash = JSON.stringify(payload);
    if (hash === lastSavedHashRef.current) return;

    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current);
    }

    saveTimerRef.current = setTimeout(() => {
      void persist(payload, hash);
    }, 900);
  }, [buildPayload, persist]);

  useEffect(() => {
    if (status !== 'authenticated') {
      setIsReadyToSync(false);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();

    const loadProgress = async () => {
      setIsReadyToSync(false);

      try {
        const response = await fetch('/api/progress', {
          method: 'GET',
          cache: 'no-store',
          signal: controller.signal,
        });

        if (!response.ok) return;

        const result = await response.json();
        if (!result?.success || cancelled) return;

        const incoming = normalizePayload(result.data);
        const source = typeof result.source === 'string' ? result.source : 'unknown';
        const currentPayload = buildPayload();
        const entriesToApply: ServerProgressPayload = {};

        for (const key of SERVER_PROGRESS_STORE_KEYS) {
          if (!(key in incoming)) continue;
          const incomingValue = incoming[key];
          if (source === 'snapshot' || isEmptyValue(currentPayload[key])) {
            entriesToApply[key] = incomingValue;
          }
        }

        applyingRemoteRef.current = true;
        if (Object.keys(entriesToApply).length > 0) {
          setClientStoreEntries(entriesToApply as Record<string, unknown>);
        }

        const merged = {
          ...currentPayload,
          ...entriesToApply,
        };

        if (source === 'snapshot') {
          lastSavedHashRef.current = JSON.stringify(merged);
        }
      } catch (error) {
        if (!cancelled) {
          console.warn('Falha ao carregar progresso remoto:', error);
        }
      } finally {
        if (cancelled) return;
        window.setTimeout(() => {
          applyingRemoteRef.current = false;
          setIsReadyToSync(true);
        }, 0);
      }
    };

    void loadProgress();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [buildPayload, status]);

  useEffect(() => {
    if (status !== 'authenticated' || !isReadyToSync) {
      return;
    }

    const handleStoreSync = (event: Event) => {
      const customEvent = event as CustomEvent<StoreSyncEventDetail>;
      const changedKey = customEvent.detail?.key;
      if (!changedKey || !serverProgressKeySet.has(changedKey)) return;
      if (applyingRemoteRef.current) return;
      schedulePersist();
    };

    window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, handleStoreSync);

    // Garante criação/atualização do snapshot mesmo sem interação imediata.
    schedulePersist();

    return () => {
      window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, handleStoreSync);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [isReadyToSync, schedulePersist, status]);
}

export default useServerProgressSync;
