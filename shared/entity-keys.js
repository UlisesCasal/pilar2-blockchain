'use strict';

const fs = require('fs');
const path = require('path');

const KEYS_DIR = path.join(__dirname, '..', 'keys');

const publicKeys = new Map();
const privateKeys = new Map();

function loadKeys() {
  if (!fs.existsSync(KEYS_DIR)) return;

  const files = fs.readdirSync(KEYS_DIR);
  for (const file of files) {
    if (file.endsWith('.pub.pem')) {
      const entity = file.replace('.pub.pem', '');
      publicKeys.set(entity, fs.readFileSync(path.join(KEYS_DIR, file), 'utf8'));
    } else if (file.endsWith('.pem')) {
      const entity = file.replace('.pem', '');
      privateKeys.set(entity, fs.readFileSync(path.join(KEYS_DIR, file), 'utf8'));
    }
  }
}

loadKeys();

function getPublicKey(entityName) {
  return publicKeys.get(entityName) || null;
}

function getPrivateKey(entityName) {
  return privateKeys.get(entityName) || null;
}

function listEntities() {
  return Array.from(publicKeys.keys());
}

module.exports = { getPublicKey, getPrivateKey, listEntities };
