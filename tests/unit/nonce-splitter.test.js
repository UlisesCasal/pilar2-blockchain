'use strict';

const { split, MAX_NONCE } = require('../../pool/nonce-splitter');

describe('nonce-splitter', () => {
  describe('MAX_NONCE', () => {
    test('is Number.MAX_SAFE_INTEGER', () => {
      expect(MAX_NONCE).toBe(Number.MAX_SAFE_INTEGER);
    });
  });

  describe('split(1)', () => {
    test('returns single range covering [0, MAX_SAFE_INTEGER]', () => {
      const ranges = split(1);
      expect(ranges).toHaveLength(1);
      expect(ranges[0]).toEqual({ start: 0, end: Number.MAX_SAFE_INTEGER });
    });
  });

  describe('split(2)', () => {
    test('returns two non-overlapping contiguous ranges that together cover [0, MAX_SAFE_INTEGER]', () => {
      const ranges = split(2);
      expect(ranges).toHaveLength(2);

      // First range starts at 0
      expect(ranges[0].start).toBe(0);
      // Last range ends at MAX_SAFE_INTEGER
      expect(ranges[1].end).toBe(Number.MAX_SAFE_INTEGER);

      // Contiguous: each range[i].end + 1 === range[i+1].start
      expect(ranges[0].end + 1).toBe(ranges[1].start);

      // Non-overlapping
      expect(ranges[0].end).toBeLessThan(ranges[1].start);
    });
  });

  describe('split(3)', () => {
    test('returns three ranges with no gaps and no overlaps', () => {
      const ranges = split(3);
      expect(ranges).toHaveLength(3);

      // Starts at 0
      expect(ranges[0].start).toBe(0);
      // Last ends at MAX_SAFE_INTEGER
      expect(ranges[2].end).toBe(Number.MAX_SAFE_INTEGER);

      // Contiguous
      expect(ranges[0].end + 1).toBe(ranges[1].start);
      expect(ranges[1].end + 1).toBe(ranges[2].start);
    });

    test('all range values are safe integers', () => {
      const ranges = split(3);
      for (const r of ranges) {
        expect(Number.isSafeInteger(r.start)).toBe(true);
        expect(Number.isSafeInteger(r.end)).toBe(true);
      }
    });
  });

  describe('guard cases', () => {
    test('split(0) returns empty array', () => {
      const ranges = split(0);
      expect(ranges).toEqual([]);
    });

    test('split(-1) returns empty array', () => {
      const ranges = split(-1);
      expect(ranges).toEqual([]);
    });
  });

  describe('general invariants', () => {
    test('ranges are exactly N entries for arbitrary N', () => {
      [1, 2, 3, 4, 5, 10].forEach(n => {
        const ranges = split(n);
        expect(ranges).toHaveLength(n);
      });
    });

    test('all ranges together cover full [0, MAX_SAFE_INTEGER] with no gaps', () => {
      const ranges = split(4);
      expect(ranges[0].start).toBe(0);
      expect(ranges[ranges.length - 1].end).toBe(Number.MAX_SAFE_INTEGER);
      for (let i = 0; i < ranges.length - 1; i++) {
        expect(ranges[i].end + 1).toBe(ranges[i + 1].start);
      }
    });
  });
});
