require('dotenv').config();

const SERVICE = process.env.SERVICE;

const map = {
  coordinator: './coordinator/index.js',
  pool: './pool/index.js',
  worker: './worker/index.js',
  validator: './validator/server.js',
};

if (!map[SERVICE]) {
  console.error(`Unknown SERVICE: "${SERVICE}". Valid values: coordinator, pool, worker, validator`);
  process.exit(1);
}

require(map[SERVICE]);
