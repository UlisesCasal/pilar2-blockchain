# Spec: Pilar 2 — Distributed PoW Blockchain Infrastructure

Change: `pilar2-distributed-blockchain`
Mode: New capabilities (greenfield — no prior specs to delta against)

---

## Capability: transaction-validation

### Purpose

Schema validation and HMAC-SHA256 signature verification for custody transactions.

### Requirements

#### Requirement: Transaction Schema Enforcement

The validator MUST reject any transaction missing one or more required fields: `id`, `id_lote`, `origen`, `destino`, `cantidad`, `tipo`, `timestamp`, `firma`. The response MUST list every failing field.

##### Scenario: Valid MINERAL transaction accepted

- GIVEN a transaction with all required fields, `tipo = "MINERAL"`, `cantidad > 0`, `origen !== destino`, and a valid HMAC-SHA256 `firma`
- WHEN the validator receives it
- THEN it returns `{ valid: true }` with HTTP 200

##### Scenario: Valid CRUDO transaction accepted

- GIVEN the same conditions with `tipo = "CRUDO"`
- WHEN the validator receives it
- THEN it returns `{ valid: true }` with HTTP 200

##### Scenario: Missing required field

- GIVEN a transaction with one or more required fields absent
- WHEN the validator receives it
- THEN it returns HTTP 400 with `{ valid: false, errors: [<field-names>] }`

##### Scenario: cantidad = 0 rejected

- GIVEN `cantidad = 0`
- WHEN validated
- THEN HTTP 400, error references `cantidad`

##### Scenario: cantidad negative rejected

- GIVEN `cantidad < 0`
- WHEN validated
- THEN HTTP 400, error references `cantidad`

##### Scenario: tipo invalid rejected

- GIVEN `tipo = "GAS"` (not in enum `MINERAL | CRUDO`)
- WHEN validated
- THEN HTTP 400, error references `tipo`

##### Scenario: origen equals destino rejected

- GIVEN `origen === destino`
- WHEN validated
- THEN HTTP 400, error references `destino`

##### Scenario: firma tampered rejected

- GIVEN a valid transaction body with `firma` replaced by an incorrect hex string
- WHEN validated
- THEN HTTP 400, `{ valid: false, errors: ["firma"] }`

##### Scenario: firma missing rejected

- GIVEN a transaction with no `firma` field
- WHEN validated
- THEN HTTP 400, `{ valid: false, errors: ["firma"] }`

---

## Capability: transaction-pool

### Purpose

Transaction accumulation, BLOCK_SIZE threshold triggering, nonce range splitting, and worker registry with keepalive management.

### Requirements

#### Requirement: Transaction Intake and Validation Gate

The pool MUST forward every incoming transaction to the validator. Only transactions that pass validation MAY be stored in the pending pool.

##### Scenario: Valid transaction stored

- GIVEN a valid transaction (passes validation)
- WHEN `POST /transaction` is called
- THEN the transaction is added to the pending pool and HTTP 201 is returned

##### Scenario: Invalid transaction rejected

- GIVEN a transaction that fails validation
- WHEN `POST /transaction` is called
- THEN HTTP 400 is returned with the validator's error list; the pool is unchanged

#### Requirement: Block Formation Threshold

When pending transaction count reaches `BLOCK_SIZE` (default 10), the pool MUST emit a block formation event and MUST clear those transactions from the pending pool atomically.

##### Scenario: Threshold triggers block formation

- GIVEN 9 transactions in the pending pool
- WHEN the 10th valid transaction arrives
- THEN a block formation event is published and the pool is cleared to 0

#### Requirement: Nonce Range Splitting

The pool MUST split the nonce range `[0, 9007199254740991]` into N equal parts where N is the number of active workers at block formation time.

##### Scenario: Range split across N workers

- GIVEN N active workers (N >= 1)
- WHEN a block formation event fires
- THEN N mining task messages are published, each with a non-overlapping `[nonce_start, nonce_end]` that together cover the full range

##### Scenario: Zero workers fallback

- GIVEN 0 active workers at block formation time
- WHEN a block formation event fires
- THEN the pool MUST reduce difficulty by removing one leading character AND emit one mining task to `mining_tasks` for any available CPU worker

#### Requirement: Worker Keepalive Registry

Workers MUST register presence via a keepalive queue message every 10 seconds. The pool MUST track each worker with a 30-second TTL. Expired workers MUST be removed from the active worker list.

##### Scenario: Worker keepalive registered

- GIVEN a worker keepalive message `{ worker_id, type, timestamp }`
- WHEN received by the pool
- THEN the worker is added or refreshed in the active registry with TTL 30s

