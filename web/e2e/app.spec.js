import { test, expect } from '@playwright/test';

// 全流程回归（单上下文顺序执行：IndexedDB 随 context 隔离，流程必须串在一起）
// 前置：npm --prefix web run build（服务器托管 dist，由 webServer 自动拉起）
test.describe('MyTime 核心流程', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('打卡 → 记录 → 统计 → 设置 全链路', async ({ page }) => {
    // 今日页：首次启动自动播种默认分类
    await page.goto('/');
    await expect(page.getByRole('button', { name: /打卡/ })).toBeVisible();

    // 打卡闭环：填事项 → 选分类 → 开始 → 计时 1 秒 → 结束
    await page.getByRole('button', { name: /打卡/ }).click();
    await page.getByPlaceholder(/你在做什么/).fill('E2E测试事项');
    await page.getByRole('button', { name: '工作', exact: true }).click();
    await page.getByRole('button', { name: '开始计时' }).click();
    await expect(page.locator('.run-card')).toBeVisible();
    await expect(page.locator('.run-title')).toContainText('E2E测试事项');
    await page.waitForTimeout(1100);
    // 等开始 toast 退场，避免悬浮层拦截结束按钮的点击
    await expect(page.locator('.van-toast')).toBeHidden();
    await page.getByRole('button', { name: '结束打卡' }).click();
    await expect(page.locator('.run-card')).toBeHidden(); // 落账后回到打卡按钮
    await expect(page.locator('.ev-item').first()).toContainText('E2E测试事项');
    await expect(page.locator('.ev-item').first()).not.toContainText('进行中');

    // 记录页可见
    await page.goto('/records');
    await expect(page.getByText('E2E测试事项').first()).toBeVisible();

    // 统计页：报告与热力图
    await page.goto('/stats');
    await expect(page.locator('.report-pre')).toContainText('E2E测试事项');
    await expect(page.getByText('专注热力图')).toBeVisible();

    // 设置页：日志与导出入口
    await page.goto('/settings');
    await expect(page.locator('.log-list')).toBeVisible();
    await expect(page.getByRole('button', { name: '导出 CSV' })).toBeVisible();
  });

  test('深色模式变量生效', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await page.goto('/');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).not.toBe('rgb(245, 246, 250)'); // 非浅色底
  });
});
