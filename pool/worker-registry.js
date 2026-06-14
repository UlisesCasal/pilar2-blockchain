'use strict';

/**
 * Factory for a TTL-based worker liveness registry.
 * Workers are tracked by id with a lastSeen timestamp.
 * Expired workers are evicted lazily on count() / getAll() calls.
 *
 * @param {{ ttlMs: number }} options
 * @returns {{ register, count, getAll }}
 */
function makeRegistry({ ttlMs }) {
  // id → { id, type, lastSeen }
  const workers = new Map();

  function _evict() {
    const cutoff = Date.now() - ttlMs;
    for (const [id, w] of workers) {
      if (w.lastSeen < cutoff) workers.delete(id);
    }
  }

  /**
   * Register (or renew) a worker's presence.
   * @param {string} id - Unique worker identifier
   * @param {string} type - Worker type ('CPU' | 'GPU')
   */
  function register(id, type) {
    workers.set(id, { id, type, lastSeen: Date.now() });
  }

  /**
   * Return the number of live workers, optionally filtered by type.
   * Evicts stale workers before counting.
   *
   * @param {{ type?: string }} [filter]
   * @returns {number}
   */
  function count(filter = {}) {
    _evict();
    if (!filter.type) return workers.size;
    let n = 0;
    for (const w of workers.values()) {
      if (w.type === filter.type) n++;
    }
    return n;
  }

  /**
   * Return all live worker objects { id, type, lastSeen }.
   * Evicts stale workers before returning.
   *
   * @returns {{ id: string, type: string, lastSeen: number }[]}
   */
  function getAll() {
    _evict();
    return [...workers.values()];
  }

  return { register, count, getAll };
}

module.exports = { makeRegistry };
