import { test, expect } from '@playwright/test';

// v0.10.0 全自动同步 E2E：连接服务器 → 打卡 → 无任何手动同步操作，
// 防抖窗口内写后自动上推全链路跑通（putRow → writeHook → schedulePush → syncNow → 服务端落库）。
// 注意：E2E 服务器数据目录持久——标题带时间戳唯一化，且打卡前清掉历史运行中计时。
test('打卡后自动上推：SyncDot 自动变为已同步', async ({ page }) => {
  test.setTimeout(120_000);
  const title = `自动同步验证-${Date.now()}`;
  await page.setViewportSize({ width: 390, height: 844 });

  // 连接本机服务（webServer 同源，默认密码）
  await page.goto('/settings');
  await page.locator('.van-field input[type="password"]').fill('mytime123');
  await page.getByRole('button', { name: '连接并同步' }).click();
  await expect(page.getByRole('button', { name: '立即同步' })).toBeVisible({ timeout: 8000 }); // 登录+首推完成

  // 回今日页；历史运行中计时（跨设备拉回的）逐个结束，让打卡按钮露出来
  await page.goto('/');
  await page.waitForTimeout(800); // 等启动同步拉回历史数据
  for (let i = 0; i < 5 && (await page.locator('.run-card').count()); i++) {
    await page.getByRole('button', { name: '结束打卡' }).click();
    await page.waitForTimeout(800);
  }

  // 打卡（唯一的写入动作，不碰任何同步按钮）
  await page.locator('.hero-center').click();
  await page.locator('.van-popup:visible').getByPlaceholder(/你在做什么/).fill(title);
  await page.locator('.van-popup:visible').getByRole('button', { name: '开始计时' }).click();
  await expect(page.locator('.run-title')).toHaveText(new RegExp(title));

  // 状态点自动进入"已同步 hh:mm"（写后同步路径的状态流转）
  await expect(page.locator('.sync-dot')).toHaveText(/已同步 \d{1,2}:\d{2}/, { timeout: 8000 });

  // 服务端级断言：轮询服务端数据（给 3s 防抖留时间），证明打卡记录确实被自动推送上去
  await expect
    .poll(
      async () =>
        page.evaluate(async (t) => {
          const token = localStorage.getItem('mytime.token');
          const res = await fetch('/api/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
            body: JSON.stringify({ since: 0, changes: [] }),
          });
          const data = await res.json();
          const hit = (data.changes || []).find((c) => c.table === 'events' && c.row?.title === t);
          return hit && typeof hit.row?.serverRev === 'number' ? 1 : 0;
        }, title),
      { timeout: 10_000, intervals: [500, 1_000, 2_000], message: '服务端 10s 内未收到打卡记录' }
    )
    .toBe(1);
});
