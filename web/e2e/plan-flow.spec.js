import { test, expect } from '@playwright/test';
import fs from 'node:fs';

// 计划调度全流程（调试模式：失败不断链，最终 dump 数据库与页面状态）
test('计划调度全流程：预排/挂起/抢占/恢复/完成', async ({ page }) => {
  test.setTimeout(150_000);
  const state = { steps: [], dump: null, errors: [] };
  const save = () => fs.writeFileSync('E:/study/zi/MyTime/.debug-state.json', JSON.stringify(state, null, 1));
  const step = async (name, fn) => {
    try {
      await fn();
      state.steps.push(name + ': OK');
    } catch (e) {
      state.steps.push(name + ': FAIL(' + String(e).split('\n')[0].slice(0, 90) + ')');
      save();
      await page.screenshot({ path: 'E:/study/zi/MyTime/.fail-' + name.replace(/\//g, '_') + '.png' });
    }
  };
  page.on('pageerror', (err) => { state.errors.push('PAGE_ERR: ' + String(err).slice(0, 120)); save(); });
  await page.setViewportSize({ width: 390, height: 844 });

  // 1. 建预排A + 启动
  await step('建预排A', async () => {
    await page.goto('/plans');
    await page.getByRole('button', { name: '新建' }).click();
    await page.locator('.van-popup:visible').getByPlaceholder(/计划名称/).fill('预排任务A');
    await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(500);
  });
  await step('启动A', async () => {
    await page.locator('.plan-row', { hasText: '预排任务A' }).getByRole('button', { name: '启动' }).click();
    await page.waitForTimeout(600);
  });
  // 2. 挂起（原因）
  await step('挂起A', async () => {
    await page.locator('.plan-card', { hasText: '预排任务A' }).getByRole('button', { name: '挂起' }).click();
    await page.locator('.van-popup:visible').getByText('先处理其他事').click();
    await page.locator('.van-popup:visible').getByRole('button', { name: '确认挂起' }).click();
    await page.waitForTimeout(600);
  });
  // 3. 恢复
  await step('恢复A', async () => {
    await page.locator('.plan-card', { hasText: '预排任务A' }).getByRole('button', { name: '恢复执行' }).click();
    await page.waitForTimeout(600);
  });
  // 4. 建临时B + 启动（抢占：挂起当前）
  await step('建临时B', async () => {
    await page.getByRole('button', { name: '新建' }).click();
    await page.locator('.van-popup:visible').getByPlaceholder(/计划名称/).fill('临时任务B');
    await page.locator('.van-popup:visible .kind-btn', { hasText: '临时' }).click();
    await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(500);
  });
  await step('启动B触发调度', async () => {
    await page.locator('.plan-row', { hasText: '临时任务B' }).getByRole('button', { name: '启动' }).click();
    await page.waitForTimeout(800);
  });
  await step('调度确认挂起', async () => {
    await page.locator('.van-popup:visible').getByText('临时插入更紧急的事').click();
    await page.locator('.van-popup:visible').getByRole('button', { name: '确认并启动新计划' }).click();
    await page.waitForTimeout(800);
  });
  // 5. 恢复预排A（抢占：结束临时B）
  await step('恢复A抢占', async () => {
    await page.locator('.plan-card', { hasText: '预排任务A' }).getByRole('button', { name: '恢复执行' }).click();
    await page.waitForTimeout(800);
  });
  await step('调度确认结束临时B', async () => {
    await page.locator('.van-popup:visible').getByText('结束当前').click();
    await page.locator('.van-popup:visible').getByText('当前计划不再继续').click();
    await page.locator('.van-popup:visible').getByRole('button', { name: '确认并启动新计划' }).click();
    await page.waitForTimeout(800);
  });
  // 6. 完成预排A（挂起→标记完成→确认）
  await step('挂起A二段', async () => {
    await page.locator('.plan-card', { hasText: '预排任务A' }).getByRole('button', { name: '挂起' }).click();
    await page.locator('.van-popup:visible').getByText('被他人打断').click();
    await page.locator('.van-popup:visible').getByRole('button', { name: '确认挂起' }).click();
    await page.waitForTimeout(600);
  });
  await step('标记完成（原因弹窗）', async () => {
    await page.locator('.plan-card', { hasText: '预排任务A' }).getByRole('button', { name: '标记完成' }).click();
    await page.locator('.van-popup:visible').getByText('按计划完成').click();
    await page.locator('.van-popup:visible').getByRole('button', { name: '确认', exact: true }).click();
    await page.waitForTimeout(600);
  });

  state.dump = await page.evaluate(async () => {
    const db = window.__mytimeDebug.db;
    return {
      plans: (await db.plans.toArray()).map((p) => ({ title: p.title, status: p.status, pauseReason: p.pauseReason, endReason: p.endReason })),
      logs: (await db.planLogs.toArray()).map((l) => ({ action: l.action, reason: l.reason })),
      events: (await db.events.toArray()).map((e) => ({ title: e.title, planId: (e.planId || '').slice(0, 8), endAt: e.endAt != null })),
    };
  });
  save();
  await page.screenshot({ path: 'E:/study/zi/MyTime/.debug-final.png' });
});
