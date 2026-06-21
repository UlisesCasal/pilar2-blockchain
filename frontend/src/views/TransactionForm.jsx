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
        { tx: signed, status: result.accepted ? 'pending' : 'rejected', detail: result.accepted ? 'esperando confirmación en bloque' : (result.errors?.[0] || 'rechazado') },
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

  const unit = form.tipo === 'MINERAL' ? 'toneladas' : 'barriles';
  const isReady = form.origen && form.destino && form.id_lote && form.cantidad;

  return (
    <div className="grid grid-cols-12 gap-8">
      <div className="col-span-7">
        <div className="flex items-center gap-3 mb-6">
          <div className="w-8 h-8 rounded-lg bg-assayers-gold/10 flex items-center justify-center">
            <span className="text-assayers-gold text-sm">⬡</span>
          </div>
          <div>
            <h2 className="font-serif text-2xl">Nueva Transferencia de Custodia</h2>
            <p className="font-serif italic text-slate text-sm">Registrá una transferencia de recursos físicos entre entidades</p>
          </div>
        </div>

        <div className="flex items-center gap-2 mb-6 text-[11px] text-slate">
          <span className="flex items-center gap-1 px-2.5 py-1.5 bg-white shadow-card rounded-lg"><span className="text-assayers-gold font-semibold">1</span> Completar</span>
          <span className="text-stone">&rarr;</span>
          <span className="flex items-center gap-1 px-2.5 py-1.5 bg-white shadow-card rounded-lg"><span className="text-assayers-gold font-semibold">2</span> Firmar Ed25519</span>
          <span className="text-stone">&rarr;</span>
          <span className="flex items-center gap-1 px-2.5 py-1.5 bg-white shadow-card rounded-lg"><span className="text-assayers-gold font-semibold">3</span> Enviar al pool</span>
          <span className="text-stone">&rarr;</span>
          <span className="flex items-center gap-1 px-2.5 py-1.5 bg-malachite/10 rounded-lg text-malachite">✓ Minado</span>
        </div>

        <form onSubmit={handleSubmit} className="space-y-5">
          <div className="bg-white rounded-lg shadow-card px-5 py-5 space-y-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate mb-2">Tipo de Recurso</label>
                <select value={form.tipo} onChange={(e) => update('tipo', e.target.value)} className="w-full bg-chalk border border-stone rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-assayers-gold transition-colors">
                  <option value="MINERAL">MINERAL</option>
                  <option value="CRUDO">CRUDO</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate mb-2">ID de Lote</label>
                <input type="text" value={form.id_lote} onChange={(e) => update('id_lote', e.target.value)} placeholder="LOTE-2026-MIN-001" className="w-full bg-chalk border border-stone rounded-lg px-3 py-2.5 text-sm font-mono placeholder:text-slate/40 focus:outline-none focus:border-assayers-gold transition-colors" required />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate mb-2">Entidad de Origen</label>
                <select value={form.origen} onChange={(e) => update('origen', e.target.value)} className="w-full bg-chalk border border-stone rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-assayers-gold transition-colors" required>
                  <option value="">Seleccionar origen...</option>
                  {entities.map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
                {form.origen && (
                  <p className="flex items-center gap-1 mt-1.5 text-xs">
                    <span className="w-1.5 h-1.5 rounded-full bg-assayers-gold" />
                    <span className="font-serif italic text-slate">firmando como <span className="text-assayers-gold">{form.origen}</span></span>
                  </p>
                )}
              </div>
              <div>
                <label className="block text-xs font-semibold uppercase tracking-widest text-slate mb-2">Entidad de Destino</label>
                <select value={form.destino} onChange={(e) => update('destino', e.target.value)} className="w-full bg-chalk border border-stone rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-assayers-gold transition-colors" required>
                  <option value="">Seleccionar destino...</option>
                  {entities.filter((e) => e !== form.origen).map((e) => <option key={e} value={e}>{e}</option>)}
                </select>
              </div>
            </div>

            <div className="max-w-xs">
              <label className="block text-xs font-semibold uppercase tracking-widest text-slate mb-2">Cantidad</label>
              <div className="flex items-center gap-2">
                <input type="number" min="1" step="any" value={form.cantidad} onChange={(e) => update('cantidad', e.target.value)} className="flex-1 bg-chalk border border-stone rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-assayers-gold transition-colors" required />
                <span className="text-sm text-slate font-serif italic">{unit}</span>
              </div>
            </div>
          </div>

          <button
            type="submit"
            disabled={submitting || !isReady}
            className={`w-full py-3 rounded-lg text-sm font-medium transition-all ${
              isReady
                ? 'bg-assayers-gold text-chalk hover:bg-assayers-gold/90 shadow-card hover:shadow-card-hover'
                : 'bg-stone text-slate cursor-not-allowed'
            } disabled:opacity-50`}
          >
            {submitting ? 'Firmando y enviando...' : isReady ? 'Firmar y Registrar Transferencia' : 'Completá todos los campos'}
          </button>
        </form>
      </div>

      <div className="col-span-5">
        <div className="bg-white rounded-lg shadow-card overflow-hidden">
          <div className="bg-assayers-gold/10 px-5 py-3 border-b border-stone/60">
            <span className="font-semibold uppercase tracking-widest text-[10px] text-assayers-gold">Registro de Actividad</span>
          </div>

          <div className="px-5 py-4">
            {submissions.length === 0 ? (
              <div className="text-center py-4">
                <p className="font-serif italic text-sm text-slate">Sin transferencias registradas</p>
                <p className="text-[11px] text-slate/70 mt-1">Las transacciones enviadas aparecerán aquí con su estado</p>
              </div>
            ) : (
              <div className="space-y-2">
                {submissions.map((s, i) => (
                  <div key={i} className={`rounded-lg px-4 py-3 border animate-fade-up ${
                    s.status === 'pending' ? 'bg-gold-light/50 border-assayers-gold/20' :
                    s.status === 'confirmed' ? 'bg-malachite-light/50 border-malachite/20' :
                    'bg-garnet/5 border-garnet/20'
                  }`}>
                    <div className="flex justify-between items-start text-sm">
                      <span className="font-mono text-xs">{s.tx.id_lote}</span>
                      <span className="font-mono text-xs">{s.tx.cantidad} {s.tx.tipo === 'MINERAL' ? 'tn' : 'bbl'}</span>
                    </div>
                    <p className="text-sm text-slate mt-1">{s.tx.origen} &rarr; {s.tx.destino}</p>
                    <p className={`flex items-center gap-1.5 text-xs mt-1.5 font-semibold ${
                      s.status === 'pending' ? 'text-assayers-gold' :
                      s.status === 'confirmed' ? 'text-malachite' : 'text-garnet'
                    }`}>
                      <span>{s.status === 'pending' ? '◌' : s.status === 'confirmed' ? '✓' : '✕'}</span>
                      {s.status === 'pending' ? 'pendiente' : s.status === 'confirmed' ? 'confirmado' : 'rechazado'} — <span className="font-normal font-serif italic">{s.detail}</span>
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
