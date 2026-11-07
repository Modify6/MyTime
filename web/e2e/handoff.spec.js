import { test, expect } from '@playwright/test';
import { saveJson, shotPath } from './helpers/debug.mjs';

// v0.8.1 调度统一 E2E：手动打卡被计划抢占 / 跨设备并行清理（调试模式：步骤记录 + 最终 dump + 硬断言）
// 选择器约定：弹窗断言一律用 .van-popup:visible .handoff 作用域（避免多弹层严格模式冲突）
async function dumpDb(page) {
  return page.evaluate(async () => {
    const db = window.__mytimeDebug.db;
    return {
      plans: (await db.plans.toArray()).map((p) => ({ title: p.title, status: p.status, pauseReason: p.pauseReason, endReason: p.endReason })),
      events: (await db.events.toArray()).map((e) => ({ title: e.title, planId: !!(e.planId || '').length, endAt: e.endAt != null, note: e.note || '' })),
    };
  });
}

function mkSteps(page, state, file) {
  const save = () => saveJson(`.debug-${file}.json`, state);
  const step = async (name, fn) => {
    try {
      await fn();
      state.steps.push(name + ': OK');
    } catch (e) {
      state.steps.push(name + ': FAIL(' + String(e).split('\n')[0].slice(0, 120) + ')');
      save();
      await page.screenshot({ path: shotPath(`.fail-${file}-${name.replace(/\//g, '_')}.png`) });
    }
  };
  return { step, save };
}

const dlg = (page) => page.locator('.van-popup:visible .handoff'); // 调度弹窗内容区（唯一）

test('抢占手动打卡：全部挂起后计划启动、手动事件落账', async ({ page }) => {
  test.setTimeout(150_000);
  const state = { steps: [], dump: null };
  const { step, save } = mkSteps(page, state, 'handoff1');
  page.on('pageerror', (err) => { state.errors = state.errors || []; state.errors.push('PAGE_ERR: ' + String(err).slice(0, 120)); });
  await page.setViewportSize({ width: 390, height: 844 });

  await step('清库隔离（可重复运行）', async () => {
    await page.goto('/');
    await page.waitForTimeout(600); // 等 App 初始化完成
    await page.evaluate(async () => {
      const db = window.__mytimeDebug.db;
      await Promise.all(db.tables.map((t) => t.clear())); // 重新加载时 ensureSeed 会补默认分类
    });
    await page.goto('/');
    await page.waitForTimeout(600);
  });

  await step('开始手动打卡', async () => {
    await page.goto('/');
    await page.locator('.hero-center').click();
    await page.locator('.van-popup:visible').getByPlaceholder(/你在做什么/).fill('手动学习');
    await page.locator('.van-popup:visible').getByRole('button', { name: '开始计时' }).click();
    await page.waitForTimeout(700);
    await expect(page.locator('.run-title')).toHaveText(/手动学习/);
  });
  await step('建计划C', async () => {
    await page.goto('/plans');
    await page.getByRole('button', { name: '新建' }).click();
    await page.locator('.van-popup:visible').getByPlaceholder(/计划名称/).fill('抢占计划C');
    await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(500);
  });
  await step('启动C触发调度（弹窗列出手动计时）', async () => {
    await page.locator('.plan-row', { hasText: '抢占计划C' }).getByRole('button', { name: '启动' }).click();
    await expect(dlg(page)).toContainText('手动学习', { timeout: 8000 });
    await expect(dlg(page)).toContainText('手动打卡'); // 来源标记
  });
  await step('调度确认全部挂起', async () => {
    await dlg(page).getByText('临时插入更紧急的事').click();
    await dlg(page).getByRole('button', { name: '确认并启动新计划' }).click();
    await page.waitForTimeout(800);
  });
  await step('今日运行卡切换为计划C', async () => {
    await page.goto('/');
    await page.waitForTimeout(600);
    await expect(page.locator('.run-title')).toHaveText(/抢占计划C/);
  });

  state.dump = await dumpDb(page);
  save();
  // 硬断言：手动事件落账 + 被抢占备注 + 计划C active + 仅一个计时
  const manual = state.dump.events.find((e) => e.title === '手动学习');
  expect(manual?.endAt, '手动事件已落账').toBe(true);
  expect(manual?.note || '', '落账备注含抢占说明').toContain('被抢占');
  expect(state.dump.plans.find((p) => p.title === '抢占计划C')?.status, '计划C已激活').toBe('active');
  expect(state.dump.events.filter((e) => !e.endAt), '仅剩一个运行中计时').toHaveLength(1);
});

