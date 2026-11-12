// ECharts 主题色：从 CSS 变量取值，图表轴/网格/提示框随深浅模式统一观感
// （此前各 option 硬编码 #98a2b3/#8884 等，浅色模式下对比度欠账）
export function chartPalette(isDark) {
  const cs = getComputedStyle(document.documentElement);
  const v = (name, fb) => cs.getPropertyValue(name).trim() || fb;
  return {
    text3: v('--text-3', '#9aa3b2'),
    line: v('--line', '#eef0f5'),
    brand: v('--brand', '#4f6ef7'),
    tooltipBg: isDark ? '#1f2633' : '#ffffff',
    tooltipText: isDark ? '#e8ecf3' : '#1c2333',
    tooltipBorder: isDark ? '#2a3342' : '#eef0f5',
  };
}

// tooltip 公共片段（跟随主题）
export const chartTooltip = (p, extra = {}) => ({
  backgroundColor: p.tooltipBg,
  borderColor: p.tooltipBorder,
  textStyle: { color: p.tooltipText },
  ...extra,
});
