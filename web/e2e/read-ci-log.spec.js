import { test } from '@playwright/test';
import fs from 'node:fs';

test('展开 CI 日志读取 E2E 失败详情', async ({ page }) => {
  test.setTimeout(180_000);
  await page.goto('https://github.com/Modify6/MyTime/actions/runs/42291816946/job/128147039745');
  await page.waitForTimeout(6000);

  // 点击"运行端到端测试"步骤展开日志
  const step = page.getByText('运行端到端测试（失败自动重试一轮）').first();
  try { await step.click({ timeout: 5000 }); } catch {}
  await page.waitForTimeout(2000);

  // 滚动加载全部日志
  for (let i = 0; i < 15; i++) {
    await page.keyboard.press('End');
    await page.waitForTimeout(600);
  }

  const text = await page.evaluate(() => document.body.innerText);
  const lines = text.split('\n').filter((l) =>
    l.includes('E2E_FAIL') || l.includes('ERR:') || l.includes('✘') || l.includes('failed') || l.includes('Error')
  );
  fs.writeFileSync('E:/study/zi/MyTime/.ci-log.txt', '命中 ' + lines.length + ' 行\n' + lines.slice(0, 30).join('\n') + '\n\n=== 全文长度 ' + text.length + ' ===');
});
