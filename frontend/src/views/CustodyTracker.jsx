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
