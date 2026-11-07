// 同步引擎集成测试：fake-indexeddb + mock API，覆盖出队/合并/游标/墓碑
// 隔离策略：全文件共用一个模块实例与 IDBFactory，每个用例前删除并重建数据库
import { describe, it, expect, beforeEach, vi } from 'vitest';

let repo, sync, schema;
let mockSyncApi;

beforeEach(async () => {
  const { IDBFactory, IDBKeyRange } = await import('fake-indexeddb');
  if (!globalThis.__mytimeIdbFactory) {
    globalThis.__mytimeIdbFactory = new IDBFactory();
    globalThis.indexedDB = globalThis.__mytimeIdbFactory;
    globalThis.IDBKeyRange = IDBKeyRange; // Dexie 的 where/transaction 在非浏览器环境依赖此全局
  }

  if (!schema) {
    vi.doMock('../src/api/client.js', () => ({
      api: { sync: (...a) => mockSyncApi(...a) },
      ApiError: class ApiError extends Error {},
    }));
    repo = await import('../src/db/repo.js');
    sync = await import('../src/db/sync.js');
    schema = await import('../src/db/schema.js');
  }

  // 每个用例独立空库：delete 关闭旧库，再显式重开
  await schema.db.delete();
  await schema.db.open();
  const local = await import('../src/auth/local.js');
  local.setToken('test-token');
});

const evRow = (id, title, updatedAt, extra = {}) => ({
  id,
  title,
  categoryId: 'cat-work',
  goalId: null,
  startAt: 1000,
  endAt: 2000,
  note: '',
  createdAt: 1000,
  updatedAt,
  deleted: 0,
  ...extra,
});

describe('同步引擎', () => {
  it('本地写入进 outbox，同步后清空并推进游标', async () => {
    mockSyncApi = vi.fn(async (payload) => ({
      serverTime: 5000,
      applied: payload.changes.length,
      changes: [],
    }));

    await repo.putRow('events', evRow('e1', '写作', 111));
    expect(await schema.db.outbox.count()).toBe(1);

    await sync.syncNow();

    expect(await schema.db.outbox.count()).toBe(0);
    expect(mockSyncApi).toHaveBeenCalledTimes(1);
    const sent = mockSyncApi.mock.calls[0][0];
    expect(sent.changes[0].rows[0].id).toBe('e1');
    const cursor = await schema.db.meta.get('cursor');
    expect(cursor.value).toBe(4999); // serverTime - 1
  });

  it('同一实体多次写入合并为一条待推记录', async () => {
    mockSyncApi = vi.fn(async (p) => ({ serverTime: 5000, applied: p.changes.length, changes: [] }));
    await repo.putRow('events', evRow('e1', '第一次', 1));
    await repo.putRow('events', evRow('e1', '第二次', 2));
    await repo.putRow('events', evRow('e2', '另一条', 3));
    expect(await schema.db.outbox.count()).toBe(2);
    await sync.syncNow();
    const sent = mockSyncApi.mock.calls[0][0];
    const e1 = sent.changes.flatMap((c) => c.rows).find((r) => r.id === 'e1');
    expect(e1.title).toBe('第二次');
  });

  it('未登录时不同步', async () => {
    const local = await import('../src/auth/local.js');
    local.setToken('');
    mockSyncApi = vi.fn();
    await repo.putRow('events', evRow('e1', '写作', 1));
    await sync.syncNow();
    expect(mockSyncApi).not.toHaveBeenCalled();
    expect(await schema.db.outbox.count()).toBe(1);
  });

  it('网络失败时保留 outbox，恢复后可重试', async () => {
    mockSyncApi = vi.fn(async () => {
      throw new Error('网络不可用');
    });
    await repo.putRow('events', evRow('e1', '写作', 1));
    await sync.syncNow();
    expect(await schema.db.outbox.count()).toBe(1);

    mockSyncApi = vi.fn(async (p) => ({ serverTime: 6000, applied: p.changes.length, changes: [] }));
    await sync.syncNow();
    expect(await schema.db.outbox.count()).toBe(0);
  });

  it('拉取的墓碑覆盖本地行，查询中消失；旧数据不覆盖新本地数据', async () => {
    // 本地已有行（直接采纳，不进 outbox）
    await repo.adoptRow('events', evRow('e1', '本地版', 10), {});
    await repo.adoptRow('events', evRow('e2', '本地版2', 100), {});

    mockSyncApi = vi.fn(async () => ({
      serverTime: 9000,
      applied: 0,
      changes: [
        { table: 'events', row: evRow('e1', '删除我', 50, { deleted: 1, serverRev: 8000 }) },
        { table: 'events', row: evRow('e2', '旧数据', 99, { serverRev: 8001 }) }, // 99 < 100 不覆盖
      ],
    }));
    await sync.syncNow();

    const alive = await repo.getAllEvents();
    expect(alive.map((e) => e.id)).toEqual(['e2']);
    expect(alive[0].title).toBe('本地版2');
  });
});

