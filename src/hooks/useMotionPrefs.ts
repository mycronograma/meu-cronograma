'use client';

/**
 * Preferências de movimento e de ponteiro do aparelho.
 *
 * O app usa animação em quase tudo (Framer Motion + Tailwind): em telas com
 * `prefers-reduced-motion` isso incomoda quem tem sensibilidade a movimento, e
 * em celular/tablet o `hover` fica "grudado" depois do toque. Aqui centralizamos
 * as duas checagens para os componentes decidirem.
 */

import { useEffect, useState } from 'react';

const REDUCED_MOTION_QUERY = '(prefers-reduced-motion: reduce)';
const HOVER_QUERY = '(hover: hover) and (pointer: fine)';

const matches = (query: string, fallback: boolean) => {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    return fallback;
  }
  try {
    return window.matchMedia(query).matches;
  } catch {
    return fallback;
  }
};

export function usePrefersReducedMotion() {
  // No servidor assume `false`; o ajuste acontece no primeiro efeito.
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    setReduced(matches(REDUCED_MOTION_QUERY, false));

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(REDUCED_MOTION_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setReduced(event.matches);

    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  return reduced;
}

export function useCanHover() {
  const [canHover, setCanHover] = useState(true);

  useEffect(() => {
    setCanHover(matches(HOVER_QUERY, true));

    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;

    const media = window.matchMedia(HOVER_QUERY);
    const handleChange = (event: MediaQueryListEvent) => setCanHover(event.matches);

    media.addEventListener?.('change', handleChange);
    return () => media.removeEventListener?.('change', handleChange);
  }, []);

  return canHover;
}

export function useMotionPrefs() {
  const reduceMotion = usePrefersReducedMotion();
  const canHover = useCanHover();

  return { reduceMotion, canHover, animate: !reduceMotion, hoverEffects: canHover && !reduceMotion };
}

export default useMotionPrefs;
