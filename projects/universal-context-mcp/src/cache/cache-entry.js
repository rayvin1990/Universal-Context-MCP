/**
 * Cache Entry primitives for the cache layer.
 * Entries are isolated by agent + project + session to avoid cross-session leaks.
 */

export const DEFAULT_CACHE_TTL_MS = 60 * 60 * 1000;
export const DEFAULT_NEGATIVE_TTL_MS = 60 * 1000;
export const DEFAULT_TTL_JITTER_RATIO = 0.1;

export function normalizeScope(scope = {}) {
  return {
    agent: scope.agent || 'unknown-agent',
    project: scope.project || 'unknown-project',
    sessionId: scope.sessionId || 'global',
  };
}

export function buildScopeKey(scope = {}) {
  const normalized = normalizeScope(scope);
  return `${normalized.agent}:${normalized.project}:${normalized.sessionId}`;
}

export function buildCacheKey(identifier, scope = {}) {
  const normalizedIdentifier = typeof identifier === 'string'
    ? identifier.trim()
    : JSON.stringify(identifier);

  return `${buildScopeKey(scope)}:${stableHash(normalizedIdentifier)}`;
}

export function createCacheEntry(key, value, options = {}) {
  const now = options.now ?? Date.now();
  const ttlMs = Math.max(1, options.ttlMs ?? DEFAULT_CACHE_TTL_MS);
  const scope = normalizeScope(options.scope);
  const negative = Boolean(options.negative);

  return {
    key,
    value,
    ttlMs,
    createdAt: now,
    updatedAt: now,
    expiresAt: now + ttlMs,
    size: options.size ?? estimateEntrySize(value),
    metadata: {
      ...scope,
      createdAt: now,
      updatedAt: now,
      lastAccessedAt: now,
      accessCount: 0,
      cacheType: options.cacheType || 'session-context',
      negative,
    },
  };
}

export function touchCacheEntry(entry, now = Date.now()) {
  entry.updatedAt = now;
  entry.metadata.updatedAt = now;
  entry.metadata.lastAccessedAt = now;
  entry.metadata.accessCount += 1;
  return entry;
}

export function refreshCacheEntry(entry, value, options = {}) {
  const now = options.now ?? Date.now();
  const ttlMs = Math.max(1, options.ttlMs ?? entry.ttlMs ?? DEFAULT_CACHE_TTL_MS);
  const negative = options.negative ?? entry.metadata?.negative ?? false;

  entry.value = value;
  entry.ttlMs = ttlMs;
  entry.updatedAt = now;
  entry.expiresAt = now + ttlMs;
  entry.size = options.size ?? estimateEntrySize(value);
  entry.metadata.updatedAt = now;
  entry.metadata.lastAccessedAt = now;
  entry.metadata.negative = Boolean(negative);

  return entry;
}

export function isExpired(entry, now = Date.now()) {
  return !entry || entry.expiresAt <= now;
}

export function isNegativeEntry(entry) {
  return Boolean(entry?.metadata?.negative);
}

export function shouldExpire(entry, now = Date.now()) {
  return isExpired(entry, now);
}

export function estimateEntrySize(value) {
  try {
    return Buffer.byteLength(JSON.stringify(value), 'utf8');
  } catch {
    return 0;
  }
}

export function applyTTLJitter(ttlMs, jitterRatio = DEFAULT_TTL_JITTER_RATIO) {
  if (!Number.isFinite(ttlMs) || ttlMs <= 0 || jitterRatio <= 0) {
    return ttlMs;
  }

  const amplitude = ttlMs * jitterRatio;
  const offset = (Math.random() * 2 - 1) * amplitude;
  return Math.max(1, Math.round(ttlMs + offset));
}

export function stableHash(value) {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(36);
}
