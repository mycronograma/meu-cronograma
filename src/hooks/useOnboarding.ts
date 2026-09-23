'use client';

/**
 * useOnboarding Hook
 * Gerencia o estado do onboarding e primeiro uso no client store sincronizado.
 */

import { useLocalStorage } from './useLocalStorage';

interface OnboardingState {
  hasCompletedWelcome: boolean;
  hasCompletedTutorial: boolean;
  hasAddedFirstSubject: boolean;
  tutorialStep: number;
}

const STORAGE_KEY = 'nexora_onboarding';

const defaultState: OnboardingState = {
  hasCompletedWelcome: false,
  hasCompletedTutorial: false,
  hasAddedFirstSubject: false,
  tutorialStep: 0,
};

export function useOnboarding() {
  const [state, setState] = useLocalStorage<OnboardingState>(STORAGE_KEY, defaultState);
  const isLoading = false;

  // Save state
  const saveState = (newState: Partial<OnboardingState>) => {
    setState((prev) => ({ ...prev, ...newState }));
  };

  // Check if user is a first-time user
  const isFirstTimeUser = !state.hasCompletedWelcome;

  // Check if should show welcome modal
  const shouldShowWelcome = !isLoading && !state.hasCompletedWelcome;

  // Check if should show tutorial
  const shouldShowTutorial = !isLoading && state.hasCompletedWelcome && !state.hasCompletedTutorial;

  // Complete welcome
  const completeWelcome = () => {
    saveState({ hasCompletedWelcome: true });
  };

  // Complete tutorial
  const completeTutorial = () => {
    saveState({ hasCompletedTutorial: true });
  };

  // Skip tutorial
  const skipTutorial = () => {
    saveState({ hasCompletedTutorial: true });
  };

  // Mark first subject added
  const markFirstSubjectAdded = () => {
    saveState({ hasAddedFirstSubject: true });
  };

  // Reset onboarding (for testing)
  const resetOnboarding = () => {
    setState(defaultState);
  };

  return {
    isLoading,
    isFirstTimeUser,
    shouldShowWelcome,
    shouldShowTutorial,
    hasAddedFirstSubject: state.hasAddedFirstSubject,
    completeWelcome,
    completeTutorial,
    skipTutorial,
    markFirstSubjectAdded,
    resetOnboarding,
  };
}

export default useOnboarding;
