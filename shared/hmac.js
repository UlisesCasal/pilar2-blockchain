'use strict';

const crypto = require('crypto');

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function verify(payload, signature, secret) {
  const expected = sign(payload, secret);
  const a = Buffer.from(expected, 'hex');
  // Length guard: timingSafeEqual throws on mismatched buffer lengths
  let b;
  try {
    b = Buffer.from(signature, 'hex');
  } catch (_) {
    return false;
  }
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

module.exports = { sign, verify };
