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
