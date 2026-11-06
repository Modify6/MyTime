import { test, expect } from '@playwright/test';

// 目标关联复现：新建目标 → 打卡并关联 → 停表 → 验证目标详情与数据库真实状态
test('目标关联端到端复现', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  // 1. 新建目标
  await page.goto('/goals');
  await page.getByRole('button', { name: '新建' }).click();
  await page.getByPlaceholder(/目标名称/).fill('测试目标X');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('测试目标X').first()).toBeVisible();

  // 2. 打卡并关联目标
  await page.goto('/');
  await page.getByRole('button', { name: /打卡/ }).click();
  await page.getByPlaceholder(/你在做什么/).fill('关联测试事项');
  await page.getByRole('button', { name: '工作', exact: true }).click();
  await page.getByText('测试目标X').click(); // 关联目标 chip
  await page.getByRole('button', { name: '开始计时' }).click();

  await expect(page.locator('.run-card')).toBeVisible();
  await page.waitForTimeout(1100);
  await expect(page.locator('.van-toast')).toBeHidden();
  await page.getByRole('button', { name: '结束打卡' }).click();
  await expect(page.locator('.run-card')).toBeHidden();

  // 3. 数据库真实状态（关键证据）
  const dump = await page.evaluate(async () => {
    const db = window.__mytimeDebug.db;
    const events = await db.events.toArray();
    const goals = await db.goals.toArray();
    return {
      events: events.map((e) => ({ title: e.title, goalId: e.goalId, endAt: e.endAt })),
      goals: goals.map((g) => ({ id: g.id, name: g.name })),
    };
  });
  console.log('DB_DUMP:', JSON.stringify(dump, null, 1));
  const linked = dump.events.find((e) => e.title === '关联测试事项');
  expect(linked).toBeTruthy();
  expect(linked.goalId).toBeTruthy();

  // 4. 目标详情应显示关联事件
  await page.goto('/goals');
  await page.getByText('测试目标X').first().click();
  await expect(page.getByText('关联测试事项')).toBeVisible();
});
