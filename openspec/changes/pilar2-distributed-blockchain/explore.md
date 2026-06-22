# Exploration: pilar2-distributed-blockchain

## Current State

Fully greenfield project. No source files, no `package.json`, no Docker configuration exists.
All architecture decisions made from first principles against the specification.

**Domain**: extractive-industry custody chain (minerals/crude oil).
Transactions are validated, batched, and mined via distributed Proof-of-Work before being committed to a Redis-backed append-only blockchain.

---

## Files to Create

| File | Role |
|---|---|
| `pilar2/shared/schema.js` | Transaction field definitions, shared by all services |
| `pilar2/shared/hash.js` | Hash computation for PoW verification |
| `pilar2/shared/hmac.js` | HMAC-SHA256 sign/verify utilities |
| `pilar2/shared/amqp.js` | RabbitMQ connection factory with retry |
| `pilar2/validator/index.js` | `validateTransaction(tx)` → `{ valid, errors }` |
| `pilar2/validator/server.js` | Thin HTTP wrapper: `POST /validate` |
| `pilar2/coordinator/index.js` | Express app, status endpoints |
| `pilar2/coordinator/rabbitmq.js` | Publisher (mining_tasks) + consumer (mining_results) |
| `pilar2/coordinator/redis.js` | `getChain()`, `getBlock()`, `storeBlock()`, `acquireLock()` |
| `pilar2/coordinator/block.js` | Block formation logic |
| `pilar2/pool/index.js` | Express app: `POST /transaction`, `GET /pool/status` |
| `pilar2/pool/transaction-pool.js` | Accumulation + threshold logic |
| `pilar2/pool/nonce-splitter.js` | Range splitting algorithm |
| `pilar2/pool/worker-registry.js` | Keepalive tracking + TTL expiry |
| `pilar2/worker/index.js` | Express app: `GET /worker/status` |
| `pilar2/worker/consumer.js` | RabbitMQ consumer (mining_tasks) + publisher (mining_results) |
| `pilar2/worker/miner.js` | PoW execution, calls Pilar 1 binary |
| `docker-compose.yml` | All services wired |
| `package.json` | Single root (monorepo) |
| `jest.config.js` | Jest root config |
| `.env.example` | All config variables |

---

## Architecture: Data Flow

```
[Cliente / Pilar 3 tx-generator]
          |
          | POST /transaction
          v
    ┌───────────┐   keepalive    ┌──────────────────┐
    │   POOL    │◄───────────────│   WORKER (x N)   │
    │(pool:3001)│                │  (worker:3002)   │
    └───────────┘                └──────────────────┘
          |                               ▲
          | mining_tasks (RabbitMQ)       | mining_tasks (consume)
          v                               |
    ┌─────────────┐  mining_results  ┌────┴─────────────┐
    │ COORDINATOR │◄─────────────────│   WORKER (x N)   │
    │   (NCT)     │                  │  (pow_cpu_range) │
    │(coord:3000) │                  └──────────────────┘
    └─────────────┘
          |
          | storeBlock()
          v
    ┌───────────┐
    │   REDIS   │  (AOF persistence)
    │(redis:6379│
    └───────────┘

RabbitMQ queues:
  mining_tasks  → work queue (1 consumer gets 1 task)
  mining_results→ direct (coordinator consumes)
  keepalive     → fanout (pool consumes, TTL 30s per message)

Validator runs as:
  - Embedded module in coordinator (no extra HTTP hop for internal calls)
  - Also exposed as POST /validate for external testing
```

---

## Key Design Decisions

### 1. Pool vs Coordinator: separate services
**Decision**: Keep separate.
- Pool has no Redis dependency; Coordinator has no transaction-accumulation logic
- Each scales independently
- Maps directly to spec's P4 (NCT) and P5 (Pool) as distinct labeled components

### 2. Express vs Fastify
**Decision**: Express.
- Bottleneck is PoW and I/O, not HTTP throughput
- `supertest` integration is canonical for Jest
- Lower learning curve, better university-project docs

### 3. Single `package.json` vs npm workspaces
**Decision**: Single root.
- No dependency conflicts expected between services
- Simpler Docker COPY instructions
- Relative imports for shared code

### 4. RabbitMQ pattern for `mining_tasks`
**Decision**: Work queue (NOT fanout/topic).
- Each task must be processed by exactly ONE worker
- First worker to pick up the task wins the race for that nonce range
- `prefetch: 1` ensures fair dispatch

### 5. Race condition: two workers return valid nonce simultaneously
**Decision**: Redis `SET NX` (atomic lock per block height / prev_hash).
- NCT attempts `SET block:<prev_hash>:lock <task_id> NX EX 30`
- First writer wins; second finds key exists → discards result
- Lock auto-expires in 30s in case of NCT crash

### 6. Signature scheme
**Decision**: HMAC-SHA256 with shared secret.
- 5 lines of code, zero key management complexity
- Proves integrity (not tampered), adequate for custody chain
- Document as "not for production — use ECDSA for real deployments"

### 7. Nonce range
**Decision**: `[0, Number.MAX_SAFE_INTEGER]` split into N equal parts.
- MAX_SAFE_INTEGER = 2^53 - 1 = 9,007,199,254,740,991
- For difficulty "0000" (MD5), expect solution within ~65,536 attempts
- Each worker gets range of ~MAX_SAFE_INTEGER / N

---

## Risks

| Risk | Mitigation |
|---|---|
| RabbitMQ not ready when services start | `healthcheck: rabbitmq-diagnostics ping` + exponential backoff in amqp.js |
| Worker count = 0 at block formation | Pool guards: if 0 workers → reduce difficulty OR launch CPU worker inline |
| Nonce exhaustion in range | Worker acks + signals failure; coordinator retries with new timestamp |
| Keepalive queue buildup | Set `x-message-ttl: 30000` on keepalive queue |
| Pilar 1 binary stdout interface undefined | Must define contract before implementing `miner.js` |
| Hash algorithm MD5 vs SHA256 | Spec implies MD5 (Pilar 1 naming); clarify before implementation |
| HMAC secret in .env | Add `.env` to `.gitignore` immediately; provide only `.env.example` |

---

## Open Questions (clarify before apply phase)

1. **PoW hash algorithm**: MD5 (implied by Pilar 1) or SHA256? This affects `coordinator/redis.js` verification.
2. **Pilar 1 binary stdout contract**: What does `pow_cpu_range.js` print on success/failure? `<nonce> <hash>` or JSON?

---

## Build Order (TDD-first, Strict Mode)

1. `shared/schema.js` + `shared/hmac.js` (zero deps — write tests first)
2. `validator/index.js` — pure functions, full unit test coverage
3. `shared/hash.js`
4. `shared/amqp.js` (with retry logic)
5. `coordinator/redis.js` (mock ioredis in tests)
6. `pool/nonce-splitter.js` (pure function — easy to test)
7. `pool/worker-registry.js` (TTL logic)
8. `pool/index.js` (Express app)
9. `coordinator/block.js` + `coordinator/rabbitmq.js`
10. `coordinator/index.js` (full NCT)
11. `worker/consumer.js` + `worker/miner.js`
12. `docker-compose.yml`
13. Integration tests (full mining cycle)
