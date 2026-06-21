import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export default function OverviewBar({ role }) {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);

  const metrics = [
    { label: 'Bloques', value: status?.chain_length ?? '—', detail: 'confirmados en la cadena', stripe: 'bg-malachite' },
    { label: 'Workers', value: pool ? (pool.gpu_workers + pool.cpu_workers) : '—', detail: pool ? `${pool.gpu_workers} GPU · ${pool.cpu_workers} CPU` : 'conectando...', stripe: 'bg-assayers-gold' },
    { label: 'Pendientes', value: pool?.pending ?? '—', detail: 'en el pool de transacciones', stripe: 'bg-slate' },
    { label: 'Dificultad', value: status?.difficulty ?? '0000', detail: 'prefijo hash requerido', stripe: 'bg-graphite' },
  ];

  return (
    <div className="px-8 pt-6 pb-2">
      <div className="grid grid-cols-4 gap-4">
        {metrics.map((m, i) => (
          <div
            key={m.label}
            className="bg-white rounded-lg shadow-card overflow-hidden animate-fade-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <div className={`h-1 ${m.stripe}`} />
            <div className="px-4 py-3">
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate">{m.label}</span>
              <p className="font-serif text-2xl mt-0.5 leading-tight">{m.value}</p>
              <p className="text-[11px] text-slate mt-0.5">{m.detail}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
