'use strict';

describe('shared/logger', () => {
  afterEach(() => {
    jest.resetModules();
  });

  test('createLogger returns a pino instance with the given name', () => {
    const { createLogger } = require('../../shared/logger');
    const logger = createLogger('test-service');

    expect(typeof logger.info).toBe('function');
    expect(typeof logger.error).toBe('function');
    expect(typeof logger.warn).toBe('function');
  });

  test('logger has the correct name in bindings', () => {
    const { createLogger } = require('../../shared/logger');
    const logger = createLogger('my-service');

    expect(logger.bindings().name).toBe('my-service');
  });

  test('respects LOG_LEVEL environment variable', () => {
    process.env.LOG_LEVEL = 'warn';
    jest.resetModules();

    const { createLogger } = require('../../shared/logger');
    const logger = createLogger('level-test');

    expect(logger.level).toBe('warn');

    delete process.env.LOG_LEVEL;
  });

  test('info call does not throw', () => {
    const { createLogger } = require('../../shared/logger');
    const logger = createLogger('no-throw');

    expect(() => logger.info('test message')).not.toThrow();
  });
});
