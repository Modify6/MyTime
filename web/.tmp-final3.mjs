import { chromium } from '@playwright/test';
import fs from 'node:fs';
const b = await chromium.launch();
const page = await b.newPage({ viewport: { width: 390, height: 844 } });
let stack = null;
page.on('pageerror', (e) => { if (!stack) stack = String(e.stack || e); });
await page.goto('http://localhost:3131/plans');
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
if (stack) {
  const { originalPositionFor, TraceMap } = await import('@jridgewell/trace-mapping');
  for (const line of stack.split('\n')) {
    const m = line.match(/(http:\/\/localhost:3131\/assets\/[^:]+\.js):(\d+):(\d+)/);
    if (!m) continue;
    const mapPath = 'E:/study/zi/MyTime/web/dist' + new URL(m[1]).pathname.replace(/^\/assets\//, '/assets/') + '.map';
    const realMap = 'E:/study/zi/MyTime/web/dist/assets/' + m[1].split('/').pop() + '.map';
    if (!fs.existsSync(realMap)) { console.log('(无map)', m[1].split('/').pop()); continue; }
    try {
      const tm = new TraceMap(JSON.parse(fs.readFileSync(realMap, 'utf8')));
      const pos = originalPositionFor(tm, { line: +m[2], column: +m[3] });
      console.log(`${pos.source || '?'}:${pos.line}:${pos.column}`);
    } catch (e) { console.log('解析失败', String(e).split('\n')[0]); }
  }
  fs.writeFileSync('E:/study/zi/MyTime/.err-stack.txt', stack);
  console.log('原始栈已存');
} else console.log('本轮无错误');
await b.close();
