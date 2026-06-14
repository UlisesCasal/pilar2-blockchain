'use strict';

const express = require('express');
const { validateTransaction } = require('./index');

const app = express();
app.use(express.json());

// POST /validate — validate a transaction
app.post('/validate', (req, res) => {
  const tx = req.body;
  const secret = process.env.HMAC_SECRET || 'change-me-in-production';
  const result = validateTransaction(tx, secret);

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
