import { test, expect } from '@playwright/test';

test('保存后弹层关闭诊断', async ({ page }) => {
  test.setTimeout(60_000);
  const errors = [];
  page.on('console', (msg) => { if (msg.type() === 'error') errors.push(msg.text().slice(0, 200)); });
  page.on('pageerror', (err) => errors.push('PAGEERROR: ' + String(err).slice(0, 200)));

  await page.goto('/plans');
  await page.getByRole('button', { name: '新建' }).click();
  await page.locator('.van-popup:visible').getByPlaceholder(/计划名称/).fill('诊断计划');
  await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
  await page.waitForTimeout(1500);
  const open = await page.evaluate(() => { const el = document.querySelector('.van-overlay'); return el ? getComputedStyle(el).display !== 'none' : false; });
  const planCount = await page.evaluate(async () => (window.__mytimeDebug ? await window.__mytimeDebug.db.plans.count() : -1));
  const logCount = await page.evaluate(async () => (window.__mytimeDebug ? await window.__mytimeDebug.db.planLogs.count() : -1));
  console.log('RESULT:', JSON.stringify({ overlayStillOpen: open, planCount, logCount, errors }));
  expect(open).toBe(false);
});
