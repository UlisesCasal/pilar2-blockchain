# Tasks: Pilar 2 — Distributed PoW Blockchain Infrastructure

## Review Workload Forecast

| Field | Value |
|-------|-------|
| Estimated changed lines | ~1 800 – 2 400 |
| 400-line budget risk | High |
| Chained PRs recommended | Yes |
| Suggested split | PR 1 (Batch 0-1) → PR 2 (Batch 2-3) → PR 3 (Batch 4-5) → PR 4 (Batch 6-7) |
| Delivery strategy | ask-on-risk |
| Chain strategy | pending |

Decision needed before apply: Yes
Chained PRs recommended: Yes
Chain strategy: pending
400-line budget risk: High

### Suggested Work Units

| Unit | Goal | Likely PR | Notes |
|------|------|-----------|-------|
| 1 | Repo setup + shared utilities | PR 1 | Pure functions, zero I/O, all tests pass offline |
| 2 | Validator + infra clients | PR 2 | Depends on PR 1; unit tests for all modules |
| 3 | Pool service + Coordinator | PR 3 | Depends on PR 2; core business logic |
| 4 | Worker + Docker Compose + integration | PR 4 | Depends on PR 3; requires running infra |

---

## Batch 0: Repo & Infrastructure Setup (sequential — must be first)

- [x] 0.1 Init git repo: `git init` in `/Users/ulisescasal/.../Pilar2`, create initial commit
- [x] 0.2 Add git submodule: `git submodule add https://github.com/EViani/TPI-SDyPP.git tpi`; verify `tpi/pilar1/Hit7/CPU/pow_cpu_range.js` is present
- [x] 0.3 Create `package.json` — deps: `express`, `amqplib`, `ioredis`, `md5`, `uuid`, `dotenv`; devDeps: `jest`, `supertest`; scripts: `start`, `test`, `test:unit`, `test:integration`
- [x] 0.4 Create `jest.config.js` — two projects: `unit` (`tests/unit/**/*.test.js`) and `integration` (`tests/integration/**/*.test.js`)
- [x] 0.5 Create `.gitignore` — must include `.env`, `node_modules/`, `tpi/` (or submodule exclude)
- [x] 0.6 Create `.env.example` with all required keys: `RABBITMQ_URL`, `REDIS_URL`, `HMAC_SECRET`, `BLOCK_THRESHOLD`, `DIFFICULTY`, `MAX_NONCE`, `KEEPALIVE_INTERVAL_MS`, `WORKER_TTL_MS`, `PORT_*`, `PILAR1_CPU_BINARY=./tpi/pilar1/Hit7/CPU/pow_cpu_range.js`
- [x] 0.7 Create `entrypoint.js` — reads `process.env.SERVICE`, dispatches to `coordinator/pool/worker/validator` index; exits 1 on unknown SERVICE
- [x] 0.8 Create `Dockerfile` — `FROM node:20-alpine`, `COPY tpi/ ./tpi/`, `npm ci --omit=dev`, `COPY . .`, `CMD ["node","entrypoint.js"]`; tpi submodule is included in build context (not a bind-mount — avoids host path coupling)

---

## Batch 1: Shared Utilities — Pure Functions, Zero I/O (parallel within batch)

STRICT TDD: write the test file first (RED), then implement (GREEN).

- [x] 1.1 [TEST FIRST] Create `tests/unit/hash.test.js` — asserts `hash("abc")` equals known MD5 hex; asserts pure (same input → same output); asserts string output
- [x] 1.2 Create `shared/hash.js` — `md5` wrapper: `function hash(str) { return md5(str); }` — make 1.1 green
- [x] 1.3 [TEST FIRST] Create `tests/unit/hmac.test.js` — 5 scenarios: sign returns hex string; verify returns true for correct sig; verify returns false for tampered sig; verify returns false for wrong secret; handles mismatched-length buffer without throwing
- [x] 1.4 Create `shared/hmac.js` — `sign(payload,secret)` / `verify(payload,sig,secret)` with `timingSafeEqual` + length guard — make 1.3 green
- [x] 1.5 Create `shared/schema.js` — export `VALID_TYPES` and `REQUIRED_FIELDS` array; no I/O
- [x] 1.6 [TEST FIRST] Create `tests/unit/block.test.js` — asserts `buildPayload(txArray,prevHash)` is byte-identical for same inputs; asserts prevHash is included; asserts field ordering matches spec; asserts multi-tx uses stable sort by `id`
- [x] 1.7 Create `shared/block.js` — `buildPayload(transactions,prevHash)` canonical serialization (MOVED from coordinator — sole canonical source for Pool AND Coordinator); `buildBlock(task,nonce,hash)` assembles final block object — make 1.6 green

