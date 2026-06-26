#!/usr/bin/env node
'use strict';

/**
 * stress-test.js
 *
 * Pruebas de estrés y carga para Pilar 2.
 * Funciona localmente y contra un deploy remoto.
 *
 * Uso:
 *   node scripts/stress-test.js                          # local, 50 tx, dificultad actual
 *   node scripts/stress-test.js --tx 200 --workers 4     # 200 tx, escala a 4 workers
 *   node scripts/stress-test.js --remote http://...       # contra deploy
 *   node scripts/stress-test.js --help                    # todas las opciones
 */

const http = require('http');
const { execSync } = require('child_process');

// --- Config ---
const config = {
  coordinatorUrl: 'http://localhost:8080/api/coordinator',
  poolUrl: 'http://localhost:3001',
  rabbitMqApi: 'http://guest:guest@localhost:15672/api',
  txCount: 50,
  blockThreshold: 5,
  workerCount: 2,
  concurrency: 5,
  difficulty: '',
  remote: false,
  skipDocker: false,
};

function parseArgs() {
  const args = process.argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    switch (args[i]) {
      case '--help':
        printHelp();
        process.exit(0);
      case '--tx':
      case '--transactions':
        config.txCount = parseInt(args[++i]) || 50;
        break;
      case '--workers':
        config.workerCount = parseInt(args[++i]) || 2;
        break;
      case '--threshold':
        config.blockThreshold = parseInt(args[++i]) || 5;
        break;
      case '--concurrency':
        config.concurrency = parseInt(args[++i]) || 5;
        break;
      case '--difficulty':
        config.difficulty = args[++i] || '';
        break;
      case '--remote':
        config.remote = args[++i] || true;
        config.skipDocker = true;
        break;
      case '--coordinator-url':
        config.coordinatorUrl = args[++i];
        config.remote = true;
        break;
      case '--pool-url':
        config.poolUrl = args[++i];
        config.remote = true;
        break;
      case '--rabbitmq-api':
        config.rabbitMqApi = args[++i];
        break;
      case '--skip-docker':
        config.skipDocker = true;
        break;
    }
  }
}

function printHelp() {
  console.log(`
Uso: node scripts/stress-test.js [opciones]

Opciones:
  --tx <n>              Cantidad de transacciones a enviar (default: 50)
  --workers <n>         Escalar a N workers (default: 2)
  --threshold <n>       Transacciones por bloque (default: 5)
  --concurrency <n>     Transacciones simultáneas (default: 5)
  --difficulty <str>    Dificultad PoW (default: la del .env)
  --remote <url>        URL base del deploy (ej: https://pilar2.example.com)
  --coordinator-url <u> URL del coordinator (default: http://localhost:8080/api/coordinator)
  --pool-url <u>        URL del pool (default: http://localhost:3001)
  --rabbitmq-api <u>    URL de RabbitMQ API (default: http://guest:guest@localhost:15672/api)
  --skip-docker         No intentar comandos docker compose
  --help                Mostrar esta ayuda

Ejemplos:
  node scripts/stress-test.js
  node scripts/stress-test.js --tx 200 --workers 4 --threshold 10
  node scripts/stress-test.js --remote https://pilar2.mi-server.com
  node scripts/stress-test.js --coordinator-url http://192.168.1.50:3000 --pool-url http://192.168.1.50:3001
`);
}

// --- Helpers ---

async function apiFetch(url, options = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const isRabbit = url.includes('guest:guest');
    const defaultPort = u.protocol === 'https:' ? 443 : 80;
    const opts = {
      hostname: u.hostname,
      port: u.port || defaultPort,
      path: u.pathname + u.search,
      method: options.method || 'GET',
      headers: options.headers || { 'Content-Type': 'application/json' },
      rejectUnauthorized: false,
    };
    if (isRabbit) {
      opts.auth = 'guest:guest';
      opts.path = u.pathname + u.search;
      opts.hostname = 'localhost';
      opts.port = 15672;
    }
    if (options.body) {
      opts.headers['Content-Length'] = Buffer.byteLength(options.body);
    }
    const mod = u.protocol === 'https:' ? require('https') : http;
    const req = mod.request(opts, (res) => {
      let data = '';
      res.on('data', (chunk) => (data += chunk));
      res.on('end', () => {
        try {
          resolve({ status: res.statusCode, data: JSON.parse(data) });
        } catch {
          resolve({ status: res.statusCode, data: data });
        }
      });
    });
    req.on('error', reject);
    if (options.body) req.write(options.body);
    req.end();
  });
}

