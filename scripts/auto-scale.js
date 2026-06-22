'use strict';

const POOL_URL = process.env.POOL_URL || 'http://localhost:3001';
const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS || '10000', 10);

async function checkScaleStatus() {
  try {
    const res = await fetch(`${POOL_URL}/scale/status`);
    const status = await res.json();

    if (status.scale_needed) {
      console.log(
        '[auto-scale] Scale needed — would scale up workers. Active: %d, CPU: %d, GPU: %d',
        status.active_workers,
        status.cpu_workers,
        status.gpu_workers
      );
    } else {
      console.log(
        '[auto-scale] Workers healthy. Active: %d, CPU: %d, GPU: %d',
        status.active_workers,
        status.cpu_workers,
        status.gpu_workers
      );
    }
  } catch (err) {
    console.error('[auto-scale] Failed to reach pool:', err.message);
  }
}

console.log('[auto-scale] Polling %s every %dms', POOL_URL, POLL_INTERVAL_MS);
checkScaleStatus();
setInterval(checkScaleStatus, POLL_INTERVAL_MS);