test('跨设备并行清理：全部结束落账', async ({ page }) => {
  test.setTimeout(150_000);
  const state = { steps: [], dump: null };
  const { step, save } = mkSteps(page, state, 'handoff2');
  page.on('pageerror', (err) => { state.errors = state.errors || []; state.errors.push('PAGE_ERR: ' + String(err).slice(0, 120)); });
  await page.setViewportSize({ width: 390, height: 844 });

  await step('清库隔离（可重复运行）', async () => {
    await page.goto('/');
    await page.waitForTimeout(600);
    await page.evaluate(async () => {
      const db = window.__mytimeDebug.db;
      await Promise.all(db.tables.map((t) => t.clear()));
    });
    await page.goto('/');
    await page.waitForTimeout(600);
  });

  await step('建并启动计划D', async () => {
    await page.goto('/plans');
    await page.getByRole('button', { name: '新建' }).click();
    await page.locator('.van-popup:visible').getByPlaceholder(/计划名称/).fill('并行计划D');
    await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(500);
    await page.locator('.plan-row', { hasText: '并行计划D' }).getByRole('button', { name: '启动' }).click();
    await page.waitForTimeout(700);
  });
  await step('模拟跨设备插入手动计时', async () => {
    await page.evaluate(async () => {
      const db = window.__mytimeDebug.db;
      await db.events.add({
        id: 'ev-cross-' + Date.now(), title: '别端手动', categoryId: 'cat-work', goalId: null,
        planId: null, startAt: Date.now() - 30000, endAt: null, note: '', estimateMs: null, createdAt: Date.now(),
      });
    });
    await page.waitForTimeout(800); // onChange → timer.refresh
  });
  await step('今日可见其他进行中', async () => {
    await page.goto('/');
    const extraCard = page.locator('.card', { hasText: '其他进行中的计时' }); // 作用域限定，避开时间线同名条目
    await expect(extraCard).toBeVisible({ timeout: 8000 });
    await expect(extraCard.getByText('别端手动')).toBeVisible();
  });
  await step('建计划E并启动触发调度（弹窗列出2条）', async () => {
    await page.goto('/plans');
    await page.getByRole('button', { name: '新建' }).click();
    await page.locator('.van-popup:visible').getByPlaceholder(/计划名称/).fill('接管计划E');
    await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
    await page.waitForTimeout(500);
    await page.locator('.plan-row', { hasText: '接管计划E' }).getByRole('button', { name: '启动' }).click();
    await expect(dlg(page)).toContainText('2 个计时进行中', { timeout: 8000 });
  });
  await step('调度确认全部结束', async () => {
    await dlg(page).getByText('全部结束').click();
    await dlg(page).getByText('当前计划不再继续').click();
    await dlg(page).getByRole('button', { name: '确认并启动新计划' }).click();
    await page.waitForTimeout(900);
  });

  state.dump = await dumpDb(page);
  save();
  // 硬断言：计划D 结束并带原因、手动事件落账、仅剩计划E 的计时
  const planD = state.dump.plans.find((p) => p.title === '并行计划D');
  expect(planD?.status, '计划D已结束').toBe('done');
  expect(planD?.endReason || '', '结束原因已写入').toBe('当前计划不再继续');
  const cross = state.dump.events.find((e) => e.title === '别端手动');
  expect(cross?.endAt, '手动事件已落账').toBe(true);
  expect(state.dump.events.filter((e) => !e.endAt), '仅剩计划E 一个运行中计时').toHaveLength(1);
});
