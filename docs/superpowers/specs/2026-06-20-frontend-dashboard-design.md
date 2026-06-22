# Frontend Dashboard — Design Spec

**Project**: Pilar 2 — Distributed PoW Blockchain  
**Date**: 2026-06-20  
**Status**: Approved  
**Stack**: React + Vite + Tailwind CSS, served by Express static in Docker Compose

---

## 1. Concept

"Registro de Custodia" — an editorial, light-themed dashboard inspired by assay certificates, custody documents, and high-end financial data design (Bloomberg, FT). Authority comes from typography and whitespace, not decoration.

The dashboard serves three user roles and four views, making the blockchain and the extractive-industry custody use case visually tangible for the video demo and academic defense.

---

## 2. Design Tokens

### 2.1 Color Palette

| Token            | Hex       | Usage                                      |
|------------------|-----------|--------------------------------------------|
| `chalk`          | `#FAFAF7` | Primary background                         |
| `stone`          | `#F0EDE6` | Card surfaces, secondary areas             |
| `graphite`       | `#1A1A1A` | Primary text                               |
| `slate`          | `#6B7280` | Secondary text, labels, metadata           |
| `assayers-gold`  | `#B8860B` | Primary accent — CTAs, active states       |
| `malachite`      | `#2D6A4F` | Success — confirmed blocks, valid sigs     |
| `garnet`         | `#9B2335` | Error — invalid signatures, rejections     |

### 2.2 Typography

| Role      | Font               | Weight    | Usage                                          |
|-----------|--------------------|-----------|-------------------------------------------------|
| Display   | DM Serif Display   | 400       | Section headings, block numbers, entity names   |
| Display   | DM Serif Display   | 400 italic| Subtitles, states, timestamps, metadata hints   |
| Body      | Inter              | 400, 500  | Body text, table data, form labels              |
| Label     | Inter              | 600       | Uppercase labels with wide tracking (0.1em)     |
| Mono      | JetBrains Mono     | 400       | Hashes, block IDs, signatures, payloads         |

**Scale contrast**: Display headings at 48-64px alongside data labels at 11-12px uppercase. This tension is the typographic signature.

**Italic usage**: DM Serif Display italic for delicate moments — section subtitles, temporal information (timestamps, "12s ago", "last seen"), states ("pending", "verified", "mining..."), and contextual hints ("signing as mina-san-juan", "or barrels, depending on type").

### 2.3 Layout

- **No persistent sidebar**. Horizontal overview bar for key metrics.
- **Asymmetric grid**: 8/4 column split — wide main content + narrow contextual metadata column.
- **Generous whitespace** between sections.
- **Hairline rules** (`1px solid stone`) as section dividers — no heavy borders.
- **Minimal border-radius**: 4px on cards, 2px on inputs. No pill shapes.

---

## 3. User Roles

Role selection via a discrete switch in the header (no authentication — demo mode).

| Role         | Persona                          | Views                                    |
|--------------|----------------------------------|------------------------------------------|
| **Operador** | Mine, plant, refinery, terminal  | Transaction Form, their lot history       |
| **Auditor**  | Regulator, oversight body        | Block Explorer, Custody Tracker           |
| **Monitor**  | System admin, tech team          | Mining Monitor                            |

Each role sees only its relevant tabs in the navigation. The overview bar adapts to show role-relevant metrics.

---

## 4. Views

### 4.1 Block Explorer (Auditor)

**Purpose**: Browse the blockchain — blocks and their transactions.

**Layout**: Descending list (newest first). Each block is a card showing:
- Block number in serif bold + timestamp in serif italic (right-aligned)
- Block hash in mono, slate color
- Transaction count in serif italic
- Transaction summary lines: `Origin -> Destination  Qty  Type`

**Expandable**: Click a block to reveal full details — `previous_hash`, `nonce`, complete transaction list with signature verification status (malachite check / garnet cross).

**Sidebar metadata**: Chain integrity status (italic malachite), current difficulty (mono), time since last block (italic).

### 4.2 Custody Tracker (Auditor)

**Purpose**: Trace a specific lot through the entire custody chain.

**Search**: Input field for `id_lote`. On search, displays:
- Lot ID in serif bold (large)
- Quantity + type in sans, slate
- First seen date in serif italic

**Custody Chain Timeline**: Vertical timeline with nodes:
- **Confirmed node** (gold circle): Entity name in sans bold, quantity, date in italic, block reference in mono, signature status in italic malachite.
- **Pending node** (slate circle): Entity name, "awaiting custody transfer" in italic slate.

**Sidebar metadata**:
- Transfer count (italic malachite)
- Entity count
- Integrity status (italic malachite)
- **Quantity Drift**: If quantity changes between transfers, displayed in garnet with "drift detected" in italic. This is the anti-smuggling indicator from the proposal.

### 4.3 Mining Monitor (Monitor)

**Purpose**: Real-time infrastructure status.

