'use strict';

/**
 * buildPayload — canonical serialization for PoW and HMAC verification.
 *
 * Single tx:   "<id_lote>:<origen>-><destino>:<cantidad>tn:<prevHash>"
 * Multiple txs: "<sorted-ids-csv>:<prevHash>"   (sorted by tx.id, lexicographic)
 *
 * This is the ONLY source of payload serialization in the system.
 * Pool, Coordinator, and Worker all import from here.
 */
function buildPayload(transactions, prevHash) {
  if (transactions.length === 1) {
    const tx = transactions[0];
    return `${tx.id_lote}:${tx.origen}->${tx.destino}:${tx.cantidad}tn:${prevHash}`;
  }

  const sorted = [...transactions].sort((a, b) => a.id.localeCompare(b.id));
  return sorted.map(tx => tx.id).join(',') + ':' + prevHash;
}

/**
 * buildBlock — assembles the final block object for Redis storage.
 * nonce is coerced to string to match the Redis HASH schema.
 */
function buildBlock(task, nonce, blockHash) {
  return {
    previous_hash: task.prev_hash,
    nonce: String(nonce),
    timestamp: new Date().toISOString(),
    transactions: task.transactions,
    block_hash: blockHash,
  };
}

module.exports = { buildPayload, buildBlock };
