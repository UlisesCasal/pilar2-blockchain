import { useState, useEffect } from 'react';
import { Route, Pickaxe, Fuel, Check, AlertTriangle } from 'lucide-react';
import { api } from '../api/client';
import RingChart from '../components/RingChart';

/* ── SVG hex palette (Tailwind classes don't work inside SVG) ── */
const C = {
  mineral:       '#D97706',
  crude:         '#0EA5E9',
  verified:      '#10B981',
  anomaly:       '#EF4444',
  pending:       '#F59E0B',
  surface:       '#1C1917',
  surfaceBright: '#44403C',
  base:          '#0C0A09',
  border:        '#33302E',
  textPrimary:   '#FAFAF9',
  textMuted:     '#78716C',
};

/* ── Flow-graph layout constants ── */
const NODE_W  = 120;
const NODE_H  = 44;
const NODE_RX = 8;
const GAP     = 50;
const SVG_PAD = 24;
const SVG_H   = 140;

/* ──────────────────────────────────────────────────────────────
   FlowGraph — inline SVG custody flow visualisation
   ────────────────────────────────────────────────────────────── */
function FlowGraph({ results, pendingData }) {
  /* ---- extract entities & edges ---- */
  const entities = [];
  const entitySet = new Set();
  results.forEach((r) => {
    if (!entitySet.has(r.tx.origen))  { entities.push(r.tx.origen);  entitySet.add(r.tx.origen); }
    if (!entitySet.has(r.tx.destino)) { entities.push(r.tx.destino); entitySet.add(r.tx.destino); }
  });

  const edges = results.map((r, i) => ({
    from:     r.tx.origen,
    to:       r.tx.destino,
    quantity: r.tx.cantidad,
    tipo:     r.tx.tipo,
    hasDrift: i > 0 && results[i - 1].tx.cantidad !== r.tx.cantidad,
  }));

  /* ---- pending edges / entities ---- */
  const pendingEdges = [];
  const pendingEntities = [];
  if (pendingData?.pending_count > 0) {
    pendingData.transactions.forEach((tx) => {
      if (!entitySet.has(tx.origen))  { pendingEntities.push(tx.origen);  entitySet.add(tx.origen); }
      if (!entitySet.has(tx.destino)) { pendingEntities.push(tx.destino); entitySet.add(tx.destino); }
      pendingEdges.push({
        from:     tx.origen,
        to:       tx.destino,
        quantity: tx.cantidad,
        tipo:     tx.tipo,
      });
    });
  }

  const allEntities = [...entities, ...pendingEntities];

  /* ---- node positions ---- */
  const svgW = SVG_PAD * 2 + allEntities.length * NODE_W + (allEntities.length - 1) * GAP;
  const nodeY = (SVG_H - NODE_H) / 2;
  const pos = {};
  allEntities.forEach((e, i) => {
    pos[e] = { x: SVG_PAD + i * (NODE_W + GAP), y: nodeY };
  });

  /* ---- helpers ---- */
  const firstEntity = entities[0];
  const lastEntity  = entities[entities.length - 1];

  // entities that receive a drifted transfer
  const anomalyReceivers = new Set();
  edges.forEach((edge) => { if (edge.hasDrift) anomalyReceivers.add(edge.to); });

  function nodeBorder(entity, isPending) {
    if (isPending)                       return C.pending;
    if (anomalyReceivers.has(entity))    return C.anomaly;
    if (entity === firstEntity)          return C.mineral;
    if (entity === lastEntity)           return C.verified;
    return C.border;
  }

  function nodeBorderWidth(entity, isPending) {
    if (isPending) return 1;
    if (anomalyReceivers.has(entity) || entity === firstEntity || entity === lastEntity) return 2;
    return 1;
  }

  function edgePath(fromEntity, toEntity) {
    const x1 = pos[fromEntity].x + NODE_W;
    const y1 = pos[fromEntity].y + NODE_H / 2;
    const x2 = pos[toEntity].x;
    const y2 = pos[toEntity].y + NODE_H / 2;
    const cpY = Math.min(y1, y2) - 22;
    return `M${x1},${y1} Q${(x1 + x2) / 2},${cpY} ${x2},${y2}`;
  }

  function edgeMid(fromEntity, toEntity) {
    const x1 = pos[fromEntity].x + NODE_W;
    const y1 = pos[fromEntity].y + NODE_H / 2;
    const x2 = pos[toEntity].x;
    const y2 = pos[toEntity].y + NODE_H / 2;
    const cpY = Math.min(y1, y2) - 22;
    // midpoint of quadratic bezier at t=0.5
    const mx = 0.25 * x1 + 0.5 * ((x1 + x2) / 2) + 0.25 * x2;
    const my = 0.25 * y1 + 0.5 * cpY + 0.25 * y2;
    return { x: mx, y: my };
  }

  const unitLabel = (tipo, qty) => `${qty} ${tipo === 'MINERAL' ? 'tn' : 'bbl'}`;

  return (
    <div className="bg-surface rounded-lg border border-border-subtle p-6 mb-6 animate-fade-up">
      <span className="font-semibold uppercase tracking-widest text-[10px] text-text-muted mb-4 block">
        Grafo de Flujo de Custodia
      </span>

      {/* scoped keyframes for flowing dashes */}
      <style>{`
        @keyframes flowPath { to { stroke-dashoffset: -18; } }
        .flow-edge       { animation: flowPath 1.5s linear infinite; }
        .flow-edge-anomaly { animation: flowPath 1s linear infinite; }
        @media (prefers-reduced-motion: reduce) {
          .flow-edge, .flow-edge-anomaly { animation: none; }
        }
      `}</style>

      <div className="overflow-x-auto">
        <svg
          width={svgW}
          height={SVG_H}
          viewBox={`0 0 ${svgW} ${SVG_H}`}
          xmlns="http://www.w3.org/2000/svg"
          role="img"
          aria-label="Grafo de flujo de custodia"
        >
          {/* ── Defs: markers + glow filter ── */}
          <defs>
            <marker id="arrow-ok" viewBox="0 0 10 8" refX="9" refY="4"
              markerWidth="8" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,4 L0,8 Z" fill={C.verified} />
            </marker>
            <marker id="arrow-anomaly" viewBox="0 0 10 8" refX="9" refY="4"
              markerWidth="8" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,4 L0,8 Z" fill={C.anomaly} />
            </marker>
            <marker id="arrow-pending" viewBox="0 0 10 8" refX="9" refY="4"
              markerWidth="8" markerHeight="6" orient="auto-start-reverse">
              <path d="M0,0 L10,4 L0,8 Z" fill={C.pending} opacity="0.6" />
            </marker>
            <filter id="glow-red" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3" result="blur" />
              <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
            </filter>
          </defs>

          {/* ── Confirmed edges ── */}
          {edges.map((edge, i) => {
            const d = edgePath(edge.from, edge.to);
            const mid = edgeMid(edge.from, edge.to);
            const label = unitLabel(edge.tipo, edge.quantity);
            const isDrift = edge.hasDrift;
            return (
              <g key={`edge-${i}`} style={{ opacity: 0, animation: `fadeIn 300ms ease-out ${300 + i * 80}ms forwards` }}>
                <path
                  d={d}
                  fill="none"
                  stroke={isDrift ? C.anomaly : C.verified}
                  strokeWidth={2}
                  strokeDasharray="6 3"
                  className={isDrift ? 'flow-edge-anomaly' : 'flow-edge'}
                  markerEnd={isDrift ? 'url(#arrow-anomaly)' : 'url(#arrow-ok)'}
                  filter={isDrift ? 'url(#glow-red)' : undefined}
                  style={{ transition: 'stroke-width 150ms ease' }}
                  onMouseEnter={(e) => { e.currentTarget.setAttribute('stroke-width', '3'); }}
                  onMouseLeave={(e) => { e.currentTarget.setAttribute('stroke-width', '2'); }}
                />
                {/* label bg + text */}
                <rect
                  x={mid.x - label.length * 3.2 - 4}
                  y={mid.y - 8}
                  width={label.length * 6.4 + 8}
                  height={16}
                  rx={4}
                  fill={C.base}
                  stroke={isDrift ? C.anomaly : C.border}
                  strokeWidth={0.5}
                />
                <text
                  x={mid.x}
                  y={mid.y + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="monospace"
                  fill={isDrift ? C.anomaly : C.textPrimary}
                  filter={isDrift ? 'url(#glow-red)' : undefined}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* ── Pending edges ── */}
          {pendingEdges.map((edge, i) => {
            const d = edgePath(edge.from, edge.to);
            const mid = edgeMid(edge.from, edge.to);
            const label = unitLabel(edge.tipo, edge.quantity);
            return (
              <g key={`pedge-${i}`} opacity={0.5}>
                <path
                  d={d}
                  fill="none"
                  stroke={C.pending}
                  strokeWidth={1.5}
                  strokeDasharray="4 4"
                  markerEnd="url(#arrow-pending)"
                />
                <rect
                  x={mid.x - label.length * 3.2 - 4}
                  y={mid.y - 8}
                  width={label.length * 6.4 + 8}
                  height={16}
                  rx={4}
                  fill={C.base}
                  stroke={C.pending}
                  strokeWidth={0.5}
                  opacity={0.6}
                />
                <text
                  x={mid.x}
                  y={mid.y + 4}
                  textAnchor="middle"
                  fontSize={10}
                  fontFamily="monospace"
                  fill={C.pending}
                  opacity={0.8}
                >
                  {label}
                </text>
              </g>
            );
          })}

          {/* ── Confirmed nodes ── */}
          {entities.map((entity, i) => {
            const p = pos[entity];
            const bc = nodeBorder(entity, false);
            const bw = nodeBorderWidth(entity, false);
            return (
              <g
                key={`node-${i}`}
                style={{
                  opacity: 0,
                  animation: `fadeIn 300ms ease-out ${i * 100}ms forwards`,
                  cursor: 'default',
                }}
                onMouseEnter={(e) => {
                  const rect = e.currentTarget.querySelector('rect');
                  if (rect) { rect.setAttribute('transform', `translate(${p.x + NODE_W / 2},${p.y + NODE_H / 2}) scale(1.03) translate(${-(p.x + NODE_W / 2)},${-(p.y + NODE_H / 2)})`); }
                }}
                onMouseLeave={(e) => {
                  const rect = e.currentTarget.querySelector('rect');
                  if (rect) { rect.removeAttribute('transform'); }
                }}
              >
                <rect
                  x={p.x} y={p.y}
                  width={NODE_W} height={NODE_H}
                  rx={NODE_RX}
                  fill={C.surface}
                  stroke={bc}
                  strokeWidth={bw}
                  style={{ transition: 'transform 150ms ease, filter 150ms ease' }}
                  filter={anomalyReceivers.has(entity) ? 'url(#glow-red)' : undefined}
                />
                <text
                  x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 - 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={12} fill={C.textPrimary} fontFamily="system-ui, sans-serif"
                >
                  {entity.length > 14 ? entity.slice(0, 13) + '…' : entity}
                </text>
                <text
                  x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 + 12}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill={C.textMuted} fontFamily="system-ui, sans-serif"
                >
                  {entity === entities[0] ? 'origen' : entity === entities[entities.length - 1] ? 'destino final' : 'intermediario'}
                </text>
              </g>
            );
          })}

          {/* ── Pending nodes ── */}
          {pendingEntities.map((entity, i) => {
            const p = pos[entity];
            return (
              <g key={`pnode-${i}`} opacity={0.6}>
                <rect
                  x={p.x} y={p.y}
                  width={NODE_W} height={NODE_H}
                  rx={NODE_RX}
                  fill={C.surface}
                  stroke={C.pending}
                  strokeWidth={1}
                  strokeDasharray="4 2"
                />
                <text
                  x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 - 2}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={12} fill={C.pending} fontFamily="system-ui, sans-serif"
                >
                  {entity.length > 14 ? entity.slice(0, 13) + '…' : entity}
                </text>
                <text
                  x={p.x + NODE_W / 2} y={p.y + NODE_H / 2 + 12}
                  textAnchor="middle" dominantBaseline="middle"
                  fontSize={9} fill={C.textMuted} fontFamily="system-ui, sans-serif"
                >
                  pendiente
                </text>
              </g>
            );
          })}

          {/* fade-in keyframe (scoped inside SVG via <style>) */}
          <style>{`@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }`}</style>
        </svg>
      </div>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   QuantityBarChart — horizontal bars per transfer step
   ────────────────────────────────────────────────────────────── */
function QuantityBarChart({ results }) {
  const maxQty = Math.max(...results.map((r) => r.tx.cantidad));

  return (
    <div className="space-y-2">
      {results.map((r, i) => {
        const prevQty = i > 0 ? results[i - 1].tx.cantidad : null;
        const isDrift = prevQty !== null && prevQty !== r.tx.cantidad;
        const pct = maxQty > 0 ? (r.tx.cantidad / maxQty) * 100 : 0;
        const unit = r.tx.tipo === 'MINERAL' ? 'tn' : 'bbl';

        return (
          <div key={i} className="flex items-center gap-2">
            <span className="text-[10px] text-text-muted w-5 shrink-0 text-right font-mono">{i + 1}</span>
            <div className="flex-1 h-5 bg-surface-bright rounded-sm overflow-hidden relative">
              <div
                className={`h-full rounded-sm ${isDrift ? 'bg-anomaly' : 'bg-mineral'}`}
                style={{
                  width: `${pct}%`,
                  animation: `barGrow 400ms cubic-bezier(0.23,1,0.32,1) ${i * 80}ms both`,
                }}
              />
            </div>
            <span className={`text-[11px] font-mono w-16 shrink-0 text-right ${isDrift ? 'text-anomaly font-semibold' : 'text-text-primary'}`}>
              {r.tx.cantidad} {unit}
            </span>
            <span className="w-4 shrink-0 text-center">
              {isDrift
                ? <AlertTriangle className="w-3 h-3 text-anomaly inline-block" aria-label="Deriva de cantidad" />
                : i > 0
                  ? <Check className="w-3 h-3 text-verified inline-block" aria-label="Consistente" />
                  : null
              }
            </span>
          </div>
        );
      })}

      {/* bar animation keyframe */}
      <style>{`
        @keyframes barGrow {
          from { width: 0; }
        }
        @media (prefers-reduced-motion: reduce) {
          @keyframes barGrow { from { width: unset; } }
        }
      `}</style>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────
   CustodyTracker — main view
   ────────────────────────────────────────────────────────────── */
export default function CustodyTracker() {
  const [lotId, setLotId] = useState('');
  const [results, setResults] = useState(null);
  const [pendingData, setPendingData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Check URL params for pre-filled lot
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const lot = params.get('lot');
    if (lot) {
      setLotId(lot);
      searchLot(lot);
    }
  }, []);

  // Listen for navigation events from TransactionForm
  useEffect(() => {
    function handler(e) {
      const match = e.detail?.match(/custody\?lot=(.+)/);
      if (match) {
        const lot = decodeURIComponent(match[1]);
        setLotId(lot);
        searchLot(lot);
      }
    }
    window.addEventListener('navigate', handler);
    return () => window.removeEventListener('navigate', handler);
  }, []);

  async function searchLot(id) {
    if (!id?.trim()) return;
    setLoading(true);
    setError(null);
    setResults(null);
    setPendingData(null);
    try {
      // Search confirmed blocks
      const chainData = await api.getLot(id.trim());

      // Search pending pool
      let pending = null;
      try {
        pending = await api.getPendingByLot(id.trim());
      } catch {
        // pool might not have /pending/lot endpoint available yet
      }

      setResults(chainData);
      setPendingData(pending);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSearch(e) {
    e.preventDefault();
    await searchLot(lotId);
  }

  const firstTx = results?.[0]?.tx;
  const quantities = results?.map((r) => r.tx.cantidad) ?? [];
  const hasDrift = quantities.length > 1 && new Set(quantities).size > 1;
  const hasPending = pendingData && pendingData.pending_count > 0;
  const totalConfirmed = results?.length ?? 0;
  const entityCount = results ? new Set(results.flatMap((r) => [r.tx.origen, r.tx.destino])).size : 0;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
      <div className="col-span-full lg:col-span-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-mineral-dim flex items-center justify-center">
            <Route className="w-4 h-4 text-mineral" aria-hidden="true" />
          </div>
          <div>
            <h2 className="font-sans text-2xl font-semibold text-text-primary">Trazabilidad de Custodia</h2>
            <p className="font-sans text-text-muted text-sm">Rastreá un recurso físico a lo largo de toda la cadena de custodia</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <label htmlFor="lot-id-search" className="sr-only">ID de lote</label>
          <input
            id="lot-id-search"
            type="text"
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            placeholder="Ingresá un ID de lote (ej: LOTE-2026-MIN-001)"
            className="flex-1 bg-surface border border-border-subtle rounded-lg px-4 py-2.5 text-sm font-mono text-text-primary shadow-card placeholder:text-text-muted/50 focus:border-mineral focus:shadow-glow-mineral focus:outline-none hover:border-text-muted/40 transition-all duration-200"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-mineral text-base px-5 py-2.5 rounded-lg text-sm font-semibold cursor-pointer hover:bg-mineral/90 active:scale-[0.97] transition-all duration-150 disabled:opacity-50"
          >
            {loading ? 'Buscando...' : 'Rastrear Lote'}
          </button>
        </form>

        {!results && !pendingData && !loading && !error && (
          <div className="bg-surface border border-border-subtle rounded-lg shadow-card px-6 py-8 text-center animate-fade-up">
            <p className="font-sans text-lg text-text-primary">Buscá un lote para rastrear su recorrido de custodia</p>
            <p className="text-sm text-text-secondary mt-2">Ingresá un ID de lote para ver cada entidad que lo manipuló, cuándo y con qué cantidad.</p>
            <div className="flex items-center justify-center gap-3 mt-6 text-xs text-text-secondary">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-bright rounded-lg">
                <span className="text-mineral font-semibold">1</span> Pool
              </span>
              <span className="text-text-muted">&rarr;</span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-surface-bright rounded-lg">
                <span className="text-mineral font-semibold">2</span> Minería
              </span>
              <span className="text-text-muted">&rarr;</span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-verified-dim rounded-lg text-verified">
                <Check className="w-3 h-3" aria-hidden="true" /> Cadena
              </span>
            </div>
            <p className="text-xs text-text-muted mt-4">Los cambios de cantidad entre transferencias se marcan como posible contrabando.</p>
          </div>
        )}

        {error && (
          <div className="bg-anomaly-dim border border-anomaly/20 rounded-lg px-5 py-3 animate-fade-up">
            <p className="text-anomaly text-sm">{error}</p>
          </div>
        )}

        {results && results.length === 0 && !hasPending && (
          <div className="bg-surface border border-border-subtle rounded-lg shadow-card px-6 py-6 text-center animate-fade-up">
            <p className="font-sans text-text-primary">No se encontraron transacciones para <span className="font-mono text-sm text-mineral">{lotId}</span></p>
            <p className="text-xs text-text-muted mt-2">Este lote todavía no fue registrado en la cadena ni está pendiente en el pool.</p>
          </div>
        )}

        {/* Pending in pool */}
        {hasPending && (
          <div className="mb-6 animate-fade-up">
            <span className="font-semibold uppercase tracking-widest text-[10px] text-pending">Pendiente en Pool</span>
            <div className="mt-3 bg-pending-dim border border-pending/20 rounded-lg px-5 py-4">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 rounded-full bg-pending animate-pulse-slow" />
                <span className="text-sm font-medium text-pending">
                  {pendingData.pending_count} transacción(es) esperando minado
                </span>
              </div>
              {pendingData.transactions.map((tx, i) => (
                <div key={i} className="mt-3 flex items-center justify-between text-sm text-text-secondary border-t border-pending/10 pt-2">
                  <span className="font-medium text-text-primary">{tx.origen} &rarr; {tx.destino}</span>
                  <span className="font-mono text-xs text-text-muted">{tx.cantidad} {tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ─── Flow Graph (THE STAR FEATURE) ─── */}
        {results && results.length > 0 && (
          <FlowGraph results={results} pendingData={pendingData} />
        )}

        {/* Confirmed in chain */}
        {results && results.length > 0 && (
          <div className="animate-fade-up">
            <div className="mb-8 bg-surface border border-border-subtle rounded-lg shadow-card px-5 py-4 transition-all duration-200 hover:shadow-card-hover">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-mineral-dim flex items-center justify-center">
                  {firstTx.tipo === 'MINERAL'
                    ? <Pickaxe className="w-4 h-4 text-mineral" aria-hidden="true" />
                    : <Fuel className="w-4 h-4 text-crude" aria-hidden="true" />
                  }
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-sans text-xl font-semibold text-text-primary">{firstTx.id_lote}</h3>
                    <span className="text-[10px] bg-verified-dim text-verified px-2 py-0.5 rounded-full font-semibold">{totalConfirmed} bloque(s)</span>
                  </div>
                  <p className="text-sm text-text-secondary">
                    {firstTx.cantidad} {firstTx.tipo === 'MINERAL' ? 'toneladas' : 'barriles'} · <span className={firstTx.tipo === 'MINERAL' ? 'text-mineral' : 'text-crude'}>{firstTx.tipo}</span>
                    <span className="text-xs text-text-muted ml-2">
                      registrado {new Date(results[0].block_timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <span className="font-semibold uppercase tracking-widest text-[10px] text-text-muted">Línea de Custodia</span>

            <div className="mt-4 space-y-0">
              {results.map((r, i) => {
                const prevQty = i > 0 ? results[i - 1].tx.cantidad : null;
                const qtyChanged = prevQty !== null && prevQty !== r.tx.cantidad;

                return (
                  <div key={i} className="flex gap-4 animate-fade-up" style={{ animationDelay: `${i * 80}ms` }}>
                    <div className="flex flex-col items-center">
                      <div className={`w-4 h-4 rounded-full border-2 transition-colors duration-200 ${
                        qtyChanged ? 'bg-anomaly border-anomaly shadow-glow-anomaly' : 'bg-verified border-verified'
                      }`} />
                      {i < results.length - 1 && <div className="w-0.5 flex-1 bg-mineral" />}
                    </div>
                    <div className="pb-8 flex-1">
                      <div className={`rounded-lg px-4 py-3 border transition-all duration-200 hover:shadow-card-hover active:scale-[0.97] ${
                        qtyChanged
                          ? 'bg-anomaly-dim border-anomaly shadow-glow-anomaly'
                          : 'bg-surface border-border-subtle shadow-card hover:bg-surface-hover'
                      }`}>
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm text-text-primary">{r.tx.origen}</p>
                          <span className="text-xs text-text-muted">
                            {new Date(r.block_timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-text-secondary mt-1">
                          {r.tx.cantidad} {r.tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}
                          <span className="mx-2 text-mineral">&rarr;</span>
                          <span className="text-text-primary font-medium">{r.tx.destino}</span>
                        </p>
                        {qtyChanged && (
                          <p className="text-xs text-anomaly font-semibold mt-1 flex items-center gap-1">
                            <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Deriva de cantidad: {prevQty} &rarr; {r.tx.cantidad} ({r.tx.cantidad - prevQty > 0 ? '+' : ''}{r.tx.cantidad - prevQty})
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-text-muted">
                          <span className="font-mono bg-surface-bright px-1.5 py-0.5 rounded-sm">Bloque {r.block_hash.slice(0, 10)}...</span>
                          <span className="flex items-center gap-1 text-verified">
                            <Check className="w-3 h-3" aria-hidden="true" />
                            <span>firmado</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* ─── Sidebar ─── */}
      <aside className="col-span-full lg:col-span-4">
        {results && results.length > 0 ? (
          <div className="space-y-6">
            {/* Lot Summary */}
            <div className="bg-surface border border-border-subtle rounded-lg shadow-card overflow-hidden animate-slide-in-right">
              <div className="bg-mineral-dim px-5 py-3 border-b border-border-subtle">
                <span className="font-semibold uppercase tracking-widest text-[10px] text-mineral">Resumen del Lote</span>
              </div>
              <div className="px-5 py-4 space-y-4">
                <div>
                  <span className="text-[11px] text-text-muted">Transferencias</span>
                  <p className="text-verified text-sm mt-0.5 font-medium">
                    {totalConfirmed} confirmadas
                    {hasPending && <span className="text-pending"> · {pendingData.pending_count} pendientes</span>}
                  </p>
                </div>
                <div>
                  <span className="text-[11px] text-text-muted">Entidades involucradas</span>
                  <p className="font-sans text-lg font-semibold text-text-primary mt-0.5">{entityCount}</p>
                </div>
                <div>
                  <span className="text-[11px] text-text-muted">Integridad de cantidad</span>
                  {hasDrift ? (
                    <div className="mt-0.5">
                      <p className="flex items-center gap-1.5 text-anomaly text-sm font-semibold">
                        <AlertTriangle className="w-3 h-3" aria-hidden="true" /> Deriva detectada
                      </p>
                      <p className="text-[11px] text-anomaly/70 mt-0.5">La cantidad cambió entre transferencias</p>
                    </div>
                  ) : (
                    <p className="flex items-center gap-1.5 mt-0.5">
                      <span className="w-2 h-2 rounded-full bg-verified" />
                      <span className="text-verified text-sm font-medium">consistente</span>
                    </p>
                  )}
                </div>
                <div>
                  <span className="text-[11px] text-text-muted">Integridad</span>
                  <div className="mt-1 flex items-center gap-3">
                    <RingChart
                      value={hasDrift ? quantities.filter((q, i) => i === 0 || q === quantities[i - 1]).length : totalConfirmed}
                      max={totalConfirmed}
                      size={40}
                      strokeWidth={3}
                      color={hasDrift ? 'text-anomaly' : 'text-verified'}
                      showValue
                    />
                    <span className="text-[11px] text-text-secondary">
                      {hasDrift
                        ? `${quantities.filter((q, i) => i > 0 && q !== quantities[i - 1]).length} transferencia(s) con deriva`
                        : 'Todas las transferencias consistentes'
                      }
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Quantity Bar Chart */}
            <div className="bg-surface border border-border-subtle rounded-lg shadow-card overflow-hidden animate-slide-in-right" style={{ animationDelay: '100ms' }}>
              <div className="bg-surface-bright px-5 py-3 border-b border-border-subtle">
                <span className="font-semibold uppercase tracking-widest text-[10px] text-text-muted">Cantidad por Transferencia</span>
              </div>
              <div className="px-5 py-4">
                <QuantityBarChart results={results} />
              </div>
            </div>
          </div>
        ) : hasPending ? (
          <div className="bg-pending-dim border border-pending/20 rounded-lg shadow-card overflow-hidden animate-slide-in-right">
            <div className="bg-pending-dim px-5 py-3 border-b border-pending/20">
              <span className="font-semibold uppercase tracking-widest text-[10px] text-pending">Pendiente de Minado</span>
            </div>
            <div className="px-5 py-4">
              <p className="text-sm text-text-secondary">
                El lote <span className="font-mono text-pending">{lotId}</span> está en el pool esperando ser minado.
              </p>
              <p className="text-[11px] text-text-muted mt-2">
                {pendingData.pending_count} transacción(es) pendiente(s). Cuando haya 10 o usen "Minar ahora", el bloque se procesará y aparecerá acá.
              </p>
            </div>
          </div>
        ) : (
          <div className="bg-surface border border-border-subtle rounded-lg shadow-card px-5 py-4 animate-fade-up">
            <span className="font-semibold uppercase tracking-widest text-[10px] text-text-muted">Cómo funciona</span>
            <div className="mt-3 space-y-3 text-xs text-text-secondary">
              <div className="flex gap-2">
                <span className="text-mineral font-semibold">1.</span>
                <p>Un operador registra una transferencia de custodia</p>
              </div>
              <div className="flex gap-2">
                <span className="text-mineral font-semibold">2.</span>
                <p>La transacción se firma con Ed25519 y va al pool</p>
              </div>
              <div className="flex gap-2">
                <span className="text-mineral font-semibold">3.</span>
                <p>El pool acumula hasta 10 txs o se fuerza el minado manual</p>
              </div>
              <div className="flex gap-2">
                <span className="text-mineral font-semibold">4.</span>
                <p>Los workers minan el bloque y se confirma en la cadena</p>
              </div>
              <div className="flex gap-2">
                <Check className="w-3 h-3 text-verified shrink-0" aria-hidden="true" />
                <p>Podés consultar el estado en la vista Transferencias</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
