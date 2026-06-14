'use strict';

const MAX_NONCE = Number.MAX_SAFE_INTEGER; // 9007199254740991

/**
 * Split the full nonce space [0, MAX_SAFE_INTEGER] into N contiguous,
 * non-overlapping ranges. The last range absorbs any remainder.
 *
 * @param {number} workerCount - Number of workers (>= 1)
 * @returns {{ start: number, end: number }[]} Array of N range objects, or [] if workerCount <= 0
 */
function split(workerCount) {
  if (workerCount <= 0) return [];

  const size = Math.floor(MAX_NONCE / workerCount);

  return Array.from({ length: workerCount }, (_, i) => ({
    start: i * size,
    end: i === workerCount - 1 ? MAX_NONCE : (i + 1) * size - 1,
  }));
}

module.exports = { split, MAX_NONCE };
