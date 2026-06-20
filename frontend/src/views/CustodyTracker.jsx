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
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-sm bg-assayers-gold/10 flex items-center justify-center">
            <span className="text-assayers-gold text-sm">⟐</span>
          </div>
          <div>
            <h2 className="font-serif text-2xl">Custody Tracker</h2>
            <p className="font-serif italic text-slate text-sm">Trace a physical resource through the entire custody chain</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <input
            type="text"
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            placeholder="Enter a lot ID (e.g. LOTE-2026-MIN-001)"
            className="flex-1 bg-stone/30 border border-stone rounded-sm px-4 py-2.5 text-sm font-mono placeholder:text-slate/50 focus:outline-none focus:border-assayers-gold focus:bg-chalk transition-colors"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-graphite text-chalk px-5 py-2.5 rounded-sm text-sm font-medium hover:bg-graphite/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Searching...' : 'Trace Lot'}
          </button>
        </form>

        {!results && !loading && !error && (
          <div className="bg-stone/20 border border-stone rounded-sm px-6 py-8 text-center">
            <p className="font-serif text-lg text-graphite">Search for a lot to trace its custody journey</p>
            <p className="text-sm text-slate mt-2">Enter a lot ID to see every entity that handled it, when, and with what quantity.</p>
            <p className="text-xs text-slate mt-3 font-serif italic">Quantity changes between transfers are flagged as potential drift — the anti-smuggling mechanism.</p>
          </div>
        )}

        {error && (
          <div className="bg-garnet/5 border border-garnet/20 rounded-sm px-5 py-3">
            <p className="text-garnet text-sm">{error}</p>
          </div>
        )}

        {results && results.length === 0 && (
          <div className="bg-stone/20 border border-stone rounded-sm px-6 py-6 text-center">
            <p className="font-serif text-graphite">No transactions found for <span className="font-mono text-sm">{lotId}</span></p>
            <p className="text-xs text-slate mt-2">This lot hasn't been registered on the chain yet.</p>
          </div>
        )}

        {results && results.length > 0 && (
          <div>
            <div className="mb-8 bg-stone/20 border border-stone rounded-sm px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-sm bg-assayers-gold/10 flex items-center justify-center">
                  <span className="font-mono text-sm text-assayers-gold">{firstTx.tipo === 'MINERAL' ? '⛏' : '🛢'}</span>
                </div>
                <div>
                  <h3 className="font-serif text-xl">{firstTx.id_lote}</h3>
                  <p className="text-sm text-slate">
                    {firstTx.cantidad} {firstTx.tipo === 'MINERAL' ? 'tonnes' : 'barrels'} · {firstTx.tipo}
                    <span className="font-serif italic text-xs ml-2">
                      first seen {new Date(results[0].block_timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Custody Timeline</span>

            <div className="mt-4 space-y-0">
              {results.map((r, i) => {
                const prevQty = i > 0 ? results[i - 1].tx.cantidad : null;
                const qtyChanged = prevQty !== null && prevQty !== r.tx.cantidad;

                return (
                  <div key={i} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        qtyChanged ? 'bg-garnet border-garnet' : 'bg-assayers-gold border-assayers-gold'
                      }`} />
                      {i < results.length - 1 && <div className="w-px flex-1 bg-stone" />}
                    </div>
                    <div className="pb-8 flex-1">
                      <div className={`rounded-sm px-4 py-3 ${qtyChanged ? 'bg-garnet/5 border border-garnet/20' : 'bg-stone/20'}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{r.tx.origen}</p>
                          <span className="font-serif italic text-xs text-slate">
                            {new Date(r.block_timestamp).toLocaleDateString('en-US', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-slate mt-1">
                          {r.tx.cantidad} {r.tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}
                          <span className="mx-2 text-assayers-gold">&rarr;</span>
                          <span className="text-graphite font-medium">{r.tx.destino}</span>
                        </p>
                        {qtyChanged && (
                          <p className="text-xs text-garnet font-semibold mt-1">
                            ⚠ Quantity drift: {prevQty} &rarr; {r.tx.cantidad} ({r.tx.cantidad - prevQty > 0 ? '+' : ''}{r.tx.cantidad - prevQty})
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate">
                          <span className="font-mono bg-stone/50 px-1.5 py-0.5 rounded-sm">Block {r.block_hash.slice(0, 10)}...</span>
                          <span className="flex items-center gap-1 text-malachite">
                            <span>✓</span>
                            <span className="font-serif italic">signed</span>
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

      <aside className="col-span-4">
        {results && results.length > 0 ? (
          <div className="bg-stone/30 border border-stone rounded-sm overflow-hidden">
            <div className="bg-assayers-gold/10 px-5 py-3 border-b border-stone/60">
              <span className="font-semibold uppercase tracking-widest text-[10px] text-assayers-gold">Lot Summary</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <span className="text-[11px] text-slate">Transfers</span>
                <p className="font-serif italic text-malachite text-sm mt-0.5">{results.length} confirmed</p>
              </div>
              <div>
                <span className="text-[11px] text-slate">Entities Involved</span>
                <p className="font-serif text-lg mt-0.5">{new Set(results.flatMap((r) => [r.tx.origen, r.tx.destino])).size}</p>
              </div>
              <div>
                <span className="text-[11px] text-slate">Quantity Integrity</span>
                {hasDrift ? (
                  <div className="mt-0.5">
                    <p className="flex items-center gap-1.5 text-garnet text-sm font-semibold">
                      <span>⚠</span> Drift detected
                    </p>
                    <p className="text-[11px] text-garnet/70 mt-0.5 font-serif italic">Quantity changed between transfers</p>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-malachite" />
                    <span className="font-serif italic text-malachite text-sm">consistent</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-stone/20 border border-stone rounded-sm px-5 py-4">
            <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">How it works</span>
            <div className="mt-3 space-y-3 text-xs text-slate">
              <div className="flex gap-2">
                <span className="text-assayers-gold">1.</span>
                <p>An operator registers a custody transfer (e.g., minerals from mine to plant)</p>
              </div>
              <div className="flex gap-2">
                <span className="text-assayers-gold">2.</span>
                <p>The transaction is signed with the origin entity's Ed25519 key</p>
              </div>
              <div className="flex gap-2">
                <span className="text-assayers-gold">3.</span>
                <p>Workers mine a block to confirm it on the chain</p>
              </div>
              <div className="flex gap-2">
                <span className="text-assayers-gold">4.</span>
                <p>Any quantity change between transfers flags potential smuggling</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
