'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import { navItems } from './navItems';
import AppContainer from './AppContainer';

export default function BottomNav() {
  const pathname = usePathname();
  const isActiveRoute = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  return (
    <nav
      className={cn(
        'pointer-events-none fixed inset-x-0 bottom-0 z-40 w-full min-w-0 lg:hidden'
      )}
      aria-label="Navegacao principal"
    >
      <div className="app-bottom-nav-surface pointer-events-auto border-t border-card-border">
        <AppContainer className="safe-area-bottom">
          <ul className="mx-auto flex h-[var(--bottom-nav-height)] w-full max-w-[34rem] items-center justify-between gap-1 py-1.5">
            {navItems.map((item) => {
              const isActive = isActiveRoute(item.href);
              const Icon = item.icon;

              return (
                <li key={item.id} className="flex min-w-0 flex-1">
                  <Link
                    href={item.href}
                    prefetch
                    data-tutorial={`nav-${item.id}`}
                    aria-current={isActive ? 'page' : undefined}
                    className={cn(
                      'relative flex w-full min-w-0 flex-col items-center justify-center gap-1 rounded-xl px-1.5 py-2',
                      'min-h-[50px] touch-manipulation text-[10px] sm:text-[11px] transition-colors',
                      isActive
                        ? 'bg-neon-blue/10 text-neon-blue'
                        : 'text-text-secondary hover:text-white'
                    )}
                  >
                    <Icon className="h-5 w-5" />
                    <span className="max-w-full truncate">{item.label}</span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </AppContainer>
      </div>
    </nav>
  );
}
