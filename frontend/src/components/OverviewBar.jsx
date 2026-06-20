import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

export default function OverviewBar({ role }) {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);

  const metrics = [
    { label: 'Chain Length', value: status?.chain_length ?? '—', detail: 'confirmed blocks', accent: 'border-malachite/40' },
    { label: 'Active Workers', value: pool ? (pool.gpu_workers + pool.cpu_workers) : '—', detail: pool ? `${pool.gpu_workers} GPU · ${pool.cpu_workers} CPU` : 'connecting...', accent: 'border-assayers-gold/40' },
    { label: 'Pending Tx', value: pool?.pending ?? '—', detail: 'in transaction pool', accent: 'border-slate/40' },
    { label: 'Node Role', value: status?.role ?? '—', detail: status?.role === 'leader' ? 'accepting results' : 'standby replica', accent: status?.role === 'leader' ? 'border-assayers-gold/40' : 'border-slate/40' },
  ];

  return (
    <div className="bg-stone/30 border-b border-stone">
      <div className="px-8 py-4 flex items-center gap-6">
        <div className="flex items-center gap-2 mr-2">
          <div className="w-2 h-2 rounded-full bg-malachite animate-pulse" />
          <span className="text-[10px] font-semibold uppercase tracking-widest text-malachite">Live</span>
        </div>
        {metrics.map((m) => (
          <div key={m.label} className={`flex flex-col border-l-2 ${m.accent} pl-3`}>
            <span className="text-[10px] font-semibold uppercase tracking-widest text-slate">{m.label}</span>
            <span className="font-serif text-xl leading-tight">{m.value}</span>
            <span className="font-serif italic text-[11px] text-slate">{m.detail}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
