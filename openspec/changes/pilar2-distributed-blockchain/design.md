# Technical Design: Pilar 2 — Distributed PoW Blockchain Infrastructure

> Change: `pilar2-distributed-blockchain`
> Reads: `sdd/pilar2-distributed-blockchain/proposal`, `sdd/pilar2-distributed-blockchain/explore`
> Status: design (HOW at architectural level). Task breakdown is deferred to `sdd-tasks`.

---

## 1. Architecture Approach

### 1.1 Pattern: thin transport shell over a pure-logic core

Every service follows the same layering, so the system reads identically no matter which box you open:

```
┌─────────────────────────────────────────────┐
│  server.js / index.js   (transport: Express) │  ← I/O edge, no business rules
├─────────────────────────────────────────────┤
│  *.js core modules      (pure / orchestrate) │  ← logic, deterministic, testable
├─────────────────────────────────────────────┤
│  shared/*               (cross-cutting utils)│  ← schema, hmac, hash, amqp
└─────────────────────────────────────────────┘
```

- **Transport layer** (`index.js` / `server.js`): wires Express routes, RabbitMQ consumers, and startup loops. Knows nothing about *why*, only *where data comes from and goes to*.
- **Core layer**: the part you unit-test. `validateTransaction`, `split`, `worker-registry`, `block.buildPayload` are pure functions (zero I/O). `miner`, `redis`, `rabbitmq` are orchestration modules that wrap one external dependency each behind a small async interface.
- **Shared layer**: single import point for schema, signing, hashing, and AMQP connection. Centralizing the hash here is what makes "MD5 vs SHA256" a one-line swap instead of a refactor.

This is a deliberate Hexagonal-lite boundary: the core never imports `express`, `ioredis`, or `amqplib` directly. Those live only in transport/orchestration modules. The payoff is that the TDD-critical logic (validator, splitter, registry) runs in milliseconds with no Docker, no broker, no network.

### 1.2 Service topology: 6 boxes, single responsibility each

| Service | Port | Owns | Touches |
|---------|------|------|---------|
| `validator` | 3003 | schema + HMAC verification | nothing external (pure) |
| `pool` | 3001 | tx intake, threshold, nonce split, worker registry | RabbitMQ (publish tasks, consume keepalive) |
| `worker` (×N) | 3002 | PoW execution via Pilar 1 binary | RabbitMQ (consume tasks, publish results), Pilar 1 child process |
| `coordinator` (NCT) | 3000 | result verification, block commitment | RabbitMQ (consume results), Redis (all writes) |
| `rabbitmq` | 5672 | message transport | — |
| `redis` | 6379 | blockchain state | — |

**Hard boundary — only the Coordinator touches Redis.** Pool and Worker are stateless relative to the chain. This is the single most important architectural constraint: it makes block commitment serializable through one writer and eliminates an entire class of distributed-write races. Pool scales for intake throughput; Coordinator stays singular-authority for chain state.

---

## 2. Component Map

### 2.1 Folder structure (exact)

```
pilar2/
├── shared/
│   ├── schema.js            # transaction field definitions + VALID_TYPES
│   ├── hmac.js              # sign(payload, secret) / verify(payload, sig, secret)
│   ├── hash.js              # md5(str) wrapper — single import point
│   └── amqp.js              # createChannel(url) with exponential backoff retry
├── validator/
│   ├── index.js             # validateTransaction(tx) → { valid, errors[] }
│   └── server.js            # Express app: POST /validate, GET /health
├── coordinator/
│   ├── index.js             # Express app + startup (result consumer wiring)
│   ├── block.js             # buildPayload(tx[]) / buildBlock(task, nonce, hash)
│   ├── rabbitmq.js          # publishTask(task) / consumeResults(handler)
│   └── redis.js             # storeBlock / getChain / getBlock / acquireLock
├── pool/
│   ├── index.js             # Express app + startup
│   ├── transaction-pool.js  # add(tx) / flush() / size()
│   ├── nonce-splitter.js    # split(n) → [{start, end}]
│   └── worker-registry.js   # register(id) / expire() / count()
├── worker/
│   ├── index.js             # Express app + keepalive loop + startup
│   ├── consumer.js          # consumeTasks(handler)
│   └── miner.js             # mine(task) → Promise<{found, nonce, hash}>
├── entrypoint.js            # reads process.env.SERVICE → requires the right index
├── docker-compose.yml
├── docker-compose.test.yml
├── Dockerfile
├── .env.example
├── .gitignore               # MUST include .env
├── package.json
├── jest.config.js
└── tests/
    ├── unit/
    │   ├── validator.test.js
    │   ├── nonce-splitter.test.js
    │   └── worker-registry.test.js
    └── integration/
        └── mining-cycle.test.js
```

