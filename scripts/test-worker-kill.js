'use strict';

/**
 * test-worker-kill.js
 *
 * Orquestra una prueba de muerte de worker:
 * 1. Envía transacciones hasta disparar minería
 * 2. Detecta cuándo el worker toma la tarea (unacked > 0)
 * 3. Mata el worker en ese instante
 * 4. Inspecciona las colas para ver dónde quedó el mensaje
 * 5. Reporta el resultado
 *
 * Uso:
 *   node scripts/test-worker-kill.js
 *
 * Requisitos:
 *   - Stack levantado con `docker compose up -d --scale worker=1`
 *   - RabbitMQ management en localhost:15672
 */

const http = require('http');

// --- Config ---
const RABBITMQ_API = 'http://guest:guest@localhost:15672/api';
const POOL_URL = 'http://localhost:3001';
const COORDINATOR_URL = 'http://localhost:8080/api/coordinator';
const TX_COUNT = 3; // mandamos 3 para llegar rápido al threshold

// --- Helpers ---

function fetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isRabbit = url.includes('guest:guest');
    const opts = {
      hostname: u.hostname,
      port: u.port,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || { 'Content-Type': 'application/json' },
    };
    if (isRabbit) {
      opts.auth = 'guest:guest';
      opts.path = u.pathname + u.search + (u.hash || '');
      opts.hostname = 'localhost';
      opts.port = 15672;
    }
    if (options.body) {
      opts.headers['Content-Length'] = Buffer.byteLength(options.body);
    }

    const req = http.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function color(s, c) {
  const colors = { green: 32, red: 31, yellow: 33, cyan: 36, gray: 90 };
  return `\x1b[${colors[c] || 0}m${s}\x1b[0m`;
}

// --- RabbitMQ helpers ---

async function getQueue(name) {
  const res = await fetch(`${RABBITMQ_API}/queues/%2F/${name}`);
  if (res.status === 404) return null;
  return res.data;
}

async function getMessagesFromQueue(name, count = 5) {
  const body = JSON.stringify({
    count,
    ackmode: 'ack_requeue_true',
    encoding: 'auto',
    truncate: 500,
  });
  const res = await fetch(`${RABBITMQ_API}/queues/%2F/${name}/get`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body,
  });
  return res.data;
}

// --- Main ---

