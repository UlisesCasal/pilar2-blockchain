'use strict';

require('dotenv').config();

const express = require('express');
const { startConsuming, WORKER_ID, WORKER_TYPE } = require('./consumer');
const { createChannel } = require('../shared/amqp');

const app = express();
app.use(express.json());

// Placeholder metrics — real hash-rate measurement would require timing inside miner.js
let lastTask = null;
let hashRate = 0;

/**
 * GET /worker/status
 * Liveness and stats endpoint for the pool worker registry.
 */
app.get('/worker/status', (_req, res) => {
  res.json({
    worker: 'OK',
    worker_id: WORKER_ID,
    type: WORKER_TYPE,
    hash_rate: hashRate,
    last_task: lastTask,
  });
});

/**
 * Publish a keepalive heartbeat to the keepalive queue.
 * Pool consumes this to track live workers.
 */
async function sendKeepalive(channel) {
  const msg = JSON.stringify({
    worker_id: WORKER_ID,
    type: WORKER_TYPE,
    timestamp: new Date().toISOString(),
  });
  channel.sendToQueue('keepalive', Buffer.from(msg));
}

async function start() {
  const rabbitmqUrl = process.env.RABBITMQ_URL;

  // Start consuming mining tasks
  await startConsuming(rabbitmqUrl);

  // Keepalive loop — separate channel so the consumer channel isn't shared
  const { channel: keepaliveChannel } = await createChannel(rabbitmqUrl);
  await keepaliveChannel.assertQueue('keepalive', {
    durable: false,
    arguments: { 'x-message-ttl': 30000 },
  });

  // Send first heartbeat immediately, then on interval
  await sendKeepalive(keepaliveChannel);
  setInterval(
    () => sendKeepalive(keepaliveChannel),
    parseInt(process.env.KEEPALIVE_INTERVAL_MS || '10000', 10)
  );

  const port = parseInt(process.env.PORT_WORKER || '3002', 10);
  app.listen(port, () => {
    console.log(`[worker/${WORKER_ID}] HTTP status on port ${port}`);
  });
}

start().catch((err) => {
  console.error('[worker] Fatal startup error:', err);
  process.exit(1);
});

module.exports = app;
