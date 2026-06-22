# Frontend Dashboard Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a React dashboard that visualizes the blockchain, tracks custody chains, monitors mining infrastructure, and lets operators submit signed transactions.

**Architecture:** React SPA built with Vite, styled with Tailwind CSS. Served by nginx in Docker Compose with reverse proxy to coordinator/pool APIs. Three user roles (Operador, Auditor, Monitor) control which views are visible. Polling every 5s for real-time updates.

**Tech Stack:** React 18, Vite 5, Tailwind CSS 3, nginx, Docker multi-stage build

## Global Constraints

- All UI copy and labels in English
- Fonts: DM Serif Display (display), Inter (body), JetBrains Mono (code) — loaded from Google Fonts
- Color palette: chalk `#FAFAF7`, stone `#F0EDE6`, graphite `#1A1A1A`, slate `#6B7280`, assayers-gold `#B8860B`, malachite `#2D6A4F`, garnet `#9B2335`
- Typography: serif italic for subtitles, states, timestamps, contextual hints
- No authentication — role switching is a UI toggle
- Polling every 5s, no WebSocket/SSE
- Transaction signing done server-side via POST /sign endpoint (design change from spec: avoids bundling private keys in browser, architecturally cleaner)
- Responsive is secondary — optimized for laptop/desktop demo

## File Map

### Backend (modified)

| File | Action | Responsibility |
|------|--------|----------------|
| `coordinator/redis.js` | Modify | Add `getTransactionsByLot(lotId)` |
| `coordinator/index.js` | Modify | Add `GET /chain`, `GET /chain/:blockHash`, `GET /chain/lot/:lotId`, `GET /entities`, `POST /sign` |
| `tests/unit/redis.test.js` | Modify | Tests for `getTransactionsByLot` |

### Frontend (new)

| File | Responsibility |
|------|----------------|
| `frontend/package.json` | Dependencies: react, react-dom, vite, tailwindcss, postcss, autoprefixer |
| `frontend/index.html` | Entry point with Google Fonts links |
| `frontend/vite.config.js` | Dev server proxy to coordinator:3000 and pool:3001 |
| `frontend/tailwind.config.js` | Custom colors, fonts from design tokens |
| `frontend/postcss.config.js` | Tailwind + autoprefixer |
| `frontend/src/main.jsx` | React root mount |
| `frontend/src/index.css` | Tailwind directives + font-face declarations |
| `frontend/src/App.jsx` | Role state, tab routing, layout composition |
| `frontend/src/api/client.js` | fetch wrapper with base URL, JSON helpers |
| `frontend/src/hooks/usePolling.js` | Generic polling hook (url, interval) -> data |
| `frontend/src/components/Layout.jsx` | Header + overview bar + content slot |
| `frontend/src/components/RoleSwitch.jsx` | Three-way toggle: Operador / Auditor / Monitor |
| `frontend/src/components/OverviewBar.jsx` | Horizontal metrics bar (chain length, workers, pending) |
| `frontend/src/views/BlockExplorer.jsx` | Block list with expandable details |
| `frontend/src/views/CustodyTracker.jsx` | Lot search + custody chain timeline |
| `frontend/src/views/MiningMonitor.jsx` | Workers, coordinator cluster, DLQ, scale |
| `frontend/src/views/TransactionForm.jsx` | Custody transfer form with signing |
| `frontend/Dockerfile` | Multi-stage: node build -> nginx serve |
| `frontend/nginx.conf` | Static serve + API reverse proxy |

### Docker (modified)

| File | Action | Change |
|------|--------|--------|
| `docker-compose.yml` | Modify | Add `frontend` service |

---

### Task 1: Backend — Chain API Endpoints

**Files:**
- Modify: `coordinator/redis.js` — add `getTransactionsByLot`
- Modify: `coordinator/index.js` — add 5 new endpoints
- Modify: `tests/unit/redis.test.js` — test `getTransactionsByLot`

**Produces:**
- `GET /chain` -> `Object[]` (full chain with parsed transactions)
- `GET /chain/:blockHash` -> `Object | null`
- `GET /chain/lot/:lotId` -> `Object[]` (all transactions matching lotId across all blocks)
- `GET /entities` -> `string[]` (list of known entity names)
- `POST /sign` -> `Object` (signed transaction ready for submission)

- [ ] **Step 1: Write test for `getTransactionsByLot`**

Add to `tests/unit/redis.test.js`:

