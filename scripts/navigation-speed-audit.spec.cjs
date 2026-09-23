const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:3000' });
test.describe.configure({ timeout: 120000 });

const settings = {
  name: 'Estudante QA',
  email: 'qa@nexora.local',
  theme: 'dark',
  dailyGoalHours: 2,
  preferredStart: '08:00',
  preferredEnd: '12:00',
  maxBlockMinutes: 50,
  breakMinutes: 10,
  excludeDays: [],
  aiDifficulty: 'adaptive',
  focusMode: false,
  autoSchedule: true,
  smartBreaks: true,
  dailyReminder: true,
  streakReminder: true,
  achievementAlerts: true,
  weeklyReport: true,
  notificationsEnabled: false,
  notificationMinutesBefore: 15,
  notificationSoundEnabled: false,
  backlogReminderEnabled: false,
  allowSundayBacklog: false,
};

test('local app navigation is warmed and responsive after first load', async ({ page }) => {
  await page.addInitScript((seedSettings) => {
    window.localStorage.clear();
    window.localStorage.setItem('nexora_theme', 'dark');
    window.localStorage.setItem('nexora_demo_session', 'true');
    window.localStorage.setItem(
      'nexora_demo_user',
      JSON.stringify({ email: seedSettings.email, name: seedSettings.name })
    );
    window.localStorage.setItem('nexora_user_settings', JSON.stringify(seedSettings));
    window.localStorage.setItem('nexora_subjects', JSON.stringify([]));
    window.localStorage.setItem('nexora_planner_blocks', JSON.stringify([]));
    window.localStorage.setItem('nexora_analytics', JSON.stringify({ daily: {} }));
    window.localStorage.setItem(
      'nexora_onboarding',
      JSON.stringify({ hasCompletedWelcome: true, hasCompletedTutorial: true })
    );
  }, settings);

  await page.goto('/dashboard', { waitUntil: 'domcontentloaded' });
  await expect(page.locator('body')).toContainText('Nexora');

  await page.waitForTimeout(9000);

  const timings = [];
  for (const route of ['/subjects', '/dashboard', '/planner', '/analytics', '/settings', '/dashboard']) {
    const start = Date.now();
    await page.locator(`a[href="${route}"]`).first().click();
    await page.waitForURL(`**${route}`);
    await page.locator('main').waitFor({ state: 'visible' });
    timings.push({ route, ms: Date.now() - start });
  }

  console.log(JSON.stringify({ timings }, null, 2));
  expect(timings.every((item) => item.ms < 1800)).toBe(true);
});
