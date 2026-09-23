'use client';

/**
 * Shared Client Store Hook
 * Keeps state synchronized across components and persisted in browser localStorage.
 */

import { useState, useEffect, useCallback, useRef } from 'react';

export const LOCAL_STORAGE_SYNC_EVENT = 'nexora-local-storage-sync';

type ClientStoreSyncDetail<T = unknown> = {
  key: string;
  value?: T;
  hasValue: boolean;
};

const clientStore = new Map<string, unknown>();

function readBrowserStorage<T>(key: string): { hasValue: boolean; value?: T } {
  if (typeof window === 'undefined') {
    return { hasValue: false };
  }

  try {
    const item = window.localStorage.getItem(key);
    if (item === null) {
      return { hasValue: false };
    }
    return { hasValue: true, value: JSON.parse(item) as T };
  } catch (error) {
    console.warn(`Error reading browser storage key "${key}":`, error);
    return { hasValue: false };
  }
}

function writeBrowserStorage<T>(key: string, value: T) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch (error) {
    console.warn(`Error writing browser storage key "${key}":`, error);
  }
}

function removeBrowserStorage(key: string) {
  if (typeof window === 'undefined') return;

  try {
    window.localStorage.removeItem(key);
  } catch (error) {
    console.warn(`Error removing browser storage key "${key}":`, error);
  }
}

export function emitLocalStorageSyncEvent<T>(key: string, value: T, hasValue = true) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent(LOCAL_STORAGE_SYNC_EVENT, {
      detail: { key, value, hasValue } satisfies ClientStoreSyncDetail<T>,
    })
  );
}

export function getClientStoreSnapshot(keys?: readonly string[]) {
  const entries = keys
    ? keys
        .filter((key) => clientStore.has(key))
        .map((key) => [key, clientStore.get(key)] as const)
    : Array.from(clientStore.entries());

  return entries.reduce<Record<string, unknown>>((acc, [key, value]) => {
    acc[key] = value;
    return acc;
  }, {});
}

export function setClientStoreValue<T>(key: string, value: T) {
  const previousValue = clientStore.get(key);
  if (Object.is(previousValue, value)) return false;
  clientStore.set(key, value);
  writeBrowserStorage(key, value);
  emitLocalStorageSyncEvent(key, value, true);
  return true;
}

export function setClientStoreEntries(entries: Record<string, unknown>) {
  Object.entries(entries).forEach(([key, value]) => {
    setClientStoreValue(key, value);
  });
}

export function clearClientStoreKeys(keys: readonly string[]) {
  keys.forEach((key) => {
    const hadValue = clientStore.has(key);
    clientStore.delete(key);
    removeBrowserStorage(key);
    if (!hadValue) return;
    emitLocalStorageSyncEvent(key, undefined, false);
  });
}

export function useLocalStorage<T>(
  key: string,
  initialValue: T
): [T, (value: T | ((val: T) => T)) => void] {
  const initialValueRef = useRef(initialValue);

  useEffect(() => {
    initialValueRef.current = initialValue;
  }, [initialValue, key]);

  const [storedValue, setStoredValue] = useState<T>(() => {
    if (clientStore.has(key)) {
      return clientStore.get(key) as T;
    }
    clientStore.set(key, initialValueRef.current);
    return initialValueRef.current;
  });
  const storedValueRef = useRef(storedValue);

  useEffect(() => {
    storedValueRef.current = storedValue;
  }, [storedValue]);

  useEffect(() => {
    const browserValue = readBrowserStorage<T>(key);
    if (browserValue.hasValue) {
      clientStore.set(key, browserValue.value as T);
      setStoredValue((prev) => (Object.is(prev, browserValue.value) ? prev : (browserValue.value as T)));
      return;
    }

    if (clientStore.has(key)) {
      const value = clientStore.get(key) as T;
      setStoredValue((prev) => (Object.is(prev, value) ? prev : value));
      return;
    }

    clientStore.set(key, initialValueRef.current);
    setStoredValue((prev) =>
      Object.is(prev, initialValueRef.current) ? prev : initialValueRef.current
    );
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleCustomSync = (event: Event) => {
      const customEvent = event as CustomEvent<ClientStoreSyncDetail<T>>;
      if (customEvent.detail?.key !== key) return;

      if (!customEvent.detail.hasValue) {
        setStoredValue((prev) =>
          Object.is(prev, initialValueRef.current) ? prev : initialValueRef.current
        );
        return;
      }
      const nextValue = customEvent.detail.value as T;

      setStoredValue((prev) =>
        Object.is(prev, nextValue) ? prev : nextValue
      );
    };

    window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, handleCustomSync);

    return () => {
      window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, handleCustomSync);
    };
  }, [key]);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handleBrowserStorage = (event: StorageEvent) => {
      if (event.storageArea !== window.localStorage) return;
      if (event.key !== null && event.key !== key) return;

      if (event.key === null || event.newValue === null) {
        clientStore.delete(key);
        setStoredValue((prev) =>
          Object.is(prev, initialValueRef.current) ? prev : initialValueRef.current
        );
        return;
      }

      try {
        const nextValue = JSON.parse(event.newValue) as T;
        clientStore.set(key, nextValue);
        storedValueRef.current = nextValue;
        setStoredValue((prev) => (Object.is(prev, nextValue) ? prev : nextValue));
      } catch (error) {
        console.warn(`Error syncing browser storage key "${key}":`, error);
      }
    };

    window.addEventListener('storage', handleBrowserStorage);

    return () => {
      window.removeEventListener('storage', handleBrowserStorage);
    };
  }, [key]);

  const setValue = useCallback((value: T | ((val: T) => T)) => {
    try {
      const previousValue = (clientStore.has(key) ? clientStore.get(key) : storedValueRef.current) as T;
      const valueToStore = value instanceof Function ? value(previousValue) : value;

      if (Object.is(previousValue, valueToStore)) {
        return;
      }

      clientStore.set(key, valueToStore);
      storedValueRef.current = valueToStore;
      writeBrowserStorage(key, valueToStore);
      emitLocalStorageSyncEvent(key, valueToStore, true);
      setStoredValue((prev) => (Object.is(prev, valueToStore) ? prev : valueToStore));
    } catch (error) {
      console.warn(`Error setting client store key "${key}":`, error);
    }
  }, [key]);

  return [storedValue, setValue];
}

export default useLocalStorage;
