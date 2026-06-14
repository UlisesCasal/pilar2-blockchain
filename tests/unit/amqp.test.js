'use strict';

// RED phase: shared/amqp.js does not exist yet

jest.mock('amqplib');

const amqplib = require('amqplib');
const { createChannel } = require('../../shared/amqp');

beforeEach(() => {
  jest.clearAllMocks();
});

describe('createChannel', () => {
  // 1. Resolves with { channel, connection } on first try
  test('resolves with { channel, connection } on first try', async () => {
    const fakeChannel = {};
    const fakeConnection = { createChannel: jest.fn().mockResolvedValue(fakeChannel) };
    amqplib.connect.mockResolvedValue(fakeConnection);

    const result = await createChannel('amqp://localhost', { maxRetries: 3, baseDelayMs: 0 });

    expect(result).toEqual({ channel: fakeChannel, connection: fakeConnection });
    expect(amqplib.connect).toHaveBeenCalledTimes(1);
  });

  // 2. Retries on connection failure — mock first call throws, second succeeds
  test('retries on connection failure and succeeds on second attempt', async () => {
    const fakeChannel = {};
    const fakeConnection = { createChannel: jest.fn().mockResolvedValue(fakeChannel) };

    amqplib.connect
      .mockRejectedValueOnce(new Error('ECONNREFUSED'))
      .mockResolvedValue(fakeConnection);

    const result = await createChannel('amqp://localhost', { maxRetries: 3, baseDelayMs: 0 });

    expect(result).toEqual({ channel: fakeChannel, connection: fakeConnection });
    expect(amqplib.connect).toHaveBeenCalledTimes(2);
  });

  // 3. Rejects after max retries exceeded
  test('rejects after maxRetries is exceeded', async () => {
    const connectionError = new Error('ECONNREFUSED');
    amqplib.connect.mockRejectedValue(connectionError);

    await expect(
      createChannel('amqp://localhost', { maxRetries: 3, baseDelayMs: 0 })
    ).rejects.toThrow('ECONNREFUSED');

    expect(amqplib.connect).toHaveBeenCalledTimes(3);
  });
});
