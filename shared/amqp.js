'use strict';

const amqplib = require('amqplib');
const { createLogger } = require('./logger');
const logger = createLogger('amqp');

/**
 * Connect to RabbitMQ with exponential backoff retries.
 *
 * @param {string} url - AMQP connection URL
 * @param {object} [options]
 * @param {number} [options.maxRetries=6] - Maximum number of attempts
 * @param {number} [options.baseDelayMs=1000] - Initial delay in milliseconds (doubles each attempt)
 * @param {object} [options.tls] - TLS/SSL options (ca, cert, key)
 * @returns {Promise<{ channel: object, connection: object }>}
 */
async function createChannel(url, { maxRetries = 6, baseDelayMs = 1000, tls = {} } = {}) {
  let delay = baseDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connectOptions = {};
      if (tls.ca || tls.cert || tls.key) {
        Object.assign(connectOptions, tls);
      }
      
      const connection = await amqplib.connect(url, connectOptions);
      const channel = await connection.createChannel();
      return { channel, connection };
    } catch (err) {
      if (attempt === maxRetries) throw err;
      if (delay > 0) {
        await new Promise(r => setTimeout(r, delay));
      }
      delay = Math.min(delay * 2, 32000);
    }
  }
}

async function subscribeBlockConfirmed(url, handler) {
  const { channel } = await createChannel(url);
  await channel.assertExchange('block_confirmed', 'fanout', { durable: false });
  const q = await channel.assertQueue('', { exclusive: true });
  await channel.bindQueue(q.queue, 'block_confirmed', '');
  channel.consume(q.queue, (msg) => {
    if (!msg) return;
    try {
      const block = JSON.parse(msg.content.toString());
      handler(block);
    } catch (err) {
      logger.error({ err: err.message }, 'Error handling block_confirmed');
    }
    channel.ack(msg);
  }, { noAck: false });
  return { channel };
}

module.exports = { createChannel, subscribeBlockConfirmed };
