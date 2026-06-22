'use strict';

const fs = require('fs');
const path = require('path');
const pino = require('pino');

const SERVICE = process.env.SERVICE || 'app';
const LOG_LEVEL = process.env.LOG_LEVEL || 'info';

const logsDir = path.join(__dirname, '..', 'logs');
fs.mkdirSync(logsDir, { recursive: true });

function createLogger(serviceName) {
  const streams = [
    { stream: process.stdout },
    { stream: pino.destination(path.join(logsDir, `${SERVICE}.log`)) },
  ];

  return pino(
    { name: serviceName, level: LOG_LEVEL },
    pino.multistream(streams)
  );
}

module.exports = { createLogger };
