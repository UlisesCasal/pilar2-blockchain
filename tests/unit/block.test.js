'use strict';

const { buildPayload, buildBlock } = require('../../shared/block');

const PREV_HASH = 'abc123prevhash';

const TX_SINGLE = {
  id: 'tx-1',
  id_lote: 'lote-42',
  origen: 'Buenos Aires',
  destino: 'Mendoza',
  cantidad: 500,
  tipo: 'MINERAL',
  timestamp: '2024-01-01T00:00:00.000Z',
  firma: 'somesig',
};

const TX_A = { id: 'tx-aaa', id_lote: 'lote-1', origen: 'A', destino: 'B', cantidad: 10, tipo: 'MINERAL', timestamp: '2024-01-01T00:00:00Z', firma: 'sig1' };
const TX_B = { id: 'tx-bbb', id_lote: 'lote-2', origen: 'C', destino: 'D', cantidad: 20, tipo: 'CRUDO',   timestamp: '2024-01-01T00:00:01Z', firma: 'sig2' };
const TX_C = { id: 'tx-zzz', id_lote: 'lote-3', origen: 'E', destino: 'F', cantidad: 30, tipo: 'MINERAL', timestamp: '2024-01-01T00:00:02Z', firma: 'sig3' };

describe('shared/block — buildPayload', () => {
  test('single tx: format is id_lote:origen->destino:cantidadtn:prevHash', () => {
    const result = buildPayload([TX_SINGLE], PREV_HASH);
    expect(result).toBe(`${TX_SINGLE.id_lote}:${TX_SINGLE.origen}->${TX_SINGLE.destino}:${TX_SINGLE.cantidad}tn:${PREV_HASH}`);
  });

  test('buildPayload is deterministic — same inputs always produce same output', () => {
    const r1 = buildPayload([TX_SINGLE], PREV_HASH);
    const r2 = buildPayload([TX_SINGLE], PREV_HASH);
    expect(r1).toBe(r2);
  });

  test('prevHash is always included in the output', () => {
    const result = buildPayload([TX_A, TX_B], PREV_HASH);
    expect(result).toContain(PREV_HASH);
  });

  test('multiple txs: uses stable sort by id and includes prevHash', () => {
    // Provide txs out of alphabetical order; result must be sorted by id
    const resultUnsorted = buildPayload([TX_C, TX_A, TX_B], PREV_HASH);
    const resultSorted   = buildPayload([TX_A, TX_B, TX_C], PREV_HASH);
    // Stable sort → same result regardless of input order
    expect(resultUnsorted).toBe(resultSorted);
    // Format: sorted ids joined by comma + :prevHash
    const sortedIds = [TX_A.id, TX_B.id, TX_C.id].sort((a, b) => a.localeCompare(b)).join(',');
    expect(resultSorted).toBe(`${sortedIds}:${PREV_HASH}`);
  });
});

describe('shared/block — buildBlock', () => {
  const TASK = {
    prev_hash: PREV_HASH,
    transactions: [TX_SINGLE],
  };
  const NONCE = 42;
  const BLOCK_HASH = '0000abcdef';

  test('buildBlock returns object with all required fields', () => {
    const block = buildBlock(TASK, NONCE, BLOCK_HASH);
    expect(block).toHaveProperty('previous_hash', PREV_HASH);
    expect(block).toHaveProperty('nonce', String(NONCE));
    expect(block).toHaveProperty('timestamp');
    expect(block).toHaveProperty('transactions', TASK.transactions);
    expect(block).toHaveProperty('block_hash', BLOCK_HASH);
  });

  test('buildBlock nonce is stored as string', () => {
    const block = buildBlock(TASK, 99, BLOCK_HASH);
    expect(typeof block.nonce).toBe('string');
  });

  test('buildBlock timestamp is an ISO 8601 string', () => {
    const block = buildBlock(TASK, NONCE, BLOCK_HASH);
    expect(() => new Date(block.timestamp).toISOString()).not.toThrow();
  });
});
