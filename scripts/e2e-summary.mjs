// E2E 失败摘要：从 playwright json 报告提取失败用例与错误信息（输出进 CI 日志，公开可见）
import fs from 'node:fs';

const r = JSON.parse(fs.readFileSync('web/e2e-report.json', 'utf8'));
const walk = (s) => {
  (s.suites || []).forEach(walk);
  (s.specs || []).forEach((sp) => {
    (sp.tests || []).forEach((t) => {
      if (t.ok === false || t.expectedStatus !== t.status) {
        const msg = String(t.results?.[0]?.error?.message || t.results?.[0]?.failure?.message || '').slice(0, 300);
        console.log('::error::E2E_FAIL ' + sp.title + ' :: ' + msg.replace(/\n/g, ' '));
      }
    });
  });
};
walk(r);
console.log('---E2E 摘要结束---');
