'use strict';

/**
 * Factory for an in-memory transaction accumulator.
 * Returns { add, flush, size } — no shared module-level state,
 * so each service startup creates its own independent pool instance.
 *
 * @returns {{ add: Function, flush: Function, size: Function }}
 */
function makePool() {
  let pending = [];

  /**
   * Add a transaction to the pending pool.
   * @param {Object} tx
   */
  function add(tx) {
    pending.push(tx);
  }

  /**
   * Return all pending transactions and clear the pool atomically.
   * @returns {Object[]}
   */
  function flush() {
    const batch = [...pending];
    pending = [];
    return batch;
  }

  /**
   * Return the number of pending transactions.
   * @returns {number}
   */
  function size() {
    return pending.length;
  }

  return { add, flush, size };
}

module.exports = { makePool };
