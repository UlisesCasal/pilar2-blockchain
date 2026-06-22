'use strict';

const { withRetry } = require('../../shared/retry');

describe('withRetry', () => {
  test('resolves on first successful call', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 4, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  test('retries on failure then succeeds', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 4, baseDelayMs: 0 });
    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  test('throws after all retries exhausted', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('persistent'));
    await expect(
      withRetry(fn, { maxRetries: 3, baseDelayMs: 0 })
    ).rejects.toThrow('persistent');
    expect(fn).toHaveBeenCalledTimes(4);
  });

  test('calculates exponential delay correctly', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    const delays = [];
    const originalSetTimeout = global.setTimeout;
    jest.spyOn(global, 'setTimeout').mockImplementation((cb, ms) => {
      delays.push(ms);
      return originalSetTimeout(cb, 0);
    });

    await withRetry(fn, { maxRetries: 4, baseDelayMs: 1000 });

    expect(delays).toContain(1000);
    global.setTimeout.mockRestore();
  });

  test('respects maxRetries option', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('fail'));

    await expect(
      withRetry(fn, { maxRetries: 2, baseDelayMs: 0 })
    ).rejects.toThrow('fail');
    expect(fn).toHaveBeenCalledTimes(3);
  });
});