### 2.2 Module responsibilities & contracts

#### `shared/schema.js`
Exports the field contract every service agrees on. No I/O.

```js
const VALID_TYPES = ['MINERAL_EXTRACTION', 'CUSTODY_TRANSFER', 'REFINEMENT', 'EXPORT'];
const REQUIRED_FIELDS = ['id', 'type', 'from', 'to', 'asset', 'quantity', 'timestamp', 'signature'];
module.exports = { VALID_TYPES, REQUIRED_FIELDS };
```

#### `shared/hash.js`
The one place MD5 lives. Swap algorithm here, the whole system follows.

```js
const md5 = require('md5');
function hash(str) { return md5(str); }
module.exports = { hash };
```

#### `shared/hmac.js`
```js
const crypto = require('crypto');
function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}
function verify(payload, signature, secret) {
  const expected = sign(payload, secret);
  const a = Buffer.from(expected, 'hex');
  const b = Buffer.from(signature, 'hex');
  if (a.length !== b.length) return false;       // length guard before timingSafeEqual
  return crypto.timingSafeEqual(a, b);
}
module.exports = { sign, verify };
```
`payload` is the canonical JSON of the transaction **excluding** the `signature` field (deterministic key ordering — see §3.4). Constant-time compare via `timingSafeEqual`; the length guard prevents the throw `timingSafeEqual` raises on mismatched buffer lengths.

#### `shared/amqp.js`
Connection factory with exponential backoff. This is the mitigation for the #1 risk (RabbitMQ startup race).

```js
const amqp = require('amqplib');
// backoff schedule: 1s, 2s, 4s, 8s, 16s, 32s — max 6 retries (~63s window)
async function createChannel(url, { maxRetries = 6 } = {}) {
  let attempt = 0;
  for (;;) {
    try {
      const connection = await amqp.connect(url);
      const channel = await connection.createChannel();
      return { channel, connection };       // caller asserts its own queues
    } catch (err) {
      if (attempt >= maxRetries) throw err;
      const delay = Math.pow(2, attempt) * 1000;
      await new Promise(r => setTimeout(r, delay));
      attempt++;
    }
  }
}
module.exports = { createChannel };
```
Returns `{ channel, connection }`; the **caller** asserts queues (each service knows which queues it needs). This keeps `shared/amqp.js` free of topology assumptions.

#### `validator/index.js`
Pure, zero I/O. The canonical TDD target.

```js
const { VALID_TYPES, REQUIRED_FIELDS } = require('../shared/schema');
function validateTransaction(tx) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (tx[field] === undefined || tx[field] === null || tx[field] === '') {
      errors.push(`missing field: ${field}`);
    }
  }
  if (tx.type && !VALID_TYPES.includes(tx.type)) {
    errors.push(`invalid type: ${tx.type}`);
  }
  if (tx.quantity !== undefined && (typeof tx.quantity !== 'number' || tx.quantity <= 0)) {
    errors.push('quantity must be a positive number');
  }
  return { valid: errors.length === 0, errors };
}
module.exports = { validateTransaction };
```
HMAC verification (`shared/hmac.verify`) is a separate concern composed at the `server.js` / coordinator layer — keeps `validateTransaction` free of secrets and I/O so it stays unit-testable.

#### `validator/server.js`
Express shell. `POST /validate` → runs `validateTransaction` + HMAC verify → `200 {valid:true}` or `422 {valid:false, errors}`. `GET /health` → `200`.

