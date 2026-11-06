import { test, expect } from '@playwright/test';

// 复现用户操作：先打卡（不关联）→ 停表 → 编辑该记录 → 关联目标 → 保存 → 验证
test('编辑已有记录时关联目标', async ({ page }) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });

  // 新建目标
  await page.goto('/goals');
  await page.getByRole('button', { name: '新建' }).click();
  await page.getByPlaceholder(/目标名称/).fill('编辑关联目标Y');
  await page.getByRole('button', { name: '保存' }).click();
  await expect(page.getByText('编辑关联目标Y').first()).toBeVisible();

  // 打卡（不关联）→ 结束
  await page.goto('/');
  await page.getByRole('button', { name: /打卡/ }).click();
  await page.getByPlaceholder(/你在做什么/).fill('待关联事项');
  await page.getByRole('button', { name: '工作', exact: true }).click();
  await page.getByRole('button', { name: '开始计时' }).click();
  await expect(page.locator('.run-card')).toBeVisible();
  await page.waitForTimeout(1100);
  await expect(page.locator('.van-toast')).toBeHidden();
  await page.getByRole('button', { name: '结束打卡' }).click();
  await expect(page.locator('.run-card')).toBeHidden();

  // 编辑该记录 → 关联目标 → 保存
  await page.locator('.ev-item').first().click();
  await expect(page.locator('.van-popup:visible .sheet-title')).toContainText('编辑记录');
  await page.locator('.van-popup:visible').getByText('编辑关联目标Y').click(); // 关联目标 chip
  await page.locator('.van-popup:visible').getByRole('button', { name: '保存' }).click();
  await expect(page.locator('.van-popup:visible .sheet-title')).toBeHidden(); // 弹层关闭=已保存

  // 数据库真实状态
  const dump = await page.evaluate(async () => {
    const db = window.__mytimeDebug.db;
    const events = await db.events.toArray();
    const goals = await db.goals.toArray();
    return {
      events: events.map((e) => ({ title: e.title, goalId: e.goalId })),
      goals: goals.map((g) => ({ id: g.id, name: g.name })),
    };
  });
  console.log('DB_DUMP2:', JSON.stringify(dump, null, 1));
  const linked = dump.events.find((e) => e.title === '待关联事项');
  expect(linked).toBeTruthy();
  expect(linked.goalId).toBeTruthy();

  // 目标详情应显示
  await page.goto('/goals');
  await page.getByText('编辑关联目标Y').first().click();
  await expect(page.getByText('待关联事项')).toBeVisible();
});
