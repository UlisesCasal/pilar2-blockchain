'use strict';

const amqplib = require('amqplib');

/**
 * Connect to RabbitMQ with exponential backoff retries.
 *
 * @param {string} url - AMQP connection URL
 * @param {object} [options]
 * @param {number} [options.maxRetries=6] - Maximum number of attempts
 * @param {number} [options.baseDelayMs=1000] - Initial delay in milliseconds (doubles each attempt)
 * @returns {Promise<{ channel: object, connection: object }>}
 */
async function createChannel(url, { maxRetries = 6, baseDelayMs = 1000 } = {}) {
  let delay = baseDelayMs;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const connection = await amqplib.connect(url);
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

module.exports = { createChannel };
