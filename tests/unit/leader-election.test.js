'use strict';

jest.mock('ioredis');

const Redis = require('ioredis');
const { LeaderElection, deriveId } = require('../../coordinator/leader-election');

let mockRedis;
let mockSub;
let messageHandler;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  messageHandler = null;

  mockSub = {
    subscribe: jest.fn().mockResolvedValue(),
    on: jest.fn((event, handler) => {
      if (event === 'message') messageHandler = handler;
    }),
    unsubscribe: jest.fn().mockResolvedValue(),
    quit: jest.fn().mockResolvedValue(),
  };

  mockRedis = {
    get: jest.fn().mockResolvedValue(null),
    set: jest.fn().mockResolvedValue('OK'),
    publish: jest.fn().mockResolvedValue(1),
    duplicate: jest.fn(() => mockSub),
    quit: jest.fn().mockResolvedValue(),
  };

  Redis.mockImplementation(() => mockRedis);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('deriveId', () => {
  test('returns a positive number for any hostname', () => {
    const id = deriveId('node-abc-123');
    expect(typeof id).toBe('number');
    expect(id).toBeGreaterThanOrEqual(0);
  });

  test('returns deterministic results for the same hostname', () => {
    expect(deriveId('host-a')).toBe(deriveId('host-a'));
  });

  test('returns different ids for different hostnames', () => {
    expect(deriveId('host-a')).not.toBe(deriveId('host-b'));
  });
});

describe('LeaderElection', () => {
  test('constructor sets id from coordinatorId option', () => {
    const le = new LeaderElection({ coordinatorId: 42 });
    expect(le.id).toBe(42);
  });

  test('isLeader returns false initially', () => {
    const le = new LeaderElection({ coordinatorId: 1 });
    expect(le.isLeader()).toBe(false);
  });

  test('getLeaderId returns null initially', () => {
    const le = new LeaderElection({ coordinatorId: 1 });
    expect(le.getLeaderId()).toBeNull();
  });

  test('start subscribes to election channels', async () => {
    mockRedis.get.mockResolvedValue(null);
    const le = new LeaderElection({ coordinatorId: 10 });
    await le.start();

    expect(mockSub.subscribe).toHaveBeenCalledWith(
      'election:start', 'election:answer', 'election:victory'
    );

    await le.stop();
  });

  test('start uses existing leader when one is registered', async () => {
    mockRedis.get.mockResolvedValue('99');
    const le = new LeaderElection({ coordinatorId: 10 });
    await le.start();

    expect(le.getLeaderId()).toBe(99);
    expect(le.isLeader()).toBe(false);

    await le.stop();
  });

  test('becomes leader when no one answers election', async () => {
    mockRedis.get.mockResolvedValue(null);
    const le = new LeaderElection({ coordinatorId: 10 });

    const electedPromise = new Promise(resolve => le.on('elected', resolve));

    await le.start();

    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    await electedPromise;

    expect(le.isLeader()).toBe(true);
    expect(le.getLeaderId()).toBe(10);

    await le.stop();
  });

  test('emits leader-changed when becoming leader', async () => {
    mockRedis.get.mockResolvedValue(null);
    const le = new LeaderElection({ coordinatorId: 10 });

    const changedPromise = new Promise(resolve => le.on('leader-changed', resolve));

    await le.start();

    jest.advanceTimersByTime(3000);
    await Promise.resolve();
    const newLeader = await changedPromise;

    expect(newLeader).toBe(10);

    await le.stop();
  });

  test('responds to election:start from lower-id node', async () => {
    mockRedis.get.mockResolvedValue('10');
    const le = new LeaderElection({ coordinatorId: 50 });
    await le.start();

    messageHandler('election:start', JSON.stringify({ id: 5 }));

    expect(mockRedis.publish).toHaveBeenCalledWith(
      'election:answer',
      JSON.stringify({ id: 50, to: 5 })
    );

    await le.stop();
  });

  test('ignores election:start from higher-id node', async () => {
    mockRedis.get.mockResolvedValue('100');
    const le = new LeaderElection({ coordinatorId: 50 });
    await le.start();

    mockRedis.publish.mockClear();
    messageHandler('election:start', JSON.stringify({ id: 100 }));

    expect(mockRedis.publish).not.toHaveBeenCalledWith(
      'election:answer',
      expect.any(String)
    );

    await le.stop();
  });

  test('handles victory message from another node', async () => {
    mockRedis.get.mockResolvedValue(null);
    const le = new LeaderElection({ coordinatorId: 10 });
    const changedPromise = new Promise(resolve => le.on('leader-changed', resolve));

    await le.start();

    messageHandler('election:victory', JSON.stringify({ id: 99 }));
    const newLeader = await changedPromise;

    expect(newLeader).toBe(99);
    expect(le.isLeader()).toBe(false);
    expect(le.getLeaderId()).toBe(99);

    await le.stop();
  });

  test('emits demoted when leader receives victory from another', async () => {
    mockRedis.get.mockResolvedValue(null);
    const le = new LeaderElection({ coordinatorId: 10 });

    await le.start();
    jest.advanceTimersByTime(3000);
    await Promise.resolve();

    expect(le.isLeader()).toBe(true);

    const demotedPromise = new Promise(resolve => le.on('demoted', resolve));
    messageHandler('election:victory', JSON.stringify({ id: 99 }));
    await demotedPromise;

    expect(le.isLeader()).toBe(false);

    await le.stop();
  });

  test('stop cleans up timers and connections', async () => {
    mockRedis.get.mockResolvedValue(null);
    const le = new LeaderElection({ coordinatorId: 10 });
    await le.start();
    await le.stop();

    expect(mockSub.unsubscribe).toHaveBeenCalled();
    expect(mockSub.quit).toHaveBeenCalled();
    expect(mockRedis.quit).toHaveBeenCalled();
  });

  test('ignores malformed JSON messages', async () => {
    mockRedis.get.mockResolvedValue('10');
    const le = new LeaderElection({ coordinatorId: 50 });
    await le.start();

    expect(() => {
      messageHandler('election:start', 'not-json');
    }).not.toThrow();

    await le.stop();
  });
});
