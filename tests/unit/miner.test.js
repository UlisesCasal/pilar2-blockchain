'use strict';

/**
 * Unit tests for worker/miner.js
 *
 * STRICT TDD — RED phase: test file written before implementation.
 *
 * Uses jest's module mocking to intercept child_process.spawn so tests
 * run with zero I/O and zero dependency on the Pilar 1 binary.
 */

const EventEmitter = require('events');

// Mock child_process before requiring miner
jest.mock('child_process');
jest.mock('../../shared/logger', () => ({
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    trace: jest.fn(),
    bindings: () => ({}),
  }),
}));
const { spawn } = require('child_process');

const { mine } = require('../../worker/miner');

/**
 * Build a fake child_process returned by spawn.
 * stdout and the proc itself are EventEmitters.
 */
function makeProc(stdoutData, options = {}) {
  const proc = new EventEmitter();
  proc.stdout = new EventEmitter();
  proc.stderr = new EventEmitter();

  if (!options.suppressAutoEmit) {
    // Emit stdout data and then close asynchronously
    setImmediate(() => {
      if (stdoutData !== undefined) {
        proc.stdout.emit('data', stdoutData);
      }
      if (options.errorEvent) {
        proc.emit('error', options.errorEvent);
      } else {
        proc.emit('close', 0);
      }
    });
  }

  return proc;
}

describe('worker/miner', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  test('resolves { found: true } when stdout contains Nonce and Hash lines', async () => {
    const stdout = 'Nonce:   48291\nHash:     0000f4a2c3b1e5d6\n';
    spawn.mockReturnValue(makeProc(stdout));

    const result = await mine({
      payload: 'abc',
      difficulty: '0000',
      nonceStart: 0,
      nonceEnd: 100000,
    });

    expect(result).toEqual({
      found: true,
      nonce: '48291',
      hash: '0000f4a2c3b1e5d6',
    });
  });

  test('resolves { found: false } when stdout starts with NOT FOUND', async () => {
    spawn.mockReturnValue(makeProc('NOT FOUND\n'));

    const result = await mine({
      payload: 'abc',
      difficulty: '0000',
      nonceStart: 0,
      nonceEnd: 100000,
    });

    expect(result).toEqual({ found: false });
  });

  test('rejects when spawn emits an error event', async () => {
    const boom = new Error('spawn ENOENT');
    const proc = makeProc(undefined, { errorEvent: boom });
    spawn.mockReturnValue(proc);

    await expect(
      mine({ payload: 'abc', difficulty: '0000', nonceStart: 0, nonceEnd: 100000 })
    ).rejects.toThrow('spawn ENOENT');
  });

  test('parses Nonce and Hash correctly even when surrounded by other text', async () => {
    // Output contains extra lines; parser must find Nonce: and Hash: anywhere
    const stdout = [
      'Starting search...',
      '  Nonce:   99999  ',
      '  Hash:     0000deadbeef  ',
      'Done.',
    ].join('\n');

    spawn.mockReturnValue(makeProc(stdout));

    const result = await mine({
      payload: 'xyz',
      difficulty: '0000',
      nonceStart: 0,
      nonceEnd: 999999,
    });

    expect(result).toEqual({
      found: true,
      nonce: '99999',
      hash: '0000deadbeef',
    });
  });

  test('CPU mode spawns node with CPU_BINARY', async () => {
    const stdout = 'Nonce: 123\nHash: 0000abc\n';
    spawn.mockReturnValue(makeProc(stdout));

    await mine({
      payload: 'test',
      difficulty: '0000',
      nonceStart: 0,
      nonceEnd: 100,
    });

    expect(spawn).toHaveBeenCalledWith(
      'node',
      expect.arrayContaining(['test', '0000', '0', '100'])
    );
  });

  test('GPU mode spawns the GPU binary directly', async () => {
    process.env.WORKER_TYPE = 'GPU';
    process.env.PILAR1_GPU_BINARY = '/usr/local/bin/pow_gpu';
    jest.resetModules();

    jest.mock('child_process');
    const cpGpu = require('child_process');
    const { mine: mineGpu } = require('../../worker/miner');

    const stdout = 'Nonce: 456\nHash: 0000def\n';
    cpGpu.spawn.mockReturnValue(makeProc(stdout));

    await mineGpu({
      payload: 'test',
      difficulty: '0000',
      nonceStart: 0,
      nonceEnd: 100,
    });

    expect(cpGpu.spawn).toHaveBeenCalledWith(
      '/usr/local/bin/pow_gpu',
      ['test', '0000', '0', '100']
    );

    delete process.env.WORKER_TYPE;
    delete process.env.PILAR1_GPU_BINARY;
  });
});
