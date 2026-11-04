// 数据层：node:sqlite（Node 内置，无原生依赖）
// 所有表共享同步字段：id / updatedAt(客户端逻辑时钟，用于 LWW) / serverRev(服务端接收时间，用于增量拉取) / deleted(软删)
import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

export const TABLES = {
  categories: ['id', 'name', 'color', 'sort', 'createdAt', 'updatedAt', 'deleted'],
  goals: ['id', 'name', 'description', 'color', 'targetHours', 'archived', 'createdAt', 'updatedAt', 'deleted'],
  events: ['id', 'title', 'categoryId', 'goalId', 'startAt', 'endAt', 'note', 'createdAt', 'updatedAt', 'deleted'],
};

const INT_COLS = new Set(['sort', 'createdAt', 'updatedAt', 'deleted', 'startAt', 'endAt', 'archived']);
const FLOAT_COLS = new Set(['targetHours']);

export function openDb(dataDir) {
  fs.mkdirSync(dataDir, { recursive: true });
  const db = new DatabaseSync(path.join(dataDir, 'mytime.db'));
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec(`
    CREATE TABLE IF NOT EXISTS categories (
      "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "color" TEXT NOT NULL DEFAULT '#4F6EF7',
      "sort" INTEGER NOT NULL DEFAULT 0, "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL,
      "deleted" INTEGER NOT NULL DEFAULT 0, "serverRev" INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS goals (
      "id" TEXT PRIMARY KEY, "name" TEXT NOT NULL, "description" TEXT NOT NULL DEFAULT '',
      "color" TEXT NOT NULL DEFAULT '#4F6EF7', "targetHours" REAL, "archived" INTEGER NOT NULL DEFAULT 0,
      "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL,
      "deleted" INTEGER NOT NULL DEFAULT 0, "serverRev" INTEGER NOT NULL DEFAULT 0
    );
    CREATE TABLE IF NOT EXISTS events (
      "id" TEXT PRIMARY KEY, "title" TEXT NOT NULL, "categoryId" TEXT NOT NULL, "goalId" TEXT,
      "startAt" INTEGER NOT NULL, "endAt" INTEGER, "note" TEXT NOT NULL DEFAULT '',
      "createdAt" INTEGER NOT NULL, "updatedAt" INTEGER NOT NULL,
      "deleted" INTEGER NOT NULL DEFAULT 0, "serverRev" INTEGER NOT NULL DEFAULT 0
    );
    CREATE INDEX IF NOT EXISTS idx_events_start ON events("startAt");
    CREATE INDEX IF NOT EXISTS idx_rev ON events("serverRev");
  `);
  seedDefaultCategories(db);
  return db;
}

// 首次启动时写入默认分类（柳比歇夫分类法的常见维度）
function seedDefaultCategories(db) {
  const n = db.prepare('SELECT COUNT(*) AS n FROM categories').get().n;
  if (n > 0) return;
  const now = Date.now();
  const defaults = [
    ['cat-sleep', '睡眠', '#7C4DFF'],
    ['cat-meal', '餐饮', '#FF7043'],
    ['cat-work', '工作', '#1E88E5'],
    ['cat-study', '学习', '#43A047'],
    ['cat-sport', '运动', '#00ACC1'],
    ['cat-commute', '通勤', '#8D6E63'],
    ['cat-fun', '娱乐', '#EC407A'],
    ['cat-chores', '家务', '#F0A800'],
    ['cat-other', '其他', '#90A4AE'],
  ];
  const stmt = db.prepare(
    'INSERT OR IGNORE INTO categories ("id","name","color","sort","createdAt","updatedAt","deleted","serverRev") VALUES (?,?,?,?,?,?,0,?)'
  );
  defaults.forEach(([id, name, color], i) => stmt.run(id, name, color, i, now, now, now));
}

// 只允许白名单字段写入，类型做防御性转换
function sanitize(table, row) {
  if (!row || typeof row !== 'object') return null;
  const cols = TABLES[table];
  const out = {};
  for (const c of cols) {
    let v = row[c];
    if (INT_COLS.has(c)) v = v == null ? null : Number(v) || 0;
    else if (FLOAT_COLS.has(c)) v = v == null || v === '' ? null : Number(v);
    else v = v == null ? null : String(v);
    out[c] = v;
  }
  if (!out.id || out.updatedAt == null) return null;
  return out;
}

// LWW upsert：仅当新行的 updatedAt 更大时覆盖；serverRev 记录服务端接收时间（变更流的游标依据）
export function pushChanges(db, table, rows) {
  const cols = TABLES[table];
  if (!cols || !Array.isArray(rows)) return 0;
  const setCols = cols.filter((c) => c !== 'id');
  const sql =
    `INSERT INTO "${table}" (${cols.map((c) => `"${c}"`).join(',')}) VALUES (${cols.map(() => '?').join(',')}) ` +
    `ON CONFLICT("id") DO UPDATE SET ${setCols.map((c) => `"${c}"=excluded."${c}"`).join(',')} ` +
    `WHERE "${table}"."updatedAt" < excluded."updatedAt"`;
  const stmt = db.prepare(sql);
  let applied = 0;
  const rev = Date.now();
  for (const raw of rows) {
    const row = sanitize(table, raw);
    if (!row) continue;
    const result = stmt.run(...cols.map((c) => row[c]));
    if (Number(result.changes) > 0) {
      db.prepare(`UPDATE "${table}" SET "serverRev"=? WHERE "id"=? AND "serverRev"<?`).run(rev, row.id, rev);
      applied++;
    }
  }
  return applied;
}

export function pullSince(db, since) {
  const changes = [];
  for (const table of Object.keys(TABLES)) {
    const rows = db.prepare(`SELECT * FROM "${table}" WHERE "serverRev" > ?`).all(since);
    for (const row of rows) changes.push({ table, row });
  }
  return changes;
}

export function exportAll(db) {
  const data = { version: 1, exportedAt: Date.now() };
  for (const table of Object.keys(TABLES)) {
    data[table] = db.prepare(`SELECT * FROM "${table}"`).all();
  }
  return data;
}

export function randomId() {
  return crypto.randomUUID();
}
