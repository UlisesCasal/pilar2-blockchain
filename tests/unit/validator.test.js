'use strict';

const crypto = require('crypto');

// RED phase: validator/index.js does not exist yet — all tests should fail

let validateTransaction;

beforeAll(() => {
  validateTransaction = require('../../validator/index').validateTransaction;
});

// Helper: build a fully valid transaction with correct HMAC signature
function makeValidTx(overrides = {}) {
  const secret = 'test-secret';
  const base = {
    id: 'tx-001',
    id_lote: 'lote-001',
    origen: 'empresa_A',
    destino: 'empresa_B',
    cantidad: 100,
    tipo: 'MINERAL',
    timestamp: new Date().toISOString(),
    ...overrides,
  };
  const payload = `${base.id_lote}:${base.origen}:${base.destino}:${base.cantidad}:${base.tipo}`;
  const firma = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return { ...base, firma };
}

describe('validateTransaction', () => {
  const secret = 'test-secret';

  // 1. Valid MINERAL transaction
  test('valid MINERAL transaction returns { valid: true, errors: [] }', () => {
    const tx = makeValidTx({ tipo: 'MINERAL' });
    const result = validateTransaction(tx, secret);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  // 2. Valid CRUDO transaction
  test('valid CRUDO transaction returns { valid: true, errors: [] }', () => {
    const tx = makeValidTx({ tipo: 'CRUDO' });
    // Re-sign with CRUDO tipo
    const payload = `${tx.id_lote}:${tx.origen}:${tx.destino}:${tx.cantidad}:CRUDO`;
    tx.firma = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    const result = validateTransaction(tx, secret);
    expect(result).toEqual({ valid: true, errors: [] });
  });

  // 3. Missing required field `id`
  test('missing required field id returns { valid: false, errors: ["id is required"] }', () => {
    const tx = makeValidTx();
    delete tx.id;
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('id is required');
  });

  // 4. Missing required field `cantidad`
  test('missing required field cantidad is rejected', () => {
    const tx = makeValidTx();
    delete tx.cantidad;
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cantidad is required');
  });

  // 5. cantidad = 0
  test('cantidad = 0 returns { valid: false, errors containing cantidad }', () => {
    const tx = makeValidTx({ cantidad: 0 });
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cantidad must be greater than 0');
  });

  // 6. cantidad = -5
  test('cantidad = -5 is rejected', () => {
    const tx = makeValidTx({ cantidad: -5 });
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('cantidad must be greater than 0');
  });

  // 7. tipo = 'GAS' (not in VALID_TYPES)
  test('tipo = "GAS" returns { valid: false, errors containing tipo }', () => {
    const tx = makeValidTx({ tipo: 'GAS' });
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    expect(result.errors.some(e => e.includes('tipo'))).toBe(true);
  });

  // 8. origen === destino
  test('origen === destino returns { valid: false, errors containing origen/destino }', () => {
    const tx = makeValidTx({ origen: 'empresa_A', destino: 'empresa_A' });
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('origen and destino must be different');
  });

  // 9. firma tampered
  test('tampered firma returns { valid: false, errors: ["firma is invalid"] }', () => {
    const tx = makeValidTx();
    tx.firma = 'deadbeef'.repeat(8); // wrong signature, same length
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('firma is invalid');
  });

  // 10. firma missing
  test('missing firma is rejected', () => {
    const tx = makeValidTx();
    delete tx.firma;
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('firma is required');
  });

  // 11. Multiple errors at once — returns ALL errors, not just first
  test('multiple errors are all returned together', () => {
    const tx = {
      // missing id, id_lote; cantidad = -1; tipo = 'GAS'; origen === destino
      destino: 'X',
      origen: 'X',
      cantidad: -1,
      tipo: 'GAS',
      timestamp: new Date().toISOString(),
      firma: 'aabbcc',
    };
    const result = validateTransaction(tx, secret);
    expect(result.valid).toBe(false);
    // Should have errors for: id, id_lote, cantidad, tipo, origen/destino
    expect(result.errors.length).toBeGreaterThanOrEqual(4);
  });
});
