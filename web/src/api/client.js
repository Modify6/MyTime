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
};
