'use client';

/**
 * MainLayout Component
 * Envolve as paginas com sidebar, topbar e responsividade
 */

import { useState, useEffect, useMemo } from 'react';
import { useSession } from 'next-auth/react';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';
import TopBar from './TopBar';
import BottomNav from './BottomNav';
import AppContainer from './AppContainer';
import RouteWarmup from './RouteWarmup';
import StorageWarningBanner from './StorageWarningBanner';
import { useLocalStorage } from '@/hooks';
import { useServerProgressSync } from '@/hooks/useServerProgressSync';
import { defaultSettings } from '@/lib/defaultSettings';
import { buildTrainerSnapshot, type TrainerAchievementUnlock, type TrainerXpEvent } from '@/services/studyTrainer';
import {
  clearStudyNotificationSchedule,
  recalculateStudyNotificationSchedule,
} from '@/services/notificationScheduler';
import type { AnalyticsStore, StudyBlock, StudyPreferences, Subject, UserSettings } from '@/types';

interface MainLayoutProps {
  children: React.ReactNode;
}

const emptyAnalytics: AnalyticsStore = { daily: {} };
const defaultStudyPrefs: StudyPreferences = {
  hoursPerDay: 2,
  daysOfWeek: [1, 2, 3, 4, 5],
  mode: 'random',
  examDate: '',
};

export default function MainLayout({ children }: MainLayoutProps) {
  useServerProgressSync();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const { data: session } = useSession();
  const pathname = usePathname();
  const [userSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);
  const [subjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [plannerBlocks] = useLocalStorage<StudyBlock[]>('nexora_planner_blocks', []);
  const [analytics] = useLocalStorage<AnalyticsStore>('nexora_analytics', emptyAnalytics);
  const [studyPrefs] = useLocalStorage<StudyPreferences>('nexora_study_prefs', defaultStudyPrefs);
  const [xpEvents] = useLocalStorage<TrainerXpEvent[]>('nexora_xp_events', []);
  const [unlockedAchievements] = useLocalStorage<TrainerAchievementUnlock[]>(
    'nexora_unlocked_achievements',
    []
  );
  const displayName = userSettings.name || session?.user?.name || 'Estudante';
  const trainer = useMemo(
    () =>
      buildTrainerSnapshot({
        plannerBlocks,
        analytics,
        subjects,
        studyPrefs,
        userSettings,
        xpEvents,
        unlockedAchievements,
      }),
    [analytics, plannerBlocks, studyPrefs, subjects, unlockedAchievements, userSettings, xpEvents]
  );

  // Gerenciar sidebar responsiva
  useEffect(() => {
    const mediaQuery = window.matchMedia('(max-width: 1023px)');
    const applyViewportState = (mobile: boolean) => {
      setIsMobile(mobile);
      if (mobile) {
        setSidebarCollapsed(true);
      }
    };

    applyViewportState(mediaQuery.matches);

    const handleChange = (event: MediaQueryListEvent) => {
      applyViewportState(event.matches);
    };

    mediaQuery.addEventListener('change', handleChange);
    return () => mediaQuery.removeEventListener('change', handleChange);
  }, []);

  useEffect(() => {
    const scheduleNow = () => {
      recalculateStudyNotificationSchedule({
        blocks: plannerBlocks,
        settings: {
          notificationsEnabled: userSettings.notificationsEnabled,
          notificationMinutesBefore: userSettings.notificationMinutesBefore,
          notificationSoundEnabled: userSettings.notificationSoundEnabled,
          backlogReminderEnabled: userSettings.backlogReminderEnabled,
        },
      });
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        scheduleNow();
      }
    };

    const handleFocus = () => {
      scheduleNow();
    };

    scheduleNow();
    window.addEventListener('focus', handleFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      window.removeEventListener('focus', handleFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      clearStudyNotificationSchedule();
    };
  }, [
    plannerBlocks,
    userSettings.notificationsEnabled,
    userSettings.notificationMinutesBefore,
    userSettings.notificationSoundEnabled,
    userSettings.backlogReminderEnabled,
  ]);

  const sidebarWidth = sidebarCollapsed ? 80 : 260;
  const contentOffset = isMobile ? 0 : sidebarWidth;
  const contentStyle = isMobile
    ? undefined
    : {
        paddingLeft: contentOffset,
      };

  return (
    <div className="h-[100dvh] min-h-[100dvh] w-full max-w-full overflow-x-hidden overflow-y-hidden bg-background">
      {/* Sidebar */}
      {!isMobile && (
        <Sidebar
          isCollapsed={sidebarCollapsed}
          onToggle={() => setSidebarCollapsed(!sidebarCollapsed)}
        />
      )}

      {/* Area de conteudo principal */}
      <div
        style={contentStyle}
        className="relative flex h-[100dvh] min-h-0 w-full max-w-full min-w-0 flex-col overflow-x-hidden overflow-y-hidden transition-[padding-left] duration-300 ease-in-out"
      >
        {/* Barra superior */}
        <div className="shrink-0">
          <TopBar
            user={{
              name: displayName,
              avatar: userSettings.avatar ?? session?.user?.image ?? undefined,
              level: trainer.level,
              xp: trainer.xpInCurrentLevel,
              xpToNextLevel: trainer.xpToNextLevel,
              streak: trainer.streak,
            }}
          />
        </div>

        <StorageWarningBanner />

        {/* Conteudo da pagina */}
        <main className="app-main-content flex-1 min-h-0 min-w-0 w-full max-w-full overflow-y-auto">
          <AppContainer>
            <div key={pathname} className="w-full min-w-0 max-w-full">
              {children}
            </div>
          </AppContainer>
        </main>
      </div>

      <BottomNav />
      <RouteWarmup />
    </div>
  );
}