##### Scenario: Worker keepalive expires

- GIVEN a registered worker that sends no keepalive for > 30 seconds
- WHEN the TTL expires
- THEN the worker is removed from the active registry

#### Requirement: Pool Status Endpoint

`GET /status` MUST return the current state of the pool without side effects.

##### Scenario: Status response structure

- GIVEN the pool is running
- WHEN `GET /status` is called
- THEN HTTP 200 with `{ pending_tx: <n>, active_gpu_workers: <n>, active_cpu_workers: <n> }`

---

## Capability: task-distribution

### Purpose

RabbitMQ queue topology for mining task routing and result collection.

### Requirements

#### Requirement: Queue Declarations

The system MUST declare three durable or TTL-bounded queues with exactly the specified properties.

| Queue | Durable | prefetch | Extra |
|---|---|---|---|
| `mining_tasks` | Yes | 1 | — |
| `mining_results` | Yes | — | — |
| `keepalive` | No | — | `x-message-ttl=30000` |

##### Scenario: mining_tasks prefetch enforcement

- GIVEN two workers connected to `mining_tasks`
- WHEN a message is published
- THEN exactly one worker receives and processes it; the second receives the next message only after the first is acknowledged

##### Scenario: keepalive message auto-expires

- GIVEN a message published to `keepalive` with no consumer
- WHEN 30 seconds elapse
- THEN the message is dropped by RabbitMQ

#### Requirement: Mining Task Message Schema

Every message published to `mining_tasks` MUST contain: `task_id` (uuid v4), `payload` (string), `prev_hash` (string), `difficulty` (string), `nonce_start` (integer >= 0), `nonce_end` (integer <= 9007199254740991), `transactions` (array).

##### Scenario: Task message fields present

- GIVEN a valid block formation event
- WHEN the coordinator publishes to `mining_tasks`
- THEN the message JSON includes all required fields with correct types

---

## Capability: mining-worker

### Purpose

Consumes mining tasks, executes Pilar 1 PoW binary, publishes results.

### Requirements

#### Requirement: Task Consumption and PoW Execution

The worker MUST consume a task from `mining_tasks`, spawn `pow_cpu_range.js <hash> <prefix> <nonce_start> <nonce_end>` as a child process, and parse stdout.

##### Scenario: Nonce found — success result published

- GIVEN the binary outputs a line `Nonce:   48291` and a line `Hash:     0000f4...`
- WHEN the worker processes stdout
- THEN it publishes `{ task_id, nonce: 48291, hash: "0000f4...", worker_id, found: true }` to `mining_results`

##### Scenario: Nonce not found — failure result published

- GIVEN the binary first line is `NOT FOUND`
- WHEN the worker processes stdout
- THEN it publishes `{ task_id, nonce: null, hash: null, worker_id, found: false }` to `mining_results`

#### Requirement: Worker Keepalive Emission

The worker MUST publish `{ worker_id, type, timestamp }` to the `keepalive` queue every 10 seconds while running.

##### Scenario: Keepalive sent periodically

- GIVEN a running worker
- WHEN 10 seconds elapse
- THEN exactly one keepalive message is published to `keepalive`

#### Requirement: Worker Status Endpoint

`GET /worker/status` MUST return current worker state without side effects.

##### Scenario: Status response structure

- GIVEN the worker is running
- WHEN `GET /worker/status` is called
- THEN HTTP 200 with `{ worker: "OK", type: "CPU"|"GPU", hash_rate: <n>, last_task: <id>|null }`

---

## Capability: block-coordination

### Purpose

Coordinator (NCT) consumes mining results, verifies nonce+hash, commits blocks atomically.

### Requirements

#### Requirement: Result Verification

The coordinator MUST verify that `MD5(payload + nonce)` starts with the `difficulty` string before committing a block.

##### Scenario: Valid result committed

- GIVEN a mining result with `found: true` where `MD5(payload + nonce).startsWith(difficulty)` is true
- WHEN the coordinator consumes it
- THEN the block is stored in Redis and a confirmation is published

##### Scenario: Invalid hash discarded

- GIVEN a mining result where the hash does not match
- WHEN the coordinator consumes it
- THEN the result is discarded with a warning log; no block is stored

##### Scenario: Failure result discarded

- GIVEN a mining result with `found: false`
- WHEN the coordinator consumes it
- THEN the result is discarded; no block is stored

#### Requirement: Race Condition Resolution

When multiple workers publish a result for the same task, only the first MUST be committed. Subsequent results for the same `task_id` MUST be silently ignored.

##### Scenario: First result wins