**Overview cards** (horizontal row, 4 cards):
- Workers (count, "2 GPU + 2 CPU" in italic)
- Hash Rate (approximate)
- Pending transactions in pool
- Difficulty (mono)

**Coordinator Cluster**: Table showing each coordinator replica with role (gold "leader" / italic slate "follower") and heartbeat age in italic.

**Workers**: Table with worker ID (mono), type (CPU/GPU), status ("mining..." in italic gold / "idle" in italic slate), nonce range or last seen.

**Dead Letter Queue**: Message count. If 0: "no failures recorded" in italic malachite. If >0: count + last failure time in italic garnet + expandable details.

**Scale Status**: `scale_needed` boolean (mono), last scale request time (italic).

### 4.4 Transaction Form (Operador)

**Purpose**: Register a custody transfer signed with Ed25519.

**Form fields**:
- Resource Type: dropdown (MINERAL / CRUDO)
- Origin Entity: dropdown (from `listEntities()`). Below: "signing as {entity-name}" in italic slate.
- Destination Entity: dropdown
- Lot ID: text input
- Quantity: number input + unit label ("tonnes" or "barrels, depending on type" in italic)

**Signature Preview**: Card showing the canonical JSON payload (mono, small) and signature status. Before submit: "will be computed on submit" in italic. After submit: actual base64 signature in mono.

**Submit button**: Gold background, graphite text. Label: "Register Transfer".

**Recent Submissions**: Below the form. List of this session's transactions with status:
- "pending" in italic gold + "awaiting block confirmation"
- "confirmed" in italic malachite + "Block #N"
- "rejected" in italic garnet + error reason

---

## 5. API Integration

### 5.1 Backend Endpoints Consumed

| Endpoint                    | Service      | Used by           | Purpose                          |
|-----------------------------|--------------|-------------------|----------------------------------|
| `GET /status`               | Coordinator  | All views         | Chain length, last block, role   |
| `GET /redis/status`         | Coordinator  | Block Explorer    | Block count                      |
| `GET /rabbitmq/status`      | Coordinator  | Mining Monitor    | Queue depth                      |
| `POST /transaction`         | Coordinator  | Transaction Form  | Submit custody transfer          |
| `GET /status`               | Pool         | Mining Monitor    | Pending tx, worker counts        |
| `GET /scale/status`         | Pool         | Mining Monitor    | Scale need, worker breakdown     |

### 5.2 New Endpoints Required

| Endpoint                    | Service      | Purpose                                     |
|-----------------------------|--------------|---------------------------------------------|
| `GET /chain`                | Coordinator  | Full chain with transactions (Block Explorer)|
| `GET /chain/:blockHash`     | Coordinator  | Single block detail                          |
| `GET /chain/lot/:lotId`     | Coordinator  | All transactions for a lot (Custody Tracker) |
| `GET /entities`             | Pool/Frontend| List available entities for dropdowns        |

### 5.3 Update Strategy

Polling every 5 seconds on the active view's endpoints. No WebSocket/SSE for simplicity.

---

## 6. Technical Architecture

### 6.1 Project Structure

```
frontend/
  index.html
  package.json
  vite.config.js
  tailwind.config.js
  src/
    main.jsx
    App.jsx
    api/
      client.js            # fetch wrapper, base URL config
    components/
      Layout.jsx            # header + overview bar + content area
      RoleSwitch.jsx         # role selector
      OverviewBar.jsx        # horizontal metrics bar
    views/
      BlockExplorer.jsx
      CustodyTracker.jsx
      MiningMonitor.jsx
      TransactionForm.jsx
    hooks/
      usePolling.js          # generic polling hook
    utils/
      crypto.js              # Ed25519 signing for browser (Web Crypto API)
      entities.js            # entity list + key loading
```

### 6.2 Docker Compose Integration

New service `frontend` in docker-compose.yml:
- Builds from `frontend/Dockerfile` (multi-stage: Vite build → nginx serve)
- Ports: `8080:80`
- Depends on coordinator and pool
- nginx proxies API requests to coordinator/pool (avoids CORS)

### 6.3 Browser-Side Signing

The Transaction Form signs transactions in the browser using the Web Crypto API with Ed25519. Private keys for demo entities are bundled in the frontend build (acceptable for a demo — in production, keys would be in a secure enclave or HSM).

---

## 7. Signature Element

The Custody Chain Timeline in the Custody Tracker view. A vertical editorial timeline showing a physical lot's journey through the custody chain, with each node displaying the entity name (serif), quantity, timestamp (italic), block reference (mono), and Ed25519 signature verification (italic + color). Quantity drift detection between nodes surfaces discrepancies that indicate potential smuggling — the core value proposition of the proposal.

---

## 8. Constraints

- No authentication — role switching is a UI toggle for demo purposes.
- No WebSocket/SSE — polling only for simplicity.
- Private keys bundled in frontend for demo — not production-safe.
- All fonts loaded from Google Fonts CDN.
- Responsive is secondary — optimized for laptop/desktop demo.