#### `pool/transaction-pool.js`
In-memory accumulator. `add(tx)` pushes, `size()` reads length, `flush()` returns the current batch and clears it. The Pool's intake handler calls `flush()` when `size() >= BLOCK_THRESHOLD`.

#### `pool/nonce-splitter.js`
Pure. Splits `[0, MAX_SAFE_INTEGER]` into N contiguous ranges.

```js
const MAX = Number.MAX_SAFE_INTEGER; // 9007199254740991
function split(workerCount) {
  if (workerCount <= 0) throw new Error('workerCount must be >= 1');
  const size = Math.floor(MAX / workerCount);
  const ranges = [];
  for (let i = 0; i < workerCount; i++) {
    const start = i * size;
    const end = i === workerCount - 1 ? MAX : (i + 1) * size - 1; // last range absorbs remainder
    ranges.push({ start, end });
  }
  return ranges;
}
module.exports = { split, MAX };
```
Invariant guaranteed by tests: ranges are contiguous, non-overlapping, cover `[0, MAX]` exactly, last range absorbs the remainder.

#### `pool/worker-registry.js`
TTL-based liveness map. `register(id)` stamps `now`; `expire()` drops entries older than `WORKER_TTL_MS`; `count()` returns live workers. Fed by keepalive messages. The Pool reads `count()` to decide how many ranges to split into.

```js
function makeRegistry({ ttlMs }) {
  const workers = new Map(); // id → lastSeen
  return {
    register(id) { workers.set(id, Date.now()); },
    expire() {
      const cutoff = Date.now() - ttlMs;
      for (const [id, seen] of workers) if (seen < cutoff) workers.delete(id);
    },
    count() { this.expire(); return workers.size; },
  };
}
```

#### `coordinator/redis.js`
Sole owner of chain state. See §3.3 for the full key schema.

```js
// Keys:
//   block:<hash>  → Redis HASH (previous_hash, nonce, timestamp, transactions, block_hash)
//   chain         → Redis LIST of block hashes (RPUSH appends)
//   lock:<prev>   → Redis string, SET NX EX 30 (atomic block-height lock)
async function storeBlock(block) { /* HSET block:<hash> + RPUSH chain <hash> */ }
async function getChain() { /* LRANGE chain 0 -1 → hydrate each via getBlock */ }
async function getBlock(hash) { /* HGETALL block:<hash> → object or null */ }
async function acquireLock(prevHash) { /* SET lock:<prevHash> 1 NX EX 30 → boolean */ }
```

#### `coordinator/block.js`
Pure block formation. `buildPayload(tx[])` produces the deterministic string fed to the miner; `buildBlock(task, nonce, hash)` assembles the final block object for `storeBlock`.

#### `coordinator/rabbitmq.js`
`publishTask(task)` → publishes to `mining_tasks` (direct work queue). `consumeResults(handler)` → subscribes to `mining_results`, invokes `handler` per message, acks on success.

#### `worker/miner.js`
Spawns the Pilar 1 child process and parses stdout. The only module that knows the binary's contract — risk isolation by design.

```js
const { spawn } = require('child_process');
const PILAR1_CPU_BINARY = process.env.PILAR1_CPU_BINARY;
async function mine({ payload, prefix, nonceStart, nonceEnd }) {
  return new Promise((resolve, reject) => {
    const proc = spawn('node', [PILAR1_CPU_BINARY, payload, prefix, String(nonceStart), String(nonceEnd)]);
    let stdout = '';
    proc.stdout.on('data', chunk => { stdout += chunk; });
    proc.on('error', reject);
    proc.on('close', () => {
      const lines = stdout.split('\n');
      if (lines[0] && lines[0].trim() === 'NOT FOUND') return resolve({ found: false });
      const nonceLine = lines.find(l => l.startsWith('Nonce:'));
      const hashLine  = lines.find(l => l.startsWith('Hash:'));
      if (!nonceLine || !hashLine) return resolve({ found: false }); // defensive: malformed → not found
      resolve({
        found: true,
        nonce: nonceLine.split(':')[1].trim(),
        hash:  hashLine.split(':')[1].trim(),
      });
    });
  });
}
module.exports = { mine };
```
**Stdout contract (confirmed):** binary at `../pilar1/Hit7/CPU/pow_cpu_range.js`, called `node <binary> <hash> <prefix> <nonce_start> <nonce_end>`. On success it prints a line `Nonce: <n>` and a line `Hash: <h>`. On failure the first line is `NOT FOUND`. The defensive `!nonceLine || !hashLine → found:false` guard protects against partial output if the process is killed mid-write.

