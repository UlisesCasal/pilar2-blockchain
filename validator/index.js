'use strict';

const { VALID_TYPES, REQUIRED_FIELDS } = require('../shared/schema');
const { verify } = require('../shared/hmac');

/**
 * Validate a transaction object.
 *
 * @param {Object} tx - Transaction to validate
 * @param {string} [secret] - HMAC secret for firma verification.
 *   Defaults to process.env.HMAC_SECRET or 'change-me-in-production'
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateTransaction(tx, secret) {
  const hmacSecret = secret || process.env.HMAC_SECRET || 'change-me-in-production';
  const errors = [];

  // 1. Required fields
  for (const field of REQUIRED_FIELDS) {
    if (tx[field] === undefined || tx[field] === null || tx[field] === '') {
      errors.push(`${field} is required`);
    }
  }

  // 2. cantidad must be > 0 (only when present)
  if (tx.cantidad !== undefined && tx.cantidad !== null && tx.cantidad !== '') {
    if (tx.cantidad <= 0) {
      errors.push('cantidad must be greater than 0');
    }
  }

  // 3. tipo must be in VALID_TYPES (only when present)
  if (tx.tipo !== undefined && tx.tipo !== null && tx.tipo !== '') {
    if (!VALID_TYPES.includes(tx.tipo)) {
      errors.push(`tipo must be one of: ${VALID_TYPES.join(', ')}`);
    }
  }

  // 4. origen and destino must differ (only when both present)
  if (tx.origen && tx.destino && tx.origen === tx.destino) {
    errors.push('origen and destino must be different');
  }

  // 5. firma verification — only when firma and key payload fields are present
  const firmaPresent = tx.firma !== undefined && tx.firma !== null && tx.firma !== '';
  const payloadFieldsPresent =
    tx.id_lote && tx.origen && tx.destino && tx.cantidad && tx.tipo;

  if (firmaPresent && payloadFieldsPresent) {
    const payload = `${tx.id_lote}:${tx.origen}:${tx.destino}:${tx.cantidad}:${tx.tipo}`;
    if (!verify(payload, tx.firma, hmacSecret)) {
      errors.push('firma is invalid');
    }
  }

  return { valid: errors.length === 0, errors };
}

module.exports = { validateTransaction };
