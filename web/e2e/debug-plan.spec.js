import { test } from '@playwright/test';
import fs from 'node:fs';

// 调试：全流程尽力执行，每步状态写文件（绕过 reporter 吞输出）
test('调试：计划调度状态收集', async ({ page }) => {
  test.setTimeout(90_000);
  const state = { steps: [], dump: null };
  const save = () => fs.writeFileSync('E:/study/zi/MyTime/.debug-state.json', JSON.stringify(state, null, 1));
  const step = async (name, fn) => {
    try {
      await fn();
      state.steps.push(name + ': OK');
    } catch (e) {
      state.steps.push(name + ': FAIL(' + String(e).split('\n')[0].slice(0, 100) + ')');
      save();
    }
  };

  await page.setViewportSize({ width: 390, height: 844 });
  const consoleLines = [];
  page.on('console', (msg) => consoleLines.push(msg.type() + ':' + msg.text().slice(0, 150)));
  page.on('pageerror', (err) => consoleLines.push('PAGEERROR:' + String(err).slice(0, 150)));

  await step('建预排A', async () => {
    await page.goto('/plans');
    await page.getByRole('button', { name: '新建' }).click();
    await page.locator('.van-popup:visible').getByPlaceholder(/计划名称/).fill('预排任务A');
    await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(400);
  });
  save();

  await step('启动A', async () => {
    state.urlAfterStart = page.url();
    await page.waitForTimeout(300);
    state.toastAfterStart = await page.evaluate(() => document.querySelector('.van-toast')?.innerText || null);
    state.dbAfterStart = await page.evaluate(async () => {
      const db = window.__mytimeDebug.db;
      return {
        plans: (await db.plans.toArray()).map((p) => ({ title: p.title, status: p.status })),
        events: (await db.events.toArray()).map((e) => ({ title: e.title, planId: e.planId, endAt: e.endAt })),
      };
    });
    state.buttonsAfterStart = await page.evaluate(() =>
      [...document.querySelectorAll('button')].map((b) => ({ t: b.innerText.trim(), visible: b.offsetParent !== null }))
    );
    await page.locator('.plan-row', { hasText: '预排任务A' }).getByRole('button', { name: '启动' }).click();
    await page.waitForTimeout(600);
  });
  save();

  await step('挂起A', async () => {
    await page.locator('.plan-card', { hasText: '预排任务A' }).getByRole('button', { name: '挂起' }).click();
    await page.locator('.van-popup:visible').getByText('先处理其他事').click();
    await page.locator('.van-popup:visible').getByRole('button', { name: '确认挂起' }).click();
    await page.waitForTimeout(600);
  });
  save();

  await step('恢复A', async () => {
    const btns = await page.evaluate(() =>
      [...document.querySelectorAll('.plan-card .plan-actions button')].map((b) => b.innerText)
    );
    state.buttons = btns;
    save();
    await page.locator('.plan-card', { hasText: '预排任务A' }).getByRole('button', { name: '恢复执行' }).click();
    await page.waitForTimeout(600);
  });
  save();

  await step('建临时B', async () => {
    await page.getByRole('button', { name: '新建' }).click();
    await page.locator('.van-popup:visible').getByPlaceholder(/计划名称/).fill('临时任务B');
    await page.locator('.van-popup:visible .kind-btn', { hasText: '临时' }).click();
    await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(400);
  });
  save();

  await step('启动B触发调度', async () => {
    await page.locator('.plan-row', { hasText: '临时任务B' }).getByRole('button', { name: '启动' }).click();
    await page.waitForTimeout(800);
  });
  save();

  await step('调度确认（挂起当前）', async () => {
    await page.getByText('临时插入更紧急的事').click();
    await page.getByRole('button', { name: '确认并启动新计划' }).click();
    await page.waitForTimeout(800);
  });

  state.consoleLines = consoleLines;
  state.dump = await page.evaluate(async () => {
    const db = window.__mytimeDebug.db;
    return {
      plans: (await db.plans.toArray()).map((p) => ({ title: p.title, status: p.status, pauseReason: p.pauseReason, endReason: p.endReason })),
      logs: (await db.planLogs.toArray()).map((l) => ({ planId: l.planId.slice(0, 8), action: l.action, reason: l.reason })),
      events: (await db.events.toArray()).map((e) => ({ title: e.title, planId: (e.planId || '').slice(0, 8), endAt: e.endAt })),
    };
  });
  save();
  await page.screenshot({ path: 'E:/study/zi/MyTime/.debug-handoff.png' });
});
