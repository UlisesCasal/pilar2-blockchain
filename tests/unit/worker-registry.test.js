'use strict';

const { makeRegistry } = require('../../pool/worker-registry');

describe('worker-registry', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  test('register then count() === 1', () => {
    const registry = makeRegistry({ ttlMs: 30000 });
    registry.register('worker-1', 'CPU');
    expect(registry.count()).toBe(1);
  });

  test('two distinct registers → count() === 2', () => {
    const registry = makeRegistry({ ttlMs: 30000 });
    registry.register('worker-1', 'CPU');
    registry.register('worker-2', 'GPU');
    expect(registry.count()).toBe(2);
  });

  test('after TTL elapsed worker is removed on count()', () => {
    const registry = makeRegistry({ ttlMs: 30000 });
    registry.register('worker-1', 'CPU');
    expect(registry.count()).toBe(1);

    // Advance time beyond TTL
    jest.advanceTimersByTime(31000);

    expect(registry.count()).toBe(0);
  });

  test('re-registering same id renews TTL (heartbeat renewal)', () => {
    const registry = makeRegistry({ ttlMs: 30000 });
    registry.register('worker-1', 'CPU');

    // Advance almost to TTL
    jest.advanceTimersByTime(25000);

    // Renew heartbeat
    registry.register('worker-1', 'CPU');

    // Advance another 25s (would have expired on old timestamp)
    jest.advanceTimersByTime(25000);

    // Should still be alive because heartbeat renewed
    expect(registry.count()).toBe(1);
  });

  test('expire() is called inside count() (eviction happens on count)', () => {
    const registry = makeRegistry({ ttlMs: 30000 });
    registry.register('stale-worker', 'CPU');
    registry.register('fresh-worker', 'CPU');

    // Advance time so stale-worker TTL would expire
    jest.advanceTimersByTime(31000);

    // Renew fresh-worker
    registry.register('fresh-worker', 'CPU');

    // count() must evict stale-worker and return 1
    expect(registry.count()).toBe(1);
  });

  test('getAll() returns array of worker objects with { id, type, lastSeen }', () => {
    const registry = makeRegistry({ ttlMs: 30000 });
    registry.register('worker-1', 'CPU');
    registry.register('worker-2', 'GPU');

    const all = registry.getAll();
    expect(all).toHaveLength(2);
    const cpu = all.find(w => w.id === 'worker-1');
    expect(cpu).toBeDefined();
    expect(cpu.type).toBe('CPU');
    expect(typeof cpu.lastSeen).toBe('number');
  });

  test('count({ type: "GPU" }) returns only GPU workers', () => {
    const registry = makeRegistry({ ttlMs: 30000 });
    registry.register('worker-1', 'CPU');
    registry.register('worker-2', 'GPU');
    registry.register('worker-3', 'GPU');

    expect(registry.count({ type: 'GPU' })).toBe(2);
    expect(registry.count({ type: 'CPU' })).toBe(1);
  });
});
