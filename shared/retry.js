'use strict';
const { createLogger } = require('./logger');
const logger = createLogger('retry');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function withRetry(fn, { maxRetries = 4, baseDelayMs = 1000 } = {}) {
  let lastError;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err;
      if (attempt < maxRetries) {
        const waitMs = baseDelayMs * Math.pow(2, attempt);
        logger.info('Attempt %d/%d, waiting %dms', attempt + 1, maxRetries, waitMs);
        await delay(waitMs);
      }
    }
  }
  throw lastError;
}

module.exports = { withRetry };
