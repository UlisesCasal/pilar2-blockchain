'use strict';

const crypto = require('crypto');

function canonicalize(tx) {
  const obj = {
    id: tx.id,
    id_lote: tx.id_lote,
    origen: tx.origen,
    destino: tx.destino,
    cantidad: tx.cantidad,
    tipo: tx.tipo,
    timestamp: tx.timestamp,
  };
  return JSON.stringify(obj);
}

function signTransaction(tx, privateKeyPem) {
  const data = Buffer.from(canonicalize(tx));
  const signature = crypto.sign(null, data, privateKeyPem);
  return signature.toString('base64');
}

function verifySignature(tx, signature, publicKeyPem) {
  try {
    const data = Buffer.from(canonicalize(tx));
    const sigBuffer = Buffer.from(signature, 'base64');
    return crypto.verify(null, data, publicKeyPem, sigBuffer);
  } catch (_) {
    return false;
  }
}

module.exports = { signTransaction, verifySignature, canonicalize };