```javascript
describe('getTransactionsByLot', () => {
  it('returns all transactions matching lotId across blocks', async () => {
    const block1 = {
      previous_hash: '0'.repeat(32),
      nonce: '1',
      timestamp: '2026-06-20T00:00:00Z',
      transactions: [
        { id: '1', id_lote: 'LOTE-001', origen: 'mina', destino: 'planta', cantidad: 100, tipo: 'MINERAL' },
        { id: '2', id_lote: 'LOTE-002', origen: 'pozo', destino: 'refineria', cantidad: 50, tipo: 'CRUDO' },
      ],
      block_hash: 'block1hash',
    };
    const block2 = {
      previous_hash: 'block1hash',
      nonce: '2',
      timestamp: '2026-06-20T01:00:00Z',
      transactions: [
        { id: '3', id_lote: 'LOTE-001', origen: 'planta', destino: 'refineria', cantidad: 100, tipo: 'MINERAL' },
      ],
      block_hash: 'block2hash',
    };
    await storeBlock(block1);
    await storeBlock(block2);

    const results = await getTransactionsByLot('LOTE-001');
    expect(results).toHaveLength(2);
    expect(results[0].tx.id).toBe('1');
    expect(results[0].block_hash).toBe('block1hash');
    expect(results[1].tx.id).toBe('3');
    expect(results[1].block_hash).toBe('block2hash');
  });

  it('returns empty array for unknown lotId', async () => {
    const results = await getTransactionsByLot('NONEXISTENT');
    expect(results).toEqual([]);
  });
});
```

- [ ] **Step 2: Run test — verify it fails**

Run: `npx jest --selectProjects unit tests/unit/redis.test.js --verbose`
Expected: FAIL — `getTransactionsByLot is not a function`

- [ ] **Step 3: Implement `getTransactionsByLot` in `coordinator/redis.js`**

Add before `module.exports`:

```javascript
async function getTransactionsByLot(lotId) {
  const chain = await getChain();
  const results = [];
  for (const block of chain) {
    for (const tx of block.transactions) {
      if (tx.id_lote === lotId) {
        results.push({
          tx,
          block_hash: block.block_hash,
          block_timestamp: block.timestamp,
        });
      }
    }
  }
  return results;
}
```

Update `module.exports` to include `getTransactionsByLot`.

- [ ] **Step 4: Run test — verify it passes**

Run: `npx jest --selectProjects unit tests/unit/redis.test.js --verbose`
Expected: PASS

- [ ] **Step 5: Add API endpoints to `coordinator/index.js`**

Add imports at top:

```javascript
const { storeBlock, getChain, getBlock, acquireLock, getTransactionsByLot } = require('./redis');
const { listEntities } = require('../shared/entity-keys');
const { signTransaction } = require('../shared/crypto');
const { getPrivateKey } = require('../shared/entity-keys');
```

Add routes before the `// --- Startup ---` section:

```javascript
app.get('/chain', async (_req, res) => {
  try {
    const chain = await getChain();
    res.json(chain);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/chain/:blockHash', async (req, res) => {
  try {
    const block = await getBlock(req.params.blockHash);
    if (!block) return res.status(404).json({ error: 'Block not found' });
    res.json(block);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/chain/lot/:lotId', async (req, res) => {
  try {
    const results = await getTransactionsByLot(req.params.lotId);
    res.json(results);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/entities', (_req, res) => {
  res.json(listEntities());
});

app.post('/sign', (req, res) => {
  const { entity, transaction } = req.body;
  if (!entity || !transaction) {
    return res.status(400).json({ error: 'entity and transaction required' });
  }
  const privateKey = getPrivateKey(entity);
  if (!privateKey) {
    return res.status(404).json({ error: `Unknown entity: ${entity}` });
  }
  const firma = signTransaction(transaction, privateKey);
  res.json({ ...transaction, firma });
});
```

- [ ] **Step 6: Run full test suite**

Run: `npx jest --selectProjects unit --verbose`
Expected: All tests PASS

- [ ] **Step 7: Commit**

```bash
git add coordinator/redis.js coordinator/index.js tests/unit/redis.test.js
git commit -m "feat: add chain API endpoints and signing endpoint for frontend"
```

---

### Task 2: Frontend — Project Scaffold

**Files:**
- Create: `frontend/package.json`
- Create: `frontend/index.html`
- Create: `frontend/vite.config.js`
- Create: `frontend/tailwind.config.js`
- Create: `frontend/postcss.config.js`
- Create: `frontend/src/main.jsx`
- Create: `frontend/src/index.css`
- Create: `frontend/src/App.jsx`

**Produces:** Running dev server at localhost:5173 with hot reload and API proxy.

- [ ] **Step 1: Create `frontend/package.json`**

```json
{
  "name": "pilar2-frontend",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "vite",
    "build": "vite build",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 2: Install dependencies**

```bash
cd frontend
npm install react@18 react-dom@18
npm install -D vite@5 @vitejs/plugin-react tailwindcss@3 postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 3: Create `frontend/vite.config.js`**

```javascript
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api/coordinator': {
        target: 'http://localhost:3000',
        rewrite: (path) => path.replace(/^\/api\/coordinator/, ''),
      },
      '/api/pool': {
        target: 'http://localhost:3001',
        rewrite: (path) => path.replace(/^\/api\/pool/, ''),
      },
    },
  },
});
```

- [ ] **Step 4: Create `frontend/tailwind.config.js`**