#### `worker/consumer.js`
`consumeTasks(handler)` → subscribes to `mining_tasks` with `prefetch(1)`, invokes `handler(task)`, acks after the handler resolves. `prefetch(1)` is what guarantees one nonce range → exactly one worker.

#### `worker/index.js`
Express shell (`GET /worker/status`) + a keepalive loop that publishes `{ workerId }` to the `keepalive` queue every `KEEPALIVE_INTERVAL_MS`, and wires `consumer.consumeTasks` to `miner.mine` → publish result.

---

## 3. Data Flow & Integration Points

### 3.1 Happy-path mining cycle

```
1. Client → POST /transaction (Pool)
2. Pool: validateTransaction + HMAC verify → pool.add(tx)
3. When pool.size() >= BLOCK_THRESHOLD:
      batch = pool.flush()
      n     = registry.count()              (fallback to 1 if 0 — see §4)
      ranges = nonceSplitter.split(n)
      payload = coordinator/block.buildPayload(batch)  (or pool-side equivalent)
      for each range: publishTask({ taskId, payload, prefix=DIFFICULTY, range })
4. RabbitMQ mining_tasks (prefetch 1) → one worker per range
5. Worker: miner.mine(task) spawns Pilar 1 binary
6. On found → publish { taskId, prevHash, nonce, hash, payload } to mining_results; ack
7. Coordinator consumeResults(handler):
      if acquireLock(prevHash):             (SET NX EX 30 — first writer wins)
         verify hash(payload+nonce) starts with DIFFICULTY
         block = buildBlock(task, nonce, hash)
         storeBlock(block)                  (HSET block:<hash> + RPUSH chain)
      else: discard (another worker already committed this height)
8. GET /status (Coordinator) → { chain_length: getChain().length }
```

### 3.2 RabbitMQ topology

| Queue | Type | Producer | Consumer | Options |
|-------|------|----------|----------|---------|
| `mining_tasks` | direct work queue | Pool | Worker(s) | `prefetch: 1`, durable |
| `mining_results` | direct | Worker(s) | Coordinator | durable, ack on commit |
| `keepalive` | work queue | Worker(s) | Pool | `x-message-ttl: 30000` |

Each service asserts the queues it uses on startup (idempotent). `prefetch(1)` on `mining_tasks` is the load-balancing primitive: RabbitMQ won't dispatch a second task to a worker until it acks the first.

### 3.3 Redis key schema

| Key | Type | Written by | Purpose |
|-----|------|-----------|---------|
| `block:<hash>` | HASH | Coordinator | fields: `previous_hash`, `nonce`, `timestamp`, `transactions` (JSON), `block_hash` |
| `chain` | LIST | Coordinator | ordered block hashes, `RPUSH` to append |
| `lock:<prevHash>` | STRING | Coordinator | `SET NX EX 30` — atomic per-height commit lock |

AOF persistence (`--appendonly yes`) so the chain survives a Redis restart.

### 3.4 Canonical payload (cross-service contract)

Both HMAC signing and PoW hashing depend on a **deterministic serialization**. Rule: serialize transaction fields in `REQUIRED_FIELDS` order (signing excludes `signature`); serialize the block payload as the concatenation of transaction canonical strings. The miner appends the candidate `nonce` to `payload` before hashing. Any drift in serialization between Pool/Worker/Coordinator breaks verification — this is the single sharpest integration risk and is centralized in `block.buildPayload` + `shared/hash`.

---

## 4. Edge Cases & Resolutions

