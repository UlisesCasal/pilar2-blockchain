'use strict';

const http = require('http');
const { signTransaction } = require('../shared/crypto');
const { getPrivateKey } = require('../shared/entity-keys');

const POOL_URL = process.env.POOL_URL || 'http://localhost:3001';
const COUNT = parseInt(process.argv[2] || '10');

const ORIGINS = [
  'mina-san-juan',
  'planta-neuquen',
  'refineria-bahia-blanca',
  'operador-pozo-mendoza',
  'terminal-puerto-rosario',
];
const DESTINOS = [
  'planta-neuquen',
  'refineria-bahia-blanca',
  'terminal-puerto-rosario',
  'mina-san-juan',
  'operador-pozo-mendoza',
];
const TIPOS = ['MINERAL', 'CRUDO'];

function makeTransaction(i) {
  const tipo = TIPOS[i % 2];
  const origen = ORIGINS[i % ORIGINS.length];
  let destino = DESTINOS[i % DESTINOS.length];
  if (destino === origen) destino = DESTINOS[(i + 1) % DESTINOS.length];

  const tx = {
    id: `tx-${Date.now()}-${i}`,
    id_lote: `LOTE-2026-${tipo.slice(0, 3)}-${String(i + 1).padStart(3, '0')}`,
    origen,
    destino,
    cantidad: 100 + i * 50,
    tipo,
    timestamp: new Date().toISOString(),
  };

  const privateKey = getPrivateKey(origen);
  if (!privateKey) {
    throw new Error(`No private key found for entity: ${origen}`);
  }
  tx.firma = signTransaction(tx, privateKey);
  return tx;
}

function post(url, body) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const urlObj = new URL(url);
    const req = http.request({
      hostname: urlObj.hostname,
      port: urlObj.port,
      path: urlObj.pathname,
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) },
    }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve({ status: res.statusCode, body: JSON.parse(raw) }));
    });
    req.on('error', reject);
    req.write(data);
    req.end();
  });
}

function get(url) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    http.get({ hostname: urlObj.hostname, port: urlObj.port, path: urlObj.pathname }, (res) => {
      let raw = '';
      res.on('data', c => raw += c);
      res.on('end', () => resolve(JSON.parse(raw)));
    }).on('error', reject);
  });
}

async function main() {
  console.log(`Enviando ${COUNT} transacciones a ${POOL_URL}...\n`);

  for (let i = 0; i < COUNT; i++) {
    const tx = makeTransaction(i);
    const res = await post(`${POOL_URL}/transaction`, tx);
    const icon = res.status === 201 ? '✓' : '✗';
    console.log(`${icon} tx-${i + 1} [${tx.tipo}] ${tx.origen} → ${tx.destino} ${tx.cantidad}tn  →  HTTP ${res.status} | pending: ${res.body.pending ?? res.body.errors}`);
  }

  console.log('\nEsperando que el bloque se mine...');
  await new Promise(r => setTimeout(r, 3000));

  const status = await get(`${POOL_URL.replace('3001', '3000')}/status`);
  console.log('\n=== Estado del Coordinator ===');
  console.log(JSON.stringify(status, null, 2));
}

main().catch(err => { console.error('Error:', err.message); process.exit(1); });
