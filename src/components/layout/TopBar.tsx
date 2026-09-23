'use client';

/**
 * TopBar Component
 * Exibe estatisticas do usuario, nivel e acoes rapidas
 */

import Link from 'next/link';
import Image from 'next/image';
import { usePathname, useRouter } from 'next/navigation';
import { useState, useMemo, useRef, useEffect, useCallback, type RefObject } from 'react';
import { motion } from 'framer-motion';
import { signOut, useSession } from 'next-auth/react';
import {
  Flame,
  Bell,
  Search,
  Plus,
  User,
  LogOut,
  Moon,
  Sun,
} from 'lucide-react';
import { percentage, formatNumber, cn } from '@/lib/utils';
import { QuickSessionModal } from '@/components/session';
import { useLocalStorage } from '@/hooks';
import { defaultSettings } from '@/lib/defaultSettings';
import { clearLocalDemoSession, isLocalDemoAuthEnabled } from '@/lib/localDemoAuth';
import type { AppNotification, Subject, UserSettings } from '@/types';
import AppContainer from './AppContainer';
import { navItems } from './navItems';

interface TopBarProps {
  user: {
    name: string;
    avatar?: string;
    level: number;
    xp: number;
    xpToNextLevel: number;
    streak: number;
  };
}

interface TopBarMobileProps {
  routeTitle: string;
  user: TopBarProps['user'];
  unreadCount: number;
  theme: 'light' | 'dark';
  onOpenQuickSession: () => void;
  onToggleNotifications: () => void;
  onToggleTheme: () => void;
  notificationButtonRef: RefObject<HTMLButtonElement>;
}

interface TopBarDesktopProps {
  user: TopBarProps['user'];
  unreadCount: number;
  xpProgress: number;
  theme: 'light' | 'dark';
  onOpenQuickSession: () => void;
  onToggleNotifications: () => void;
  onToggleTheme: () => void;
  onSignOut: () => void;
  notificationButtonRef: RefObject<HTMLButtonElement>;
}

const toTitleCase = (value: string) =>
  value
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const resolveRouteTitle = (pathname: string) => {
  const matched = navItems.find((item) => pathname === item.href || pathname.startsWith(`${item.href}/`));
  if (matched) return matched.label;

  const [firstSegment] = pathname.split('/').filter(Boolean);
  if (!firstSegment) return 'Nexora';
  return toTitleCase(decodeURIComponent(firstSegment));
};

function TopBarMobile({
  routeTitle,
  user,
  unreadCount,
  theme,
  onOpenQuickSession,
  onToggleNotifications,
  onToggleTheme,
  notificationButtonRef,
}: TopBarMobileProps) {
  const ThemeIcon = theme === 'light' ? Moon : Sun;

  return (
    <AppContainer className="flex h-14 min-w-0 items-center justify-between gap-3 lg:hidden">
      <div className="min-w-0 flex-1">
        <h1 className="truncate text-base font-heading font-semibold text-white">{routeTitle}</h1>
      </div>

      <div className="flex shrink-0 items-center gap-2">
        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onOpenQuickSession}
          className="flex h-11 w-11 items-center justify-center rounded-xl bg-neon-blue/10 text-neon-blue transition-colors hover:bg-neon-blue/15"
          aria-label="Abrir sessão rápida"
        >
          <Plus className="h-5 w-5" />
        </motion.button>

        <motion.button
          ref={notificationButtonRef}
          whileTap={{ scale: 0.94 }}
          onClick={onToggleNotifications}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-card-bg transition-colors"
          aria-label="Abrir notificações"
        >
          <Bell className="h-5 w-5 text-text-secondary" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-neon-cyan" />
          )}
        </motion.button>

        <motion.button
          whileTap={{ scale: 0.94 }}
          onClick={onToggleTheme}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-card-bg transition-colors"
          aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
        >
          <ThemeIcon className="h-5 w-5 text-text-secondary" />
        </motion.button>

        <Link
          href="/settings"
          className="flex h-11 w-11 items-center justify-center rounded-xl hover:bg-card-bg transition-colors"
          aria-label="Abrir perfil"
        >
          {user.avatar ? (
            <Image
              src={user.avatar}
              alt={user.name}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover border-2 border-neon-blue/50"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-neon-blue to-neon-purple">
              <User className="h-4 w-4 text-white" />
            </div>
          )}
        </Link>
      </div>
    </AppContainer>
  );
}

