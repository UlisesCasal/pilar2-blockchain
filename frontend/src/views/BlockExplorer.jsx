import { useState } from 'react';
import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export default function BlockExplorer() {
  const { data: chain, error } = usePolling(api.getChain);
  const [expanded, setExpanded] = useState(null);

  if (error) return <p className="text-garnet">Error loading chain: {error}</p>;
  if (!chain) return (
    <div className="flex items-center gap-3 text-slate">
      <div className="w-4 h-4 border-2 border-slate/30 border-t-assayers-gold rounded-full animate-spin" />
      <p className="font-serif italic">Connecting to blockchain...</p>
    </div>
  );

  const blocks = [...chain].reverse();

  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-8">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-sm bg-malachite/10 flex items-center justify-center">
            <span className="text-malachite text-sm">◆</span>
          </div>
          <div>
            <h2 className="font-serif text-2xl">Block Explorer</h2>
            <p className="font-serif italic text-slate text-sm">Browse every confirmed block and its transactions</p>
          </div>
        </div>

        {blocks.length === 0 && (
          <div className="bg-stone/30 border border-stone rounded-sm px-6 py-8 text-center">
            <p className="font-serif text-lg text-graphite">The chain is empty</p>
            <p className="text-sm text-slate mt-2">Switch to <span className="font-semibold text-assayers-gold">Operador</span> role to register the first custody transfer.</p>
            <p className="text-xs text-slate mt-1 font-serif italic">Once confirmed by miners, blocks will appear here.</p>
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
                className={`border rounded-sm cursor-pointer transition-all ${
                  isOpen ? 'bg-stone/40 border-assayers-gold/30 shadow-sm' : 'bg-stone/20 border-stone hover:border-assayers-gold/30 hover:shadow-sm'
                }`}
                onClick={() => setExpanded(isOpen ? null : block.block_hash)}
              >
                <div className="px-5 py-4 flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-8 h-8 rounded-sm flex items-center justify-center text-xs font-mono ${
                      hasTx ? 'bg-malachite/10 text-malachite' : 'bg-stone text-slate'
                    }`}>
                      {blockNum}
                    </div>
                    <div>
                      <span className="font-serif text-lg">Block #{blockNum}</span>
                      <p className="font-mono text-[11px] text-slate mt-0.5">{block.block_hash}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-serif italic text-sm text-slate">
                      {new Date(block.timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                    <p className={`text-xs mt-0.5 font-medium ${hasTx ? 'text-malachite' : 'text-slate'}`}>
                      {block.transactions.length} transaction{block.transactions.length !== 1 ? 's' : ''}
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
                      <p className="font-serif italic text-xs text-slate">+{block.transactions.length - 3} more</p>
                    )}
                  </div>
                )}

                {isOpen && (
                  <div className="border-t border-stone/60 px-5 py-4 space-y-3">
                    <div className="grid grid-cols-2 gap-4 text-xs">
                      <div>
                        <span className="font-semibold uppercase tracking-widest text-slate text-[10px]">Previous Hash</span>
                        <p className="font-mono text-slate mt-0.5 break-all">{block.previous_hash}</p>
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
                          <div key={j} className="bg-chalk rounded-sm px-4 py-3 text-sm border border-stone/40">
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
                                  <span className="font-serif italic">signed</span>
                                </span>
                              ) : (
                                <span className="flex items-center gap-1 text-slate">
                                  <span>○</span>
                                  <span className="font-serif italic">unsigned</span>
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
        <div className="bg-stone/30 border border-stone rounded-sm overflow-hidden">
          <div className="bg-malachite/10 px-5 py-3 border-b border-stone/60">
            <span className="font-semibold uppercase tracking-widest text-[10px] text-malachite">Chain Status</span>
          </div>
          <div className="px-5 py-4 space-y-4">
            <div>
              <span className="text-[11px] text-slate">Integrity</span>
              <p className="flex items-center gap-1.5 mt-0.5">
                <span className="w-2 h-2 rounded-full bg-malachite" />
                <span className="font-serif italic text-malachite text-sm">verified</span>
              </p>
            </div>
            <div>
              <span className="text-[11px] text-slate">Total Blocks</span>
              <p className="font-serif text-2xl">{chain.length}</p>
            </div>
            <div>
              <span className="text-[11px] text-slate">Latest Block</span>
              <p className="font-mono text-xs text-slate mt-0.5 break-all">{chain.length > 0 ? chain[chain.length - 1].block_hash : '—'}</p>
            </div>
          </div>
        </div>

        <div className="mt-4 bg-gold-light/50 border border-assayers-gold/20 rounded-sm px-5 py-4">
          <p className="text-xs text-slate">
            <span className="font-semibold text-assayers-gold">Tip:</span> Click any block to expand its full details, including transaction signatures and the proof-of-work nonce.
          </p>
        </div>
      </aside>
    </div>
  );
}
