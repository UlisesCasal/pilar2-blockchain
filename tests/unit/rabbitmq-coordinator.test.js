'use strict';

let mockChannel;
let getChannel, publishBlockConfirmed, consumeResults, consumeDLQ, EXCHANGES, QUEUES;

beforeEach(() => {
  jest.resetModules();

  mockChannel = {
    assertQueue: jest.fn().mockResolvedValue(),
    assertExchange: jest.fn().mockResolvedValue(),
    prefetch: jest.fn().mockResolvedValue(),
    sendToQueue: jest.fn(),
    publish: jest.fn(),
    consume: jest.fn().mockResolvedValue({ consumerTag: 'tag-123' }),
    bindQueue: jest.fn().mockResolvedValue(),
    ack: jest.fn(),
    nack: jest.fn(),
  };

  jest.doMock('../../shared/amqp', () => ({
    createChannel: jest.fn().mockResolvedValue({ channel: mockChannel, connection: {} }),
  }));

  ({ getChannel, publishBlockConfirmed, consumeResults, consumeDLQ, EXCHANGES, QUEUES } = require('../../coordinator/rabbitmq'));
});

describe('getChannel', () => {
  test('asserts block_confirmed fanout exchange', async () => {
    await getChannel();

    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      'block_confirmed', 'fanout', { durable: false }
    );
  });

  test('asserts mining_tasks, mining_results, and keepalive queues', async () => {
    await getChannel();

    expect(mockChannel.assertQueue).toHaveBeenCalledWith('mining_tasks', { durable: true });
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('mining_results', {
      durable: true,
      arguments: { 'x-dead-letter-exchange': 'dlx_mining' },
    });
    expect(mockChannel.assertQueue).toHaveBeenCalledWith('keepalive', {
      durable: false,
      arguments: { 'x-message-ttl': 30000 },
    });
  });

  test('returns the same channel on subsequent calls', async () => {
    const { createChannel } = require('../../shared/amqp');

    const ch1 = await getChannel();
    const ch2 = await getChannel();

    expect(ch1).toBe(ch2);
    expect(createChannel).toHaveBeenCalledTimes(1);
  });
});

describe('publishBlockConfirmed', () => {
  test('publishes block to block_confirmed exchange', async () => {
    const block = { block_hash: 'abc123', transactions: [] };
    await publishBlockConfirmed(block);

    expect(mockChannel.publish).toHaveBeenCalledWith(
      'block_confirmed',
      '',
      Buffer.from(JSON.stringify(block))
    );
  });
});

describe('consumeResults', () => {
  test('returns consumer tag from ch.consume', async () => {
    const handler = jest.fn();
    const result = await consumeResults(handler);

    expect(result).toEqual({ consumerTag: 'tag-123' });
  });

  test('consumes from mining_results queue', async () => {
    await consumeResults(jest.fn());

    expect(mockChannel.consume).toHaveBeenCalledWith(
      'mining_results',
      expect.any(Function),
      { noAck: false }
    );
  });
});

describe('getChannel - DLQ', () => {
  test('asserts dlx_mining direct exchange', async () => {
    await getChannel();
    expect(mockChannel.assertExchange).toHaveBeenCalledWith(
      'dlx_mining', 'direct', { durable: true }
    );
  });

  test('asserts mining_results_dlq queue', async () => {
    await getChannel();
    expect(mockChannel.assertQueue).toHaveBeenCalledWith(
      'mining_results_dlq', { durable: true }
    );
  });

  test('binds mining_results_dlq to dlx_mining exchange', async () => {
    await getChannel();
    expect(mockChannel.bindQueue).toHaveBeenCalledWith(
      'mining_results_dlq', 'dlx_mining', ''
    );
  });

  test('configures mining_results with dead letter exchange', async () => {
    await getChannel();
    expect(mockChannel.assertQueue).toHaveBeenCalledWith(
      'mining_results', {
        durable: true,
        arguments: { 'x-dead-letter-exchange': 'dlx_mining' },
      }
    );
  });
});

describe('consumeDLQ', () => {
  test('consumes from mining_results_dlq queue', async () => {
    await consumeDLQ(jest.fn());
    expect(mockChannel.consume).toHaveBeenCalledWith(
      'mining_results_dlq',
      expect.any(Function),
      { noAck: false }
    );
  });

  test('returns consumer tag', async () => {
    const result = await consumeDLQ(jest.fn());
    expect(result).toEqual({ consumerTag: 'tag-123' });
  });
});
