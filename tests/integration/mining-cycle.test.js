'use strict';

/**
 * Integration test: full mining cycle
 *
 * Requires: docker compose -f docker-compose.test.yml up -d
 * Then start all services locally:
 *   SERVICE=validator node entrypoint.js &
 *   SERVICE=coordinator node entrypoint.js &
 *   SERVICE=pool node entrypoint.js &
 *   SERVICE=worker node entrypoint.js &
 *
 * Or use the full docker-compose.yml stack:
 *   docker compose up
 *
 * Run with: INTEGRATION=true npx jest tests/integration
 *
 * Not included in the default unit test suite.
 */

const http = require('http');

const COORDINATOR_URL = process.env.COORDINATOR_URL || 'http://localhost:3000';
const POOL_URL = process.env.POOL_URL || 'http://localhost:3001';
const HMAC_SECRET = process.env.HMAC_SECRET || 'change-me-in-production';

// Skip all integration tests unless INTEGRATION=true
const describeIf = process.env.INTEGRATION === 'true' ? describe : describe.skip;

/**
 * POST JSON to a URL, returns parsed response body.
 */
function postJSON(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const parsed = new URL(url);
    const options = {
      hostname: parsed.hostname,
      port: parsed.port || 80,
      path: parsed.pathname,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(data),
      },
    };

    const req = http.request(options, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });

    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

/**
 * GET JSON from a URL, returns parsed response body.
 */
function getJSON(url) {
  return new Promise((resolve, reject) => {
    const req = http.get(url, (res) => {
      let raw = '';
      res.on('data', (chunk) => { raw += chunk; });
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, body: JSON.parse(raw) });
        } catch (e) {
          resolve({ status: res.statusCode, body: raw });
        }
      });
    });
    req.on('error', reject);
  });
}

/**
 * Poll a URL until predicate returns true or timeout is exceeded.
 */
async function pollUntil(url, predicate, { intervalMs = 2000, timeoutMs = 60000 } = {}) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await getJSON(url);
    if (predicate(res)) return res;
    await new Promise((r) => setTimeout(r, intervalMs));
  }
  throw new Error(`Timed out polling ${url} after ${timeoutMs}ms`);
}

/**
 * Build a minimal valid transaction signed with HMAC.
 */
function buildTransaction(index) {
  const crypto = require('crypto');
  const tx = {
    id: `tx-integration-${index}-${Date.now()}`,
    id_lote: `lote-${index}`,
    origen: 'NodeA',
    destino: 'NodeB',
    cantidad: 1 + index,
    tipo: 'MINERAL',
    timestamp: new Date().toISOString(),
  };
  // Canonical payload excludes firma — matches shared/hmac.js signing convention
  const payload = JSON.stringify(tx);
  tx.firma = crypto.createHmac('sha256', HMAC_SECRET).update(payload).digest('hex');
  return tx;
}

describeIf('Full mining cycle (integration)', () => {
  test('10 valid transactions trigger block confirmation', async () => {
    const THRESHOLD = parseInt(process.env.BLOCK_THRESHOLD || '10', 10);

    // Send THRESHOLD valid transactions to the pool
    for (let i = 0; i < THRESHOLD; i++) {
      const tx = buildTransaction(i);
      const res = await postJSON(`${POOL_URL}/transaction`, tx);
      expect(res.status).toBe(200);
    }

    // Poll coordinator /status until chain_length >= 1 (block confirmed)
    const statusRes = await pollUntil(
      `${COORDINATOR_URL}/status`,
      (res) => res.body && res.body.chain_length >= 1,
      { intervalMs: 2000, timeoutMs: 60000 }
    );

    expect(statusRes.body.chain_length).toBeGreaterThanOrEqual(1);

    // Verify the last block has all required Redis HASH fields
    const lastBlock = statusRes.body.last_block;
    expect(lastBlock).toBeDefined();
    expect(lastBlock).toHaveProperty('previous_hash');
    expect(lastBlock).toHaveProperty('nonce');
    expect(lastBlock).toHaveProperty('timestamp');
    expect(lastBlock).toHaveProperty('transactions');
    expect(lastBlock).toHaveProperty('block_hash');
  }, 60000);
});
