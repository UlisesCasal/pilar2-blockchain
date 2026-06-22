'use strict';

const path = require('path');
const fs = require('fs');

const KEYS_DIR = path.join(__dirname, '..', '..', 'keys');

describe('shared/entity-keys', () => {
  let getPublicKey, getPrivateKey, listEntities;

  beforeAll(() => {
    if (!fs.existsSync(KEYS_DIR)) {
      throw new Error('keys/ directory not found — run node scripts/generate-keys.js first');
    }
    jest.resetModules();
    const entityKeys = require('../../shared/entity-keys');
    getPublicKey = entityKeys.getPublicKey;
    getPrivateKey = entityKeys.getPrivateKey;
    listEntities = entityKeys.listEntities;
  });

  test('listEntities returns all demo entities', () => {
    const entities = listEntities();
    expect(entities).toContain('mina-san-juan');
    expect(entities).toContain('planta-neuquen');
    expect(entities).toContain('refineria-bahia-blanca');
    expect(entities).toContain('operador-pozo-mendoza');
    expect(entities).toContain('terminal-puerto-rosario');
    expect(entities.length).toBe(5);
  });

  test('getPublicKey returns PEM for known entity', () => {
    const key = getPublicKey('mina-san-juan');
    expect(key).not.toBeNull();
    expect(key).toContain('-----BEGIN PUBLIC KEY-----');
  });

  test('getPublicKey returns null for unknown entity', () => {
    expect(getPublicKey('unknown-entity')).toBeNull();
  });

  test('getPrivateKey returns PEM for known entity', () => {
    const key = getPrivateKey('mina-san-juan');
    expect(key).not.toBeNull();
    expect(key).toContain('-----BEGIN PRIVATE KEY-----');
  });

  test('getPrivateKey returns null for unknown entity', () => {
    expect(getPrivateKey('unknown-entity')).toBeNull();
  });
});
