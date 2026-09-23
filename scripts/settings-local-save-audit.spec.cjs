const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:3000' });
test.describe.configure({ timeout: 60000 });

test('settings save works in local demo mode without a server session', async ({ page }) => {
  const preferenceCalls = [];
  page.on('request', (request) => {
    if (request.url().includes('/api/preferences')) {
      preferenceCalls.push(request.method());
    }
  });

  await page.addInitScript(() => {
    window.localStorage.clear();
    window.localStorage.setItem('nexora_theme', 'dark');
    window.localStorage.setItem('nexora_demo_session', 'true');
    window.localStorage.setItem(
      'nexora_demo_user',
      JSON.stringify({ email: 'qa@nexora.local', name: 'Estudante QA' })
    );
    window.localStorage.setItem(
      'nexora_user_settings',
      JSON.stringify({
        name: 'Estudante QA',
        email: 'qa@nexora.local',
        dailyGoalHours: 4,
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
      })
    );
    window.localStorage.setItem(
      'nexora_study_prefs',
      JSON.stringify({
        hoursPerDay: 4,
        daysOfWeek: [1, 2, 3, 4, 5],
        mode: 'random',
      })
    );
    window.localStorage.setItem(
      'nexora_onboarding',
      JSON.stringify({ hasCompletedWelcome: true, hasCompletedTutorial: true })
    );
  });

  await page.goto('/settings?section=study', { waitUntil: 'networkidle' });
  await expect(page.locator('input[type="range"]').first()).toBeVisible();

  await page.locator('input[type="range"]').first().fill('5');

  await expect(page.getByText(/Alterações salvas/i).last()).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/Falha ao salvar/i)).toHaveCount(0);
  expect(preferenceCalls).toEqual([]);

  const stored = await page.evaluate(() => ({
    settings: JSON.parse(window.localStorage.getItem('nexora_user_settings') || '{}'),
    prefs: JSON.parse(window.localStorage.getItem('nexora_study_prefs') || '{}'),
  }));

  expect(stored.settings.dailyGoalHours).toBe(5);
  expect(stored.prefs.hoursPerDay).toBe(5);
});
