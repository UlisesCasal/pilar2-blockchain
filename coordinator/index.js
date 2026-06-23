'use strict';

require('dotenv').config();

const express = require('express');
const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../shared/logger');
const logger = createLogger('coordinator');

const { buildPayload, buildBlock } = require('../shared/block');
const { md5 } = require('../shared/hash');
const { storeBlock, getChain, getBlock, acquireLock, getTransactionsByLot } = require('./redis');
const { signTransaction } = require('../shared/crypto');
const { initDB, getEntityWithKey, listAllEntities } = require('./db');
const authRoutes = require('./auth-routes');
const { requireAuth } = require('./auth-middleware');
const { publishTask, consumeResults, consumeDLQ, getChannel, publishBlockConfirmed, QUEUES } = require('./rabbitmq');
const { LeaderElection } = require('./leader-election');
const { split } = require('../pool/nonce-splitter');

const app = express();
app.use(express.json());
app.use('/auth', authRoutes);

let election = null;
let _consumerTag = null;

// --- Config ---
const PORT = parseInt(process.env.PORT_COORDINATOR || '3000');
const DIFFICULTY = process.env.DIFFICULTY || '0000';
const POOL_URL = process.env.POOL_URL || 'http://pool:3001';
const RABBITMQ_URL = process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672';

// --- NCT Result Handler ---

/**
 * NCT.2 + NCT.3 + NCT.4: Verify result, acquire lock, store block.
 * @param {Object} result - Mining result from a worker
 */
async function handleResult(result) {
  // NCT.2: Discard if worker exhausted range without finding nonce
  if (!result.found) {
    return;
  }

  // NCT.3: Acquire atomic lock — first writer wins per block height
  const lockKey = result.prev_hash || result.task_id;
  const locked = await acquireLock(lockKey);
  if (!locked) {
    logger.info('Lock not acquired — another worker already committed this block');
    return;
  }

  // NCT.4: Verify the nonce
  const hash = md5(result.payload + result.nonce);
  if (!hash.startsWith(DIFFICULTY)) {
    logger.warn('Invalid nonce received — hash does not meet difficulty, discarding');
    return;
  }

  // Build and store block
  const block = buildBlock(
    { prev_hash: result.prev_hash, transactions: result.transactions || [] },
    result.nonce,
    hash
  );

  await storeBlock(block);
  await publishBlockConfirmed(block);
  logger.info('Block committed: %s', block.block_hash);
}

// --- Routes ---

/**
 * NCT.1: POST /mine — triggered by Pool when threshold is reached.
 * Body: { transactions, prevHash?, workerCount? }
 */
app.post('/mine', async (req, res) => {
  try {
    const { transactions, workerCount: reqWorkerCount } = req.body;

    if (!Array.isArray(transactions) || transactions.length === 0) {
      return res.status(400).json({ error: 'transactions array is required', details: [] });
    }

    // Get last block hash from chain
    const chain = await getChain();
    const lastBlock = chain.length > 0 ? chain[chain.length - 1] : null;
    const prevHash = lastBlock ? lastBlock.block_hash : '0'.repeat(32);

    const workerCount = Math.max(1, reqWorkerCount || 1);
    const payload = buildPayload(transactions, prevHash);
    const ranges = split(workerCount);

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
      await publishTask(task);
    }

    res.json({ status: 'mining started', tasks: ranges.length });
  } catch (err) {
    logger.error({ err: err.message }, '/mine error');
    res.status(500).json({ error: 'Internal error', details: [err.message] });
  }
});

/**
 * POST /transaction — validate and forward to Pool.
 */
app.post('/transaction', async (req, res) => {
  try {
    const response = await fetch(`${POOL_URL}/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await response.json();
    res.status(response.status).json(data);
  } catch (err) {
    logger.error({ err: err.message }, '/transaction forward error');
    res.status(502).json({ error: 'Pool unreachable', details: [err.message] });
  }
});

/**
 * GET /status — coordinator health + chain info.
 */
app.get('/status', async (_req, res) => {
  try {
    const chain = await getChain();
    const lastBlock = chain.length > 0 ? chain[chain.length - 1] : null;
    res.json({
      nct: 'OK',
      chain_length: chain.length,
      pending_tx: 0,
      last_block: lastBlock ? lastBlock.block_hash : null,
      role: election ? (election.isLeader() ? 'leader' : 'follower') : 'unknown',
    });
  } catch (err) {
    res.status(500).json({ error: 'Status error', details: [err.message] });
  }
});

/**
 * GET /redis/status — Redis health check.
 */
app.get('/redis/status', async (_req, res) => {
  try {
    const chain = await getChain();
    res.json({
      redis: 'OK',
      blocks_stored: chain.length,
    });
  } catch (err) {
    res.json({
      redis: 'ERROR',
      blocks_stored: 0,
      error: err.message,
    });
  }
});

/**
 * GET /rabbitmq/status — RabbitMQ health check via channel inspection.
 */
app.get('/rabbitmq/status', async (_req, res) => {
  try {
    const ch = await getChannel();
    // Check queue depth on mining_tasks
    const q = await ch.checkQueue(QUEUES.MINING_TASKS);
    res.json({
      rabbitmq: 'OK',
      queue_depth: q.messageCount,
    });
  } catch (err) {
    res.json({
      rabbitmq: 'ERROR',
      queue_depth: 0,
      error: err.message,
    });
  }
});

app.get('/chain', async (_req, res) => {
  try {
    const chain = await getChain();
    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/chain/lot/:lotId', async (req, res) => {
  try {
    const results = await getTransactionsByLot(req.params.lotId);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/chain/:blockHash', async (req, res) => {
  try {
    const block = await getBlock(req.params.blockHash);
    if (!block) return res.status(404).json({ error: 'Block not found' });
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/entities', (_req, res) => {
  res.json(listAllEntities());
});

app.post('/sign', requireAuth, (req, res) => {
  const { transaction } = req.body;
  if (!transaction) {
    return res.status(400).json({ error: 'transaction required' });
  }
  const entityRow = getEntityWithKey(req.entity.name);
  if (!entityRow) {
    return res.status(404).json({ error: `Unknown entity: ${req.entity.name}` });
  }
  const firma = signTransaction(transaction, entityRow.private_key);
  res.json({ ...transaction, firma });
});

// --- Startup ---

async function start() {
  try {
    initDB();

    // Initialize genesis block if chain is empty
    const chain = await getChain();
    if (chain.length === 0) {
      const genesis = {
        previous_hash: '0'.repeat(32),
        nonce: '0',
        timestamp: new Date().toISOString(),
        transactions: [],
        block_hash: md5('genesis'),
      };
      await storeBlock(genesis);
      logger.info('Genesis block created: %s', genesis.block_hash);
    }

    election = new LeaderElection();

    election.on('elected', async () => {
      logger.info('Elected as leader — starting result consumer');
      try {
        const { consumerTag } = await consumeResults(handleResult);
        _consumerTag = consumerTag;
      } catch (err) {
        logger.error({ err: err.message }, 'Failed to start consumer');
      }
    });

    election.on('demoted', async () => {
      logger.info('Demoted — cancelling result consumer');
      if (_consumerTag) {
        try {
          const ch = await getChannel();
          await ch.cancel(_consumerTag);
        } catch (err) {
          logger.error({ err: err.message }, 'Failed to cancel consumer');
        }
        _consumerTag = null;
      }
    });

    await election.start();

    await consumeDLQ((content, headers) => {
      logger.warn({ content }, 'DLQ message');
    });

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
