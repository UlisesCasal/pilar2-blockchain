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
