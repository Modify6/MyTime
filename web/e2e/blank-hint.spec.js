import { test, expect } from '@playwright/test';

// 空白补录助手 + 时间轴提示（今日页提示卡 / 时间轴弹层重叠与空档提示）
// 前置：npm --prefix web run build；数据在 DATA_DIR 隔离库（见 playwright.config）
test.describe('空白补录助手', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  // 固定页面时钟：当天 10:00（clock API 让页面内 Date.now 稳定，测试不随时钟漂移）
  const TODAY_10 = new Date(new Date().setHours(10, 0, 0, 0));

  test('今日页空白提示 → 一键预填补录 → 保存落账', async ({ page }) => {
    await page.clock.install({ time: TODAY_10 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /打卡/ })).toBeVisible();

    // 新库无今日记录 → 头部 0:00-10:00 全空白 ≥1h → 提示卡出现
    const hint = page.locator('.blank-hint');
    await expect(hint).toBeVisible();
    await expect(hint).toContainText('没有记录');

    // 点击 → EventEditor 草稿模式：标题「补录时段」+ 起止预填 + 无删除按钮
    await hint.click();
    await expect(page.getByText('补录时段')).toBeVisible();
    await expect(page.getByRole('button', { name: '删除' })).toHaveCount(0);
    const startVal = await page.locator('input[type="datetime-local"]').first().inputValue();
    expect(startVal).toContain('T00:00');
    const endVal = await page.locator('input[type="datetime-local"]').nth(1).inputValue();
    expect(endVal).toContain('T10:00');

    // 填标题选分类保存 → 时间线出现该记录
    await page.getByPlaceholder('事项名称').fill('E2E空白补录');
    await page.getByRole('button', { name: '工作', exact: true }).click();
    await page.locator('.sheet-foot').getByRole('button', { name: '保存' }).click();
    await expect(page.locator('.ev-item').first()).toContainText('E2E空白补录');

    // 0:00-10:00 已被覆盖 → 提示卡消失
    await expect(page.locator('.blank-hint')).toHaveCount(0);
  });

  test('时间轴弹层：重叠警示与空档补录行', async ({ page }) => {
    await page.clock.install({ time: TODAY_10 });
    await page.goto('/');
    await expect(page.getByRole('button', { name: /打卡/ })).toBeVisible();

    // 注入两条交叉记录（08:00-10:00 与 09:00-11:00 的后者跨到"未来"会被截断，改用 07:00-09:00 与 08:00-09:30）
    await page.evaluate(async () => {
      const db = window.__mytimeDebug.db;
      const now = Date.now();
      const day0 = new Date().setHours(0, 0, 0, 0);
      const at = (h, m = 0) => day0 + h * 3_600_000 + m * 60_000;
      await db.events.bulkPut([
        { id: 'e2e-ov1', title: '交叉A', categoryId: 'cat-work', startAt: at(7), endAt: at(9), note: '', createdAt: now, updatedAt: now, deleted: 0 },
        { id: 'e2e-ov2', title: '交叉B', categoryId: 'cat-study', startAt: at(8), endAt: at(9, 30), note: '', createdAt: now, updatedAt: now, deleted: 0 },
      ]);
    });
    await page.goto('/records');
    await expect(page.getByText('交叉A')).toBeVisible();

    // 点今天分组的「时间轴」→ 弹层应同时出现：重叠警示（琥珀）+ 最近空档补录行（0:00-7:00）
    await page.getByRole('button', { name: '时间轴' }).nth(0).click();
    const hintLine = page.locator('.van-popup .hint').filter({ hasText: '时间重叠' });
    await expect(hintLine).toBeVisible({ timeout: 8000 });
    await expect(hintLine).toContainText('1 段记录时间重叠');
    await expect(hintLine).toContainText('点色块');
    // 最近空档 = 头部 00:00–07:00（7 小时），琥珀时段 + 品牌蓝「点此补录」
    await expect(page.locator('.van-popup .hint').filter({ hasText: '最近空档' })).toContainText('00:00–07:00');
    await expect(page.locator('.van-popup .hint').getByText('点此补录')).toBeVisible();
  });
});
