'use strict';

const { createChannel } = require('../shared/amqp');
const { withRetry } = require('../shared/retry');
const { createLogger } = require('../shared/logger');
const logger = createLogger('coordinator');

const QUEUES = {
  MINING_TASKS: 'mining_tasks',
  MINING_RESULTS: 'mining_results',
  MINING_RESULTS_DLQ: 'mining_results_dlq',
  KEEPALIVE: 'keepalive',
};

const EXCHANGES = {
  BLOCK_CONFIRMED: 'block_confirmed',
  DLX_MINING: 'dlx_mining',
};

let _channel = null;

async function getChannel() {
  if (!_channel) {
    const tls = {};
    if (process.env.RABBITMQ_CA) tls.ca = [require('fs').readFileSync(process.env.RABBITMQ_CA)];
    if (process.env.RABBITMQ_CERT) tls.cert = require('fs').readFileSync(process.env.RABBITMQ_CERT);
    if (process.env.RABBITMQ_KEY) tls.key = require('fs').readFileSync(process.env.RABBITMQ_KEY);

    const { channel } = await createChannel(
      process.env.RABBITMQ_URL || 'amqps://guest:guest@rabbitmq:5671',
      { tls }
    );
    await channel.assertQueue(QUEUES.MINING_TASKS, { durable: true });
    await channel.assertQueue(QUEUES.MINING_RESULTS, {
      durable: true,
      arguments: { 'x-dead-letter-exchange': EXCHANGES.DLX_MINING },
    });
    await channel.assertQueue(QUEUES.KEEPALIVE, {
      durable: false,
      arguments: { 'x-message-ttl': 30000 },
    });
    await channel.prefetch(1);
    await channel.assertExchange(EXCHANGES.BLOCK_CONFIRMED, 'fanout', { durable: false });
    await channel.assertExchange(EXCHANGES.DLX_MINING, 'direct', { durable: true });
    await channel.assertQueue(QUEUES.MINING_RESULTS_DLQ, { durable: true });
    await channel.bindQueue(QUEUES.MINING_RESULTS_DLQ, EXCHANGES.DLX_MINING, '');
    _channel = channel;
  }
  return _channel;
}

/**
 * Publish a mining task to the mining_tasks queue.
 * @param {Object} task
 */
async function publishTask(task) {
  const ch = await getChannel();
  ch.sendToQueue(
    QUEUES.MINING_TASKS,
    Buffer.from(JSON.stringify(task)),
    { persistent: true }
  );
}

/**
 * Subscribe to mining_results. Calls handler per message and acks on success.
 * @param {Function} handler - async (result) => void
 */
async function consumeResults(handler) {
  const ch = await getChannel();
  return ch.consume(
    QUEUES.MINING_RESULTS,
    async (msg) => {
      if (!msg) return;
      try {
        const result = JSON.parse(msg.content.toString());
        await withRetry(() => handler(result));
        ch.ack(msg);
      } catch (err) {
        logger.error({ err: err.message }, 'Error handling result');
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

async function consumeDLQ(handler) {
  const ch = await getChannel();
  return ch.consume(
    QUEUES.MINING_RESULTS_DLQ,
    async (msg) => {
      if (!msg) return;
      try {
        const content = JSON.parse(msg.content.toString());
        await handler(content, msg.properties.headers);
        ch.ack(msg);
      } catch (err) {
        logger.error({ err: err.message }, 'DLQ handler error');
        ch.nack(msg, false, false);
      }
    },
    { noAck: false }
  );
}

async function publishBlockConfirmed(block) {
  const ch = await getChannel();
  ch.publish(
    EXCHANGES.BLOCK_CONFIRMED,
    '',
    Buffer.from(JSON.stringify(block))
  );
}

module.exports = { publishTask, consumeResults, consumeDLQ, getChannel, publishBlockConfirmed, QUEUES, EXCHANGES };
