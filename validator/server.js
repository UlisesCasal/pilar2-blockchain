'use strict';

const express = require('express');
const { validateTransaction } = require('./index');
const { createLogger } = require('../shared/logger');
const logger = createLogger('validator');

const PORT = parseInt(process.env.PORT_VALIDATOR || '3003');

const app = express();
app.use(express.json());

app.post('/validate', (req, res) => {
  const tx = req.body;
  const result = validateTransaction(tx);

  if (result.valid) {
    return res.status(200).json(result);
  }
  return res.status(400).json(result);
});

app.get('/health', (_req, res) => {
  res.status(200).json({ status: 'OK', service: 'validator' });
});

app.listen(PORT, () => {
  logger.info('Listening on port %d', PORT);
});

module.exports = app;
