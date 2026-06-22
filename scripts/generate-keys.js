'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const ENTITIES = [
  'mina-san-juan',
  'planta-neuquen',
  'refineria-bahia-blanca',
  'operador-pozo-mendoza',
  'terminal-puerto-rosario',
];

const KEYS_DIR = path.join(__dirname, '..', 'keys');

if (!fs.existsSync(KEYS_DIR)) {
  fs.mkdirSync(KEYS_DIR, { recursive: true });
}

for (const entity of ENTITIES) {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519', {
    publicKeyEncoding: { type: 'spki', format: 'pem' },
    privateKeyEncoding: { type: 'pkcs8', format: 'pem' },
  });

  fs.writeFileSync(path.join(KEYS_DIR, `${entity}.pem`), privateKey);
  fs.writeFileSync(path.join(KEYS_DIR, `${entity}.pub.pem`), publicKey);
  console.log(`[generate-keys] ${entity}`);
}

console.log(`[generate-keys] Done — ${ENTITIES.length} key pairs in ${KEYS_DIR}`);
