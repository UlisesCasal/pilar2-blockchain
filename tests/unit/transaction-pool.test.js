'use strict';

const { makePool } = require('../../pool/transaction-pool');

describe('transaction-pool', () => {
  let pool;

  beforeEach(() => {
    // Fresh pool for each test — no shared state
    pool = makePool();
  });

  test('add(tx) then size() === 1', () => {
    pool.add({ id: 'tx-1' });
    expect(pool.size()).toBe(1);
  });

  test('multiple adds accumulate correctly', () => {
    pool.add({ id: 'tx-1' });
    pool.add({ id: 'tx-2' });
    pool.add({ id: 'tx-3' });
    expect(pool.size()).toBe(3);
  });

  test('flush() returns all pending transactions', () => {
    const tx1 = { id: 'tx-1' };
    const tx2 = { id: 'tx-2' };
    pool.add(tx1);
    pool.add(tx2);

    const batch = pool.flush();
    expect(batch).toHaveLength(2);
    expect(batch).toContainEqual(tx1);
    expect(batch).toContainEqual(tx2);
  });

  test('flush() clears the pool — size() returns 0 after flush', () => {
    pool.add({ id: 'tx-1' });
    pool.add({ id: 'tx-2' });
    pool.flush();
    expect(pool.size()).toBe(0);
  });

  test('flush() on empty pool returns []', () => {
    const batch = pool.flush();
    expect(batch).toEqual([]);
  });
});
