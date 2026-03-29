import { createHash } from 'crypto';

interface CacheEntry {
  response: string;
  dataType?: string;
  data?: unknown;
  cachedAt: number;
}

const TTL_MS = 60 * 60 * 1000; // 1 hour

// In-memory cache (per Node.js process)
const cache = new Map<string, CacheEntry>();

// Stats tracking
let hits = 0;
let misses = 0;

export function getCacheKey(projectId: string, versionId: string, query: string): string {
  const normalized = query.toLowerCase().trim().replace(/\s+/g, ' ');
  return createHash('sha256').update(`${projectId}:${versionId}:${normalized}`).digest('hex');
}

export function getCached(key: string): CacheEntry | null {
  const entry = cache.get(key);
  if (!entry) {
    misses++;
    return null;
  }
  if (Date.now() - entry.cachedAt > TTL_MS) {
    cache.delete(key);
    misses++;
    return null;
  }
  hits++;
  return entry;
}

export function setCached(key: string, entry: CacheEntry): void {
  cache.set(key, entry);
}

export function invalidateProject(projectId: string): void {
  // We can't do partial key invalidation with SHA256 keys, so we clear all
  // In production (Redis), we'd use key prefixes or tags
  // For now, clear all entries whose keys contain the projectId in their source
  // Since we can't reverse SHA256, we clear all entries as a safe fallback
  cache.clear();
  hits = 0;
  misses = 0;
}

export function getCacheStats(): { size: number; hitRate: number } {
  const total = hits + misses;
  return {
    size: cache.size,
    hitRate: total === 0 ? 0 : hits / total,
  };
}
