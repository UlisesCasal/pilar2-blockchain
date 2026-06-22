'use strict';

const { VALID_TYPES, REQUIRED_FIELDS } = require('../shared/schema');
const { verifySignature } = require('../shared/crypto');
const { getPublicKey } = require('../shared/entity-keys');

function validateTransaction(tx) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (tx[field] === undefined || tx[field] === null || tx[field] === '') {
      errors.push(`${field} is required`);
    }
  }

  if (tx.cantidad !== undefined && tx.cantidad !== null && tx.cantidad !== '') {
    if (tx.cantidad <= 0) {
      errors.push('cantidad must be greater than 0');
    }
  }

  if (tx.tipo !== undefined && tx.tipo !== null && tx.tipo !== '') {
    if (!VALID_TYPES.includes(tx.tipo)) {
      errors.push(`tipo must be one of: ${VALID_TYPES.join(', ')}`);
    }
  }

  if (tx.origen && tx.destino && tx.origen === tx.destino) {
    errors.push('origen and destino must be different');
  }

  const firmaPresent = tx.firma !== undefined && tx.firma !== null && tx.firma !== '';
  const payloadFieldsPresent =
    tx.id_lote && tx.origen && tx.destino && tx.cantidad && tx.tipo;

  if (firmaPresent && payloadFieldsPresent) {
    const publicKey = getPublicKey(tx.origen);
    if (!publicKey) {
      errors.push('unknown origin entity');
    } else if (!verifySignature(tx, tx.firma, publicKey)) {
      errors.push('invalid signature for origin entity');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateTransaction };
