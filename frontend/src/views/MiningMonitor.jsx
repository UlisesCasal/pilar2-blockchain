import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

function MetricCard({ label, value, detail }) {
  return (
    <div className="bg-stone/50 border border-stone rounded-sm px-5 py-4">
      <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">{label}</span>
      <p className="font-serif text-3xl mt-1">{value}</p>
      <p className="font-serif italic text-xs text-slate mt-0.5">{detail}</p>
    </div>
  );
}

function StatusRow({ label, value, detail, variant }) {
  const colors = {
    gold: 'text-assayers-gold',
    malachite: 'text-malachite',
    garnet: 'text-garnet',
    slate: 'text-slate',
  };
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone last:border-0">
      <div>
        <span className="text-sm font-medium">{label}</span>
        {detail && <span className="font-mono text-xs text-slate ml-2">{detail}</span>}
      </div>
      <span className={`font-serif italic text-sm ${colors[variant] || 'text-slate'}`}>{value}</span>
    </div>
  );
}

export default function MiningMonitor() {
  const { data: status } = usePolling(api.getStatus);
  const { data: pool } = usePolling(api.getPoolStatus);
  const { data: scale } = usePolling(api.getScaleStatus);
  const { data: rabbit } = usePolling(api.getRabbitStatus);

  return (
    <div>
      <h2 className="font-serif text-2xl mb-1">Mining Monitor</h2>
      <p className="font-serif italic text-slate text-sm mb-6">Distributed mining infrastructure status</p>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Workers"
          value={scale ? (scale.gpu_workers + scale.cpu_workers) : '—'}
          detail={scale ? `${scale.gpu_workers} GPU · ${scale.cpu_workers} CPU` : ''}
        />
        <MetricCard
          label="Pending"
          value={pool?.pending ?? '—'}
          detail="in pool"
        />
        <MetricCard
          label="Queue Depth"
          value={rabbit?.queue_depth ?? '—'}
          detail="mining tasks"
        />
        <MetricCard
          label="Difficulty"
          value="0000"
          detail="4 chars prefix"
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Coordinator Cluster</span>
          <div className="mt-3 bg-stone/50 border border-stone rounded-sm px-5 py-2">
            <StatusRow
              label="coordinator"
              value={status?.role ?? 'unknown'}
              variant={status?.role === 'leader' ? 'gold' : 'slate'}
              detail={`chain: ${status?.chain_length ?? '—'} blocks`}
            />
          </div>
        </div>

        <div>
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Scale Status</span>
          <div className="mt-3 bg-stone/50 border border-stone rounded-sm px-5 py-2">
            <StatusRow
              label="scale_needed"
              value={scale?.scale_needed ? 'true' : 'false'}
              variant={scale?.scale_needed ? 'garnet' : 'malachite'}
            />
            <StatusRow
              label="last request"
              value={scale?.last_scale_request ? new Date(scale.last_scale_request).toLocaleTimeString() : 'none'}
              variant="slate"
            />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Dead Letter Queue</span>
        <div className="mt-3 bg-stone/50 border border-stone rounded-sm px-5 py-4">
          <p className="font-serif italic text-sm text-malachite">no failures recorded</p>
        </div>
      </div>
    </div>
  );
}
