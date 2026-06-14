'use strict';

require('dotenv').config();

const express = require('express');
const { v4: uuidv4 } = require('uuid');

const { createChannel } = require('../shared/amqp');
const { buildPayload } = require('../shared/block');
const { validateTransaction } = require('../validator/index');
const { makePool } = require('./transaction-pool');
const { makeRegistry } = require('./worker-registry');
const { split } = require('./nonce-splitter');

const app = express();
app.use(express.json());

// --- Config ---
const PORT = parseInt(process.env.PORT_POOL || '3001');
const BLOCK_THRESHOLD = parseInt(process.env.BLOCK_THRESHOLD || '10');
const DIFFICULTY = process.env.DIFFICULTY || '0000';
const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://coordinator:3000';
const HMAC_SECRET = process.env.HMAC_SECRET;
if (!HMAC_SECRET) throw new Error('HMAC_SECRET environment variable is required');
const WORKER_TTL_MS = parseInt(process.env.WORKER_TTL_MS || '30000');
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

const QUEUES = {
  MINING_TASKS: 'mining_tasks',
  KEEPALIVE: 'keepalive',
};

// --- State ---
const pool = makePool();
const registry = makeRegistry({ ttlMs: WORKER_TTL_MS });

let _channel = null;

async function getChannel() {
  if (!_channel) {
    const { channel } = await createChannel(RABBITMQ_URL);
    await channel.assertQueue(QUEUES.MINING_TASKS, { durable: true });
    await channel.assertQueue(QUEUES.KEEPALIVE, {
      durable: false,
      arguments: { 'x-message-ttl': 30000 },
    });
    _channel = channel;
  }
  return _channel;
}

/**
 * Trigger block formation: flush pool, split nonce range, publish tasks to mining_tasks.
 * @param {Object[]} transactions
 */
async function triggerMining(transactions) {
  const ch = await getChannel();

  // Get last block hash from Coordinator to use as prevHash
  let prevHash = '0'.repeat(32);
  try {
    const statusRes = await fetch(`${COORDINATOR_URL}/status`);
    if (statusRes.ok) {
      const status = await statusRes.json();
      if (status.last_block) prevHash = status.last_block;
    }
  } catch (_) {
    // Coordinator unavailable — use genesis prevHash
  }

  const activeWorkers = registry.count();
  const workerCount = Math.max(1, activeWorkers);
  const effectiveDifficulty = activeWorkers === 0
    ? DIFFICULTY.slice(0, Math.max(1, DIFFICULTY.length - 1))
    : DIFFICULTY;
  const ranges = split(workerCount);
  const payload = buildPayload(transactions, prevHash);

  for (const range of ranges) {
    const task = {
      task_id: uuidv4(),
      payload,
      prev_hash: prevHash,
      difficulty: effectiveDifficulty,
      nonce_start: range.start,
      nonce_end: range.end,
      transactions,
    };
    ch.sendToQueue(
      QUEUES.MINING_TASKS,
      Buffer.from(JSON.stringify(task)),
      { persistent: true }
    );
  }
}

// --- Routes ---

/**
 * POST /transaction
 * Validate tx, add to pool. If pool reaches threshold → trigger mining.
 */
app.post('/transaction', async (req, res) => {
  const tx = req.body;

  // Validate
  const result = validateTransaction(tx, HMAC_SECRET);
  if (!result.valid) {
    return res.status(400).json({ valid: false, errors: result.errors });
  }

  pool.add(tx);

  // Threshold check — flush and trigger mining atomically
  if (pool.size() >= BLOCK_THRESHOLD) {
    const batch = pool.flush();
    try {
      await triggerMining(batch);
    } catch (err) {
      console.error('[pool] Failed to trigger mining:', err.message);
      // Re-add transactions back to pool on failure
      for (const t of batch) pool.add(t);
      return res.status(500).json({ error: 'Failed to trigger mining', details: [err.message] });
    }
  }

  return res.status(201).json({ accepted: true, pending: pool.size() });
});

/**
 * GET /status
 * Returns pool state and worker counts.
 */
app.get('/status', (_req, res) => {
  res.json({
    pool: 'OK',
    pending: pool.size(),
    gpu_workers: registry.count({ type: 'GPU' }),
    cpu_workers: registry.count({ type: 'CPU' }),
  });
});

// --- Startup ---

async function start() {
  try {
    const ch = await getChannel();

    // Consume keepalive queue — register workers on heartbeat
    await ch.consume(
      QUEUES.KEEPALIVE,
      (msg) => {
        if (!msg) return;
        try {
          const hb = JSON.parse(msg.content.toString());
          if (hb.worker_id) {
            registry.register(hb.worker_id, hb.type || 'CPU');
          }
        } catch (_) {
          // Malformed keepalive — ignore
        }
        ch.ack(msg);
      },
      { noAck: false }
    );

    app.listen(PORT, () => {
      console.log(`[pool] Listening on port ${PORT}`);
    });
  } catch (err) {
    console.error('[pool] Startup failed:', err.message);
    process.exit(1);
  }
}

start();

module.exports = app; // for supertest in integration tests
