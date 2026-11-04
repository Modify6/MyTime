import dayjs from 'dayjs';

export const MIN = 60_000;
export const HOUR = 3_600_000;
export const DAY = 86_400_000;

// 时段均为 [start, end) 毫秒区间；周从周一开始
export function dayRange(input) {
  const d = dayjs(input);
  return { start: d.startOf('day').valueOf(), end: d.add(1, 'day').startOf('day').valueOf() };
}

export function weekRange(input) {
  const d = dayjs(input);
  const start = d.subtract((d.day() + 6) % 7, 'day').startOf('day').valueOf();
  return { start, end: start + 7 * DAY };
}

export function monthRange(input) {
  const d = dayjs(input);
  return { start: d.startOf('month').valueOf(), end: d.add(1, 'month').startOf('month').valueOf() };
}

export function rangeFor(period, cursor) {
  if (period === 'week') return weekRange(cursor);
  if (period === 'month') return monthRange(cursor);
  return dayRange(cursor);
}

export function shiftCursor(period, cursor, dir) {
  const d = dayjs(cursor);
  if (period === 'week') return d.add(dir * 7, 'day').valueOf();
  if (period === 'month') return d.add(dir, 'month').valueOf();
  return d.add(dir, 'day').valueOf();
}

// 3900000 -> "1小时5分"；2700000 -> "45分钟"；38000 -> "38秒"
export function fmtDur(ms) {
  if (ms <= 0) return '0';
  const h = Math.floor(ms / HOUR);
  const m = Math.floor((ms % HOUR) / MIN);
  const s = Math.floor((ms % MIN) / 1000);
  if (h > 0) return m > 0 ? `${h}小时${m}分` : `${h}小时`;
  if (m > 0) return `${m}分钟`;
  return `${s}秒`;
}

// 计时器显示：1:05:09 或 05:09
export function fmtClock(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  const mm = String(m).padStart(2, '0');
  const ss = String(s).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

export function fmtTime(ms) {
  return dayjs(ms).format('HH:mm');
}

export function fmtDate(ms) {
  return dayjs(ms).format('M月D日');
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];

export function fmtDayLabel(ms) {
  const d = dayjs(ms);
  return `${d.format('M月D日')} ${WEEKDAYS[d.day()]}`;
}

export function isToday(ms) {
  return dayjs(ms).isSame(dayjs(), 'day');
}

// 与 <input type="datetime-local"> 互转
export function toLocalInput(ms) {
  return ms == null ? '' : dayjs(ms).format('YYYY-MM-DDTHH:mm');
}

export function fromLocalInput(v) {
  if (!v) return null;
  const ms = dayjs(v).valueOf();
  return Number.isNaN(ms) ? null : ms;
}
