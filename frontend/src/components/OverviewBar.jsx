import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export default function OverviewBar() {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);

  const metrics = [
    { label: 'Chain', value: status?.chain_length ?? '—', detail: 'blocks' },
    { label: 'Workers', value: pool ? (pool.gpu_workers + pool.cpu_workers) : '—', detail: pool ? `${pool.gpu_workers} GPU · ${pool.cpu_workers} CPU` : '' },
    { label: 'Pending', value: pool?.pending ?? '—', detail: 'in pool' },
    { label: 'Role', value: status?.role ?? '—', detail: 'coordinator' },
  ];

  return (
    <div className="flex gap-6 border-b border-stone px-8 py-4">
      {metrics.map((m) => (
        <div key={m.label} className="flex flex-col">
          <span className="text-[11px] font-semibold uppercase tracking-widest text-slate">{m.label}</span>
          <span className="font-serif text-2xl">{m.value}</span>
          <span className="font-serif italic text-xs text-slate">{m.detail}</span>
        </div>
      ))}
    </div>
  );
}
