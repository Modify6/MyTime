import { test } from '@playwright/test';
import fs from 'node:fs';

test('读取 CI 日志页诊断', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('https://github.com/Modify6/MyTime/actions/runs/42289319969/job/128138415453');
  await page.waitForTimeout(5000);

  // 展开所有折叠的日志步骤
  const toggles = await page.locator('summary, .step-summary, [aria-expanded="false"]').all();
  for (const t of toggles.slice(0, 20)) {
    try { await t.click({ timeout: 1000 }); } catch {}
  }
  await page.waitForTimeout(3000);

  // 滚动到底触发日志懒加载
  for (let i = 0; i < 10; i++) {
    await page.keyboard.press('End');
    await page.waitForTimeout(800);
  }

  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split('\n').filter((l) => l.includes('E2E_FAIL') || l.includes('ERR:'));
  fs.writeFileSync('E:/study/zi/MyTime/.ci-log.txt', 'LINES:' + lines.length + '\n' + lines.join('\n') + '\n\n=== 全文长度 ' + text.length + ' ===\n' + text.slice(0, 500));
});