describe('写后防抖上推（v0.10.0 全自动同步）', () => {
  it('putRow 触发 writeHook，防抖到点后 api.sync 收到该变更', async () => {
    mockSyncApi = vi.fn(async (p) => ({ serverTime: 5000, applied: p.changes.length, changes: [] }));
    let hookCalls = 0;
    repo.setWriteHook(() => {
      hookCalls++;
      sync.schedulePush(10);
    });

    await repo.putRow('events', evRow('hook-ev', '写后上推', 1));
    expect(hookCalls).toBe(1);

    await new Promise((r) => setTimeout(r, 80)); // 等防抖到点 + 同步完成
    expect(mockSyncApi).toHaveBeenCalledTimes(1);
    const sent = mockSyncApi.mock.calls[0][0];
    expect(sent.changes.some((c) => c.rows.some((r) => r.id === 'hook-ev'))).toBe(true);
    repo.setWriteHook(null);
  });

  it('adoptRow 拉取写入不触发 writeHook（防拉→推循环）', async () => {
    let calls = 0;
    repo.setWriteHook(() => calls++);
    const replaced = await repo.adoptRow('events', evRow('pull-row', '远端行', Date.now() + 99999), {});
    expect(replaced).toBe(true);
    expect(calls).toBe(0);
    repo.setWriteHook(null);
  });

  it('未登录时 schedulePush 不动作', async () => {
    const local = await import('../src/auth/local.js');
    local.setToken('');
    mockSyncApi = vi.fn(async (p) => ({ serverTime: 5000, applied: 0, changes: [] }));
    sync.schedulePush(10);
    await new Promise((r) => setTimeout(r, 60));
    expect(mockSyncApi).not.toHaveBeenCalled();
  });

  it('连续多次写入合并：防抖窗口内只推一次，且推的是最终状态', async () => {
    mockSyncApi = vi.fn(async (p) => ({ serverTime: 5000, applied: p.changes.length, changes: [] }));
    repo.setWriteHook(() => sync.schedulePush(60)); // 防抖窗口 60ms，写入间隔 5ms——10 倍裕量防定时器抢先
    await repo.putRow('events', evRow('merge-ev', '第一版', 1));
    await new Promise((r) => setTimeout(r, 5));
    await repo.putRow('events', evRow('merge-ev', '第二版', 2));
    await new Promise((r) => setTimeout(r, 150)); // 越过整个防抖窗口

    expect(mockSyncApi).toHaveBeenCalledTimes(1); // 两次写入只推一次
    const sent = mockSyncApi.mock.calls[0][0];
    const row = sent.changes.flatMap((c) => c.rows).find((r) => r.id === 'merge-ev');
    expect(row.title).toBe('第二版');
    repo.setWriteHook(null);
  });
});
