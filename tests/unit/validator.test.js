'use strict';

const crypto = require('crypto');

const { publicKey: mockPubKey, privateKey: mockPrivKey } = crypto.generateKeyPairSync('ed25519', {
  publicKeyEncoding: { type: 'spki', format: 'pem' },
  privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
});

jest.mock('../../shared/entity-keys', () => ({
  getPublicKey: (name) => {
    if (name === 'mina-san-juan') return mockPubKey;
    return null;
  },
  getPrivateKey: () => null,
  listEntities: () => ['mina-san-juan'],
}));

const { signTransaction } = require('../../shared/crypto');
const { validateTransaction } = require('../../validator/index');

function makeValidTx(overrides = {}) {
  const base = {
    id: 'tx-001',
    id_lote: 'lote-001',
    origen: 'mina-san-juan',
    destino: 'planta-neuquen',
    cantidad: 100,
    tipo: 'MINERAL',
    timestamp: '2026-06-14T12:00:00.000Z',
    ...overrides,
  };
  base.firma = signTransaction(base, mockPrivKey);
  return base;
}

describe('validateTransaction', () => {
  test('valid MINERAL transaction returns { valid: true, errors: [] }', () => {
    const tx = makeValidTx({ tipo: 'MINERAL' });
    expect(validateTransaction(tx)).toEqual({ valid: true, errors: [] });
  });

  test('valid CRUDO transaction returns { valid: true, errors: [] }', () => {
    const tx = makeValidTx({ tipo: 'CRUDO' });
    expect(validateTransaction(tx)).toEqual({ valid: true, errors: [] });
  });

  test('missing required field id is rejected', () => {
    const tx = makeValidTx();
    delete tx.id;
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id is required');
  });

  test('missing required field cantidad is rejected', () => {
    const tx = makeValidTx();
    delete tx.cantidad;
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cantidad is required');
  });

  test('cantidad = 0 is rejected', () => {
    const tx = makeValidTx({ cantidad: 0 });
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cantidad must be greater than 0');
  });

  test('cantidad = -5 is rejected', () => {
    const tx = makeValidTx({ cantidad: -5 });
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cantidad must be greater than 0');
  });

  test('tipo = "GAS" is rejected', () => {
    const tx = makeValidTx({ tipo: 'GAS' });
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tipo'))).toBe(true);
  });

  test('origen === destino is rejected', () => {
    const tx = makeValidTx({ origen: 'mina-san-juan', destino: 'mina-san-juan' });
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('origen and destino must be different');
  });

  test('tampered firma is rejected', () => {
    const tx = makeValidTx();
    tx.firma = 'AAAA' + tx.firma.slice(4);
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('invalid signature for origin entity');
  });

  test('missing firma is rejected', () => {
    const tx = makeValidTx();
    delete tx.firma;
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('firma is required');
  });

  test('unknown origin entity is rejected', () => {
    const tx = makeValidTx({ origen: 'unknown-entity' });
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('unknown origin entity');
  });

  test('multiple errors are all returned together', () => {
    const tx = {
      destino: 'X',
      origen: 'X',
      cantidad: -1,
      tipo: 'GAS',
      timestamp: new Date().toISOString(),
      firma: 'aabbcc',
    };
    const result = validateTransaction(tx);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
