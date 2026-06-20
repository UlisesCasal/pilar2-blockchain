import { usePolling } from '../hooks/usePolling';
import { api } from '../api/client';

function MetricCard({ label, value, detail, accent }) {
  return (
    <div className={`bg-stone/20 border border-stone rounded-sm px-5 py-4 border-l-2 ${accent}`}>
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
  const dots = {
    gold: 'bg-assayers-gold',
    malachite: 'bg-malachite',
    garnet: 'bg-garnet',
    slate: 'bg-slate/50',
  };
  return (
    <div className="flex items-center justify-between py-3 border-b border-stone/60 last:border-0">
      <div className="flex items-center gap-2">
        <div className={`w-2 h-2 rounded-full ${dots[variant] || 'bg-slate/50'}`} />
        <span className="text-sm font-medium">{label}</span>
        {detail && <span className="font-mono text-xs text-slate ml-1">{detail}</span>}
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
      <div className="flex items-center gap-3 mb-6">
        <div className="w-8 h-8 rounded-sm bg-slate/10 flex items-center justify-center">
          <span className="text-slate text-sm">⚡</span>
        </div>
        <div>
          <h2 className="font-serif text-2xl">Mining Monitor</h2>
          <p className="font-serif italic text-slate text-sm">Real-time view of the distributed mining infrastructure</p>
        </div>
      </div>

      <div className="grid grid-cols-4 gap-4 mb-8">
        <MetricCard
          label="Workers"
          value={scale ? (scale.gpu_workers + scale.cpu_workers) : '—'}
          detail={scale ? `${scale.gpu_workers} GPU · ${scale.cpu_workers} CPU` : 'connecting...'}
          accent="border-l-assayers-gold"
        />
        <MetricCard
          label="Pending"
          value={pool?.pending ?? '—'}
          detail="in transaction pool"
          accent="border-l-malachite"
        />
        <MetricCard
          label="Queue Depth"
          value={rabbit?.queue_depth ?? '—'}
          detail="mining task messages"
          accent="border-l-slate"
        />
        <MetricCard
          label="Difficulty"
          value="0000"
          detail="4-char hash prefix"
          accent="border-l-graphite"
        />
      </div>

      <div className="grid grid-cols-2 gap-8">
        <div>
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Coordinator Cluster</span>
          <div className="mt-3 bg-stone/20 border border-stone rounded-sm px-5 py-2">
            <StatusRow
              label="This node"
              value={status?.role ?? 'unknown'}
              variant={status?.role === 'leader' ? 'gold' : 'slate'}
              detail={`chain: ${status?.chain_length ?? '—'} blocks`}
            />
          </div>
          <p className="text-[11px] text-slate mt-2 font-serif italic">
            {status?.role === 'leader'
              ? 'This coordinator won the Bully election and is processing mining results'
              : 'Standing by — will take over if the leader fails'}
          </p>
        </div>

        <div>
          <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Auto-Scale</span>
          <div className="mt-3 bg-stone/20 border border-stone rounded-sm px-5 py-2">
            <StatusRow
              label="Scale needed"
              value={scale?.scale_needed ? 'yes' : 'no'}
              variant={scale?.scale_needed ? 'garnet' : 'malachite'}
            />
            <StatusRow
              label="Last request"
              value={scale?.last_scale_request ? new Date(scale.last_scale_request).toLocaleTimeString() : 'none'}
              variant="slate"
            />
          </div>
        </div>
      </div>

      <div className="mt-8">
        <span className="font-semibold uppercase tracking-widest text-[10px] text-slate">Dead Letter Queue</span>
        <div className="mt-3 bg-stone/20 border border-stone rounded-sm px-5 py-4">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-malachite" />
            <p className="font-serif italic text-sm text-malachite">No failures recorded</p>
          </div>
          <p className="text-[11px] text-slate mt-1 font-serif italic">Failed mining results are routed here via the DLX exchange after 4 retries with exponential backoff</p>
        </div>
      </div>
    </div>
  );
}
