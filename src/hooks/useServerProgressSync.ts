'use client';

/**
 * Mantém o progresso do estudante sincronizado com o servidor.
 *
 * Desde a migração para sincronização incremental este hook é fino: quem decide
 * o que enviar é `src/lib/clientSync.ts` (delta por registro + tombstones).
 * Aqui cuidamos só do ciclo de vida:
 *  - dispara a primeira sincronização ao entrar (puxa o que existe na conta);
 *  - reagrupa alterações do app (debounce) e envia o delta;
 *  - revalida ao voltar para a aba (celular ↔ computador);
 *  - em modo demo não chama o servidor (não há sessão).
 */

import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useSession } from 'next-auth/react';
import { useLocalStorage, LOCAL_STORAGE_SYNC_EVENT } from './useLocalStorage';
import { ROW_STORE_KEYS, SNAPSHOT_STORE_KEYS, syncNow, type SyncStats } from '@/lib/clientSync';
import { SYNC_STATUS_EVENT } from '@/components/layout/SyncStatusBanner';

/** Todas as chaves que fazem parte do progresso do usuário. */
export const SERVER_PROGRESS_STORE_KEYS = [
  ...ROW_STORE_KEYS,
  ...SNAPSHOT_STORE_KEYS,
] as const;

export const SYNC_STATUS_STORAGE_KEY = 'nexora_sync_status';

const SYNC_DEBOUNCE_MS = 1200;
/** Revalidação periódica enquanto a aba está aberta. */
const SYNC_INTERVAL_MS = 120_000;

const serverProgressKeySet = new Set<string>(SERVER_PROGRESS_STORE_KEYS);

type StoreSyncEventDetail = {
  key: string;
  value?: unknown;
  hasValue: boolean;
};

export interface StoredSyncStatus {
  ok: boolean;
  at: string;
  bytesUp: number;
  bytesDown: number;
  pushed: number;
  pulled: number;
  error?: string;
}

export function useServerProgressSync() {
  const { status } = useSession();
  const [storedStatus, setStoredStatus] = useLocalStorage<StoredSyncStatus | null>(
    SYNC_STATUS_STORAGE_KEY,
    null
  );

  const applyingRemoteRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inFlightRef = useRef<Promise<void> | null>(null);
  const isAuthenticated = status === 'authenticated';

  const runSync = useCallback(
    async (options: { force?: boolean } = {}) => {
      if (!isAuthenticated) return;
      if (inFlightRef.current) return inFlightRef.current;

      const task = (async () => {
        applyingRemoteRef.current = true;
        try {
          const result: SyncStats = await syncNow({ force: options.force });
          const pushed =
            result.pushed.subjects + result.pushed.blocks + result.pushed.snapshots;
          const pulled =
            result.pulled.subjects + result.pulled.blocks + result.pulled.sessions;

          if (!result.skipped) {
            setStoredStatus({
              ok: result.ok,
              at: result.at,
              bytesUp: result.bytesUp,
              bytesDown: result.bytesDown,
              pushed,
              pulled,
              error: result.error,
            });
          }
        } finally {
          applyingRemoteRef.current = false;
          inFlightRef.current = null;
        }
      })();

      inFlightRef.current = task;
      await task;
    },
    [isAuthenticated, setStoredStatus]
  );

  const scheduleSync = useCallback(() => {
    if (!isAuthenticated) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      saveTimerRef.current = null;
      void runSync();
    }, SYNC_DEBOUNCE_MS);
  }, [isAuthenticated, runSync]);

  // Primeira sincronização ao entrar: puxa o progresso que estiver na conta.
  useEffect(() => {
    if (!isAuthenticated) return;
    void runSync({ force: true });
  }, [isAuthenticated, runSync]);

  // Alterações do app entram no próximo lote.
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleStoreSync = (event: Event) => {
      const customEvent = event as CustomEvent<StoreSyncEventDetail>;
      const changedKey = customEvent.detail?.key;
      if (!changedKey || !serverProgressKeySet.has(changedKey)) return;
      if (applyingRemoteRef.current) return;
      scheduleSync();
    };

    window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, handleStoreSync);

    return () => {
      window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, handleStoreSync);
      if (saveTimerRef.current) {
        clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [isAuthenticated, scheduleSync]);

  // Voltar para a aba reflete o que foi feito em outro dispositivo.
  useEffect(() => {
    if (!isAuthenticated) return;

    const handleVisibility = () => {
      if (document.visibilityState === 'visible') void runSync({ force: true });
    };

    window.addEventListener('focus', handleVisibility);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('focus', handleVisibility);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [isAuthenticated, runSync]);

  useEffect(() => {
    if (!isAuthenticated) return;
    const interval = setInterval(() => {
      if (document.visibilityState === 'visible') void runSync();
    }, SYNC_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [isAuthenticated, runSync]);

  // Avisa a interface (banner de falha + Configurações) sempre que o status muda.
  useEffect(() => {
    if (typeof window === 'undefined' || !storedStatus) return;
    window.dispatchEvent(new CustomEvent(SYNC_STATUS_EVENT, { detail: storedStatus }));
  }, [storedStatus]);

  return useMemo(
    () => ({ status: storedStatus, syncNow: runSync }),
    [storedStatus, runSync]
  );
}

export default useServerProgressSync;
