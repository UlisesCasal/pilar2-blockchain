import { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export default function BlockExplorer() {
  const { data: chain, error } = usePolling(api.getChain);
  const [expanded, setExpanded] = useState(null);

  if (error) return <p className="text-garnet">Error al cargar la cadena: {error}</p>;
  if (!chain) return (
    <div className="flex items-center gap-3 text-slate">
      <div className="w-4 h-4 border-2 border-slate/30 border-t-assayers-gold rounded-full animate-spin" />
      <p className="font-serif italic">Conectando a la blockchain...</p>
    </div>
  );

  const blocks = [...chain].reverse();

  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-malachite/10 flex items-center justify-center">
            <span className="text-malachite text-sm">◆</span>
          </div>
          <div>
            <h2 className="font-serif text-2xl">Explorador de Bloques</h2>
            <p className="font-serif italic text-slate text-sm">Navegá cada bloque confirmado y sus transacciones</p>
          </div>
        </div>

        {blocks.length === 0 && (
          <div className="bg-white rounded-lg shadow-card px-6 py-8 text-center animate-fade-up">
            <p className="font-serif text-lg text-graphite">La cadena está vacía</p>
            <p className="text-sm text-slate mt-2">Cambiá al rol <span className="font-semibold text-assayers-gold">Operador</span> para registrar la primera transferencia de custodia.</p>
            <p className="text-xs text-slate mt-1 font-serif italic">Una vez confirmada por los mineros, los bloques aparecerán acá.</p>
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
                className={`rounded-lg cursor-pointer transition-all animate-fade-up ${
                  isOpen ? 'bg-white shadow-card-hover' : 'bg-white shadow-card transition-lift'
                }`}
                style={{ animationDelay: `${i * 60}ms` }}
                onClick={() => setExpanded(isOpen ? null : block.block_hash)}
              >
                <div className="px-5 py-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-mono ${
                      hasTx ? 'bg-malachite/10 text-malachite' : 'bg-stone text-slate'
                    }`}>
                      {blockNum}
                    </div>
                    <div>
                      <span className="font-serif text-lg">Bloque #{blockNum}</span>
                      <p className="font-mono text-[11px] text-slate mt-0.5">{block.block_hash}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-serif italic text-sm text-slate">
                      {new Date(block.timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <p className={`text-xs mt-0.5 font-medium ${hasTx ? 'text-malachite' : 'text-slate'}`}>
                      {block.transactions.length} {block.transactions.length === 1 ? 'transacción' : 'transacciones'}
                    </p>
                  </div>
                </div>

                {!isOpen && hasTx && (
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
                      <p className="font-serif italic text-xs text-slate">+{block.transactions.length - 3} más</p>
                    )}
                  </div>
                )}

                {isOpen && (
                  <div className="border-t border-stone/60 px-5 py-4 space-y-3 animate-fade-in">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="font-semibold uppercase tracking-widest text-slate text-[10px]">Hash anterior</span>
                        <p className="font-mono text-slate mt-0.5 break-all">{block.previous_hash}</p>
                      </div>
                      <div>
                        <span className="font-semibold uppercase tracking-widest text-slate text-[10px]">Nonce</span>
                        <p className="font-mono mt-0.5">{block.nonce}</p>
                      </div>
                    </div>
                    <div>
                      <span className="font-semibold uppercase tracking-widest text-slate text-[10px]">Transacciones</span>
                      <div className="mt-2 space-y-2">
                        {block.transactions.map((tx, j) => (
                          <div key={j} className="bg-chalk rounded-lg px-4 py-3 text-sm border border-stone/40">
                            <div className="flex justify-between items-start">
                              <div>
                                <span className="text-graphite font-medium">{tx.origen}</span>
                                <span className="mx-2 text-assayers-gold">&rarr;</span>
                                <span className="text-graphite font-medium">{tx.destino}</span>
                              </div>
                              <span className="font-mono text-xs">{tx.cantidad} {tx.tipo === 'MINERAL' ? 'tn' : 'bbl'} {tx.tipo}</span>
                            </div>
                            <div className="mt-1.5 flex items-center gap-3 text-xs text-slate">
                              <span className="font-mono bg-stone/50 px-1.5 py-0.5 rounded-sm">{tx.id_lote}</span>
                              {tx.firma ? (
                                <span className="flex items-center gap-1 text-malachite">
                                  <span>✓</span>
                                  <span className="font-serif italic">firmado</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-slate">
                                  <span>○</span>
                                  <span className="font-serif italic">sin firma</span>
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

      <aside className="col-span-4">
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="bg-malachite/10 px-5 py-3 border-b border-stone/60">
            <span className="font-semibold uppercase tracking-widest text-[10px] text-malachite">Estado de la Cadena</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <span className="text-[11px] text-slate">Integridad</span>
              <p className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-malachite" />
                <span className="font-serif italic text-malachite text-sm">verificada</span>
              </p>
            </div>
            <div>
              <span className="text-[11px] text-slate">Total de Bloques</span>
              <p className="font-serif text-2xl">{chain.length}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate">Último Bloque</span>
              <p className="font-mono text-xs text-slate mt-0.5 break-all">{chain.length > 0 ? chain[chain.length - 1].block_hash : '—'}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 bg-gold-light/50 border border-assayers-gold/20 rounded-lg px-5 py-4">
          <p className="text-xs text-slate">
            <span className="font-semibold text-assayers-gold">Tip:</span> Hacé clic en cualquier bloque para ver los detalles completos, incluyendo firmas y el nonce de proof-of-work.
          </p>
        </div>
      </aside>
    </div>
  );
}