function TopBarDesktop({
  user,
  unreadCount,
  xpProgress,
  theme,
  onOpenQuickSession,
  onToggleNotifications,
  onToggleTheme,
  onSignOut,
  notificationButtonRef,
}: TopBarDesktopProps) {
  const ThemeIcon = theme === 'light' ? Moon : Sun;

  return (
    <AppContainer className="hidden h-16 min-w-0 items-center gap-3 lg:flex">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <div className="relative w-full min-w-0 max-w-xs xl:max-w-sm">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-text-muted" />
          <input
            type="text"
            placeholder="Buscar disciplinas, sessões..."
            className="input-field w-full py-2 pl-10 text-sm"
          />
        </div>
      </div>

      <div className="hidden shrink-0 items-center gap-4 2xl:gap-6 xl:flex">
        <motion.div whileHover={{ scale: 1.05 }} className="flex cursor-pointer items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-orange-500/20">
            <Flame className="h-4 w-4 text-orange-500" />
          </div>
          <div className="text-sm">
            <span className="font-bold text-white">{user.streak}</span>
            <span className="ml-1 hidden text-text-secondary 2xl:inline">
              {user.streak === 1 ? 'dia seguido' : 'dias seguidos'}
            </span>
          </div>
        </motion.div>

        <motion.div whileHover={{ scale: 1.02 }} className="flex cursor-pointer items-center gap-3">
          <div className="relative">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-neon-purple to-neon-blue">
              <span className="text-sm font-bold text-white">{user.level}</span>
            </div>
            <svg className="absolute inset-0 h-10 w-10 -rotate-90" viewBox="0 0 40 40">
              <circle cx="20" cy="20" r="18" fill="none" stroke="rgba(127, 0, 255, 0.2)" strokeWidth="3" />
              <circle
                cx="20"
                cy="20"
                r="18"
                fill="none"
                stroke="url(#xpGradient)"
                strokeWidth="3"
                strokeDasharray={`${xpProgress * 1.13} 113`}
                strokeLinecap="round"
              />
              <defs>
                <linearGradient id="xpGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="#7F00FF" />
                  <stop offset="100%" stopColor="#00B4FF" />
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="hidden text-sm 2xl:block">
            <div className="font-bold text-white">Nível {user.level}</div>
            <div className="text-xs text-text-secondary">
              {formatNumber(user.xp)} / {formatNumber(user.xpToNextLevel)} XP
            </div>
          </div>
        </motion.div>
      </div>

      <div className="flex min-w-0 shrink-0 items-center justify-end gap-2 xl:gap-3">
        <motion.button
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.95 }}
          onClick={onOpenQuickSession}
          className="btn-primary flex min-h-[44px] items-center gap-2 px-3 xl:px-4 py-2 text-sm"
          aria-label="Abrir sessão rápida"
        >
          <Plus className="h-4 w-4" />
          <span className="hidden xl:inline">Sessão rápida</span>
          <span className="xl:hidden">Sessão</span>
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onToggleTheme}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-card-bg transition-colors"
          aria-label={theme === 'light' ? 'Ativar tema escuro' : 'Ativar tema claro'}
        >
          <ThemeIcon className="h-5 w-5 text-text-secondary" />
        </motion.button>

        <motion.button
          ref={notificationButtonRef}
          whileHover={{ scale: 1.1 }}
          whileTap={{ scale: 0.9 }}
          onClick={onToggleNotifications}
          className="relative flex h-11 w-11 items-center justify-center rounded-xl hover:bg-card-bg transition-colors"
          aria-label="Abrir notificações"
        >
          <Bell className="h-5 w-5 text-text-secondary" />
          {unreadCount > 0 && (
            <span className="absolute right-2 top-2 h-2 w-2 rounded-full bg-neon-cyan" />
          )}
        </motion.button>

        <motion.button
          type="button"
          whileHover={{ scale: 1.05 }}
          className="flex max-w-full cursor-pointer items-center gap-2 xl:gap-3 rounded-xl p-2 transition-colors hover:bg-card-bg"
          onClick={onSignOut}
          aria-label="Sair da conta"
        >
          {user.avatar ? (
            <Image
              src={user.avatar}
              alt={user.name}
              width={32}
              height={32}
              className="h-8 w-8 rounded-full object-cover border-2 border-neon-blue/50"
            />
          ) : (
            <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gradient-to-br from-neon-blue to-neon-purple">
              <User className="h-4 w-4 text-white" />
            </div>
          )}
          <span className="hidden max-w-[10rem] truncate text-sm font-medium text-white 2xl:inline">
            {user.name}
          </span>
          <LogOut className="h-4 w-4 text-text-muted" />
        </motion.button>
      </div>
    </AppContainer>
  );
}

