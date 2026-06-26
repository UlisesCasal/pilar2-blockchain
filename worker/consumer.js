'use strict';

const { createChannel } = require('../shared/amqp');
const { mine } = require('./miner');
const { v4: uuidv4 } = require('uuid');
const { createLogger } = require('../shared/logger');
const logger = createLogger('worker');

const WORKER_ID = process.env.WORKER_ID || uuidv4();
const WORKER_TYPE = process.env.WORKER_TYPE || 'CPU';

/**
 * Connect to RabbitMQ and begin consuming mining tasks.
 *
 * For each task received:
 *   1. Run mine() with the task parameters
 *   2. Publish the result to mining_results
 *   3. Ack the original message
 *
 * @param {string} rabbitmqUrl - AMQP connection URL
 * @returns {Promise<void>}
 */
async function startConsuming(rabbitmqUrl) {
  const { channel, connection } = await createChannel(rabbitmqUrl);

  await channel.assertQueue('mining_tasks', { durable: true });
  await channel.assertQueue('mining_results', {
    durable: true,
    arguments: { 'x-dead-letter-exchange': 'dlx_mining' },
  });
  await channel.prefetch(1);

  const { consumerTag } = await channel.consume(
    'mining_tasks',
    async (msg) => {
      if (!msg) return;

      const task = JSON.parse(msg.content.toString());

      let result;
      try {
        const mineResult = await mine({
          payload: task.payload,
          difficulty: task.difficulty,
          nonceStart: task.nonce_start,
          nonceEnd: task.nonce_end,
        });

        result = {
          task_id: task.task_id,
          worker_id: WORKER_ID,
          found: mineResult.found,
          nonce: mineResult.nonce || null,
          hash: mineResult.hash || null,
          payload: task.payload,
          prev_hash: task.prev_hash,
          difficulty: task.difficulty,
          transactions: task.transactions,
        };
      } catch (err) {
        logger.error({ err: err.message, workerId: WORKER_ID }, 'Mine error');
        result = {
          task_id: task.task_id,
          worker_id: WORKER_ID,
          found: false,
          error: err.message,
        };
      }

      channel.sendToQueue(
        'mining_results',
        Buffer.from(JSON.stringify(result)),
        { persistent: true }
      );

      channel.ack(msg);
    },
    { noAck: false }
  );

  logger.info({ workerId: WORKER_ID, type: WORKER_TYPE }, 'Consuming mining_tasks');
  return { channel, connection, consumerTag };
}

module.exports = { startConsuming, WORKER_ID, WORKER_TYPE };
