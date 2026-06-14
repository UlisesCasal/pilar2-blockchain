'use strict';

const express = require('express');
const { validateTransaction } = require('./index');

if (!process.env.HMAC_SECRET) {
  throw new Error('HMAC_SECRET environment variable is required');
}
const HMAC_SECRET = process.env.HMAC_SECRET;

const app = express();
app.use(express.json());

// POST /validate — validate a transaction
app.post('/validate', (req, res) => {
  const tx = req.body;
  const result = validateTransaction(tx, HMAC_SECRET);

  if (result.valid) {
    return res.status(200).json(result);
  }
  return res.status(400).json(result);
});

// GET /health — liveness probe
app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', service: 'validator' });
});

module.exports = app;
