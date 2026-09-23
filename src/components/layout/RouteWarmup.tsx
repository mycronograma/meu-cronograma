'use client';

import { useEffect } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { navItems } from './navItems';

const shouldWarmRoutes =
  process.env.NODE_ENV !== 'production' &&
  process.env.NEXT_PUBLIC_LOCAL_DEMO_MODE === 'true';

const warmupRoutes = Array.from(new Set(navItems.map((item) => item.href)));
const warmedRoutes = new Set<string>();
let warmupStarted = false;

export default function RouteWarmup() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!shouldWarmRoutes || typeof window === 'undefined') return;
    if (warmupStarted) return;
    warmupStarted = true;

    let cancelled = false;
    const runWarmup = async () => {
      const routes = warmupRoutes.filter((route) => route !== pathname);

      for (const route of routes) {
        if (cancelled) return;
        if (warmedRoutes.has(route)) continue;
        warmedRoutes.add(route);

        try {
          router.prefetch(route);
          await fetch(route, {
            method: 'GET',
            credentials: 'same-origin',
            cache: 'force-cache',
          });
        } catch {
          // Warmup is only a local development convenience.
        }

        await new Promise((resolve) => window.setTimeout(resolve, 150));
      }
    };

    const startWarmup = () => {
      void runWarmup();
    };

    const idleWindow = window as Window & {
      requestIdleCallback?: (callback: () => void, options?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };
    const idleHandle =
      typeof idleWindow.requestIdleCallback === 'function'
        ? idleWindow.requestIdleCallback(startWarmup, { timeout: 800 })
        : window.setTimeout(startWarmup, 800);

    return () => {
      cancelled = true;
      if (typeof idleWindow.cancelIdleCallback === 'function') {
        idleWindow.cancelIdleCallback(idleHandle);
      } else if (typeof idleHandle === 'number') {
        window.clearTimeout(idleHandle);
      }
    };
  }, [pathname, router]);

  return null;
}