async function main() {
  console.log('\n' + color('═══════════════════════════════════════════════', 'cyan'));
  console.log(color('  🧪 Test: Muerte de worker durante minería', 'cyan'));
  console.log(color('═══════════════════════════════════════════════', 'cyan'));
  console.log();

  // --- Step 1: Verificar que los servicios estén arriba ---
  console.log(color('▸ [1/6] Verificando servicios...', 'yellow'));

  const { execSync } = require('child_process');
  try {
    const ps = execSync('docker compose ps --format "{{.Service}} {{.State}}"', { cwd: __dirname + '/..', encoding: 'utf8' });
    const lines = ps.trim().split('\n').filter(Boolean);
    console.log('  ' + lines.join('\n  '));
    const workerUp = lines.some(l => l.startsWith('worker ') && l.includes('running'));
    if (!workerUp) {
      console.log(color('  ✗ Worker no está corriendo. Levantalo:', 'red'));
      console.log('    docker compose up -d --scale worker=1');
      process.exit(1);
    }
  } catch (_) { /* sigue sin docker info */ }

  // Intentamos conectar al coordinator y pool con reintentos
  for (let attempt = 0; attempt < 10; attempt++) {
    try {
      if (attempt === 0) {
        const coordStatus = await fetch(`${COORDINATOR_URL}/status`);
        if (coordStatus.status !== 200) throw new Error(`status ${coordStatus.status}`);
        console.log('  ✓ Coordinator OK');
      }

      const poolStatus = await fetch(`${POOL_URL}/status`);
      if (poolStatus.status !== 200) throw new Error(`status ${poolStatus.status}`);
      console.log('  ✓ Pool OK');

      const rmqStatus = await getQueue('mining_tasks');
      if (!rmqStatus) throw new Error('mining_tasks no existe');
      console.log('  ✓ RabbitMQ OK');

      break; // todo OK
    } catch (err) {
      if (attempt === 9) {
        const msg = err?.message || err?.code || err?.stack || JSON.stringify(err);
        console.error(color(`  ✗ Error: ${msg}`, 'red'));
        console.log(color('\n  Revisá los logs:', 'yellow'));
        console.log('    docker compose logs pool --tail=10');
        console.log('    docker compose logs coordinator --tail=10');
        process.exit(1);
      }
      process.stdout.write('.');
      await sleep(2000);
    }
  }

  // --- Step 2: Ver estado inicial de colas ---
  console.log(color('\n▸ [2/6] Estado inicial de colas:', 'yellow'));

  const miningTasksBefore = await getQueue('mining_tasks');
  const dlqBefore = await getQueue('mining_results_dlq');
  console.log(`  mining_tasks:       ${color(miningTasksBefore?.messages || 0, 'gray')} mensajes`);
  console.log(`  mining_results_dlq: ${color(dlqBefore?.messages || 0, 'gray')} mensajes`);

  // --- Step 3: Mandar transacciones ---
  console.log(color(`\n▸ [3/6] Enviando ${TX_COUNT} transacciones...`, 'yellow'));

  const entities = [
    { origen: 'mina-san-juan', destino: 'planta-neuquen' },
    { origen: 'planta-neuquen', destino: 'refineria-bahia-blanca' },
    { origen: 'refineria-bahia-blanca', destino: 'terminal-puerto-rosario' },
  ];

  // Averiguar el último bloque para el prevHash (lo necesita el pool internamente)
  for (let i = 0; i < TX_COUNT; i++) {
    const tx = {
      id: `test-kill-${i + 1}`,
      id_lote: 'LOTE-TEST-KILL',
      origen: entities[i % entities.length].origen,
      destino: entities[i % entities.length].destino,
      cantidad: 100 + i * 10,
      tipo: i % 2 === 0 ? 'MINERAL' : 'CRUDO',
      timestamp: new Date().toISOString(),
      firma: '__unsigned__',
    };
    try {
      const res = await fetch(`${POOL_URL}/transaction`, {
        method: 'POST',
        body: JSON.stringify(tx),
      });
      const status = res.status === 201 ? '✓' : '✗';
      console.log(`  ${status} tx-${i + 1}: ${res.status} | pending: ${res.data?.pending || '?'} ${res.data?.mining_triggered ? '⚡ MINANDO' : ''}`);
    } catch (err) {
      console.error(`  ✗ tx-${i + 1}: ${err.message}`);
    }
  }

  // --- Step 4: Esperar a que el worker tome la tarea ---
  console.log(color('\n▸ [4/6] Esperando a que el worker tome la tarea...', 'yellow'));

  let attempts = 0;
  let workerKilled = false;
  while (attempts < 30) {
    const q = await getQueue('mining_tasks');
    if (!q) {
      console.log('  ⏳ Esperando RabbitMQ...');
      await sleep(500);
      attempts++;
      continue;
    }

    const unacked = q.messages_unacknowledged || 0;
    const ready = q.messages_ready || 0;
    const total = q.messages || 0;

    console.log(`  → ready: ${ready} | unacked: ${unacked} | total: ${total}`);

    if (unacked > 0 && !workerKilled) {
      // El worker AGARRÓ la tarea! Lo matamos ahora.
      console.log(color(`\n  🎯 Worker tomó la tarea (${unacked} unacked). MATANDO worker...`, 'red'));

      const { execSync } = require('child_process');
      try {
        execSync('docker compose kill worker', { stdio: 'pipe', cwd: __dirname + '/..' });
        console.log(color('  💀 Worker asesinado.', 'red'));
        workerKilled = true;
      } catch (err) {
        console.error(`  ✗ Error matando worker: ${err.message}`);
      }

      await sleep(2000);
      break;
    }

    if (total === 0 && workerKilled) {
      // Ya matamos al worker y no quedan mensajes — terminó
      break;
    }

    await sleep(500);
    attempts++;
  }

  if (!workerKilled) {
    console.log(color('\n  ⚠️  No se detectó unacked a tiempo. El worker minó muy rápido.', 'yellow'));
    console.log(color('  Sugerencia: aumentá DIFFICULTY a "00000" en el .env y rebuildéa', 'yellow'));
    console.log(color('  o reducí el scale del worker con --scale worker=1', 'yellow'));
  }

  // --- Step 5: Inspeccionar colas post-mortem ---
  console.log(color('\n▸ [5/6] Inspeccionando colas después de matar worker...', 'yellow'));

  await sleep(3000); // dar tiempo a RabbitMQ para re-encolar

  const miningTasksAfter = await getQueue('mining_tasks');
  const dlqAfter = await getQueue('mining_results_dlq');

  console.log(`\n  ${color('mining_tasks:', 'cyan')}`);
  console.log(`    Ready:  ${miningTasksAfter?.messages_ready || 0}`);
  console.log(`    Unacked: ${miningTasksAfter?.messages_unacknowledged || 0}`);
  console.log(`    Total:  ${color(miningTasksAfter?.messages || 0, miningTasksAfter?.messages > 0 ? 'yellow' : 'green')}`);

  console.log(`\n  ${color('mining_results_dlq:', 'cyan')}`);
  console.log(`    Total:  ${color(dlqAfter?.messages || 0, dlqAfter?.messages > 0 ? 'green' : 'gray')}`);

  // --- Step 6: Reporte final ---
  console.log(color('\n═══════════════════════════════════════════════', 'cyan'));
  console.log(color('  📋 REPORTE FINAL', 'cyan'));
  console.log(color('═══════════════════════════════════════════════', 'cyan'));
  console.log();

  if (workerKilled) {
    // Caso: worker muerto durante la tarea
    const tasksRequeued = miningTasksAfter?.messages_ready || 0;
    const dlqMessages = dlqAfter?.messages || 0;

    console.log(`  Worker muerto:             ${color('SI', 'red')}`);
    console.log(`  Tarea re-encolada:         ${tasksRequeued > 0 ? color('SI (ready > 0)', 'yellow') : color('NO', 'red')}`);
    console.log(`  Mensajes en DLQ:           ${dlqMessages > 0 ? color(`SI (${dlqMessages})`, 'green') : color('NO — mining_tasks no tiene DLQ ⚠️', 'red')}`);

    console.log();
    if (tasksRequeued > 0 && dlqMessages === 0) {
      console.log(color('  ⚠️  CONCLUSIÓN: mining_tasks NO tiene DLQ.', 'yellow'));
      console.log(color('     La tarea se re-encoló pero nunca va a una', 'yellow'));
      console.log(color('     cola de mensajes muertos. Si el worker', 'yellow'));
      console.log(color('     se cae repetidamente, la tarea se reintenta', 'yellow'));
      console.log(color('     indefinidamente sin registro.', 'yellow'));
    }
  } else {
    console.log(color('  El worker no se mató a tiempo.', 'yellow'));
    console.log(color('  La minería fue demasiado rápida con dificultad 0000.', 'yellow'));
    console.log();
    console.log(color('  Para alentar la prueba:', 'yellow'));
    console.log(color('  1. Cambiá DIFFICULTY=00000 en el .env', 'yellow'));
    console.log(color('  2. Reconstruí: docker compose up -d --build --scale worker=1', 'yellow'));
    console.log(color('  3. Ejecutá de nuevo: node scripts/test-worker-kill.js', 'yellow'));
  }

  console.log();
}

main().catch((err) => {
  console.error(color('Error fatal:', 'red'), err);
  process.exit(1);
});
