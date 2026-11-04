// LWW 合并规则（纯函数，供同步与导入复用、可单测）
// 远端 updatedAt 更大才覆盖本地；相等视为同一版本，保留本地减少抖动
export function shouldReplace(local, remote) {
  if (!local) return true;
  if (!remote || typeof remote.updatedAt !== 'number') return false;
  return remote.updatedAt > local.updatedAt;
}
