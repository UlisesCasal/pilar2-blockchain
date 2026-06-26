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
const { createLogger } = require('../shared/logger');
const logger = createLogger('pool');

const app = express();
app.use(express.json());

// --- Config ---
const PORT = parseInt(process.env.PORT_POOL || '3001');
const BLOCK_THRESHOLD = parseInt(process.env.BLOCK_THRESHOLD || '1');
const DIFFICULTY = process.env.DIFFICULTY || '0000';
const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://coordinator:3000';
const WORKER_TTL_MS = parseInt(process.env.WORKER_TTL_MS || '30000');
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

const QUEUES = {
  MINING_TASKS: 'mining_tasks',
  KEEPALIVE: 'keepalive',
  SCALE_REQUESTS: 'scale_requests',
};

// --- State ---
const pool = makePool();
const registry = makeRegistry({ ttlMs: WORKER_TTL_MS });

let _channel = null;
let lastScaleRequest = null;
let _miningInProgress = false;
let _pendingBlockBatch = null;

async function getChannel() {
  if (!_channel) {
    const { channel } = await createChannel(RABBITMQ_URL);
    await channel.assertQueue(QUEUES.MINING_TASKS, { durable: true });
    await channel.assertQueue(QUEUES.KEEPALIVE, {
      durable: false,
      arguments: { 'x-message-ttl': 30000 },
    });
    await channel.assertQueue(QUEUES.SCALE_REQUESTS, { durable: true });
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

  if (activeWorkers === 0) {
    const scaleRequest = {
      type: 'scale_up',
      service: 'worker',
      reason: 'no_active_workers',
      requested_count: 2,
      timestamp: new Date().toISOString(),
    };
    ch.sendToQueue(
      QUEUES.SCALE_REQUESTS,
      Buffer.from(JSON.stringify(scaleRequest)),
      { persistent: true }
    );
    lastScaleRequest = scaleRequest.timestamp;
    logger.warn('No active workers — published scale request');
  }

  const ranges = split(workerCount);
  const payload = buildPayload(transactions, prevHash);

  for (const range of ranges) {
    const task = {
      task_id: uuidv4(),
      payload,
      prev_hash: prevHash,
      difficulty: DIFFICULTY,
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
async function checkCustody(tx) {
  const lotId = tx.id_lote;
  const origen = tx.origen;

  // Check pending pool first — most recent pending tx for this lot
  const pendingForLot = pool.findByLot(lotId);
  if (pendingForLot.length > 0) {
    const lastPending = pendingForLot[pendingForLot.length - 1];
    if (lastPending.destino !== origen) {
      return { valid: false, holder: lastPending.destino };
    }
    return { valid: true };
  }

  // Check confirmed chain
  try {
    const res = await fetch(`${COORDINATOR_URL}/chain/lot/${encodeURIComponent(lotId)}`);
    if (!res.ok) return { valid: true }; // coordinator unavailable — allow
    const chainTxs = await res.json();
    if (!Array.isArray(chainTxs) || chainTxs.length === 0) {
      return { valid: true }; // new lot — anyone can originate
    }
    const lastEntry = chainTxs[chainTxs.length - 1];
    const lastTx = lastEntry.tx || lastEntry;
    if (lastTx.destino !== origen) {
      return { valid: false, holder: lastTx.destino };
    }
    return { valid: true };
  } catch (_) {
    return { valid: true }; // coordinator unreachable — don't block
  }
}

app.post('/transaction', async (req, res) => {
  const tx = req.body;

  // Validate schema + signature
  const result = validateTransaction(tx);
  if (!result.valid) {
    return res.status(400).json({ valid: false, errors: result.errors });
  }

  // Validate custody ownership
  const custody = await checkCustody(tx);
  if (!custody.valid) {
    return res.status(403).json({
      valid: false,
      accepted: false,
      errors: [`${tx.origen} does not hold custody of lot ${tx.id_lote}. Current holder: ${custody.holder}`],
    });
  }

  pool.add(tx);
  let miningTriggered = false;

  // Threshold check — flush and trigger mining atomically
  // Skip si ya hay una minería en curso (evita tareas redundantes con el mismo prevHash)
  if (!_miningInProgress && pool.size() >= BLOCK_THRESHOLD) {
    const batch = pool.flush();
    _miningInProgress = true;
    try {
      await triggerMining(batch);
      miningTriggered = true;
    } catch (err) {
      logger.error({ err: err.message }, 'Failed to trigger mining');
      _miningInProgress = false;
      // Re-add transactions back to pool on failure
      for (const t of batch) pool.add(t);
      return res.status(500).json({ error: 'Failed to trigger mining', details: [err.message] });
    }
  }

  return res.status(201).json({
    accepted: true,
    pending: pool.size(),
    threshold: BLOCK_THRESHOLD,
    remaining: Math.max(0, BLOCK_THRESHOLD - pool.size()),
    mining_triggered: miningTriggered,
  });
});

/**
 * GET /status
 * Returns pool state and worker counts.
 */
/**
 * GET /pending
 * Returns all pending transactions in the pool without flushing.
 */
app.get('/pending', (_req, res) => {
  res.json({
    pending_count: pool.size(),
    threshold: BLOCK_THRESHOLD,
    pending: pool.peek(),
  });
});

/**
 * GET /pending/lot/:lotId
 * Filter pending transactions by lot ID for traceability.
 */
app.get('/pending/lot/:lotId', (req, res) => {
  const results = pool.findByLot(req.params.lotId);
  res.json({
    lot_id: req.params.lotId,
    pending_count: results.length,
    transactions: results,
  });
});

/**
 * POST /mine
 * Force-flush all pending transactions and trigger mining immediately.
 * Useful for testing or when pool has not reached threshold.
 */
app.post('/mine', async (_req, res) => {
  const batch = pool.flush();
  if (batch.length === 0) {
    return res.status(400).json({ error: 'No pending transactions to mine' });
  }
  try {
    await triggerMining(batch);
    res.json({ status: 'mining triggered', transactions: batch.length });
  } catch (err) {
    for (const t of batch) pool.add(t);
    logger.error({ err: err.message }, 'Force mine failed');
    res.status(500).json({ error: 'Failed to trigger mining', details: [err.message] });
  }
});

app.get('/status', (_req, res) => {
  res.json({
    pool: 'OK',
    pending: pool.size(),
    gpu_workers: registry.count({ type: 'GPU' }),
    cpu_workers: registry.count({ type: 'CPU' }),
  });
});

app.get('/scale/status', (_req, res) => {
  const activeWorkers = registry.count();
  res.json({
    active_workers: activeWorkers,
    gpu_workers: registry.count({ type: 'GPU' }),
    cpu_workers: registry.count({ type: 'CPU' }),
    scale_needed: activeWorkers === 0,
    last_scale_request: lastScaleRequest,
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
            const wasEmpty = registry.count() === 0;
            registry.register(hb.worker_id, hb.type || 'CPU');
            if (wasEmpty && pool.size() > 0) {
              const batch = pool.flush();
              triggerMining(batch).catch((err) =>
                logger.error({ err: err.message }, 'Failed to trigger mining on worker reconnect')
              );
            }
          }
        } catch (_) {
          // Malformed keepalive — ignore
        }
        ch.ack(msg);
      },
      { noAck: false }
    );

    try {
      const { subscribeBlockConfirmed } = require('../shared/amqp');
      await subscribeBlockConfirmed(RABBITMQ_URL, (block) => {
        logger.info('Block confirmed: %s', block.block_hash);
        _miningInProgress = false;
        // Si quedaron transacciones pendientes en el pool, disparar minería
        if (pool.size() >= BLOCK_THRESHOLD) {
          const batch = pool.flush();
          _miningInProgress = true;
          triggerMining(batch).catch((err) =>
            logger.error({ err: err.message }, 'Failed to trigger mining after block confirmation')
          );
        }
      });
    } catch (err) {
      logger.warn({ err: err.message }, 'Could not subscribe to block confirmations');
    }

    app.listen(PORT, () => {
      logger.info('Listening on port %d', PORT);
    });
  } catch (err) {
    logger.error({ err: err.message }, 'Startup failed');
    process.exit(1);
  }
}

start();

module.exports = app; // for supertest in integration tests
