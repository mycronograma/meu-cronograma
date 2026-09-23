'use client';

import { useEffect } from 'react';
import { useRef } from 'react';
import { LOCAL_STORAGE_SYNC_EVENT, useLocalStorage } from '@/hooks/useLocalStorage';
import { defaultSettings } from '@/lib/defaultSettings';
import type { UserSettings } from '@/types';

const SETTINGS_KEY = 'nexora_user_settings';
const THEME_STORAGE_KEY = 'nexora_theme';

type AppTheme = 'light' | 'dark';

const resolveTheme = (settings?: Partial<UserSettings> | null): AppTheme =>
  settings?.theme === 'light' ? 'light' : 'dark';

const applyTheme = (theme: AppTheme) => {
  const root = document.documentElement;
  root.classList.toggle('theme-light', theme === 'light');
  root.classList.toggle('theme-dark', theme !== 'light');
  root.classList.toggle('dark', theme !== 'light');
  root.style.colorScheme = theme === 'light' ? 'light' : 'dark';
  const themeColor = theme === 'light' ? '#f2f2f7' : '#05080F';
  document
    .querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    ?.setAttribute('content', themeColor);
};

export default function ThemeBootstrap() {
  const [settings, setSettings] = useLocalStorage<UserSettings>(SETTINGS_KEY, defaultSettings);
  const hasResolvedSavedThemeRef = useRef(false);

  useEffect(() => {
    let theme = resolveTheme(settings);

    if (!hasResolvedSavedThemeRef.current) {
      hasResolvedSavedThemeRef.current = true;
      const savedTheme = window.localStorage.getItem(THEME_STORAGE_KEY);

      if (savedTheme === 'light' || savedTheme === 'dark') {
        theme = savedTheme;

        if (settings.theme !== savedTheme) {
          setSettings((prev) => ({ ...prev, theme: savedTheme }));
        }
      }
    }

    applyTheme(theme);
    window.localStorage.setItem(THEME_STORAGE_KEY, theme);
  }, [settings, setSettings]);

  useEffect(() => {
    const handleSync = (event: Event) => {
      const customEvent = event as CustomEvent<{
        key?: string;
        value?: Partial<UserSettings>;
        hasValue?: boolean;
      }>;
      if (customEvent.detail?.key !== SETTINGS_KEY || customEvent.detail.hasValue === false) return;
      applyTheme(resolveTheme(customEvent.detail.value));
    };

    window.addEventListener(LOCAL_STORAGE_SYNC_EVENT, handleSync);
    return () => window.removeEventListener(LOCAL_STORAGE_SYNC_EVENT, handleSync);
  }, []);

  return null;
}