| Case | Resolution |
|------|-----------|
| **0 live workers at block formation** | `registry.count()` returns 0 → Pool falls back to `split(1)` and the batch is still publishable; a worker (or inline CPU fallback) picks it up when it registers. Never split into 0 ranges (`split` throws on `<= 0`). |
| **Two workers return a valid nonce for the same height** | `acquireLock(prevHash)` via `SET NX EX 30`. First writer commits; second sees the lock and discards. Lock auto-expires in 30s if the Coordinator crashes mid-commit. |
| **Nonce exhaustion (`NOT FOUND`)** | Worker acks the task and the range simply produced no solution. Coordinator never receives a result for it; on no commit within a window, Pool re-publishes with a fresh `timestamp` (changes the payload → new search space). |
| **Keepalive buildup after worker crash** | `x-message-ttl: 30000` on the `keepalive` queue; stale messages self-expire, and `worker-registry.expire()` drops the worker after `WORKER_TTL_MS`. |
| **RabbitMQ not ready at startup** | Compose healthcheck gates dependents + `shared/amqp.js` exponential backoff (≈63s tolerance window). |
| **Malformed / truncated Pilar 1 stdout** | `miner.mine` returns `{ found: false }` defensively rather than throwing — a killed child process can't corrupt the result stream. |

---

## 5. Infrastructure Design

### 5.1 `package.json`
```json
{
  "name": "pilar2",
  "scripts": {
    "start": "node entrypoint.js",
    "test": "jest",
    "test:unit": "jest --selectProjects unit",
    "test:integration": "jest --selectProjects integration"
  },
  "dependencies": {
    "express": "...", "amqplib": "...", "ioredis": "...",
    "md5": "...", "uuid": "...", "dotenv": "..."
  },
  "devDependencies": {
    "jest": "...", "supertest": "...", "@jest/globals": "..."
  }
}
```
`start` is service-agnostic: `entrypoint.js` reads `process.env.SERVICE` and requires the matching `index.js`/`server.js`. One image, one start command, four roles.

### 5.2 `entrypoint.js`
```js
require('dotenv').config();
const SERVICE = process.env.SERVICE;
const map = {
  coordinator: './coordinator/index.js',
  pool: './pool/index.js',
  worker: './worker/index.js',
  validator: './validator/server.js',
};
if (!map[SERVICE]) { console.error(`unknown SERVICE: ${SERVICE}`); process.exit(1); }
require(map[SERVICE]);
```

### 5.3 `Dockerfile` (single image, all services)
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev
COPY . .
CMD ["node", "entrypoint.js"]
```
One image is correct here because all four services share one dependency set (single root `package.json`). Role is selected at runtime via `SERVICE`. **Note:** the Pilar 1 binary lives at `../pilar1/...` relative to the repo — for the worker to spawn it inside the container, the compose worker service must mount or copy the Pilar 1 directory into the image context. Flag for `sdd-tasks`: decide between a build-context that includes `pilar1/` or a bind-mount volume in `docker-compose.yml`.

### 5.4 `docker-compose.yml`
```yaml
services:
  rabbitmq:
    image: rabbitmq:3-management
    healthcheck: { test: rabbitmq-diagnostics ping, interval: 10s, retries: 5 }
  redis:
    image: redis:7-alpine
    command: redis-server --appendonly yes
    healthcheck: { test: redis-cli ping, interval: 5s }
  validator:
    build: { context: ., dockerfile: Dockerfile }
    environment: { SERVICE: validator }
  coordinator:
    build: { context: ., dockerfile: Dockerfile }
    environment: { SERVICE: coordinator }
    depends_on:
      rabbitmq: { condition: service_healthy }
      redis:    { condition: service_healthy }
  pool:
    build: { context: ., dockerfile: Dockerfile }
    environment: { SERVICE: pool }
    depends_on:
      rabbitmq:    { condition: service_healthy }
      coordinator: { condition: service_started }
  worker:
    build: { context: ., dockerfile: Dockerfile }
    environment: { SERVICE: worker }
    deploy: { replicas: 2 }
    depends_on:
      rabbitmq: { condition: service_healthy }