---

## Batch 2: Validator Service (sequential within service; parallel with Batch 3)

STRICT TDD for core logic.

- [x] 2.1 [TEST FIRST] Create `tests/unit/validator.test.js` — 9 scenarios mapped to spec: valid MINERAL accepted; valid CRUDO accepted; missing required field → 400 + lists field; `cantidad=0` → 400; `cantidad<0` → 400; `tipo` invalid → 400; `origen===destino` → 400; `firma` tampered → 400 `{valid:false,errors:["firma"]}`; `firma` missing → 400
- [x] 2.2 Create `validator/index.js` — `validateTransaction(tx)` pure function using `shared/schema.js`; HMAC verify via `shared/hmac.verify`; inject secret as argument for testability — make 2.1 green
- [x] 2.3 Create `validator/server.js` — Express app; `POST /validate` → `validateTransaction` → 200/400/422; `GET /health` → 200; errors conform to `{error,details}` contract

---

## Batch 3: Infrastructure Clients (parallel with Batch 2)

STRICT TDD with mocks.

- [x] 3.1 [TEST FIRST] Create `tests/unit/amqp.test.js` — mock `amqplib`; asserts: returns `{channel,connection}` on first try; retries on connection error; throws after `maxRetries` exceeded; backoff delay doubles each attempt
- [x] 3.2 Create `shared/amqp.js` — `createChannel(url,{maxRetries=6})` exponential backoff (1,2,4,8,16,32 s); returns `{channel,connection}`; caller asserts queues — make 3.1 green
- [x] 3.3 [TEST FIRST] Create `tests/unit/redis.test.js` — mock `ioredis`; asserts: `storeBlock` calls HSET + RPUSH; `getBlock` returns hydrated object; `getBlock` returns null for unknown hash; `getChain` returns array in insertion order; `acquireLock` returns true on SET NX success, false otherwise
- [x] 3.4 Create `coordinator/redis.js` — `storeBlock(block)`, `getChain()`, `getBlock(hash)`, `acquireLock(prevHash)` using `ioredis`; key schema: `block:<hash>` HASH, `chain` LIST, `lock:<prevHash>` SET NX EX 60 — make 3.3 green

---

## Batch 4: Pool Service (sequential; depends on Batch 1 + 3)

STRICT TDD for all pure modules.

- [x] 4.1 [TEST FIRST] Create `tests/unit/nonce-splitter.test.js` — 6 scenarios: N=1 returns `[{start:0,end:MAX}]`; N=2 contiguous non-overlapping cover `[0,MAX]`; N=3 last range absorbs remainder; throws on `workerCount<=0`; all values are safe integers; ranges are exactly N entries
- [x] 4.2 Create `pool/nonce-splitter.js` — `split(workerCount)` returning `[{start,end}]`; uses `MAX=Number.MAX_SAFE_INTEGER`; last range absorbs remainder — make 4.1 green
- [x] 4.3 [TEST FIRST] Create `tests/unit/worker-registry.test.js` — 4 scenarios: `register` then `count()===1`; two registers → `count()===2`; after TTL elapsed worker removed; `expire()` is called inside `count()` (inject fake clock via `Date.now` spy)
- [x] 4.4 Create `pool/worker-registry.js` — `makeRegistry({ttlMs})` factory returning `{register,expire,count}` — make 4.3 green
- [x] 4.5 [TEST FIRST] Create `tests/unit/transaction-pool.test.js` — 3 scenarios: `add` then `size()===1`; `flush()` returns batch and resets to 0; multiple adds accumulate correctly
- [x] 4.6 Create `pool/transaction-pool.js` — `add(tx)`, `flush()`, `size()` — make 4.5 green
- [x] 4.7 Create `pool/index.js` — Express app; `POST /transaction`: forward to validator HTTP, on pass `pool.add`, if `pool.size()>=BLOCK_THRESHOLD` → `flush()` → `nonceSplitter.split(Math.max(registry.count(),1))` → build payload via `shared/block.buildPayload` → publish N tasks; 0-worker fallback: `split(1)` + difficulty reduced by 1 leading char; `GET /status` → `{pending_tx,active_workers}`; consume `keepalive` queue → `registry.register`

---

## Batch 5: Coordinator / NCT (sequential; depends on Batch 1 + 3)

