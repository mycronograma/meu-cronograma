'use client';

import { signOut } from 'next-auth/react';
import { clearClientStoreKeys } from '@/hooks/useLocalStorage';
import { SERVER_PROGRESS_STORE_KEYS } from '@/hooks/useServerProgressSync';

/** Prevent the next account on this browser from inheriting the previous user's study data. */
export async function signOutAndClearProgress() {
  const result = await signOut({ redirect: false, callbackUrl: '/login' });
  clearClientStoreKeys(SERVER_PROGRESS_STORE_KEYS);
  window.location.assign(result.url || '/login');
}
