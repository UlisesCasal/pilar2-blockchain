'use strict';

const { createChannel } = require('../shared/amqp');

const QUEUES = {
  MINING_TASKS: 'mining_tasks',
  MINING_RESULTS: 'mining_results',
  KEEPALIVE: 'keepalive',
};

let _channel = null;

async function getChannel() {
  if (!_channel) {
    const { channel } = await createChannel(
      process.env.RABBITMQ_URL || 'amqp://guest:guest@rabbitmq:5672'
    );
    await channel.assertQueue(QUEUES.MINING_TASKS, { durable: true });
    await channel.assertQueue(QUEUES.MINING_RESULTS, { durable: true });
    await channel.assertQueue(QUEUES.KEEPALIVE, {
      durable: false,
      arguments: { 'x-message-ttl': 30000 },
    });
    await channel.prefetch(1);
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
  await ch.consume(
    QUEUES.MINING_RESULTS,
    async (msg) => {
      if (!msg) return;
      try {
        const result = JSON.parse(msg.content.toString());
        await handler(result);
        ch.ack(msg);
      } catch (err) {
        console.error('[coordinator/rabbitmq] Error handling result:', err.message);
        ch.nack(msg, false, false); // discard on handler error
      }
    },
    { noAck: false }
  );
}

module.exports = { publishTask, consumeResults, getChannel, QUEUES };
