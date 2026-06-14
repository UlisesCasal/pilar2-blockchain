'use strict';

const Redis = require('ioredis');

let client;

function getClient() {
  if (!client) {
    client = new Redis(process.env.REDIS_URL || 'redis://localhost:6379');
  }
  return client;
}

/**
 * Store a confirmed block in Redis.
 * Key schema:
 *   HSET block:<block_hash> previous_hash nonce timestamp transactions block_hash
 *   RPUSH chain <block_hash>
 *
 * @param {Object} block
 */
async function storeBlock(block) {
  const r = getClient();
  const key = `block:${block.block_hash}`;
  await r.hset(
    key,
    'previous_hash', block.previous_hash,
    'nonce', block.nonce,
    'timestamp', block.timestamp,
    'transactions', JSON.stringify(block.transactions),
    'block_hash', block.block_hash
  );
  await r.rpush('chain', block.block_hash);
}

/**
 * Retrieve all blocks from the chain in insertion order.
 *
 * @returns {Promise<Object[]>}
 */
async function getChain() {
  const r = getClient();
  const hashes = await r.lrange('chain', 0, -1);
  if (!hashes.length) return [];
  return Promise.all(hashes.map(h => getBlock(h)));
}

/**
 * Retrieve a single block by its hash.
 *
 * @param {string} hash
 * @returns {Promise<Object|null>}
 */
async function getBlock(hash) {
  const r = getClient();
  const data = await r.hgetall(`block:${hash}`);
  if (!data || !data.block_hash) return null;
  return {
    ...data,
    transactions: JSON.parse(data.transactions),
  };
}

/**
 * Attempt to acquire an atomic commit lock for a given prevHash.
 * Uses Redis SET NX EX — only the first caller succeeds.
 *
 * @param {string} prevHash
 * @returns {Promise<boolean>} true if the lock was acquired
 */
async function acquireLock(prevHash) {
  const r = getClient();
  const result = await r.set(`lock:${prevHash}`, '1', 'NX', 'EX', 30);
  return result === 'OK';
}

module.exports = { storeBlock, getChain, getBlock, acquireLock };
