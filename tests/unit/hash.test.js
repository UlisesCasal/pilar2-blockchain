'use strict';

const { md5 } = require('../../shared/hash');

describe('shared/hash — md5 wrapper', () => {
  test('md5("") returns known empty-string digest', () => {
    expect(md5('')).toBe('d41d8cd98f00b204e9800998ecf8427e');
  });

  test('md5("hello") returns known digest', () => {
    expect(md5('hello')).toBe('5d41402abc4b2a76b9719d911017c592');
  });

  test('result is always lowercase hex of length 32', () => {
    const result = md5('arbitrary input 123');
    expect(result).toMatch(/^[0-9a-f]{32}$/);
  });

  test('same input always returns same output (pure)', () => {
    const input = 'deterministic';
    expect(md5(input)).toBe(md5(input));
  });
});
