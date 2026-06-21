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
          <div className="w-8 h-8 rounded-lg bg-assayers-gold/10 flex items-center justify-center">
            <span className="text-assayers-gold text-sm">⟐</span>
          </div>
          <div>
            <h2 className="font-serif text-2xl">Trazabilidad de Custodia</h2>
            <p className="font-serif italic text-slate text-sm">Rastreá un recurso físico a lo largo de toda la cadena de custodia</p>
          </div>
        </div>

        <form onSubmit={handleSearch} className="flex gap-3 mb-8">
          <input
            type="text"
            value={lotId}
            onChange={(e) => setLotId(e.target.value)}
            placeholder="Ingresá un ID de lote (ej: LOTE-2026-MIN-001)"
            className="flex-1 bg-white border border-stone rounded-lg px-4 py-2.5 text-sm font-mono shadow-card placeholder:text-slate/50 focus:outline-none focus:border-assayers-gold focus:shadow-card-hover transition-all"
          />
          <button
            type="submit"
            disabled={loading}
            className="bg-graphite text-chalk px-5 py-2.5 rounded-lg text-sm font-medium hover:bg-graphite/90 transition-colors disabled:opacity-50"
          >
            {loading ? 'Buscando...' : 'Rastrear Lote'}
          </button>
        </form>

        {!results && !loading && !error && (
          <div className="bg-white rounded-lg shadow-card px-6 py-8 text-center animate-fade-up">
            <p className="font-serif text-lg text-graphite">Buscá un lote para rastrear su recorrido de custodia</p>
            <p className="text-sm text-slate mt-2">Ingresá un ID de lote para ver cada entidad que lo manipuló, cuándo y con qué cantidad.</p>
            <div className="flex items-center justify-center gap-3 mt-6 text-xs text-slate">
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-stone/40 rounded-lg">
                <span className="text-assayers-gold font-semibold">1</span> Extracción
              </span>
              <span className="text-stone">&rarr;</span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-stone/40 rounded-lg">
                <span className="text-assayers-gold font-semibold">2</span> Transporte
              </span>
              <span className="text-stone">&rarr;</span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-stone/40 rounded-lg">
                <span className="text-assayers-gold font-semibold">3</span> Refinería
              </span>
              <span className="text-stone">&rarr;</span>
              <span className="flex items-center gap-1.5 px-3 py-1.5 bg-malachite/10 rounded-lg text-malachite">
                ✓ Verificado
              </span>
            </div>
            <p className="text-xs text-slate mt-4 font-serif italic">Los cambios de cantidad entre transferencias se marcan como posible contrabando.</p>
          </div>
        )}

        {error && (
          <div className="bg-garnet/5 border border-garnet/20 rounded-lg px-5 py-3 animate-fade-up">
            <p className="text-garnet text-sm">{error}</p>
          </div>
        )}

        {results && results.length === 0 && (
          <div className="bg-white rounded-lg shadow-card px-6 py-6 text-center animate-fade-up">
            <p className="font-serif text-graphite">No se encontraron transacciones para <span className="font-mono text-sm">{lotId}</span></p>
            <p className="text-xs text-slate mt-2">Este lote todavía no fue registrado en la cadena.</p>
          </div>
        )}

        {results && results.length > 0 && (
          <div className="animate-fade-up">
            <div className="mb-8 bg-white rounded-lg shadow-card px-5 py-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-assayers-gold/10 flex items-center justify-center">
                  <span className="font-mono text-sm text-assayers-gold">{firstTx.tipo === 'MINERAL' ? '⛏' : '🛢'}</span>
                </div>
                <div>
                  <h3 className="font-serif text-xl">{firstTx.id_lote}</h3>
                  <p className="text-sm text-slate">
                    {firstTx.cantidad} {firstTx.tipo === 'MINERAL' ? 'toneladas' : 'barriles'} · {firstTx.tipo}
                    <span className="font-serif italic text-xs ml-2">
                      registrado {new Date(results[0].block_timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', year: 'numeric' })}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Línea de Custodia</span>

            <div className="mt-4 space-y-0">
              {results.map((r, i) => {
                const prevQty = i > 0 ? results[i - 1].tx.cantidad : null;
                const qtyChanged = prevQty !== null && prevQty !== r.tx.cantidad;

                return (
                  <div key={i} className="flex gap-4 animate-fade-up" style={{ animationDelay: `${i * 100}ms` }}>
                    <div className="flex flex-col items-center">
                      <div className={`w-4 h-4 rounded-full border-2 ${
                        qtyChanged ? 'bg-garnet border-garnet' : 'bg-assayers-gold border-assayers-gold'
                      }`} />
                      {i < results.length - 1 && <div className="w-px flex-1 bg-stone" />}
                    </div>
                    <div className="pb-8 flex-1">
                      <div className={`rounded-lg px-4 py-3 ${qtyChanged ? 'bg-garnet/5 border border-garnet/20' : 'bg-white shadow-card'}`}>
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-sm">{r.tx.origen}</p>
                          <span className="font-serif italic text-xs text-slate">
                            {new Date(r.block_timestamp).toLocaleDateString('es-AR', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                        <p className="text-sm text-slate mt-1">
                          {r.tx.cantidad} {r.tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}
                          <span className="mx-2 text-assayers-gold">&rarr;</span>
                          <span className="text-graphite font-medium">{r.tx.destino}</span>
                        </p>
                        {qtyChanged && (
                          <p className="text-xs text-garnet font-semibold mt-1">
                            ⚠ Deriva de cantidad: {prevQty} &rarr; {r.tx.cantidad} ({r.tx.cantidad - prevQty > 0 ? '+' : ''}{r.tx.cantidad - prevQty})
                          </p>
                        )}
                        <div className="flex items-center gap-3 mt-1.5 text-xs text-slate">
                          <span className="font-mono bg-stone/50 px-1.5 py-0.5 rounded-sm">Bloque {r.block_hash.slice(0, 10)}...</span>
                          <span className="flex items-center gap-1 text-malachite">
                            <span>✓</span>
                            <span className="font-serif italic">firmado</span>
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
          <div className="bg-white rounded-lg shadow-card overflow-hidden animate-slide-in-right">
            <div className="bg-assayers-gold/10 px-5 py-3 border-b border-stone/60">
              <span className="font-semibold uppercase tracking-widest text-[10px] text-assayers-gold">Resumen del Lote</span>
            </div>
            <div className="px-5 py-4 space-y-4">
              <div>
                <span className="text-[11px] text-slate">Transferencias</span>
                <p className="font-serif italic text-malachite text-sm mt-0.5">{results.length} confirmadas</p>
              </div>
              <div>
                <span className="text-[11px] text-slate">Entidades involucradas</span>
                <p className="font-serif text-lg mt-0.5">{new Set(results.flatMap((r) => [r.tx.origen, r.tx.destino])).size}</p>
              </div>
              <div>
                <span className="text-[11px] text-slate">Integridad de cantidad</span>
                {hasDrift ? (
                  <div className="mt-0.5">
                    <p className="flex items-center gap-1.5 text-garnet text-sm font-semibold">
                      <span>⚠</span> Deriva detectada
                    </p>
                    <p className="text-[11px] text-garnet/70 mt-0.5 font-serif italic">La cantidad cambió entre transferencias</p>
                  </div>
                ) : (
                  <p className="flex items-center gap-1.5 mt-0.5">
                    <span className="w-2 h-2 rounded-full bg-malachite" />
                    <span className="font-serif italic text-malachite text-sm">consistente</span>
                  </p>
                )}
              </div>
            </div>
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow-card px-5 py-4 animate-fade-up">
            <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Cómo funciona</span>
            <div className="mt-3 space-y-3 text-xs text-slate">
              <div className="flex gap-2">
                <span className="text-assayers-gold font-semibold">1.</span>
                <p>Un operador registra una transferencia de custodia (ej: minerales de mina a planta)</p>
              </div>
              <div className="flex gap-2">
                <span className="text-assayers-gold font-semibold">2.</span>
                <p>La transacción se firma con la clave Ed25519 de la entidad de origen</p>
              </div>
              <div className="flex gap-2">
                <span className="text-assayers-gold font-semibold">3.</span>
                <p>Los workers minan un bloque para confirmarla en la cadena</p>
              </div>
              <div className="flex gap-2">
                <span className="text-assayers-gold font-semibold">4.</span>
                <p>Cualquier cambio de cantidad entre transferencias se marca como posible contrabando</p>
              </div>
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
