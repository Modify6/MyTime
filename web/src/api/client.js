// 极简 API 客户端：serverUrl 为空表示同源（生产由 server 托管 / 开发走 Vite 代理）
import { getServerUrl, getToken } from '../auth/local.js';

export class ApiError extends Error {
  constructor(message, status) {
    super(message);
    this.status = status;
  }
}

async function request(method, path, body) {
  const base = getServerUrl().replace(/\/+$/, '');
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;
  let res;
  try {
    res = await fetch(base + path, {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch {
    throw new ApiError('网络不可用', 0);
  }
  if (res.status === 401) throw new ApiError('未登录或密码已更改', 401);
  if (!res.ok) throw new ApiError(`请求失败(${res.status})`, res.status);
  return res.json();
}

export const api = {
  testConnection: () => request('GET', '/api/health'),
  login: (password) => request('POST', '/api/auth', { password }),
  sync: (payload) => request('POST', '/api/sync', payload),
  serverExport: () => request('GET', '/api/export'),
  // —— 服务端快照备份 ——
  serverBackup: () => request('POST', '/api/backup'),
  backupList: () => request('GET', '/api/backup/list'),
  // 下载指定快照（返回 Blob，由调用方触发保存）
  backupDownload: async (name) => {
    const base = getServerUrl().replace(/\/+$/, '');
    const res = await fetch(`${base}/api/backup/file?name=${encodeURIComponent(name)}`, {
      headers: { Authorization: `Bearer ${getToken()}` },
    });
    if (!res.ok) throw new ApiError(`下载失败(${res.status})`, res.status);
    return res.blob();
  },
  // 手机端运行日志上传到服务器（电脑端 server/data/client-logs/ 查看）
  uploadClientLog: (text) => request('POST', '/api/client-log', { text }),
};
