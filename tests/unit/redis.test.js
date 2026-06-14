'use strict';

// RED phase: coordinator/redis.js does not exist yet

jest.mock('ioredis');

const Redis = require('ioredis');

// Build the mock instance that ioredis constructor returns
const mockRedis = {
  hset: jest.fn(),
  rpush: jest.fn(),
  lrange: jest.fn(),
  hgetall: jest.fn(),
  set: jest.fn(),
};

Redis.mockImplementation(() => mockRedis);

// Require after mock is configured
let storeBlock, getChain, getBlock, acquireLock;

beforeAll(() => {
  ({ storeBlock, getChain, getBlock, acquireLock } = require('../../coordinator/redis'));
});

beforeEach(() => {
  jest.clearAllMocks();
});

describe('storeBlock', () => {
  const block = {
    previous_hash: '0000000000000000000000000000000000000000',
    nonce: '42',
    timestamp: '2024-01-01T00:00:00.000Z',
    transactions: [{ id: 'tx-1' }],
    block_hash: 'abc123',
  };

  // 1. storeBlock stores hash fields in Redis at key block:<block_hash>
  test('calls HSET with correct key and fields', async () => {
    mockRedis.hset.mockResolvedValue(1);
    mockRedis.rpush.mockResolvedValue(1);

    await storeBlock(block);

    expect(mockRedis.hset).toHaveBeenCalledWith(
      'block:abc123',
      'previous_hash', block.previous_hash,
      'nonce', block.nonce,
      'timestamp', block.timestamp,
      'transactions', JSON.stringify(block.transactions),
      'block_hash', block.block_hash
    );
  });

  // 2. storeBlock also RPUSHes block_hash to `chain` list
  test('calls RPUSH to append block_hash to chain list', async () => {
    mockRedis.hset.mockResolvedValue(1);
    mockRedis.rpush.mockResolvedValue(1);

    await storeBlock(block);

    expect(mockRedis.rpush).toHaveBeenCalledWith('chain', 'abc123');
  });
});

describe('getChain', () => {
  // 3. getChain() returns array of block objects in order
  test('returns array of hydrated block objects in insertion order', async () => {
    const block1 = {
      previous_hash: '0'.repeat(32),
      nonce: '0',
      timestamp: '2024-01-01T00:00:00.000Z',
      transactions: '[]',
      block_hash: 'hash1',
    };
    const block2 = {
      previous_hash: 'hash1',
      nonce: '7',
      timestamp: '2024-01-01T00:01:00.000Z',
      transactions: '[{"id":"tx-1"}]',
      block_hash: 'hash2',
    };

    mockRedis.lrange.mockResolvedValue(['hash1', 'hash2']);
    mockRedis.hgetall
      .mockResolvedValueOnce(block1)
      .mockResolvedValueOnce(block2);

    const chain = await getChain();

    expect(chain).toHaveLength(2);
    expect(chain[0].block_hash).toBe('hash1');
    expect(chain[1].block_hash).toBe('hash2');
    // transactions are parsed from JSON string
    expect(chain[0].transactions).toEqual([]);
    expect(chain[1].transactions).toEqual([{ id: 'tx-1' }]);
  });

  // 4. getChain() returns [] when chain is empty
  test('returns empty array when chain list is empty', async () => {
    mockRedis.lrange.mockResolvedValue([]);

    const chain = await getChain();

    expect(chain).toEqual([]);
  });
});

describe('getBlock', () => {
  // 5. getBlock(hash) returns block object when found
  test('returns hydrated block object when hash is found', async () => {
    const raw = {
      previous_hash: '0'.repeat(32),
      nonce: '0',
      timestamp: '2024-01-01T00:00:00.000Z',
      transactions: '[{"id":"tx-1"}]',
      block_hash: 'abc123',
    };
    mockRedis.hgetall.mockResolvedValue(raw);

    const block = await getBlock('abc123');

    expect(block).not.toBeNull();
    expect(block.block_hash).toBe('abc123');
    expect(block.transactions).toEqual([{ id: 'tx-1' }]);
  });

  // 6. getBlock(hash) returns null when not found
  test('returns null when hash is not found', async () => {
    mockRedis.hgetall.mockResolvedValue({});

    const block = await getBlock('nonexistent');

    expect(block).toBeNull();
  });
});

describe('acquireLock', () => {
  // 7. acquireLock(prevHash) returns true when SET NX succeeds
  test('returns true when Redis SET NX returns OK', async () => {
    mockRedis.set.mockResolvedValue('OK');

    const result = await acquireLock('prevHash123');

    expect(result).toBe(true);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'lock:prevHash123', '1', 'NX', 'EX', expect.any(Number)
    );
  });

  // 8. acquireLock(prevHash) returns false when key already exists
  test('returns false when Redis SET NX returns null (key already exists)', async () => {
    mockRedis.set.mockResolvedValue(null);

    const result = await acquireLock('prevHash123');

    expect(result).toBe(false);
  });
});