function fetch(url, opts) { return apiFetch(url, opts); }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function color(s, c) {
  const colors = { green: 32, red: 31, yellow: 33, cyan: 36, gray: 90, magenta: 35 };
  return `\x1b[${colors[c] || 0}m${s}\x1b[0m`;
}

function fmt(ms) {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

// --- Docker helpers ---

async function scaleWorker(count) {
  if (config.skipDocker || config.remote) return;
  try {
    execSync(`docker compose up -d --scale worker=${count} worker`, {
      cwd: __dirname + '/..',
      stdio: 'pipe',
    });
    console.log(color(`  → Workers escalados a ${count}`, 'cyan'));
    await sleep(3000);
  } catch (err) {
    console.warn(color(`  ⚠️  No se pudo escalar workers: ${err.message}`, 'yellow'));
  }
}

async function killWorker() {
  if (config.skipDocker || config.remote) return;
  try {
    execSync('docker compose kill worker', { cwd: __dirname + '/..', stdio: 'pipe' });
    console.log(color('  → Worker asesinado', 'red'));
    await sleep(1000);
  } catch (_) {}
}

// --- Metrics ---

const metrics = {
  txSent: 0,
  txAccepted: 0,
  txFailed: 0,
  blocksBefore: 0,
  blocksAfter: 0,
  miningStarted: 0,
  startTime: 0,
  blocksTimestamps: [],
  queueHistory: [],
};

async function getQueueInfo() {
  try {
    const q = await fetch(`${config.rabbitMqApi}/queues/%2F/mining_tasks`);
    const dlq = await fetch(`${config.rabbitMqApi}/queues/%2F/mining_results_dlq`);
    return {
      ready: q.data?.messages_ready || 0,
      unacked: q.data?.messages_unacknowledged || 0,
      total: q.data?.messages || 0,
      dlq: dlq.data?.messages || 0,
    };
  } catch { return null; }
}

async function getChainLength() {
  try {
    const status = await fetch(`${config.coordinatorUrl}/status`);
    return status.data?.chain_length || 0;
  } catch { return 0; }
}

// --- Transaction sender ---

async function sendTransaction(tx) {
  try {
    const res = await fetch(`${config.poolUrl}/transaction`, {
      method: 'POST',
      body: JSON.stringify(tx),
    });
    metrics.txSent++;
    if (res.status === 201) {
      metrics.txAccepted++;
      if (res.data?.mining_triggered) metrics.miningStarted++;
      return { ok: true, miningTriggered: !!res.data?.mining_triggered };
    }
    metrics.txFailed++;
    return { ok: false, status: res.status };
  } catch (err) {
    metrics.txFailed++;
    return { ok: false, error: err.message };
  }
}

function makeTx(id, lotId) {
  const entities = [
    { origen: 'mina-san-juan', destino: 'planta-neuquen' },
    { origen: 'planta-neuquen', destino: 'refineria-bahia-blanca' },
    { origen: 'refineria-bahia-blanca', destino: 'terminal-puerto-rosario' },
    { origen: 'terminal-puerto-rosario', destino: 'mina-san-juan' },
  ];
  const e = entities[id % entities.length];
  return {
    id: `stress-${id}`,
    id_lote: lotId || `LOTE-STRESS-${Math.ceil((id + 1) / 10)}`,
    origen: e.origen,
    destino: e.destino,
    cantidad: Math.floor(Math.random() * 500) + 10,
    tipo: id % 3 === 0 ? 'CRUDO' : 'MINERAL',
    timestamp: new Date().toISOString(),
    firma: '__unsigned__',
  };
}

// --- Main ---

async function main() {
  parseArgs();

  console.log('\n' + color('═══════════════════════════════════════════════════', 'cyan'));
  console.log(color('        🔥 PRUEBA DE ESTRÉS — Pilar 2', 'cyan'));
  console.log(color('═══════════════════════════════════════════════════', 'cyan'));
  console.log();
  console.log(`  Transacciones: ${color(config.txCount, 'yellow')}`);
  console.log(`  Threshold:     ${color(config.blockThreshold, 'yellow')} tx/bloque`);
  console.log(`  Workers:       ${color(config.workerCount, 'yellow')}`);
  console.log(`  Concurrencia:  ${color(config.concurrency, 'yellow')}`);
  console.log(`  Pool URL:      ${config.poolUrl}`);
  console.log(`  Coordinator:   ${config.coordinatorUrl}`);
  console.log(`  Modo:          ${config.remote ? '🌐 Remoto' : '💻 Local'}`);
  console.log();

  // --- Phase 1: Verificar conectividad ---
  console.log(color('▸ [1/5] Verificando conectividad...', 'yellow'));
  for (let i = 0; i < 10; i++) {
    try {
      const s = await fetch(`${config.coordinatorUrl}/status`);
      if (s.status !== 200) throw new Error(`HTTP ${s.status}`);
      const p = await fetch(`${config.poolUrl}/status`);
      if (p.status !== 200) throw new Error(`Pool HTTP ${p.status}`);
      console.log('  ✓ Coordinator y Pool OK');
      break;
    } catch (err) {
      if (i === 9) {
        console.error(color(`  ✗ No se puede conectar: ${err.message}`, 'red'));
        console.log(color('  Verificá que los servicios estén levantados', 'yellow'));
        process.exit(1);
      }
      process.stdout.write('.');
      await sleep(2000);
    }
  }

  // --- Phase 2: Escalar workers y preparar ---
  console.log(color('\n▸ [2/5] Preparando workers...', 'yellow'));
  metrics.blocksBefore = await getChainLength();
  console.log(`  Bloques actuales: ${color(metrics.blocksBefore, 'green')}`);

  await scaleWorker(config.workerCount);

  // Setear dificultad si se pidió
  if (config.difficulty && !config.remote) {
    console.log(color(`  ⚠️  Para cambiar dificultad a "${config.difficulty}",`, 'yellow'));
    console.log('     editar .env y rebuildear: docker compose up -d --build pool coordinator');
  }

  // --- Phase 3: Enviar transacciones ---
  console.log(color('\n▸ [3/5] Enviando transacciones...', 'yellow'));

  metrics.startTime = Date.now();
  const queueSnapshots = [];

  // Monitorear colas mientras enviamos
  const monitorInterval = setInterval(async () => {
    const q = await getQueueInfo();
    if (q) queueSnapshots.push({ t: Date.now() - metrics.startTime, ...q });
  }, 500);

  // Run ID único para evitar colisiones con corridas anteriores en la chain
  const runId = Date.now().toString(36);

  // Enviar en lotes con concurrencia controlada
  let sent = 0;
  const lotSize = Math.ceil(config.txCount / config.blockThreshold);

  while (sent < config.txCount) {
    const batch = [];
    const remaining = config.txCount - sent;
    const batchSize = Math.min(config.concurrency, remaining);

    for (let i = 0; i < batchSize; i++) {
      const id = sent + i;
      const lotId = `LOTE-STRESS-${runId}-${Math.ceil((id + 1) / config.blockThreshold)}`;
      batch.push(sendTransaction(makeTx(id, lotId)));
    }

    const results = await Promise.all(batch);
    const ok = results.filter(r => r.ok).length;
    const mining = results.filter(r => r.miningTriggered).length;
    sent += batch.length;

    process.stdout.write(`\r  ${sent}/${config.txCount} enviadas | ${ok} aceptadas | ${mining} mineras disparadas`);

    // Pequeña pausa para no saturar
    await sleep(50);
  }

  clearInterval(monitorInterval);
  const sendTime = Date.now() - metrics.startTime;
  console.log(`\n  ${color('Envío completado', 'green')} en ${fmt(sendTime)}`);

  // --- Phase 4: Esperar a que termine la minería ---
  console.log(color('\n▸ [4/5] Esperando confirmación de bloques...', 'yellow'));

  let stableCount = 0;
  let lastBlockCount = metrics.blocksBefore;
  const maxWait = 120000; // 2 min máximo
  const waitStart = Date.now();

  while (Date.now() - waitStart < maxWait) {
    const current = await getChainLength();
    const q = await getQueueInfo();

    if (current > lastBlockCount) {
      const newBlocks = current - lastBlockCount;
      metrics.blocksTimestamps.push({ count: current, t: Date.now() - metrics.startTime });
      lastBlockCount = current;
      stableCount = 0;
      console.log(`  → Bloque #${current} confirmado ${q ? `| cola: ${q.ready} ready, ${q.unacked} unacked` : ''}`);
    } else {
      stableCount++;
    }

    // Cortar cuando pasen 10s sin nuevos bloques (la cola puede tener tareas
    // porque el pool publica nuevas tandas al confirmarse cada bloque)
    if (current > metrics.blocksBefore && stableCount > 20) break; // 10s sin cambios

    await sleep(500);
  }

  const totalTime = Date.now() - metrics.startTime;
  metrics.blocksAfter = await getChainLength();
  const newBlocks = metrics.blocksAfter - metrics.blocksBefore;

  // --- Phase 5: Reporte final ---
  console.log(color('\n▸ [5/5] Reporte final', 'yellow'));
  console.log(color('═══════════════════════════════════════════════════', 'cyan'));

  const finalQueue = await getQueueInfo();

  const report = {
    'Transacciones enviadas': metrics.txSent,
    'Aceptadas': metrics.txAccepted,
    'Fallidas': metrics.txFailed,
    'Tasa de éxito': `${((metrics.txAccepted / Math.max(1, metrics.txSent)) * 100).toFixed(1)}%`,
    'Bloques minados': newBlocks,
    'Bloques previos': metrics.blocksBefore,
    'Tiempo total': fmt(totalTime),
    'Tiempo de envío': fmt(sendTime),
    'Throughput': `${(metrics.txAccepted / (totalTime / 1000)).toFixed(1)} tx/s`,
    'Tiempo por bloque': newBlocks > 0 ? fmt(totalTime / newBlocks) : 'N/A',
    'Threshold': config.blockThreshold,
  };

  if (finalQueue) {
    report['Cola mining_tasks (ready)'] = finalQueue.ready;
    report['Cola mining_tasks (unacked)'] = finalQueue.unacked;
    report['DLQ (mining_results_dlq)'] = finalQueue.dlq;
  }

  for (const [k, v] of Object.entries(report)) {
    console.log(`  ${color(k + ':', 'gray')} ${color(v, 'green')}`);
  }

  console.log();
  console.log(color('  ─── Historial de colas ───', 'gray'));
  if (queueSnapshots.length > 0) {
    // Muestreo: primero, último y picos
    const peakReady = Math.max(...queueSnapshots.map(q => q.ready));
    const peakUnacked = Math.max(...queueSnapshots.map(q => q.unacked));
    const peakDlq = Math.max(...queueSnapshots.map(q => q.dlq));
    console.log(`  Pico ready:  ${peakReady}`);
    console.log(`  Pico unacked: ${peakUnacked}`);
    console.log(`  Pico DLQ:    ${peakDlq}`);
    if (queueSnapshots.length > 10) {
      console.log(`  Muestras:    ${queueSnapshots.length} (cada ~500ms)`);
    }
  }

  console.log();

  // Diagnóstico
  if (newBlocks === 0) {
    console.log(color('  ⚠️  No se minaron bloques. Posibles causas:', 'yellow'));
    console.log('  • Dificultad muy alta para el tiempo de espera (2 min)');
    console.log('  • Workers no están corriendo o no agarran tareas');
    console.log('  • RabbitMQ no accesible');
    if (finalQueue && finalQueue.ready > 0) {
      console.log(color(`  • ${finalQueue.ready} tareas esperando en mining_tasks`, 'red'));
    }
  }

  console.log();
}

main().catch(err => {
  console.error(color('Error fatal:', 'red'), err);
  process.exit(1);
});
