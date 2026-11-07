// E2E 调试产物路径（跨平台）：写到项目根（web/ 的上级），Windows 本地与 Linux CI 均可写。
// 教训：调试辅助绝不因自身写入失败而拖垮测试——所有写入吞错并告警。
import path from 'node:path';
import fs from 'node:fs';

const ROOT = path.resolve(process.cwd(), '..'); // Playwright 从 web/ 运行

export const debugFile = (name) => path.join(ROOT, name);

export function saveJson(name, data) {
  try {
    fs.writeFileSync(debugFile(name), JSON.stringify(data, null, 1));
  } catch (e) {
    console.warn('[debug.mjs] 调试写入失败（忽略）:', name, String(e).split('\n')[0]);
  }
}

export const shotPath = (name) => debugFile(name);
