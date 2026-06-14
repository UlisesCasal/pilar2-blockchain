'use strict';

const { spawn } = require('child_process');
const path = require('path');

/**
 * Path to the Pilar 1 CPU PoW binary.
 * Override via PILAR1_CPU_BINARY environment variable.
 */
const BINARY =
  process.env.PILAR1_CPU_BINARY ||
  path.join(__dirname, '../../tpi/pilar1/Hit7/CPU/pow_cpu_range.js');

/**
 * Run the Pilar 1 PoW binary over the given nonce range.
 *
 * @param {object} params
 * @param {string} params.payload     - The payload string to hash
 * @param {string} params.difficulty  - Difficulty prefix (e.g. "0000")
 * @param {number} params.nonceStart  - Start of nonce range (inclusive)
 * @param {number} params.nonceEnd    - End of nonce range (inclusive)
 * @returns {Promise<{ found: boolean, nonce?: string, hash?: string }>}
 */
async function mine({ payload, difficulty, nonceStart, nonceEnd }) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [
      BINARY,
      payload,
      difficulty,
      String(nonceStart),
      String(nonceEnd),
    ]);

    let stdout = '';

    proc.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });

    // Suppress stderr noise — binary may print debug info to stderr
    proc.stderr.on('data', () => {});

    proc.on('error', reject);

    proc.on('close', () => {
      const lines = stdout
        .split('\n')
        .map((l) => l.trim())
        .filter(Boolean);

      // No output or first meaningful line is NOT FOUND
      if (!lines.length || lines[0] === 'NOT FOUND') {
        return resolve({ found: false });
      }

      const nonceLine = lines.find((l) => l.startsWith('Nonce:'));
      const hashLine = lines.find((l) => l.startsWith('Hash:'));

      // Defensive guard: malformed output → not found
      if (!nonceLine || !hashLine) {
        return resolve({ found: false });
      }

      resolve({
        found: true,
        nonce: nonceLine.split(':')[1].trim(),
        hash: hashLine.split(':')[1].trim(),
      });
    });
  });
}

module.exports = { mine };