- GIVEN two workers publish results for the same `task_id` near-simultaneously
- WHEN the coordinator processes them
- THEN exactly one block is stored; the second result is discarded

#### Requirement: Coordinator HTTP Endpoints

##### Scenario: POST /transaction

- GIVEN a transaction payload
- WHEN `POST /transaction` is called on the coordinator
- THEN it validates and forwards to the pool; returns the pool's response

##### Scenario: GET /status

- GIVEN the coordinator is running
- WHEN `GET /status` is called
- THEN HTTP 200 with `{ nct: "OK", chain_length: <n>, pending_tx: <n>, last_block: <hash>|null }`

##### Scenario: GET /redis/status

- WHEN `GET /redis/status` is called
- THEN HTTP 200 with `{ redis: "OK"|"ERROR", blocks_stored: <n> }`

##### Scenario: GET /rabbitmq/status

- WHEN `GET /rabbitmq/status` is called
- THEN HTTP 200 with `{ rabbitmq: "OK"|"ERROR", queue_depth: <n> }`

---

## Capability: blockchain-state

### Purpose

Redis storage for blockchain: per-block hashes, ordered chain list, and atomic lock.

### Requirements

#### Requirement: Block Storage Schema

Each block MUST be stored as a Redis hash at key `block:<block_hash>` with fields: `previous_hash`, `nonce` (string), `timestamp` (ISO8601), `transactions` (JSON string), `block_hash`.

##### Scenario: Block written and retrievable

- GIVEN a confirmed block
- WHEN stored via `HSET block:<hash> ...`
- THEN `getBlock(hash)` returns an object with all five fields

##### Scenario: Unknown hash returns null

- GIVEN a hash not in Redis
- WHEN `getBlock(hash)` is called
- THEN it returns `null`

#### Requirement: Chain Order

Block hashes MUST be appended to Redis list `chain` via `RPUSH` in confirmation order. `getChain()` MUST return all block objects in insertion order.

##### Scenario: Chain order preserved

- GIVEN blocks B1, B2, B3 confirmed in order
- WHEN `getChain()` is called
- THEN the returned array is `[B1, B2, B3]`

#### Requirement: Genesis Block

The chain MUST be initialized with a genesis block: `previous_hash = "0".repeat(32)`, `nonce = "0"`, `transactions = []`.

##### Scenario: Fresh chain has genesis block

- GIVEN an empty Redis instance
- WHEN the coordinator initializes
- THEN `getChain()` returns exactly one block with `previous_hash = "000...0"` (32 zeros)

#### Requirement: Atomic Commit Lock

`acquireLock(prev_hash)` MUST use Redis `SET lock:task:<id> NX EX 60` and MUST return `true` only if the key was set (lock acquired).

##### Scenario: First caller acquires lock

- GIVEN no lock exists for a task_id
- WHEN two callers attempt `acquireLock` simultaneously
- THEN exactly one returns `true`; the other returns `false`

---

## Capability: deployment-compose

### Purpose

Docker Compose orchestration of all 6 services with health-gated startup order.

### Requirements

#### Requirement: Service Definitions

Docker Compose MUST define services: `rabbitmq`, `redis`, `validator`, `coordinator`, `pool`, `worker`. All services MUST share a single Docker network. Configuration MUST be driven by a `.env` file.

##### Scenario: All services start healthy

- GIVEN `docker compose up --build`
- WHEN all healthchecks pass
- THEN all 6 services are in state `healthy` or `running`

#### Requirement: Startup Order

Services MUST start in dependency order: `rabbitmq` and `redis` first (with healthchecks), then `validator`, then `coordinator` and `pool`, then `worker`.

##### Scenario: rabbitmq healthcheck gates downstream

- GIVEN `rabbitmq` is not yet healthy
- WHEN `coordinator` tries to start
- THEN `coordinator` waits (`depends_on: condition: service_healthy`)

#### Requirement: Worker Replicas

The `worker` service MUST be configured for a minimum of 2 replicas.

##### Scenario: Two workers active by default

- GIVEN `docker compose up`
- WHEN startup completes
- THEN at least 2 worker instances are running and registered in the pool's active registry

#### Requirement: Healthchecks

`rabbitmq` MUST use `rabbitmq-diagnostics ping`. `redis` MUST use `redis-cli ping`.

---

## HTTP API Contract (cross-capability)

All services MUST return `Content-Type: application/json`. Error responses MUST conform to:

```json
{ "error": "<message>", "details": [...] }
```

Successful responses MUST use 2xx status codes. Validation errors MUST use HTTP 400. Server errors MUST use HTTP 500.
