import { useState, useRef, useEffect } from 'react';
import { Gem, Check, Circle, ChevronDown } from 'lucide-react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import RingChart from '../components/RingChart';

export default function BlockExplorer() {
  const { data: chain, error } = usePolling(api.getChain);
  const [expanded, setExpanded] = useState(null);
  const chainScrollRef = useRef(null);
  const blockRefs = useRef({});

  // Auto-scroll chain viz to the right (most recent) on load
  useEffect(() => {
    if (chainScrollRef.current) {
      chainScrollRef.current.scrollLeft = chainScrollRef.current.scrollWidth;
    }
  }, [chain]);

  if (error) return <p className="text-anomaly">Error al cargar la cadena: {error}</p>;
  if (!chain) return (
    <div className="flex items-center gap-3 text-text-secondary">
      <div className="w-4 h-4 border-2 border-text-muted/30 border-t-mineral rounded-full animate-spin" />
      <p className="font-sans">Conectando a la blockchain...</p>
    </div>
  );

  const blocks = [...chain].reverse();

  // Total transactions across chain
  const totalTx = chain.reduce((sum, b) => sum + b.transactions.length, 0);
  const blocksWithTx = chain.filter((b) => b.transactions.length > 0).length;

  function handleChainNodeClick(blockHash) {
    setExpanded((prev) => (prev === blockHash ? null : blockHash));
    // Scroll block into view in the list
    if (blockRefs.current[blockHash]) {
      blockRefs.current[blockHash].scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
  }

  // Chain visualization constants
  const nodeSize = 32;
  const nodeGap = 48;
  const nodePadX = 16;
  const nodePadY = 16;
  const chainSvgWidth = chain.length > 0
    ? nodePadX * 2 + chain.length * nodeSize + (chain.length - 1) * nodeGap
    : 0;
  const chainSvgHeight = nodeSize + nodePadY * 2;

  return (
    <div>
      {/* Visual Chain */}
      {chain.length > 0 && (
        <div
          ref={chainScrollRef}
          className="overflow-x-auto scroll-smooth bg-surface rounded-lg border border-border-subtle p-4 mb-6"
        >
          <svg
            width={chainSvgWidth}
            height={chainSvgHeight}
            className="block"
            role="img"
            aria-label="Visualizacion de la cadena de bloques"
          >
            {chain.map((block, i) => {
              const blockNum = i + 1;
              const x = nodePadX + i * (nodeSize + nodeGap);
              const y = nodePadY;
              const isSelected = expanded === block.block_hash;
              const isRecent = i >= chain.length - 3;
              const hasTx = block.transactions.length > 0;

              // Determine fill
              let fill = '#2A2725'; // surface-bright approx
              if (isSelected) fill = '#B8860B'; // mineral approx
              else if (isRecent) fill = '#3D3935'; // brighter surface

              return (
                <g
                  key={block.block_hash}
                  style={{
                    cursor: 'pointer',
                    animation: `fadeUp 300ms ease-out ${i * 30}ms both`,
                  }}
                  onClick={() => handleChainNodeClick(block.block_hash)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      handleChainNodeClick(block.block_hash);
                    }
                  }}
                >
                  {/* Connecting line to next node */}
                  {i < chain.length - 1 && (
                    <line
                      x1={x + nodeSize}
                      y1={y + nodeSize / 2}
                      x2={x + nodeSize + nodeGap}
                      y2={y + nodeSize / 2}
                      stroke="#33302E"
                      strokeWidth={2}
                    />
                  )}

                  {/* Glow for recent blocks */}
                  {isRecent && !isSelected && (
                    <rect
                      x={x - 2}
                      y={y - 2}
                      width={nodeSize + 4}
                      height={nodeSize + 4}
                      rx={8}
                      fill="none"
                      stroke={hasTx ? '#B8860B' : '#555'}
                      strokeWidth={1}
                      opacity={0.4}
                    />
                  )}

                  {/* Selected glow */}
                  {isSelected && (
                    <rect
                      x={x - 3}
                      y={y - 3}
                      width={nodeSize + 6}
                      height={nodeSize + 6}
                      rx={9}
                      fill="none"
                      stroke="#B8860B"
                      strokeWidth={2}
                      opacity={0.6}
                    />
                  )}

                  {/* Block node */}
                  <rect
                    x={x}
                    y={y}
                    width={nodeSize}
                    height={nodeSize}
                    rx={6}
                    fill={fill}
                    className="transition-all duration-200"
                  />

                  {/* Block number */}
                  <text
                    x={x + nodeSize / 2}
                    y={y + nodeSize / 2 + 1}
                    textAnchor="middle"
                    dominantBaseline="central"
                    fill={isSelected ? '#1A1816' : '#A09A94'}
                    fontSize={11}
                    fontFamily="ui-monospace, monospace"
                    fontWeight={600}
                  >
                    {blockNum}
                  </text>
                </g>
              );
            })}

            <style>{`
              @keyframes fadeUp {
                from { opacity: 0; transform: translateY(4px); }
                to { opacity: 1; transform: translateY(0); }
              }
            `}</style>
          </svg>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
        <div className="col-span-full lg:col-span-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-8 h-8 rounded-lg bg-mineral-dim flex items-center justify-center">
              <Gem className="w-4 h-4 text-mineral" aria-hidden="true" />
            </div>
            <div>
              <h2 className="font-sans text-2xl font-semibold text-text-primary">Explorador de Bloques</h2>
              <p className="font-sans text-text-muted text-sm">Navega cada bloque confirmado y sus transacciones</p>
            </div>
          </div>

          {blocks.length === 0 && (
            <div className="bg-surface border border-border-subtle rounded-lg shadow-card px-6 py-8 text-center animate-fade-up">
              <p className="font-sans text-lg text-text-primary">La cadena esta vacia</p>
              <p className="text-sm text-text-secondary mt-2">Cambia al rol <span className="font-semibold text-mineral">Operador</span> para registrar la primera transferencia de custodia.</p>
              <p className="text-xs text-text-muted mt-1">Una vez confirmada por los mineros, los bloques apareceran aca.</p>
            </div>
          )}

          <div className="space-y-3">
            {blocks.map((block, i) => {
              const blockNum = chain.length - i;
              const isOpen = expanded === block.block_hash;
              const hasTx = block.transactions.length > 0;

              return (
                <div
                  key={block.block_hash}
                  ref={(el) => { blockRefs.current[block.block_hash] = el; }}
                  role="button"
                  tabIndex={0}
                  className={`bg-surface border border-border-subtle rounded-lg cursor-pointer transition-all duration-200 animate-fade-up active:scale-[0.97] ${
                    isOpen ? 'shadow-card-hover' : 'shadow-card hover:bg-surface-hover hover:shadow-card-hover'
                  }`}
                  style={{ animationDelay: `${i * 60}ms` }}
                  onClick={() => setExpanded(isOpen ? null : block.block_hash)}
                  onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setExpanded(isOpen ? null : block.block_hash); } }}
                >
                  <div className="px-5 py-4 flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono font-semibold ${
                        hasTx ? 'bg-mineral-dim text-mineral' : 'bg-surface-bright text-text-muted'
                      }`}>
                        {blockNum}
                      </div>
                      <div>
                        <span className="font-sans text-lg font-medium text-text-primary">Bloque #{blockNum}</span>
                        <p className="font-mono text-[11px] text-text-muted mt-0.5 truncate max-w-[280px]">{block.block_hash}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
                      <div className="text-right">
                        <span className="text-sm text-text-secondary">
                          {new Date(block.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                        <p className={`text-xs mt-0.5 font-medium ${hasTx ? 'text-verified' : 'text-text-muted'}`}>
                          {block.transactions.length} {block.transactions.length === 1 ? 'transaccion' : 'transacciones'}
                        </p>
                      </div>
                      <ChevronDown className={`w-4 h-4 text-text-muted transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`} aria-hidden="true" />
                    </div>
                  </div>

                  {!isOpen && hasTx && (
                    <div className="px-5 pb-4 space-y-1">
                      {block.transactions.slice(0, 3).map((tx, j) => (
                        <p key={j} className="text-sm text-text-secondary">
                          <span className="text-text-primary">{tx.origen}</span>
                          <span className="mx-2 text-mineral">&rarr;</span>
                          <span className="text-text-primary">{tx.destino}</span>
                          <span className="ml-3 font-mono text-xs text-text-muted">{tx.cantidad} {tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}</span>
                        </p>
                      ))}
                      {block.transactions.length > 3 && (
                        <p className="text-xs text-text-muted">+{block.transactions.length - 3} mas</p>
                      )}
                    </div>
                  )}

                  {isOpen && (
                    <div className="border-t border-border-subtle px-5 py-4 space-y-3 animate-fade-in">
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div>
                          <span className="font-semibold uppercase tracking-widest text-text-muted text-[10px]">Hash anterior</span>
                          <p className="font-mono text-text-muted mt-0.5 break-all">{block.previous_hash}</p>
                        </div>
                        <div>
                          <span className="font-semibold uppercase tracking-widest text-text-muted text-[10px]">Nonce</span>
                          <p className="font-mono text-text-primary mt-0.5">{block.nonce}</p>
                        </div>
                      </div>
                      <div>
                        <span className="font-semibold uppercase tracking-widest text-text-muted text-[10px]">Transacciones</span>
                        <div className="mt-2 space-y-2">
                          {block.transactions.map((tx, j) => (
                            <div key={j} className={`rounded-lg px-4 py-3 text-sm border border-border-subtle ${
                              j % 2 === 0 ? 'bg-surface' : 'bg-surface-hover'
                            }`}>
                              <div className="flex justify-between items-start">
                                <div className="flex items-center gap-2">
                                  <span className={`w-2 h-2 rounded-full ${tx.tipo === 'MINERAL' ? 'bg-mineral' : 'bg-crude'}`} />
                                  <span className="text-text-primary font-medium">{tx.origen}</span>
                                  <span className="mx-1 text-mineral">&rarr;</span>
                                  <span className="text-text-primary font-medium">{tx.destino}</span>
                                </div>
                                <span className="font-mono text-xs text-text-secondary">
                                  {tx.cantidad} {tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}{' '}
                                  <span className={tx.tipo === 'MINERAL' ? 'text-mineral' : 'text-crude'}>{tx.tipo}</span>
                                </span>
                              </div>
                              <div className="mt-1.5 flex items-center gap-3 text-xs text-text-muted">
                                <span className="font-mono bg-surface-bright px-1.5 py-0.5 rounded-sm">{tx.id_lote}</span>
                                {tx.firma ? (
                                  <span className="flex items-center gap-1 text-verified">
                                    <Check className="w-3 h-3" aria-hidden="true" />
                                    <span>firmado</span>
                                  </span>
                                ) : (
                                  <span className="flex items-center gap-1 text-text-muted">
                                    <Circle className="w-3 h-3" aria-hidden="true" />
                                    <span>sin firma</span>
                                  </span>
                                )}
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
        </div>

        <aside className="col-span-full lg:col-span-4">
          <div className="bg-surface border border-border-subtle rounded-lg shadow-card shadow-glow-verified overflow-hidden">
            <div className="bg-verified-dim px-5 py-3 border-b border-border-subtle">
              <span className="font-semibold uppercase tracking-widest text-[10px] text-verified">Estado de la Cadena</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <span className="text-[11px] text-text-muted">Integridad</span>
                <p className="flex items-center gap-1.5 mt-0.5">
                  <span className="w-2 h-2 rounded-full bg-verified animate-pulse-slow" />
                  <span className="text-verified text-sm font-medium">verificada</span>
                </p>
              </div>
              <div>
                <span className="text-[11px] text-text-muted">Total de Bloques</span>
                <p className="font-sans text-2xl font-semibold text-text-primary">{chain.length}</p>
              </div>
              <div>
                <span className="text-[11px] text-text-muted">Ultimo Bloque</span>
                <p className="font-mono text-xs text-text-muted mt-0.5 break-all">{chain.length > 0 ? chain[chain.length - 1].block_hash : '—'}</p>
              </div>

              {/* Transaction distribution ring chart */}
              {chain.length > 0 && (
                <div className="pt-2 border-t border-border-subtle">
                  <span className="text-[11px] text-text-muted">Bloques con transacciones</span>
                  <div className="flex items-center gap-4 mt-2">
                    <RingChart
                      value={blocksWithTx}
                      max={chain.length}
                      size={56}
                      strokeWidth={5}
                      color="text-mineral"
                      trackColor="text-surface-bright"
                    />
                    <div>
                      <p className="font-mono text-sm text-text-primary">
                        {blocksWithTx}<span className="text-text-muted">/{chain.length}</span>
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">{totalTx} transacciones totales</p>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="mt-4 bg-mineral-dim border border-mineral/20 rounded-lg px-5 py-4">
            <p className="text-xs text-text-secondary">
              <span className="font-semibold text-mineral">Tip:</span> Hace clic en cualquier bloque de la cadena visual o de la lista para ver los detalles completos, incluyendo firmas y el nonce de proof-of-work.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
