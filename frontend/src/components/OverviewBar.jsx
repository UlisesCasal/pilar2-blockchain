import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';
import RingChart from './RingChart';

export default function OverviewBar({ role }) {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);

  const poolPending = pool?.pending ?? 0;
  const poolThreshold = pool?.threshold ?? 10;
  const poolFilling = poolThreshold > 0 && poolPending / poolThreshold > 0.5;

  const metrics = [
    {
      key: 'bloques',
      dot: 'bg-verified',
      value: status?.chain_length ?? '—',
      label: 'Bloques',
    },
    {
      key: 'workers',
      dot: 'bg-crude',
      value: pool ? pool.gpu_workers + pool.cpu_workers : '—',
      label: 'Workers',
    },
    {
      key: 'pool',
      ring: true,
      value: poolPending,
      max: poolThreshold,
      label: 'Pool',
    },
    {
      key: 'dificultad',
      dot: 'bg-mineral',
      value: status?.difficulty ?? '0000',
      label: 'Dificultad',
    },
  ];

  return (
    <div className="px-6 pt-4 pb-2">
      <div className="flex items-center glass-subtle ring-1 ring-white/[0.06] rounded-2xl h-[50px] overflow-hidden animate-fade-in shadow-inner-highlight">
        {metrics.map((m, i) => (
          <div
            key={m.key}
            className={`flex items-center gap-2.5 px-5 h-full ${
              i < metrics.length - 1 ? 'border-r border-white/[0.06]' : ''
            }`}
          >
            {m.ring ? (
              <>
                <RingChart
                  value={m.value}
                  max={m.max}
                  size={32}
                  strokeWidth={3}
                  color={poolFilling ? 'text-pending' : 'text-mineral'}
                />
                <span className="font-mono text-lg font-bold text-text-primary leading-none">
                  {m.value}
                  <span className="text-text-muted font-normal">/{m.max}</span>
                </span>
                <span className="text-xs uppercase tracking-widest text-text-muted">
                  {m.label}
                </span>
              </>
            ) : (
              <>
                <div className={`w-2 h-2 rounded-full ${m.dot} flex-shrink-0`} />
                <span className="font-mono text-lg font-bold text-text-primary leading-none">
                  {m.value}
                </span>
                <span className="text-xs uppercase tracking-widest text-text-muted">
                  {m.label}
                </span>
              </>
            )}
          </div>
        ))}
        <div className="px-5">
          <a
            href={import.meta.env.VITE_RABBITMQ_DASHBOARD_URL || 'http://localhost:15672'}
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs uppercase tracking-widest text-text-muted hover:text-white transition-colors"
          >
            RabbitMQ
          </a>
        </div>
      </div>
    </div>
  );
}
