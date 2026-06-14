'use strict';

const { sign, verify } = require('../../shared/hmac');

const SECRET = 'test-secret';
const PAYLOAD = 'test-payload-data';

describe('shared/hmac — sign', () => {
  test('sign returns a hex string of length 64', () => {
    const sig = sign(PAYLOAD, SECRET);
    expect(typeof sig).toBe('string');
    expect(sig).toMatch(/^[0-9a-f]{64}$/);
  });

  test('sign is deterministic — same input always same output', () => {
    expect(sign(PAYLOAD, SECRET)).toBe(sign(PAYLOAD, SECRET));
  });
});

describe('shared/hmac — verify', () => {
  test('verify returns true for a correct signature', () => {
    const sig = sign(PAYLOAD, SECRET);
    expect(verify(PAYLOAD, sig, SECRET)).toBe(true);
  });

  test('verify returns false for a tampered payload', () => {
    const sig = sign(PAYLOAD, SECRET);
    expect(verify(PAYLOAD + '-tampered', sig, SECRET)).toBe(false);
  });

  test('verify returns false for a wrong secret', () => {
    const sig = sign(PAYLOAD, SECRET);
    expect(verify(PAYLOAD, sig, 'wrong-secret')).toBe(false);
  });

  test('verify handles mismatched-length signatures without throwing', () => {
    expect(() => verify(PAYLOAD, 'tooshort', SECRET)).not.toThrow();
    expect(verify(PAYLOAD, 'tooshort', SECRET)).toBe(false);
  });
});
