'use strict';

const { spawn } = require('child_process');
const path = require('path');
const { createLogger } = require('../shared/logger');

const logger = createLogger('miner');

const WORKER_TYPE = process.env.WORKER_TYPE || 'CPU';

const CPU_BINARY =
  process.env.PILAR1_CPU_BINARY ||
  path.join(__dirname, '../../tpi/pilar1/Hit7/CPU/pow_cpu_range.js');

const GPU_BINARY =
  process.env.PILAR1_GPU_BINARY ||
  path.join(__dirname, '../../tpi/pilar1/Hit7/GPU/pow_gpu_range');

logger.info({ type: WORKER_TYPE }, 'Miner initialized');

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
    const isGpu = WORKER_TYPE === 'GPU';
    const binary = isGpu ? GPU_BINARY : CPU_BINARY;
    const args = isGpu
      ? [payload, difficulty, String(nonceStart), String(nonceEnd)]
      : [CPU_BINARY, payload, difficulty, String(nonceStart), String(nonceEnd)];
    const cmd = isGpu ? binary : 'node';

    const proc = spawn(cmd, args);

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

module.exports = { mine, WORKER_TYPE, CPU_BINARY, GPU_BINARY };