export default function TopBar({ user }: TopBarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const { status } = useSession();
  const [showQuickSession, setShowQuickSession] = useState(false);
  const [showNotifications, setShowNotifications] = useState(false);
  const [notifications, setNotifications] = useState<AppNotification[]>([]);
  const [isNotificationsLoading, setIsNotificationsLoading] = useState(false);
  const [notificationsError, setNotificationsError] = useState<string | null>(null);
  const [subjects] = useLocalStorage<Subject[]>('nexora_subjects', []);
  const [userSettings, setUserSettings] = useLocalStorage<UserSettings>('nexora_user_settings', defaultSettings);

  const desktopPanelRef = useRef<HTMLDivElement | null>(null);
  const mobilePanelRef = useRef<HTMLDivElement | null>(null);
  const desktopButtonRef = useRef<HTMLButtonElement | null>(null);
  const mobileButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastNotificationSyncRef = useRef(0);

  const xpProgress = percentage(user.xp, user.xpToNextLevel);
  const routeTitle = useMemo(() => resolveRouteTitle(pathname || '/dashboard'), [pathname]);
  const theme = userSettings.theme === 'light' ? 'light' : 'dark';
  const canUseServerNotifications = status === 'authenticated';
  const quickSessionSubjects = useMemo(
    () => subjects.map((subject) => ({ id: subject.id, name: subject.name, color: subject.color })),
    [subjects]
  );
  const unreadCount = notifications.filter((item) => !item.read).length;

  const handleSignOut = useCallback(() => {
    if (isLocalDemoAuthEnabled) {
      clearLocalDemoSession();
      router.push('/login');
      return;
    }

    void signOut({ callbackUrl: '/login' });
  }, [router]);

  const toggleTheme = useCallback(() => {
    setUserSettings((prev) => ({
      ...prev,
      theme: prev.theme === 'light' ? 'dark' : 'light',
    }));
  }, [setUserSettings]);

  const formatNotificationDate = useCallback((isoDate: string) => {
    const parsed = new Date(isoDate);
    if (Number.isNaN(parsed.getTime())) return isoDate;

    return new Intl.DateTimeFormat('pt-BR', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(parsed);
  }, []);

  const fetchNotifications = useCallback(async () => {
    if (!canUseServerNotifications) {
      setNotifications([]);
      setNotificationsError(null);
      setIsNotificationsLoading(false);
      return;
    }

    setIsNotificationsLoading(true);
    setNotificationsError(null);

    try {
      const response = await fetch('/api/notifications', {
        method: 'GET',
        cache: 'no-store',
      });
      const payload = await response.json().catch(() => ({}));

      if (!response.ok || !payload?.success) {
        setNotificationsError(payload?.error || 'Não foi possível carregar notificações.');
        return;
      }

      setNotifications(Array.isArray(payload?.data?.notifications) ? payload.data.notifications : []);
    } catch {
      setNotificationsError('Não foi possível carregar notificações.');
    } finally {
      setIsNotificationsLoading(false);
    }
  }, [canUseServerNotifications]);

  const syncNotifications = useCallback(async () => {
    if (!canUseServerNotifications) return;

    const now = Date.now();
    if (now - lastNotificationSyncRef.current < 90_000) return;
    lastNotificationSyncRef.current = now;

    try {
      await fetch('/api/notifications/sync', { method: 'POST' });
    } catch {
      // no-op
    }
  }, [canUseServerNotifications]);

  const markAllNotificationsAsRead = useCallback(async () => {
    if (unreadCount <= 0) return;

    setNotifications((prev) => prev.map((item) => ({ ...item, read: true })));

    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ markAll: true }),
      });
    } catch {
      // no-op
    }
  }, [unreadCount]);

  const markNotificationAsRead = useCallback(async (notificationId: string) => {
    setNotifications((prev) =>
      prev.map((item) => (item.id === notificationId ? { ...item, read: true } : item))
    );

    try {
      await fetch('/api/notifications/read', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ notificationId }),
      });
    } catch {
      // no-op
    }
  }, []);

  const handleNotificationClick = useCallback(
    async (item: AppNotification) => {
      if (!item.read) {
        await markNotificationAsRead(item.id);
      }

      if (item.url) {
        setShowNotifications(false);
        router.push(item.url);
      }
    },
    [markNotificationAsRead, router]
  );

  const notificationsPanelContent = (
    <>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-white">Notificações</p>
        <div className="flex flex-wrap items-center justify-end gap-x-3 gap-y-1">
          {unreadCount > 0 && (
            <button
              type="button"
              onClick={markAllNotificationsAsRead}
              className="text-[11px] text-neon-blue hover:underline"
            >
              Marcar tudo como lida
            </button>
          )}
          <span className="text-xs text-text-muted">
            {unreadCount > 0 ? `${unreadCount} novas` : 'Sem novas'}
          </span>
        </div>
      </div>
      {isNotificationsLoading ? (
        <div className="text-sm text-text-muted">Carregando notificações...</div>
      ) : notificationsError ? (
        <div className="text-sm text-red-300">{notificationsError}</div>
      ) : notifications.length === 0 ? (
        <div className="text-sm text-text-muted">Nenhuma notificação por enquanto.</div>
      ) : (
        <div className="space-y-3 pr-1">
          {notifications.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => handleNotificationClick(item)}
              className={cn(
                'w-full rounded-xl border bg-card-bg/60 p-3 text-left transition-all',
                item.read ? 'border-card-border' : 'border-neon-cyan/35'
              )}
            >
              <div className="flex min-w-0 items-start justify-between gap-2">
                <p className="min-w-0 flex-1 break-words text-sm font-medium text-white">{item.title}</p>
                {!item.read && <span className="mt-1 h-2 w-2 rounded-full bg-neon-cyan" />}
              </div>
              {item.message ? (
                <p className="mt-1 break-words text-xs text-text-secondary">{item.message}</p>
              ) : null}
              <p className="mt-2 text-[11px] text-text-muted">{formatNotificationDate(item.createdAt)}</p>
            </button>
          ))}
        </div>
      )}
    </>
  );

  useEffect(() => {
    if (!showNotifications) return;
    const refreshNotifications = async () => {
      await syncNotifications();
      await fetchNotifications();
    };
    void refreshNotifications();
  }, [fetchNotifications, showNotifications, syncNotifications]);

  useEffect(() => {
    if (!showNotifications) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (desktopPanelRef.current?.contains(target)) return;
      if (mobilePanelRef.current?.contains(target)) return;
      if (desktopButtonRef.current?.contains(target)) return;
      if (mobileButtonRef.current?.contains(target)) return;
      setShowNotifications(false);
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setShowNotifications(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [showNotifications]);

  useEffect(() => {
    setShowNotifications(false);
    setShowQuickSession(false);
  }, [pathname]);

  useEffect(() => {
    void syncNotifications();
    void fetchNotifications();
  }, [fetchNotifications, syncNotifications]);

  return (
    <>
      <header className="sticky top-0 z-30 w-full min-w-0 border-b border-card-border bg-background-light/85 backdrop-blur-glass">
        <div className="safe-area-top">
          <TopBarMobile
            routeTitle={routeTitle}
            user={user}
            unreadCount={unreadCount}
            theme={theme}
            onOpenQuickSession={() => setShowQuickSession(true)}
            onToggleNotifications={() => setShowNotifications((prev) => !prev)}
            onToggleTheme={toggleTheme}
            notificationButtonRef={mobileButtonRef}
          />
          <TopBarDesktop
            user={user}
            unreadCount={unreadCount}
            xpProgress={xpProgress}
            theme={theme}
            onOpenQuickSession={() => setShowQuickSession(true)}
            onToggleNotifications={() => setShowNotifications((prev) => !prev)}
            onToggleTheme={toggleTheme}
            onSignOut={handleSignOut}
            notificationButtonRef={desktopButtonRef}
          />
        </div>
      </header>

      {showNotifications && (
        <>
          <button
            type="button"
            aria-label="Fechar notificações"
            onClick={() => setShowNotifications(false)}
            className="fixed inset-0 z-40 bg-black/45 backdrop-blur-[1px] lg:hidden"
          />

          <div className="app-mobile-safe-overlay lg:hidden">
            <motion.div
              ref={mobilePanelRef}
              initial={{ opacity: 0, y: 18 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 12 }}
              className="app-mobile-safe-surface pointer-events-auto max-h-[min(70dvh,30rem)] overflow-y-auto rounded-2xl border border-card-border bg-slate-900/95 p-4 shadow-2xl backdrop-blur-lg"
            >
              {notificationsPanelContent}
            </motion.div>
          </div>

          <div className="pointer-events-none fixed inset-x-0 top-[calc(env(safe-area-inset-top)+var(--topbar-height-desktop)+12px)] z-50 hidden lg:block">
            <AppContainer className="flex justify-end">
              <motion.div
                ref={desktopPanelRef}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 8 }}
                className="pointer-events-auto w-[22rem] max-h-[24rem] overflow-y-auto rounded-2xl border border-card-border bg-slate-900/95 p-4 shadow-2xl backdrop-blur-lg"
              >
                {notificationsPanelContent}
              </motion.div>
            </AppContainer>
          </div>
        </>
      )}

      <QuickSessionModal
        isOpen={showQuickSession}
        onClose={() => setShowQuickSession(false)}
        subjects={quickSessionSubjects}
      />
    </>
  );
}
