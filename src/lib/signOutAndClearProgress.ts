'use client';

import { signOut } from 'next-auth/react';
import { clearClientStoreKeys } from '@/hooks/useLocalStorage';
import { SERVER_PROGRESS_STORE_KEYS } from '@/hooks/useServerProgressSync';
import { resetSyncState } from '@/lib/clientSync';

/**
 * Chaves locais do usuário que NÃO fazem parte de SERVER_PROGRESS_STORE_KEYS.
 * `nexora_sync_state` guarda o cursor/fingerprint do sync: sem limpá-lo, a próxima
 * conta que entrar neste navegador herdaria o cursor da conta anterior e poderia
 * não puxar (ou até reenviar) os dados dela.
 */
export const SIGN_OUT_EXTRA_STORE_KEYS = [
  'nexora_sync_state',
  'nexora_pending_reviews',
  'nexora_backlog_notification_day',
] as const;

/** Prevent the next account on this browser from inheriting the previous user's study data. */
export async function signOutAndClearProgress() {
  const result = await signOut({ redirect: false, callbackUrl: '/login' });
  clearClientStoreKeys(SERVER_PROGRESS_STORE_KEYS);
  clearClientStoreKeys(SIGN_OUT_EXTRA_STORE_KEYS);
  // Sem isto, o aparelho continuaria achando que já enviou o que foi apagado.
  resetSyncState();
  window.location.assign(result.url || '/login');
}