```
Healthcheck-gated `depends_on` is the structural half of the startup-race mitigation; `shared/amqp.js` backoff is the runtime half. Worker runs `replicas: 2` to exercise the multi-worker nonce split by default.

### 5.5 `.env.example`
```
RABBITMQ_URL=amqp://guest:guest@rabbitmq:5672
REDIS_URL=redis://redis:6379
HMAC_SECRET=change-me-in-production
BLOCK_THRESHOLD=10
DIFFICULTY=0000
MAX_NONCE=9007199254740991
KEEPALIVE_INTERVAL_MS=10000
WORKER_TTL_MS=30000
PORT_COORDINATOR=3000
PORT_POOL=3001
PORT_WORKER=3002
PORT_VALIDATOR=3003
PILAR1_CPU_BINARY=../pilar1/Hit7/CPU/pow_cpu_range.js
```
`.env` is git-ignored; only `.env.example` is committed (HMAC secret hygiene).

---

## 6. Testing Architecture

### 6.1 `jest.config.js` — two projects, hard separation
```js
module.exports = {
  projects: [
    { displayName: 'unit', testEnvironment: 'node', testMatch: ['<rootDir>/tests/unit/**/*.test.js'] },
    { displayName: 'integration', testEnvironment: 'node', testMatch: ['<rootDir>/tests/integration/**/*.test.js'] },
  ],
};
```
**Why two projects:** unit tests must run with zero infrastructure (CI-friendly, millisecond feedback, TDD inner loop). Integration tests require live RabbitMQ + Redis and are opt-in via `test:integration`. Mixing them would force Docker on every `jest` run and kill the TDD loop.

### 6.2 Unit targets (pure functions — TDD-first)
- `validator.test.js` — missing fields, invalid type, bad quantity, valid tx.
- `nonce-splitter.test.js` — contiguity, no overlap, full `[0, MAX]` coverage, remainder in last range, throws on `<= 0`.
- `worker-registry.test.js` — register/count, TTL expiry (inject clock or `WORKER_TTL_MS`), expire drops stale.

### 6.3 Integration (`mining-cycle.test.js`)
- Spins `docker-compose.test.yml` (real rabbitmq + redis).
- `POST /transaction` ×10 → poll `GET /status` until `chain_length === 1`, 30s timeout.
- Asserts the full pipeline: intake → split → mine → verify → commit.

---

## 7. ADR Log (decisions, rationale, rejected alternatives)

### ADR-1 — Pool and Coordinator are separate services
**Decision:** Two distinct Express services.
**Rationale:** Pool has no Redis dependency; Coordinator has no accumulation logic. Maps 1:1 to spec components P5 (Pool) and P4 (NCT). Independent scaling: intake throughput vs. single-writer chain authority.
**Rejected:** Merge into one service — simpler deploy, but couples intake load to chain-commit and blurs the single-writer boundary that prevents Redis write races.

### ADR-2 — Only the Coordinator writes Redis
**Decision:** Single-writer invariant for all chain state.
**Rationale:** Serializes block commitment through one authority; combined with `SET NX` locks, eliminates concurrent-write races structurally rather than defensively.
**Rejected:** Let Pool/Worker write chain state — would require distributed consensus on ordering; massive complexity for a university-scale system.

### ADR-3 — `mining_tasks` is a direct work queue with `prefetch: 1`
**Decision:** Work queue, not fanout/topic.
**Rationale:** Each nonce range must be processed by exactly one worker. `prefetch(1)` gives fair, one-at-a-time dispatch and natural load balancing across replicas.
**Rejected:** Fanout — every worker would redundantly mine every range, wasting CPU and producing duplicate results.

### ADR-4 — Race resolution via Redis `SET NX EX 30`
**Decision:** Per-height lock `lock:<prevHash>` with `NX` and 30s expiry.
**Rationale:** Atomic first-writer-wins with crash safety (auto-expiry). No extra coordination service.
**Rejected:** Application-level mutex — not crash-safe, not shared across Coordinator restarts/instances.

### ADR-5 — HMAC-SHA256 for transaction signatures
**Decision:** Shared-secret HMAC-SHA256 via `crypto.timingSafeEqual`.
**Rationale:** ~5 lines, zero key-management, proves integrity — adequate for the custody-chain scope. Explicitly documented as "not production; use ECDSA for real deployments."
**Rejected:** ECDSA — correct for production but adds keypair lifecycle and verification complexity unjustified at this scope.

### ADR-6 — Single root `package.json` (no workspaces)
**Decision:** Monorepo with one dependency set, relative imports for shared code.
**Rationale:** No inter-service dependency conflicts; simplest Docker `COPY`; one image for all roles.
**Rejected:** npm workspaces — per-package isolation buys nothing here and complicates the Dockerfile.

### ADR-7 — MD5 centralized in `shared/hash.js`
**Decision:** PoW uses MD5 (`md5` npm package), behind a single `hash()` wrapper.
**Rationale:** Matches the Pilar 1 binary; centralizing makes any future algorithm change a one-line edit.
**Rejected:** SHA256 — would mismatch the Pilar 1 binary's actual computation; inline `crypto` calls scattered per service — refactor hazard.

### ADR-8 — Express over Fastify
**Decision:** Express for all HTTP shells.
**Rationale:** Bottleneck is PoW + I/O, not HTTP throughput; `supertest` is the canonical Jest companion; lower learning curve for a university project.
**Rejected:** Fastify — marginal perf gain irrelevant against PoW cost.

### ADR-9 — Single image, runtime role via `SERVICE` env
**Decision:** One Dockerfile + `entrypoint.js` dispatch on `process.env.SERVICE`.
**Rationale:** All services share one dependency set; one build, four roles; trivial compose wiring.
**Rejected:** Per-service Dockerfiles — duplicated build context for identical dependencies.

### ADR-10 — Nonce space `[0, MAX_SAFE_INTEGER]` split into N equal ranges
**Decision:** `Math.floor(MAX / N)` per range; last range absorbs remainder.
**Rationale:** Guarantees full coverage with no JS float-precision loss (stays within safe-integer bounds). For difficulty `"0000"` the solution is statistically reachable well within any single worker's range.
**Rejected:** Random nonce assignment — risks gaps/overlaps and no coverage guarantee.

---

## 8. Open Items for `sdd-tasks`

1. **Pilar 1 binary delivery into the worker container** — bind-mount `../pilar1` as a volume vs. include in build context. Affects `docker-compose.yml` and `Dockerfile` `COPY` scope. (§5.3)
2. **Canonical serialization function ownership** — confirm whether `buildPayload` lives in `coordinator/block.js` only, or is shared so Pool produces the identical payload it publishes. Must be byte-identical across Pool/Worker/Coordinator. (§3.4)
3. **Inline CPU fallback worker** when `registry.count() === 0` — decide whether the Pool launches a local miner or simply publishes `split(1)` and waits. (§4)
4. **`mining_results` payload shape** — finalize the exact fields (`taskId`, `prevHash`, `nonce`, `hash`, `payload`) the worker emits and the coordinator verifies.

---

## 9. Architectural Risks

| Risk | Severity | Note |
|------|----------|------|
| Serialization drift between services | High | Canonical payload must be byte-identical; any whitespace/ordering mismatch silently breaks PoW verification. Centralize in `block.buildPayload` + `shared/hash`. |
| Pilar 1 binary not reachable in container | High | Path is relative to repo root, not container WORKDIR. Resolve in compose before integration tests can pass. |
| Pilar 1 stdout contract assumption | Medium | Confirmed format (`Nonce:` / `Hash:` / `NOT FOUND`) but isolated in `miner.js` for one-spot correction if the real binary differs. |
| Worker count = 0 at block time | Medium | `split(1)` fallback keeps the system live; inline-fallback decision deferred to tasks. |
| Nonce exhaustion with no commit | Medium | Re-publish with fresh timestamp; needs a Coordinator-side timeout/retry mechanism to be specified in tasks. |
```
