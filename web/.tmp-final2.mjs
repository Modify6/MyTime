import { chromium } from '@playwright/test';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
let first = null;
page.on('pageerror', async (e) => {
  if (first) return;
  first = { msg: String(e).split('\n')[0], stack: String(e.stack || e) };
  console.log('PAGEERROR msg:', first.msg);
});
await page.goto('http://localhost:3130/plans');
await page.waitForTimeout(1500);
await page.locator('.plan-tabs').getByRole('button', { name: '模板' }).click();
await page.waitForTimeout(500);
await page.getByRole('button', { name: '新建模板' }).click();
await page.waitForTimeout(500);
await page.locator('.tpl-form input[type="text"]').first().fill('晨间启动例程');
const ti = page.locator('.tpl-form input[type="text"]');
await ti.nth(1).fill('查看今日计划');
await page.getByPlaceholder('预估/分').fill('5');
await page.getByRole('button', { name: '加一个子任务' }).click();
await ti.nth(2).fill('复盘昨日');
await page.getByPlaceholder('预估/分').nth(1).fill('15');
await page.getByRole('button', { name: '保存模板' }).click();
await page.waitForTimeout(2500);
console.log('保存后正常继续?');
await page.getByRole('button', { name: '创建本组计划' }).click().catch(() => {});
await page.waitForTimeout(1000);
if (first) {
  // 解析压缩栈 → 源码位置
  const fs = await import('node:fs');
  const lines = first.stack.split('\n');
  for (const line of lines) {
    const m = line.match(/(http:\/\/localhost:3130\/assets\/[^:]+):(\d+):(\d+)/);
    if (!m) continue;
    const mapFile = m[1] + '.map';
    if (!fs.existsSync(mapFile.replace('http://localhost:3130/', 'E:/study/zi/MyTime/web/dist/'))) continue;
    const map = JSON.parse(fs.readFileSync(mapFile.replace('http://localhost:3130/', 'E:/study/zi/MyTime/web/dist/'), 'utf8'));
    // 简易 v3 解码：找最近的生成行/列
    let best = null;
    for (let li = 0; li < map.mappings.split(';').length; li++) {
      if (li > parseInt(m[2])) break;
    }
    // 直接用 mappings 解码太重——改为按 segments 粗查：此处输出原始行号与映射文件供参考
    console.log('压缩位置:', m[1].split('/').pop(), m[2] + ':' + m[3]);
  }
  fs.writeFileSync('E:/study/zi/MyTime/.err-stack.json', JSON.stringify(first, null, 1));
  console.log('完整栈已存 .err-stack.json');
}
await b.close();
