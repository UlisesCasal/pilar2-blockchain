'use strict';

const fs = require('fs');
const path = require('path');
const Database = require('better-sqlite3');
const bcrypt = require('bcryptjs');

const DB_PATH = process.env.DB_PATH || './data/auth.db';
const KEYS_DIR = path.join(__dirname, '..', 'keys');
const DEFAULT_PASSWORD = 'admin123';
const SALT_ROUNDS = 10;

const ENTITIES = [
  { name: 'mina-san-juan', display_name: 'Mina San Juan' },
  { name: 'planta-neuquen', display_name: 'Planta Neuquén' },
  { name: 'refineria-bahia-blanca', display_name: 'Refinería Bahía Blanca' },
  { name: 'operador-pozo-mendoza', display_name: 'Operador Pozo Mendoza' },
  { name: 'terminal-puerto-rosario', display_name: 'Terminal Puerto Rosario' },
  { name: 'impostor', display_name: 'Impostor (Demo)' },
];

let db = null;

function initDB() {
  const dir = path.dirname(DB_PATH);
  fs.mkdirSync(dir, { recursive: true });

  db = new Database(DB_PATH);

  db.exec(`
    CREATE TABLE IF NOT EXISTS entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      display_name TEXT NOT NULL,
      password_hash TEXT NOT NULL,
      public_key TEXT NOT NULL,
      private_key TEXT NOT NULL
    )
  `);

  const count = db.prepare('SELECT COUNT(*) AS cnt FROM entities').get();
  if (count.cnt === 0) {
    const insert = db.prepare(
      'INSERT INTO entities (name, display_name, password_hash, public_key, private_key) VALUES (?, ?, ?, ?, ?)'
    );

    const hash = bcrypt.hashSync(DEFAULT_PASSWORD, SALT_ROUNDS);

    const insertMany = db.transaction(() => {
      for (const entity of ENTITIES) {
        const privKey = fs.readFileSync(path.join(KEYS_DIR, `${entity.name}.pem`), 'utf8');
        const pubKey = fs.readFileSync(path.join(KEYS_DIR, `${entity.name}.pub.pem`), 'utf8');
        insert.run(entity.name, entity.display_name, hash, pubKey, privKey);
      }
    });

    insertMany();
  }

  return db;
}

function getEntityByName(name) {
  return db.prepare('SELECT id, name, display_name FROM entities WHERE name = ?').get(name) || null;
}

function getEntityWithKey(name) {
  return db.prepare('SELECT id, name, display_name, private_key FROM entities WHERE name = ?').get(name) || null;
}

function verifyPassword(name, password) {
  const entity = db.prepare('SELECT id, name, display_name, password_hash FROM entities WHERE name = ?').get(name);
  if (!entity) return null;
  if (!bcrypt.compareSync(password, entity.password_hash)) return null;
  return { id: entity.id, name: entity.name, display_name: entity.display_name };
}

function listAllEntities() {
  return db.prepare('SELECT name, display_name FROM entities').all();
}

module.exports = { initDB, getEntityByName, getEntityWithKey, verifyPassword, listAllEntities };