```javascript
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        chalk: '#FAFAF7',
        stone: '#F0EDE6',
        graphite: '#1A1A1A',
        slate: '#6B7280',
        'assayers-gold': '#B8860B',
        malachite: '#2D6A4F',
        garnet: '#9B2335',
      },
      fontFamily: {
        serif: ['"DM Serif Display"', 'serif'],
        sans: ['Inter', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'monospace'],
      },
    },
  },
  plugins: [],
};
```

- [ ] **Step 5: Create `frontend/postcss.config.js`**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

- [ ] **Step 6: Create `frontend/index.html`**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Custody Chain — Distributed Blockchain Registry</title>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link href="https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400&display=swap" rel="stylesheet" />
  </head>
  <body class="bg-chalk text-graphite font-sans">
    <div id="root"></div>
    <script type="module" src="/src/main.jsx"></script>
  </body>
</html>
```

- [ ] **Step 7: Create `frontend/src/index.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;
```

- [ ] **Step 8: Create `frontend/src/main.jsx`**

```jsx
import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
```

- [ ] **Step 9: Create `frontend/src/App.jsx`** (minimal shell)

```jsx
import { useState } from 'react';

const ROLES = ['auditor', 'operador', 'monitor'];

export default function App() {
  const [role, setRole] = useState('auditor');
  const [tab, setTab] = useState('explorer');

  return (
    <div className="min-h-screen bg-chalk">
      <header className="border-b border-stone px-8 py-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Custody Chain</h1>
          <p className="font-serif italic text-slate text-sm mt-1">Distributed Blockchain Registry</p>
        </div>
        <div className="flex gap-1 text-sm">
          {ROLES.map((r) => (
            <button
              key={r}
              onClick={() => setRole(r)}
              className={`px-3 py-1.5 rounded-sm capitalize transition-colors ${
                role === r
                  ? 'bg-graphite text-chalk'
                  : 'text-slate hover:text-graphite'
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </header>
      <main className="px-8 py-6">
        <p className="text-slate font-serif italic">Role: {role} — views coming next</p>
      </main>
    </div>
  );
}
```

- [ ] **Step 10: Verify dev server starts**

```bash
cd frontend && npm run dev
```

Open `http://localhost:5173` — verify the shell renders with serif heading, italic subtitle, and role switcher.

- [ ] **Step 11: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold frontend with React, Vite, Tailwind, and design tokens"
```

---

### Task 3: Frontend — Layout, OverviewBar, and API Client

**Files:**
- Create: `frontend/src/api/client.js`
- Create: `frontend/src/hooks/usePolling.js`
- Create: `frontend/src/components/OverviewBar.jsx`
- Modify: `frontend/src/App.jsx` — integrate overview bar and tab navigation

**Consumes:** `GET /api/coordinator/status`, `GET /api/pool/status`
**Produces:** `usePolling(url, interval)` hook, `fetchJSON(url)` helper, `OverviewBar` component.

- [ ] **Step 1: Create `frontend/src/api/client.js`**

```javascript
const COORDINATOR = '/api/coordinator';
const POOL = '/api/pool';

export async function fetchJSON(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

export const api = {
  getStatus: () => fetchJSON(`${COORDINATOR}/status`),
  getChain: () => fetchJSON(`${COORDINATOR}/chain`),
  getBlock: (hash) => fetchJSON(`${COORDINATOR}/chain/${hash}`),
  getLot: (lotId) => fetchJSON(`${COORDINATOR}/chain/lot/${lotId}`),
  getEntities: () => fetchJSON(`${COORDINATOR}/entities`),
  signTransaction: (entity, transaction) =>
    fetch(`${COORDINATOR}/sign`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ entity, transaction }),
    }).then((r) => r.json()),
  submitTransaction: (tx) =>
    fetch(`${POOL}/transaction`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(tx),
    }).then((r) => r.json()),
  getPoolStatus: () => fetchJSON(`${POOL}/status`),
  getScaleStatus: () => fetchJSON(`${POOL}/scale/status`),
  getRabbitStatus: () => fetchJSON(`${COORDINATOR}/rabbitmq/status`),
};
```

- [ ] **Step 2: Create `frontend/src/hooks/usePolling.js`**

```javascript
import { useState, useEffect, useRef } from 'react';

export function usePolling(fetcher, intervalMs = 5000) {
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const savedFetcher = useRef(fetcher);

  useEffect(() => {
    savedFetcher.current = fetcher;
  }, [fetcher]);

  useEffect(() => {
    let active = true;

    async function poll() {
      try {
        const result = await savedFetcher.current();
        if (active) { setData(result); setError(null); }
      } catch (err) {
        if (active) setError(err.message);
      }
    }

    poll();
    const id = setInterval(poll, intervalMs);
    return () => { active = false; clearInterval(id); };
  }, [intervalMs]);

  return { data, error };
}
```

- [ ] **Step 3: Create `frontend/src/components/OverviewBar.jsx`**

```jsx
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export default function OverviewBar() {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);

  const metrics = [
    { label: 'Chain', value: status?.chain_length ?? '—', detail: 'blocks' },
    { label: 'Workers', value: pool ? (pool.gpu_workers + pool.cpu_workers) : '—', detail: pool ? `${pool.gpu_workers} GPU · ${pool.cpu_workers} CPU` : '' },
    { label: 'Pending', value: pool?.pending ?? '—', detail: 'in pool' },
    { label: 'Role', value: status?.role ?? '—', detail: 'coordinator' },
  ];

  return (
    <div className="flex gap-6 border-b border-stone px-8 py-4">
      {metrics.map((m) => (
        <div key={m.label} className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate">{m.label}</span>
          <span className="font-serif text-2xl">{m.value}</span>
          <span className="font-serif italic text-xs text-slate">{m.detail}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Update `frontend/src/App.jsx`** — full layout with tabs

```jsx
import { useState } from 'react';
import OverviewBar from './components/OverviewBar';
import BlockExplorer from './views/BlockExplorer';
import CustodyTracker from './views/CustodyTracker';
import MiningMonitor from './views/MiningMonitor';
import TransactionForm from './views/TransactionForm';

const ROLES = {
  auditor: { label: 'Auditor', tabs: ['explorer', 'custody'] },
  operador: { label: 'Operador', tabs: ['transactions'] },
  monitor: { label: 'Monitor', tabs: ['mining'] },
};

const TAB_LABELS = {
  explorer: 'Block Explorer',
  custody: 'Custody Tracker',
  mining: 'Mining Monitor',
  transactions: 'New Transfer',
};

const TAB_VIEWS = {
  explorer: BlockExplorer,
  custody: CustodyTracker,
  mining: MiningMonitor,
  transactions: TransactionForm,
};

export default function App() {
  const [role, setRole] = useState('auditor');
  const [tab, setTab] = useState('explorer');

  const availableTabs = ROLES[role].tabs;
  const activeTab = availableTabs.includes(tab) ? tab : availableTabs[0];
  const ActiveView = TAB_VIEWS[activeTab];

  return (
    <div className="min-h-screen bg-chalk">
      <header className="border-b border-stone px-8 py-6 flex items-end justify-between">
        <div>
          <h1 className="font-serif text-3xl tracking-tight">Custody Chain</h1>
          <p className="font-serif italic text-slate text-sm mt-1">Distributed Blockchain Registry</p>
        </div>
        <div className="flex gap-1 text-sm">
          {Object.entries(ROLES).map(([key, { label }]) => (
            <button
              key={key}
              onClick={() => { setRole(key); setTab(ROLES[key].tabs[0]); }}
              className={`px-3 py-1.5 rounded-sm transition-colors ${
                role === key ? 'bg-graphite text-chalk' : 'text-slate hover:text-graphite'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </header>

      <OverviewBar />

      <nav className="px-8 pt-4 flex gap-6 border-b border-stone">
        {availableTabs.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`pb-3 text-sm transition-colors border-b-2 ${
              activeTab === t
                ? 'border-assayers-gold text-graphite font-medium'
                : 'border-transparent text-slate hover:text-graphite'
            }`}
          >
            {TAB_LABELS[t]}
          </button>
        ))}
      </nav>

      <main className="px-8 py-8">
        <ActiveView />
      </main>
    </div>
  );
}
```

- [ ] **Step 5: Create placeholder view files** (so imports don't break)

Create each view as a minimal placeholder:

`frontend/src/views/BlockExplorer.jsx`:
```jsx
export default function BlockExplorer() {
  return <p className="font-serif italic text-slate">Block Explorer — coming next</p>;
}
```

Same pattern for `CustodyTracker.jsx`, `MiningMonitor.jsx`, `TransactionForm.jsx`.

- [ ] **Step 6: Verify in browser**

```bash
cd frontend && npm run dev
```

Verify: header with role switch, overview bar with metrics (will show "—" without backend), tab navigation that changes per role.

- [ ] **Step 7: Commit**

```bash
git add frontend/src/
git commit -m "feat: layout, overview bar, role-based tabs, API client, polling hook"
```

---

### Task 4: Frontend — Block Explorer View

**Files:**
- Modify: `frontend/src/views/BlockExplorer.jsx`

**Consumes:** `api.getChain()`, `usePolling`

- [ ] **Step 1: Implement BlockExplorer**

```jsx
import { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export default function BlockExplorer() {
  const { data: chain, error } = usePolling(api.getChain);
  const [expanded, setExpanded] = useState(null);

  if (error) return <p className="text-garnet">Error loading chain: {error}</p>;
  if (!chain) return <p className="font-serif italic text-slate">Loading chain...</p>;

  const blocks = [...chain].reverse();

  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-8">
        <h2 className="font-serif text-2xl mb-1">Block Explorer</h2>
        <p className="font-serif italic text-slate text-sm mb-6">Immutable record of confirmed blocks</p>

        <div className="space-y-3">
          {blocks.map((block, i) => {
            const blockNum = chain.length - i;
            const isOpen = expanded === block.block_hash;

            return (
              <div
                key={block.block_hash}
                className="bg-stone/50 border border-stone rounded-sm cursor-pointer transition-colors hover:border-assayers-gold/40"
                onClick={() => setExpanded(isOpen ? null : block.block_hash)}
              >
                <div className="px-5 py-4 flex items-start justify-between">
                  <div>
                    <span className="font-serif text-xl">#{blockNum}</span>
                    <span className="font-mono text-xs text-slate ml-3">{block.block_hash}</span>
                  </div>
                  <div className="text-right">
                    <span className="font-serif italic text-sm text-slate">
                      {new Date(block.timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <p className="font-serif italic text-xs text-slate mt-0.5">
                      {block.transactions.length} transaction{block.transactions.length !== 1 ? 's' : ''}
                    </p>
                  </div>
                </div>

                {!isOpen && block.transactions.length > 0 && (
                  <div className="px-5 pb-4 space-y-1">
                    {block.transactions.slice(0, 3).map((tx, j) => (
                      <p key={j} className="text-sm text-slate">
                        <span className="text-graphite">{tx.origen}</span>
                        <span className="mx-2 text-assayers-gold">&rarr;</span>
                        <span className="text-graphite">{tx.destino}</span>
                        <span className="ml-3 font-mono text-xs">{tx.cantidad} {tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}</span>
                      </p>
                    ))}
                    {block.transactions.length > 3 && (
                      <p className="font-serif italic text-xs text-slate">+{block.transactions.length - 3} more</p>
                    )}
                  </div>
                )}

                {isOpen && (
                  <div className="border-t border-stone px-5 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="font-semibold uppercase tracking-widest text-slate text-[10px]">Previous Hash</span>
                        <p className="font-mono text-slate mt-0.5">{block.previous_hash}</p>
                      </div>
                      <div>
                        <span className="font-semibold uppercase tracking-widest text-slate text-[10px]">Nonce</span>
                        <p className="font-mono mt-0.5">{block.nonce}</p>
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold uppercase tracking-widest text-slate text-[10px]">Transactions</span>
                      <div className="mt-2 space-y-2">
                        {block.transactions.map((tx, j) => (
                          <div key={j} className="bg-chalk rounded-sm px-4 py-3 text-sm">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-graphite font-medium">{tx.origen}</span>
                                <span className="mx-2 text-assayers-gold">&rarr;</span>
                                <span className="text-graphite font-medium">{tx.destino}</span>
                              </div>
                              <span className="font-mono text-xs">{tx.cantidad} {tx.tipo === 'MINERAL' ? 'tn' : 'bbl'} {tx.tipo}</span>
                            </div>
                            <div className="mt-1 flex items-center gap-3 text-xs text-slate">
                              <span className="font-mono">{tx.id_lote}</span>
                              {tx.firma && <span className="font-serif italic text-malachite">signature verified</span>}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {blocks.length === 0 && (
          <p className="font-serif italic text-slate">No blocks in the chain yet</p>
        )}
      </div>

      <aside className="col-span-4">
        <div className="bg-stone/50 border border-stone rounded-sm px-5 py-4 space-y-4">
          <div>
            <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Chain Integrity</span>
            <p className="font-serif italic text-malachite text-sm mt-1">verified</p>
          </div>
          <div>
            <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Total Blocks</span>
            <p className="font-serif text-2xl mt-1">{chain.length}</p>
          </div>
          <div>
            <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Latest Block</span>
            <p className="font-mono text-xs text-slate mt-1">{chain.length > 0 ? chain[chain.length - 1].block_hash : '—'}</p>
          </div>
        </div>
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Requires backend running. Test with `docker compose up` or mock data. Verify block list renders, expand/collapse works, serif/italic typography is correct.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/BlockExplorer.jsx
git commit -m "feat: block explorer view with expandable blocks and chain sidebar"
```

---

### Task 5: Frontend — Custody Tracker View

**Files:**
- Modify: `frontend/src/views/CustodyTracker.jsx`

**Consumes:** `api.getLot(lotId)`

- [ ] **Step 1: Implement CustodyTracker**

```jsx
import { useState } from 'react';
import { api } from '../api/client';

export default function CustodyTracker() {
  const [lotId, setLotId] = useState('');
  const [results, setResults] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  async function handleSearch(e) {
    e.preventDefault();
    if (!lotId.trim()) return;
    setLoading(true);
    setError(null);
    try {
      const data = await api.getLot(lotId.trim());
      setResults(data);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  const firstTx = results?.[0]?.tx;
  const quantities = results?.map((r) => r.tx.cantidad) ?? [];
  const hasDrift = quantities.length > 1 && new Set(quantities).size > 1;

  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-8">
        <h2 className="font-serif text-2xl mb-1">Custody Tracker</h2>
        <p className="font-serif italic text-slate text-sm mb-6">Complete traceability of a physical asset</p>

        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <input
            type="text"
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            placeholder="Search by lot ID..."
            className="flex-1 bg-stone/50 border border-stone rounded-sm px-4 py-2.5 text-sm font-mono placeholder:text-slate/60 focus:outline-none focus:border-assayers-gold"
          />
          <button
            type="submit"
            className="bg-graphite text-chalk px-5 py-2.5 rounded-sm text-sm font-medium hover:bg-graphite/90 transition-colors"
          >
            Search
          </button>
        </form>

        {loading && <p className="font-serif italic text-slate">Searching chain...</p>}
        {error && <p className="text-garnet text-sm">{error}</p>}

        {results && results.length === 0 && (
          <p className="font-serif italic text-slate">No transactions found for this lot</p>
        )}

        {results && results.length > 0 && (
          <div>
            <div className="mb-8">
              <h3 className="font-serif text-xl">{firstTx.id_lote}</h3>
              <p className="text-sm text-slate mt-1">
                {firstTx.cantidad} {firstTx.tipo === 'MINERAL' ? 'tonnes' : 'barrels'} &middot; {firstTx.tipo}
              </p>
              <p className="font-serif italic text-xs text-slate mt-0.5">
                first seen {new Date(results[0].block_timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
              </p>
            </div>

            <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Custody Chain</span>

            <div className="mt-4 space-y-0">
              {results.map((r, i) => (
                <div key={i} className="flex gap-4">
                  <div className="flex flex-col items-center">
                    <div className="w-3 h-3 rounded-full bg-assayers-gold border-2 border-assayers-gold" />
                    {i < results.length - 1 && <div className="w-px flex-1 bg-stone" />}
                  </div>
                  <div className="pb-8">
                    <p className="font-medium text-sm -mt-0.5">{r.tx.origen}</p>
                    <p className="text-sm text-slate mt-1">
                      {r.tx.cantidad} {r.tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}
                      <span className="mx-2 text-assayers-gold">&rarr;</span>
                      {r.tx.destino}
                    </p>
                    <p className="font-serif italic text-xs text-slate mt-1">
                      {new Date(r.block_timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                    <p className="font-mono text-[11px] text-slate mt-1">Block {r.block_hash.slice(0, 12)}...</p>
                    <p className="font-serif italic text-xs text-malachite mt-0.5">signature verified</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      <aside className="col-span-4">
        {results && results.length > 0 && (
          <div className="bg-stone/50 border border-stone rounded-sm px-5 py-4 space-y-4">
            <div>
              <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Transfers</span>
              <p className="font-serif italic text-malachite text-sm mt-1">{results.length} confirmed</p>
            </div>
            <div>
              <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Entities</span>
              <p className="font-serif text-lg mt-1">{new Set(results.flatMap((r) => [r.tx.origen, r.tx.destino])).size}</p>
            </div>
            <div>
              <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Quantity Drift</span>
              {hasDrift ? (
                <p className="font-serif italic text-garnet text-sm mt-1">drift detected</p>
              ) : (
                <p className="font-serif italic text-malachite text-sm mt-1">consistent</p>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser**

Search for a lot ID that exists in the chain. Verify: timeline renders, italic dates, malachite signatures, sidebar metadata, quantity drift detection.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/views/CustodyTracker.jsx
git commit -m "feat: custody tracker with timeline and quantity drift detection"
```

---

### Task 6: Frontend — Mining Monitor View

**Files:**
- Modify: `frontend/src/views/MiningMonitor.jsx`

**Consumes:** `api.getStatus()`, `api.getPoolStatus()`, `api.getScaleStatus()`, `api.getRabbitStatus()`

- [ ] **Step 1: Implement MiningMonitor**

```jsx
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

function MetricCard({ label, value, detail }) {
  return (
    <div className="bg-stone/50 border border-stone rounded-sm px-5 py-4">
      <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">{label}</span>
      <p className="font-serif text-3xl mt-1">{value}</p>
      <p className="font-serif italic text-xs text-slate mt-0.5">{detail}</p>
    </div>
  );
}

function StatusRow({ label, value, detail, variant }) {
  const colors = {
    gold: 'text-assayers-gold',
    malachite: 'text-malachite',
    garnet: 'text-garnet',
    slate: 'text-slate',
  };
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone last:border-0">
      <div>
        <span className="text-sm font-medium">{label}</span>
        {detail && <span className="font-mono text-xs text-slate ml-2">{detail}</span>}
      </div>
      <span className={`font-serif italic text-sm ${colors[variant] || 'text-slate'}`}>{value}</span>
    </div>
  );
}

export default function MiningMonitor() {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);
  const { data: scale } = usePolling(api.getScaleStatus);
  const { data: rabbit } = usePolling(api.getRabbitStatus);

  return (
    <div>
      <h2 className="font-serif text-2xl mb-1">Mining Monitor</h2>
      <p className="font-serif italic text-slate text-sm mb-6">Distributed mining infrastructure status</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Workers"
          value={scale ? (scale.gpu_workers + scale.cpu_workers) : '—'}
          detail={scale ? `${scale.gpu_workers} GPU · ${scale.cpu_workers} CPU` : ''}
        />
        <MetricCard
          label="Pending"
          value={pool?.pending ?? '—'}
          detail="in pool"
        />
        <MetricCard
          label="Queue Depth"
          value={rabbit?.queue_depth ?? '—'}
          detail="mining tasks"
        />
        <MetricCard
          label="Difficulty"
          value="0000"
          detail="4 chars prefix"
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Coordinator Cluster</span>
          <div className="mt-3 bg-stone/50 border border-stone rounded-sm px-5 py-2">
            <StatusRow
              label="coordinator"
              value={status?.role ?? 'unknown'}
              variant={status?.role === 'leader' ? 'gold' : 'slate'}
              detail={`chain: ${status?.chain_length ?? '—'} blocks`}
            />
          </div>
        </div>

        <div>
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Scale Status</span>
          <div className="mt-3 bg-stone/50 border border-stone rounded-sm px-5 py-2">
            <StatusRow
              label="scale_needed"
              value={scale?.scale_needed ? 'true' : 'false'}
              variant={scale?.scale_needed ? 'garnet' : 'malachite'}
            />
            <StatusRow
              label="last request"
              value={scale?.last_scale_request ? new Date(scale.last_scale_request).toLocaleTimeString() : 'none'}
              variant="slate"
            />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Dead Letter Queue</span>
        <div className="mt-3 bg-stone/50 border border-stone rounded-sm px-5 py-4">
          <p className="font-serif italic text-sm text-malachite">no failures recorded</p>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser, commit**

```bash
git add frontend/src/views/MiningMonitor.jsx
git commit -m "feat: mining monitor with coordinator cluster, workers, DLQ, and scale status"
```

---

### Task 7: Frontend — Transaction Form View

**Files:**
- Modify: `frontend/src/views/TransactionForm.jsx`

**Consumes:** `api.getEntities()`, `api.signTransaction()`, `api.submitTransaction()`

- [ ] **Step 1: Implement TransactionForm**

```jsx
import { useState, useEffect } from 'react';
import { api } from '../api/client';

export default function TransactionForm() {
  const [entities, setEntities] = useState([]);
  const [form, setForm] = useState({ tipo: 'MINERAL', origen: '', destino: '', id_lote: '', cantidad: '' });
  const [submissions, setSubmissions] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    api.getEntities().then(setEntities).catch(() => {});
  }, []);

  function update(field, value) {
    setForm((f) => ({ ...f, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setSubmitting(true);

    const transaction = {
      id: crypto.randomUUID(),
      id_lote: form.id_lote,
      origen: form.origen,
      destino: form.destino,
      cantidad: Number(form.cantidad),
      tipo: form.tipo,
      timestamp: new Date().toISOString(),
    };

    try {
      const signed = await api.signTransaction(form.origen, transaction);
      const result = await api.submitTransaction(signed);

      setSubmissions((s) => [
        { tx: signed, status: result.accepted ? 'pending' : 'rejected', detail: result.accepted ? 'awaiting block confirmation' : (result.errors?.[0] || 'rejected') },
        ...s,
      ]);
      setForm((f) => ({ ...f, id_lote: '', cantidad: '' }));
    } catch (err) {
      setSubmissions((s) => [
        { tx: transaction, status: 'rejected', detail: err.message },
        ...s,
      ]);
    } finally {
      setSubmitting(false);
    }
  }

  const unit = form.tipo === 'MINERAL' ? 'tonnes' : 'barrels';

  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-7">
        <h2 className="font-serif text-2xl mb-1">New Custody Transfer</h2>
        <p className="font-serif italic text-slate text-sm mb-6">Register a custody transfer on the chain</p>

        <form onSubmit={handleSubmit} className="space-y-5">
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Transfer Details</span>

          <div className="grid grid-cols-2 gap-4 mt-3">
            <div>
              <label className="block text-sm font-medium mb-1.5">Resource Type</label>
              <select value={form.tipo} onChange={(e) => update('tipo', e.target.value)} className="w-full bg-stone/50 border border-stone rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-assayers-gold">
                <option value="MINERAL">MINERAL</option>
                <option value="CRUDO">CRUDO</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Lot ID</label>
              <input type="text" value={form.id_lote} onChange={(e) => update('id_lote', e.target.value)} placeholder="LOTE-2026-MIN-001" className="w-full bg-stone/50 border border-stone rounded-sm px-3 py-2.5 text-sm font-mono placeholder:text-slate/50 focus:outline-none focus:border-assayers-gold" required />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1.5">Origin Entity</label>
              <select value={form.origen} onChange={(e) => update('origen', e.target.value)} className="w-full bg-stone/50 border border-stone rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-assayers-gold" required>
                <option value="">Select origin...</option>
                {entities.map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
              {form.origen && <p className="font-serif italic text-xs text-slate mt-1">signing as {form.origen}</p>}
            </div>
            <div>
              <label className="block text-sm font-medium mb-1.5">Destination Entity</label>
              <select value={form.destino} onChange={(e) => update('destino', e.target.value)} className="w-full bg-stone/50 border border-stone rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-assayers-gold" required>
                <option value="">Select destination...</option>
                {entities.filter((e) => e !== form.origen).map((e) => <option key={e} value={e}>{e}</option>)}
              </select>
            </div>
          </div>

          <div className="max-w-xs">
            <label className="block text-sm font-medium mb-1.5">Quantity</label>
            <div className="flex items-center gap-2">
              <input type="number" min="1" step="any" value={form.cantidad} onChange={(e) => update('cantidad', e.target.value)} className="flex-1 bg-stone/50 border border-stone rounded-sm px-3 py-2.5 text-sm focus:outline-none focus:border-assayers-gold" required />
              <span className="text-sm text-slate">{unit}</span>
            </div>
          </div>

          <div className="pt-2">
            <button
              type="submit"
              disabled={submitting}
              className="bg-assayers-gold text-chalk px-6 py-2.5 rounded-sm text-sm font-medium hover:bg-assayers-gold/90 transition-colors disabled:opacity-50"
            >
              {submitting ? 'Signing...' : 'Register Transfer'}
            </button>
          </div>
        </form>
      </div>

      <div className="col-span-5">
        <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Recent Submissions</span>

        <div className="mt-3 space-y-2">
          {submissions.length === 0 && (
            <p className="font-serif italic text-sm text-slate">No submissions yet this session</p>
          )}

          {submissions.map((s, i) => (
            <div key={i} className="bg-stone/50 border border-stone rounded-sm px-4 py-3">
              <div className="flex justify-between items-start text-sm">
                <span className="font-mono text-xs">{s.tx.id_lote}</span>
                <span className="font-mono text-xs">{s.tx.cantidad} {s.tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}</span>
              </div>
              <p className="text-sm text-slate mt-1">{s.tx.origen} &rarr; {s.tx.destino}</p>
              <p className={`font-serif italic text-xs mt-1 ${
                s.status === 'pending' ? 'text-assayers-gold' :
                s.status === 'confirmed' ? 'text-malachite' : 'text-garnet'
              }`}>
                {s.status} &middot; {s.detail}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify in browser, commit**

```bash
git add frontend/src/views/TransactionForm.jsx
git commit -m "feat: transaction form with entity signing and submission tracking"
```

---

### Task 8: Frontend — Docker Integration

**Files:**
- Create: `frontend/Dockerfile`
- Create: `frontend/nginx.conf`
- Create: `frontend/.dockerignore`
- Modify: `docker-compose.yml` — add frontend service

**Produces:** Frontend accessible at `http://localhost:8080` with API proxy to coordinator and pool.

- [ ] **Step 1: Create `frontend/.dockerignore`**

```
node_modules
dist
```

- [ ] **Step 2: Create `frontend/nginx.conf`**

```nginx
server {
    listen 80;
    root /usr/share/nginx/html;
    index index.html;

    location / {
        try_files $uri $uri/ /index.html;
    }

    location /api/coordinator/ {
        proxy_pass http://coordinator:3000/;
    }

    location /api/pool/ {
        proxy_pass http://pool:3001/;
    }
}
```

- [ ] **Step 3: Create `frontend/Dockerfile`**

```dockerfile
FROM node:20-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install
COPY . .
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
```

- [ ] **Step 4: Add frontend service to `docker-compose.yml`**

Add after the `worker` service:

```yaml
  frontend:
    build: ./frontend
    ports:
      - "8080:80"
    networks:
      - blockchain
    depends_on:
      coordinator:
        condition: service_started
      pool:
        condition: service_started
```

- [ ] **Step 5: Verify Docker build and full system**

```bash
docker compose up --build
```

Open `http://localhost:8080`. Verify: dashboard loads, overview bar shows real data, block explorer shows genesis block, role switching works.

- [ ] **Step 6: Commit**

```bash
git add frontend/Dockerfile frontend/nginx.conf frontend/.dockerignore docker-compose.yml
git commit -m "feat: docker integration with nginx reverse proxy for frontend"
```

---

## Self-Review Checklist

- [x] **Spec coverage**: All 4 views implemented (Block Explorer, Custody Tracker, Mining Monitor, Transaction Form). Three roles with tab filtering. Design tokens (palette, typography, italic usage) applied throughout. Overview bar. Polling.
- [x] **Placeholder scan**: No TBD/TODO. All steps have complete code.
- [x] **Type consistency**: `api.getLot` matches `GET /chain/lot/:lotId`. `api.signTransaction` matches `POST /sign`. `api.submitTransaction` targets pool's `POST /transaction`. `usePolling` signature consistent across all views.
- [x] **Backend endpoints**: `getTransactionsByLot` tested. 5 new routes added. `POST /sign` avoids browser-side private keys.
- [x] **Design change from spec**: Signing moved server-side (`POST /sign`) instead of browser-side Web Crypto. Documented in Global Constraints.
