'use strict';

const crypto = require('crypto');
const { signTransaction, verifySignature, canonicalize } = require('../../shared/crypto');

const { publicKey: PUBLIC_KEY, privateKey: PRIVATE_KEY } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const { publicKey: OTHER_PUBLIC_KEY } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

const TX = {
  id: 'tx-001',
  id_lote: 'lote-001',
  origen: 'mina-san-juan',
  destino: 'planta-neuquen',
  cantidad: 100,
  tipo: 'MINERAL',
  timestamp: '2026-06-14T12:00:00.000Z',
};

describe('shared/crypto — signTransaction', () => {
  test('returns a base64 string', () => {
    const sig = signTransaction(TX, PRIVATE_KEY);
    expect(typeof sig).toBe('string');
    expect(() => Buffer.from(sig, 'base64')).not.toThrow();
  });

  test('is deterministic — same input always same output', () => {
    expect(signTransaction(TX, PRIVATE_KEY)).toBe(signTransaction(TX, PRIVATE_KEY));
  });
});

describe('shared/crypto — verifySignature', () => {
  test('returns true for a correct signature', () => {
    const sig = signTransaction(TX, PRIVATE_KEY);
    expect(verifySignature(TX, sig, PUBLIC_KEY)).toBe(true);
  });

  test('returns false with wrong public key', () => {
    const sig = signTransaction(TX, PRIVATE_KEY);
    expect(verifySignature(TX, sig, OTHER_PUBLIC_KEY)).toBe(false);
  });

  test('returns false with tampered transaction', () => {
    const sig = signTransaction(TX, PRIVATE_KEY);
    const tampered = { ...TX, cantidad: 999 };
    expect(verifySignature(tampered, sig, PUBLIC_KEY)).toBe(false);
  });

  test('returns false for garbage signature without throwing', () => {
    expect(verifySignature(TX, 'not-a-real-signature', PUBLIC_KEY)).toBe(false);
  });
});

describe('shared/crypto — canonicalize', () => {
  test('produces consistent JSON regardless of input key order', () => {
    const tx1 = { id: '1', id_lote: 'L', origen: 'A', destino: 'B', cantidad: 10, tipo: 'MINERAL', timestamp: 'T' };
    const tx2 = { timestamp: 'T', tipo: 'MINERAL', cantidad: 10, destino: 'B', origen: 'A', id_lote: 'L', id: '1' };
    expect(canonicalize(tx1)).toBe(canonicalize(tx2));
  });

  test('excludes firma field', () => {
    const txWithFirma = { ...TX, firma: 'should-be-excluded' };
    expect(canonicalize(txWithFirma)).toBe(canonicalize(TX));
  });
});
