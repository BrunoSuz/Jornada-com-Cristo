import { timestampMillis } from './utils.js';

export function compareVersions(local, remote) {
  return timestampMillis(local?.updatedAt) - timestampMillis(remote?.updatedAt);
}

export function chooseNewest(local, remote, hasPendingLocal = false) {
  if (!local) return remote || null;
  if (!remote) return local;
  if (hasPendingLocal && compareVersions(local, remote) >= 0) return local;
  return compareVersions(local, remote) > 0 ? local : remote;
}

export function operationKey(scope, kind, id) {
  return `${scope}:${kind}:${id}`;
}

export function nextRetryDelay(attempt, base = 500, maximum = 30000) {
  const exponent = Math.max(0, Number(attempt) || 0);
  return Math.min(maximum, base * (2 ** exponent));
}

export function shouldApplyRealtime(local, remote, pendingOperation) {
  if (!local) return !pendingOperation || pendingOperation.type !== 'delete';
  if (pendingOperation?.type === 'delete') return false;
  return compareVersions(remote, local) >= 0 && !pendingOperation;
}