- [x] 5.1 Create `coordinator/rabbitmq.js` — `publishTask(channel,task)` → publish to `mining_tasks` (durable); `consumeResults(channel,handler)` → subscribe `mining_results` with `prefetch:1`; ack on handler resolve; assert both queues durable on startup
- [x] 5.2 Create `coordinator/index.js` — Express app; on startup: init Redis genesis block if chain empty (`getChain().length===0`); connect AMQP via `shared/amqp.js`; call `consumeResults(handler)`:
  - if `!result.found` → ack + discard
  - if `!acquireLock(result.prevHash)` → ack + discard (race: another worker already committed)
  - rebuild payload via `shared/block.buildPayload`; verify `hash(payload+nonce).startsWith(DIFFICULTY)`
  - `buildBlock` → `storeBlock`; ack
  - `POST /transaction` → HTTP forward to Pool; `GET /status` → `{nct:"OK",chain_length,pending_tx,last_block}`; `GET /redis/status`; `GET /rabbitmq/status`
- [x] 5.3 [INVARIANT] Confirm `shared/block.buildPayload` is the ONLY source of payload serialization — no local copies in `coordinator/block.js` or Pool; remove `coordinator/block.js` if it duplicates `buildPayload`; keep only `buildBlock` there

---

## Batch 6: Worker Service (sequential; depends on Batch 1 + 3)

STRICT TDD for miner.

- [x] 6.1 [TEST FIRST] Create `tests/unit/miner.test.js` — mock `child_process.spawn`; 3 scenarios: stdout `Nonce: 42\nHash: 0000abc` → `{found:true,nonce:"42",hash:"0000abc"}`; stdout `NOT FOUND` → `{found:false}`; malformed stdout → `{found:false}` (defensive guard)
- [x] 6.2 Create `worker/miner.js` — `mine({payload,prefix,nonceStart,nonceEnd})` spawns `node [PILAR1_CPU_BINARY] payload prefix start end`; parses stdout for `Nonce:` and `Hash:` lines; defensive `found:false` on malformed output — make 6.1 green; `PILAR1_CPU_BINARY=./tpi/pilar1/Hit7/CPU/pow_cpu_range.js`
- [x] 6.3 Create `worker/consumer.js` — `consumeTasks(channel,handler)` → subscribe `mining_tasks` with `prefetch:1`; call `handler(task)`; publish result `{task_id,nonce,hash,found,worker_id}` to `mining_results`; ack after handler resolves
- [x] 6.4 Create `worker/index.js` — Express app; `GET /worker/status` → `{worker:"OK",type:"CPU",hash_rate,last_task}`; keepalive loop: `setInterval` every `KEEPALIVE_INTERVAL_MS` publishes `{worker_id,type,timestamp}` to `keepalive`; wire `consumer.consumeTasks` → `miner.mine`

---

## Batch 7: Docker Compose + Integration Test (depends on all batches)

- [x] 7.1 Create `docker-compose.yml` — services: `rabbitmq` (management, healthcheck `rabbitmq-diagnostics ping`, interval 10s retries 5), `redis` (`--appendonly yes`, healthcheck `redis-cli ping`), `validator` (`SERVICE=validator`), `coordinator` (depends_on rabbitmq+redis `service_healthy`), `pool` (depends_on rabbitmq `service_healthy`), `worker` (depends_on rabbitmq `service_healthy`, `deploy.replicas:2`, `PILAR1_CPU_BINARY=./tpi/pilar1/Hit7/CPU/pow_cpu_range.js`); shared network; env_file `.env`
- [x] 7.2 Create `docker-compose.test.yml` — `rabbitmq` + `redis` only; for integration test runner (no app services — tests run on host against mapped ports)
- [x] 7.3 Create `tests/integration/mining-cycle.test.js` — POST 10 valid HMAC-signed transactions to Pool `POST /transaction`; poll `GET /status` on Coordinator every 2s, timeout 60s; assert `chain_length===1`; assert returned block object has all five Redis HASH fields (`previous_hash`, `nonce`, `timestamp`, `transactions`, `block_hash`); requires `docker-compose.test.yml` running

---

## TDD Summary

| Module | Test file | Scenarios |
|--------|-----------|-----------|
| shared/hash.js | tests/unit/hash.test.js | 3 |
| shared/hmac.js | tests/unit/hmac.test.js | 5 |
| shared/block.js | tests/unit/block.test.js | 4 |
| validator/index.js | tests/unit/validator.test.js | 9 |
| shared/amqp.js | tests/unit/amqp.test.js | 4 |
| coordinator/redis.js | tests/unit/redis.test.js | 5 |
| pool/nonce-splitter.js | tests/unit/nonce-splitter.test.js | 6 |
| pool/worker-registry.js | tests/unit/worker-registry.test.js | 4 |
| pool/transaction-pool.js | tests/unit/transaction-pool.test.js | 3 |
| worker/miner.js | tests/unit/miner.test.js | 3 |
| Full pipeline | tests/integration/mining-cycle.test.js | 1 |

**Total unit tests: 46 | Integration tests: 1**
