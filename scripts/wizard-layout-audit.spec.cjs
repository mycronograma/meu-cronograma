const { test, expect } = require('@playwright/test');

test.use({ baseURL: 'http://localhost:3000' });
test.describe.configure({ timeout: 180000 });

test('schedule wizard availability stays synchronized', async ({ page }) => {
  await page.goto('/login');
  await page.evaluate(() => {
    window.localStorage.clear();
    window.localStorage.setItem('nexora_demo_session', 'true');
    window.localStorage.setItem(
      'nexora_demo_user',
      JSON.stringify({ email: 'teste@nexora.local', name: 'Estudante Teste' })
    );
    window.localStorage.setItem(
      'nexora_user_settings',
      JSON.stringify({
        name: 'Estudante Teste',
        email: 'teste@nexora.local',
        theme: 'light',
        preferredStart: '18:30',
        preferredEnd: '22:30',
        dailyGoalHours: 4,
        maxBlockMinutes: 60,
        breakMinutes: 10,
        autoSchedule: true,
        smartBreaks: true,
        focusMode: false,
        aiDifficulty: 'medium',
        notificationsEnabled: false,
        notificationMinutesBefore: 15,
        notificationSoundEnabled: false,
        backlogReminderEnabled: false,
        allowSundayBacklog: false,
      })
    );
  });

  await page.goto('/subjects', { waitUntil: 'domcontentloaded', timeout: 120000 });
  await page.getByRole('heading', { name: 'ENEM' }).click();
  const configureButton = page.getByRole('button', { name: /Configurar modelo/i });
  await expect(configureButton).toBeVisible({ timeout: 60000 });
  await configureButton.scrollIntoViewIfNeeded();
  await configureButton.click({ force: true });
  await expect(page.getByText('Sua disponibilidade atual')).toBeVisible();

  const bodyBefore = await page.locator('body').innerText();
  expect(bodyBefore).toMatch(/Semana\s+22:00/);
  expect(bodyBefore).toMatch(/Média\s+3:40/);
  expect(bodyBefore).toContain('Faltam horários');

  await page.locator('input[type="time"]').nth(0).fill('08:00');
  await page.locator('input[type="time"]').nth(1).fill('15:00');

  const bodyAfter = await page.locator('body').innerText();
  expect(bodyAfter).toMatch(/Semana\s+42:00/);
  expect(bodyAfter).toMatch(/Média\s+7:00/);
  expect(bodyAfter).toContain('Horários completos');
  expect(bodyAfter).not.toMatch(/undefined|NaN|Invalid Date|\[object Object\]/i);

  await page.getByRole('button', { name: /Próximo/i }).click();
  await expect(page.getByText(/Duração do bloco/)).toBeVisible();
  await page.getByRole('button', { name: /Próximo/i }).click();
  await page.getByRole('button', { name: /Próximo/i }).click();
  await page.getByRole('button', { name: /Intenso/i }).click();
  await page.getByRole('button', { name: /Voltar/i }).click();
  await page.getByRole('button', { name: /Voltar/i }).click();

  const focus90Class = await page.getByRole('button', { name: /^90 min$/ }).getAttribute('class');
  const break5Class = await page.getByRole('button', { name: /^5 min$/ }).getAttribute('class');
  expect(focus90Class).toContain('border-neon-cyan');
  expect(break5Class).toContain('border-neon-purple');

  const layout = await page.evaluate(() => ({
    bodyOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
  }));
  expect(layout.bodyOverflow).toBe(false);
});
