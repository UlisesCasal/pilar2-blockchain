# Proposal: Pilar 2 — Distributed PoW Blockchain Infrastructure

## Intent

Build the complete Pilar 2 distributed blockchain for extractive-industry custody tracking: 6 Node.js services orchestrated via Docker Compose, implementing a Proof-of-Work pipeline from transaction intake to confirmed block. Greenfield — no source exists. This delivers the runnable distributed system that Pilar 3 will later deploy and load-test.

## Scope

### In Scope
- **P1 Validator**: shared schema + HMAC-SHA256 verify; HTTP `POST /validate`.
- **P2 RabbitMQ**: async task distribution — `mining_tasks` work queue (prefetch 1), `mining_results`, `keepalive` (30s TTL).
- **P3 Redis**: blockchain state — chain storage, block read/write, `SET NX` lock.
- **P4 Coordinator (NCT)**: consumes results, verifies nonce/hash, commits blocks.
- **P5 Pool**: `POST /transaction` accumulation, threshold (BLOCK_SIZE=10), nonce-range splitting, worker registry/keepalive.
- **Worker**: consumes tasks, runs MD5 PoW via Pilar 1 binary, publishes results.
- **Shared utils**: `schema.js`, `hmac.js`, `hash.js`, `amqp.js`.
- **Infra**: `docker-compose.yml`, single root `package.json`, `.env.example`, Jest config, integration test.

### Out of Scope
- Kubernetes deployment (Pilar 3)
- CI/CD pipelines (Pilar 3)
- GPU PoW binary implementation (Pilar 1)
- Load / stress testing (Pilar 3)

## Capabilities

### New Capabilities
- `transaction-validation`: schema + HMAC-SHA256 verification of custody transactions.
- `transaction-pool`: accumulation, BLOCK_SIZE threshold, nonce splitting, worker registry/keepalive.
- `task-distribution`: RabbitMQ work-queue routing of mining tasks and results.
- `mining-worker`: PoW execution via Pilar 1 binary, result publishing.
- `block-coordination`: nonce/hash verification, atomic block commitment (NCT).
- `blockchain-state`: Redis chain storage and locking.
- `deployment-compose`: Docker Compose orchestration of all 6 services.

### Modified Capabilities
- None (greenfield).

## Approach

Single-repo monorepo (one root `package.json`, relative imports — no workspaces). Each service is a thin Express app over a pure-logic core. Pool and Coordinator are **separate services**: Pool owns intake + splitting; Coordinator owns result consumption + Redis commitment (only Coordinator touches Redis). `mining_tasks` is a **direct-exchange work queue** with `prefetch: 1` so each nonce range goes to exactly one worker. Race conditions resolved by Redis `SET lock:task:{id} NX EX 60`. Transactions signed/verified with HMAC-SHA256 via `crypto.timingSafeEqual`. Build is TDD-first (pure functions: validator, nonce-splitter, worker-registry).

**Assumptions documented**: PoW = MD5, 4-char `"0000"` prefix; Pilar 1 binary at `../pilar1/pow_cpu_range.js`; stdout contract `<nonce> <hash>` (single space) on success, `NOT_FOUND` on failure.

## Affected Areas

| Area | Impact | Description |
|------|--------|-------------|
| `shared/` | New | schema, hmac, hash, amqp (retry factory) |
| `validator/` | New | pure validator + `POST /validate` + tests |
| `pool/` | New | intake, threshold, nonce-splitter, worker-registry |
| `coordinator/` | New | rabbitmq consumer, redis module, block formation |
| `worker/` | New | task consumer, miner (Pilar 1 binary) |
| `docker-compose.yml`, `package.json`, `.env.example` | New | infra + single-root deps |
| `integration/` | New | full-cycle test |

## Risks

| Risk | Likelihood | Mitigation |
|------|------------|------------|
| RabbitMQ startup race | High | Healthcheck + exponential backoff in `shared/amqp.js` |
| Worker count = 0 at block formation | Med | Fallback to inline CPU worker / reduce difficulty |
| Nonce exhaustion (`NOT_FOUND`) | Med | Worker acks + signals; coordinator retries with new timestamp |
| Keepalive queue buildup on crash | Med | 30s message TTL on keepalive queue |
| Pilar 1 stdout contract unconfirmed | Med | Documented assumption; isolate parsing in `worker/miner.js` |
| Hash algo (MD5 vs SHA256) | Low | Assume MD5; centralize in `shared/hash.js` for one-line swap |

## Rollback Plan

Greenfield change isolated to `pilar2/`. Rollback = `docker compose down -v` and delete created service directories; no existing code or data is touched. Per-service design keeps blast radius contained.

## Dependencies

- Pilar 1 binary `../pilar1/pow_cpu_range.js` (stdout contract assumed).
- Docker + Docker Compose; RabbitMQ and Redis images.

## Success Criteria

- [ ] `docker compose up --build` brings up all 6 services (healthchecks green).
- [ ] `POST /transaction` accepts a valid custody transaction.
- [ ] After 10 tx, NCT/Pool publishes a mining task to RabbitMQ.
- [ ] Worker finds a valid nonce via MD5 PoW and publishes the result.
- [ ] Coordinator verifies the nonce and stores the block in Redis.
- [ ] `GET /status` returns `chain_length` that increments per confirmed block.
- [ ] Unit tests pass: validator, nonce-splitter, worker-registry.
- [ ] Integration test: full cycle transaction → confirmed block.
